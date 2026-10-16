<?php

namespace App\Game;

use App\Models\Farm;
use App\Models\GameTable;
use App\Models\User;
use Closure;
use Illuminate\Support\Facades\DB;

/**
 * Betting tables in the game room (caro for now). Stakes come out of the
 * players' farm coins when they take a seat; the winner takes the pot minus
 * the house fee, a draw refunds both. Against the bot the house covers the
 * bot's stake. Every action locks the table row (and the farms it pays).
 */
class GameRoomService
{
    public const GAMES = ['caro'];

    public const MIN_STAKE = 100;

    /** Share of the pot the house keeps from the winner. */
    public const FEE = 0.05;

    /**
     * The house bot does not bring real money: it matches only half the stake, and the stake against it
     * is capped by the player's level. Without this, a big bet won against the bot printed millions.
     */
    public const BOT_SHARE = 0.5;

    public const BOT_STAKE_PER_LEVEL = 100;

    public static function botStakeCap(int $level): int
    {
        return max(self::MIN_STAKE, self::BOT_STAKE_PER_LEVEL * $level);
    }

    public const TURN_MS = 60_000;

    /** Unjoined tables are cancelled (and refunded) after this long. */
    public const WAIT_MS = 30 * 60_000;

    public function __construct(private FarmService $farms) {}

    // ---------------------------------------------------------------- lobby

    /** @return array{tables: list<array>, mine: ?array} */
    public function lobby(User $user, string $game): array
    {
        $this->expireWaiting();
        $tables = GameTable::with('host')
            ->where('game', $game)
            ->where('status', 'waiting')
            ->where('host_id', '!=', $user->id)
            ->orderByDesc('stake')
            ->limit(50)
            ->get()
            ->map(fn (GameTable $t) => ['id' => $t->id, 'stake' => $t->stake, 'host' => $t->host->name])
            ->all();
        $mine = $this->activeTableOf($user);

        return ['tables' => $tables, 'mine' => $mine ? $this->view($mine, $user) : null];
    }

    public function create(User $user, string $game, int $stake): GameTable
    {
        if ($this->activeTableOf($user) || app(TienLenService::class)->activeOf($user)) {
            throw new GameException('Bạn đang có một bàn chưa kết thúc');
        }

        return DB::transaction(function () use ($user, $game, $stake) {
            $this->charge($user, $stake);

            return GameTable::create([
                'game' => $game,
                'stake' => $stake,
                'status' => 'waiting',
                'host_id' => $user->id,
                'board' => Caro::emptyBoard(),
            ]);
        });
    }

    public function join(User $user, int $id): GameTable
    {
        if ($this->activeTableOf($user) || app(TienLenService::class)->activeOf($user)) {
            throw new GameException('Bạn đang có một bàn chưa kết thúc');
        }

        return $this->locked($id, function (GameTable $t) use ($user) {
            if ($t->status !== 'waiting') {
                throw new GameException('Bàn này đã có người vào');
            }
            if ($t->host_id === $user->id) {
                throw new GameException('Đây là bàn của bạn');
            }
            $this->charge($user, $t->stake);
            $t->fill(['guest_id' => $user->id, 'status' => 'playing', 'turn' => 1, 'turn_deadline' => FarmService::nowMs() + self::TURN_MS]);
            $t->version++;
            $t->save();

            return $t;
        });
    }

    /** The host stops waiting and plays the house bot, which matches the stake. */
    public function playBot(User $user, int $id): GameTable
    {
        return $this->locked($id, function (GameTable $t) use ($user) {
            if ($t->status !== 'waiting' || $t->host_id !== $user->id) {
                throw new GameException('Không thể chơi với máy ở bàn này');
            }
            $cap = self::botStakeCap($this->farms->farmFor($user)->level);
            if ($t->stake > $cap) {
                throw new GameException('Chơi với máy cược tối đa '.number_format($cap, 0, ',', '.').' xu');
            }
            $t->fill(['vs_bot' => true, 'status' => 'playing', 'turn' => 1, 'turn_deadline' => FarmService::nowMs() + self::TURN_MS]);
            $t->version++;
            $t->save();

            return $t;
        });
    }

    public function cancel(User $user, int $id): GameTable
    {
        return $this->locked($id, function (GameTable $t) use ($user) {
            if ($t->status !== 'waiting' || $t->host_id !== $user->id) {
                throw new GameException('Chỉ huỷ được bàn đang chờ của bạn');
            }
            $this->pay($t->host_id, $t->stake);
            $t->status = 'cancelled';
            $t->version++;
            $t->save();

            return $t;
        });
    }

    // ---------------------------------------------------------------- play

    public function show(User $user, int $id): GameTable
    {
        return $this->locked($id, function (GameTable $t) use ($user) {
            if ($t->sideOf($user->id) === null) {
                throw new GameException('Bạn không ở bàn này');
            }
            $this->checkTimeout($t);

            return $t;
        });
    }

    public function move(User $user, int $id, int $x, int $y): GameTable
    {
        return $this->locked($id, function (GameTable $t) use ($user, $x, $y) {
            $side = $t->sideOf($user->id);
            if ($side === null) {
                throw new GameException('Bạn không ở bàn này');
            }
            $this->checkTimeout($t);
            if ($t->status !== 'playing') {
                throw new GameException('Ván đã kết thúc');
            }
            if ($t->turn !== $side) {
                throw new GameException('Chưa tới lượt bạn');
            }
            $this->place($t, $side, $x, $y);
            if ($t->status === 'playing' && $t->vs_bot) {
                [$bx, $by] = Caro::botMove($t->board, 2);
                $this->place($t, 2, $bx, $by);
            }
            $t->save();

            return $t;
        });
    }

    public function resign(User $user, int $id): GameTable
    {
        return $this->locked($id, function (GameTable $t) use ($user) {
            $side = $t->sideOf($user->id);
            if ($side === null || $t->status !== 'playing') {
                throw new GameException('Không thể bỏ cuộc lúc này');
            }
            $this->finish($t, 3 - $side, 'resign');
            $t->save();

            return $t;
        });
    }

    /** Snapshot for the player `$user`. */
    public function view(GameTable $t, User $user): array
    {
        $t->loadMissing('host', 'guest');
        $side = $t->sideOf($user->id);

        return [
            'id' => $t->id,
            'game' => $t->game,
            'stake' => $t->stake,
            'status' => $t->status,
            'vsBot' => $t->vs_bot,
            'you' => $side,
            'players' => [
                1 => $t->host->name,
                2 => $t->vs_bot ? 'Máy' : $t->guest?->name,
            ],
            'board' => $t->board,
            'size' => Caro::SIZE,
            'turn' => $t->turn,
            'moves' => $t->moves,
            'lastMove' => $t->last_move,
            'winner' => $t->winner,
            'endReason' => $t->end_reason,
            'winLine' => $t->win_line,
            'turnDeadline' => $t->turn_deadline,
            'payout' => $this->payout($t),
            'version' => $t->version,
            'serverTime' => FarmService::nowMs(),
        ];
    }

    // ---------------------------------------------------------------- internals

    private function place(GameTable $t, int $side, int $x, int $y): void
    {
        if (! Caro::inside($x, $y)) {
            throw new GameException('Nước đi không hợp lệ');
        }
        $board = $t->board;
        $i = $y * Caro::SIZE + $x;
        if ($board[$i] !== 0) {
            throw new GameException('Ô này đã có quân');
        }
        $board[$i] = $side;
        $t->board = $board;
        $t->moves++;
        $t->last_move = [$x, $y, $side];
        $t->version++;
        if ($line = Caro::winLine($board, $x, $y)) {
            $t->win_line = $line;
            $this->finish($t, $side, 'line');
        } elseif (Caro::full($board)) {
            $this->finish($t, 0, 'draw');
        } else {
            $t->turn = 3 - $side;
            $t->turn_deadline = FarmService::nowMs() + self::TURN_MS;
        }
    }

    private function checkTimeout(GameTable $t): void
    {
        if ($t->status === 'playing' && $t->turn_deadline && FarmService::nowMs() > $t->turn_deadline) {
            $this->finish($t, 3 - $t->turn, 'timeout');
            $t->save();
        }
    }

    /** Settle the pot. Side 0 = draw. */
    private function finish(GameTable $t, int $winner, string $reason): void
    {
        $t->status = 'finished';
        $t->winner = $winner;
        $t->end_reason = $reason;
        $t->turn_deadline = null;
        $t->version++;
        if ($winner === 0) {
            $this->pay($t->host_id, $t->stake);
            if (! $t->vs_bot) {
                $this->pay($t->guest_id, $t->stake);
            }

            return;
        }
        $winnerId = $winner === 1 ? $t->host_id : ($t->vs_bot ? null : $t->guest_id);
        if ($winnerId) {
            $this->pay($winnerId, $this->payout($t));
            Farm::where('user_id', $winnerId)->incrementEach(['game_wins' => 1, 'game_winnings' => $this->payout($t) - $t->stake]);
        }
    }

    /** What the winner receives: both stakes minus the house fee. */
    private function payout(GameTable $t): int
    {
        return (int) floor($t->stake * ($t->vs_bot ? 1 + self::BOT_SHARE : 2) * (1 - self::FEE));
    }

    private function charge(User $user, int $amount): void
    {
        $this->farms->farmFor($user);
        $farm = Farm::where('user_id', $user->id)->lockForUpdate()->firstOrFail();
        if ($farm->coins < $amount) {
            throw new GameException('Không đủ xu để đặt cược');
        }
        $farm->coins -= $amount;
        $farm->save();
    }

    private function pay(int $userId, int $amount): void
    {
        $farm = Farm::where('user_id', $userId)->lockForUpdate()->first();
        if ($farm) {
            $farm->coins += $amount;
            $farm->save();
        }
    }

    private function activeTableOf(User $user): ?GameTable
    {
        return GameTable::whereIn('status', ['waiting', 'playing'])
            ->where(fn ($q) => $q->where('host_id', $user->id)->orWhere('guest_id', $user->id))
            ->latest('id')
            ->first();
    }

    private function expireWaiting(): void
    {
        $old = GameTable::where('status', 'waiting')->where('updated_at', '<', now()->subMilliseconds(self::WAIT_MS))->pluck('id');
        foreach ($old as $id) {
            $this->locked($id, function (GameTable $t) {
                if ($t->status === 'waiting') {
                    $this->pay($t->host_id, $t->stake);
                    $t->status = 'cancelled';
                    $t->version++;
                    $t->save();
                }
            });
        }
    }

    /**
     * @template T
     *
     * @param  Closure(GameTable): T  $fn
     * @return T
     */
    private function locked(int $id, Closure $fn): mixed
    {
        return DB::transaction(function () use ($id, $fn) {
            $t = GameTable::whereKey($id)->lockForUpdate()->first() ?? throw new GameException('Không tìm thấy bàn');

            return $fn($t);
        });
    }
}
