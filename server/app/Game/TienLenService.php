<?php

namespace App\Game;

use App\Models\Farm;
use App\Models\GameTable;
use App\Models\TienLenTable;
use App\Models\User;
use Closure;
use Illuminate\Support\Facades\DB;

/**
 * Tiến lên tables for up to 4 players. Each human puts the stake in when sitting down;
 * the host starts the game and empty seats are filled by house bots. The first player
 * to empty their hand takes every seat's stake (bots' stakes are covered by the house)
 * minus the house fee. A player who does not act in time passes, or plays their lowest
 * card when they must lead. Bots act on the next request after a short pause, so the
 * table advances while players poll it.
 */
class TienLenService
{
    public const SEATS = 4;

    public const TURN_MS = 30_000;

    public const BOT_DELAY_MS = 1_100;

    public const WAIT_MS = 30 * 60_000;

    public function __construct(private FarmService $farms) {}

    // ---------------------------------------------------------------- lobby

    /** @return array{tables: list<array>, mine: ?array} */
    public function lobby(User $user): array
    {
        $this->expireWaiting();
        $tables = TienLenTable::where('status', 'waiting')->orderByDesc('stake')->limit(50)->get()
            ->filter(fn (TienLenTable $t) => $t->seatOf($user->id) === null)
            ->map(fn (TienLenTable $t) => [
                'id' => $t->id,
                'stake' => $t->stake,
                'host' => collect($t->seats)->firstWhere('user', $t->host_id)['name'] ?? '?',
                'players' => collect($t->seats)->filter(fn ($s) => $s['user'])->count(),
            ])->values()->all();
        $mine = $this->activeOf($user);

        return ['tables' => $tables, 'mine' => $mine ? $this->view($mine, $user) : null];
    }

    public function create(User $user, int $stake): TienLenTable
    {
        $this->assertFree($user);

        return DB::transaction(function () use ($user, $stake) {
            $this->charge($user->id, $stake);
            $seats = array_fill(0, self::SEATS, ['user' => null, 'bot' => false, 'name' => null]);
            $seats[0] = ['user' => $user->id, 'bot' => false, 'name' => $user->name];

            return TienLenTable::create(['stake' => $stake, 'status' => 'waiting', 'host_id' => $user->id, 'seats' => $seats]);
        });
    }

    public function join(User $user, int $id): TienLenTable
    {
        $this->assertFree($user);

        return $this->locked($id, function (TienLenTable $t) use ($user) {
            if ($t->status !== 'waiting') {
                throw new GameException('Bàn đã bắt đầu');
            }
            $seats = $t->seats;
            $free = array_search(null, array_column($seats, 'user'), true);
            if ($free === false) {
                throw new GameException('Bàn đã đủ người');
            }
            $this->charge($user->id, $t->stake);
            $seats[$free] = ['user' => $user->id, 'bot' => false, 'name' => $user->name];
            $t->seats = $seats;
            $t->version++;
            // a full table starts by itself
            if (! in_array(null, array_column($seats, 'user'), true)) {
                $this->start($t);
            }
            $t->save();

            return $t;
        });
    }

    /** A seated player leaves a table that has not started (refunded); the host leaving cancels it. */
    public function leave(User $user, int $id): TienLenTable
    {
        return $this->locked($id, function (TienLenTable $t) use ($user) {
            $seat = $t->seatOf($user->id);
            if ($seat === null || $t->status !== 'waiting') {
                throw new GameException('Chỉ rời được bàn chưa bắt đầu');
            }
            $seats = $t->seats;
            if ($user->id === $t->host_id) {
                foreach ($seats as $s) {
                    if ($s['user']) {
                        $this->pay($s['user'], $t->stake);
                    }
                }
                $t->status = 'cancelled';
            } else {
                $this->pay($user->id, $t->stake);
                $seats[$seat] = ['user' => null, 'bot' => false, 'name' => null];
                $t->seats = $seats;
            }
            $t->version++;
            $t->save();

            return $t;
        });
    }

    /** Host starts now; empty seats get bots. */
    public function startNow(User $user, int $id): TienLenTable
    {
        return $this->locked($id, function (TienLenTable $t) use ($user) {
            if ($t->status !== 'waiting' || $t->host_id !== $user->id) {
                throw new GameException('Chỉ chủ bàn mới bắt đầu được');
            }
            $this->start($t);
            $t->save();

            return $t;
        });
    }

    // ---------------------------------------------------------------- play

    public function show(User $user, int $id): TienLenTable
    {
        return $this->locked($id, function (TienLenTable $t) use ($user) {
            if ($t->seatOf($user->id) === null) {
                throw new GameException('Bạn không ở bàn này');
            }
            $this->advance($t);
            $t->save();

            return $t;
        });
    }

    /** @param list<int> $cards */
    public function play(User $user, int $id, array $cards): TienLenTable
    {
        return $this->locked($id, function (TienLenTable $t) use ($user, $cards) {
            $seat = $this->mySeat($t, $user);
            $this->doPlay($t, $seat, $cards);
            $t->save();

            return $t;
        });
    }

    public function pass(User $user, int $id): TienLenTable
    {
        return $this->locked($id, function (TienLenTable $t) use ($user) {
            $seat = $this->mySeat($t, $user);
            if ($t->combo === null) {
                throw new GameException('Bạn đang được đánh trước, không thể bỏ lượt');
            }
            $this->doPass($t, $seat);
            $t->save();

            return $t;
        });
    }

    public function view(TienLenTable $t, User $user): array
    {
        $me = $t->seatOf($user->id);
        $seats = [];
        foreach ($t->seats as $i => $s) {
            $seats[] = [
                'name' => $s['bot'] ? 'Máy '.($i + 1) : $s['name'],
                'bot' => $s['bot'],
                'empty' => ! $s['user'] && ! $s['bot'],
                'cards' => $t->hands ? count($t->hands[$i]) : 0,
                'passed' => in_array($i, $t->passed ?? [], true),
            ];
        }

        return [
            'id' => $t->id,
            'game' => 'tienlen',
            'stake' => $t->stake,
            'status' => $t->status,
            'host' => $t->host_id === $user->id,
            'you' => $me,
            'seats' => $seats,
            'hand' => $t->hands && $me !== null ? $t->hands[$me] : [],
            'turn' => $t->turn,
            'combo' => $t->combo,
            'leader' => $t->leader,
            'firstTrick' => $t->first_trick,
            'lastAction' => $t->last_action,
            'winner' => $t->winner,
            'payout' => $this->payout($t),
            'turnDeadline' => $t->turn_deadline,
            'version' => $t->version,
        ];
    }

    // ---------------------------------------------------------------- internals

    private function start(TienLenTable $t): void
    {
        $seats = $t->seats;
        // bots fill the empty seats: they only bring part of a stake, and the stake is capped by level
        if (collect($seats)->contains(fn ($s) => ! $s['user'])) {
            $levels = Farm::whereIn('user_id', collect($seats)->pluck('user')->filter())->pluck('level');
            $cap = GameRoomService::botStakeCap((int) $levels->min());
            if ($t->stake > $cap) {
                throw new GameException('Có ghế máy chơi thì cược tối đa '.number_format($cap, 0, ',', '.').' xu');
            }
        }
        foreach ($seats as $i => $s) {
            if (! $s['user']) {
                $seats[$i] = ['user' => null, 'bot' => true, 'name' => null];
            }
        }
        $hands = TienLen::deal();
        // 3♠ (card 0) leads
        $first = 0;
        foreach ($hands as $i => $h) {
            if (in_array(0, $h, true)) {
                $first = $i;
            }
        }
        $t->fill([
            'seats' => $seats,
            'hands' => $hands,
            'status' => 'playing',
            'turn' => $first,
            'leader' => null,
            'combo' => null,
            'passed' => [],
            'first_trick' => true,
            'last_action' => null,
        ]);
        $this->armTurn($t);
        $t->version++;
    }

    private function mySeat(TienLenTable $t, User $user): int
    {
        $seat = $t->seatOf($user->id);
        if ($seat === null) {
            throw new GameException('Bạn không ở bàn này');
        }
        $this->advance($t);
        if ($t->status !== 'playing') {
            throw new GameException('Ván đã kết thúc');
        }
        if ($t->turn !== $seat) {
            throw new GameException('Chưa tới lượt bạn');
        }

        return $seat;
    }

    /** @param list<int> $cards */
    private function doPlay(TienLenTable $t, int $seat, array $cards): void
    {
        $hand = $t->hands[$seat];
        $cards = array_values(array_unique(array_map('intval', $cards)));
        if (array_diff($cards, $hand)) {
            throw new GameException('Bạn không có những lá này');
        }
        $combo = TienLen::combo($cards);
        if (! $combo) {
            throw new GameException('Bộ bài không hợp lệ');
        }
        if ($t->first_trick && ! in_array(0, $cards, true)) {
            throw new GameException('Lượt đầu phải đánh có 3♠');
        }
        if (! TienLen::beats($combo, $t->combo)) {
            throw new GameException('Không chặn được bài trên bàn');
        }
        $hands = $t->hands;
        $hands[$seat] = array_values(array_diff($hand, $cards));
        sort($cards);
        $t->hands = $hands;
        $t->combo = [...$combo, 'cards' => $cards];
        $t->leader = $seat;
        $t->first_trick = false;
        $t->last_action = ['seat' => $seat, 'kind' => 'play', 'cards' => $cards];
        $t->version++;
        if (! $hands[$seat]) {
            $this->finish($t, $seat);

            return;
        }
        $this->nextTurn($t, $seat);
    }

    private function doPass(TienLenTable $t, int $seat): void
    {
        $passed = $t->passed ?? [];
        $passed[] = $seat;
        $t->passed = array_values(array_unique($passed));
        $t->last_action = ['seat' => $seat, 'kind' => 'pass', 'cards' => []];
        $t->version++;
        $this->nextTurn($t, $seat);
    }

    /** Next seat still in the round; if everyone else passed, the leader starts a new round. */
    private function nextTurn(TienLenTable $t, int $from): void
    {
        for ($k = 1; $k <= self::SEATS; $k++) {
            $s = ($from + $k) % self::SEATS;
            if ($s === $t->leader) {
                // round over: leader leads freely
                $t->combo = null;
                $t->passed = [];
                $t->turn = $s;
                $this->armTurn($t);

                return;
            }
            if (! in_array($s, $t->passed ?? [], true)) {
                $t->turn = $s;
                $this->armTurn($t);

                return;
            }
        }
    }

    private function armTurn(TienLenTable $t): void
    {
        $now = FarmService::nowMs();
        $t->turn_deadline = $now + self::TURN_MS;
        $t->act_after = $now + self::BOT_DELAY_MS;
    }

    /** Run due bot turns (one per call, after their pause) and timeouts. */
    private function advance(TienLenTable $t): void
    {
        $now = FarmService::nowMs();
        for ($guard = 0; $guard < 8 && $t->status === 'playing'; $guard++) {
            $seat = $t->turn;
            $bot = $t->seats[$seat]['bot'];
            if ($bot && $now >= $t->act_after) {
                $cards = TienLen::botPlay($t->hands[$seat], $t->combo, $t->first_trick);
                if ($cards) {
                    $this->doPlay($t, $seat, $cards);
                } else {
                    $this->doPass($t, $seat);
                }
                // one bot move per request keeps the plays readable
                return;
            }
            if (! $bot && $now > $t->turn_deadline) {
                if ($t->combo === null) {
                    $this->doPlay($t, $seat, [$t->first_trick ? 0 : min($t->hands[$seat])]);
                } else {
                    $this->doPass($t, $seat);
                }

                continue;
            }

            return;
        }
    }

    private function finish(TienLenTable $t, int $winner): void
    {
        $t->status = 'finished';
        $t->winner = $winner;
        $t->turn = null;
        $t->turn_deadline = null;
        $t->version++;
        $user = $t->seats[$winner]['user'];
        if ($user) {
            $this->pay($user, $this->payout($t));
            Farm::where('user_id', $user)->incrementEach(['game_wins' => 1, 'game_winnings' => $this->payout($t) - $t->stake]);
        }
    }

    private function payout(TienLenTable $t): int
    {
        $bots = collect($t->seats)->where('bot', true)->count();

        return (int) floor($t->stake * (self::SEATS - $bots + $bots * GameRoomService::BOT_SHARE) * (1 - GameRoomService::FEE));
    }

    private function assertFree(User $user): void
    {
        if ($this->activeOf($user) || GameTable::whereIn('status', ['waiting', 'playing'])->where(fn ($q) => $q->where('host_id', $user->id)->orWhere('guest_id', $user->id))->exists()) {
            throw new GameException('Bạn đang có một bàn chưa kết thúc');
        }
    }

    public function activeOf(User $user): ?TienLenTable
    {
        return TienLenTable::whereIn('status', ['waiting', 'playing'])->latest('id')->limit(200)->get()
            ->first(fn (TienLenTable $t) => $t->seatOf($user->id) !== null);
    }

    private function charge(int $userId, int $amount): void
    {
        $farm = Farm::where('user_id', $userId)->lockForUpdate()->first();
        if (! $farm || $farm->coins < $amount) {
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

    private function expireWaiting(): void
    {
        foreach (TienLenTable::where('status', 'waiting')->where('updated_at', '<', now()->subMilliseconds(self::WAIT_MS))->pluck('id') as $id) {
            $this->locked($id, function (TienLenTable $t) {
                if ($t->status !== 'waiting') {
                    return;
                }
                foreach ($t->seats as $s) {
                    if ($s['user']) {
                        $this->pay($s['user'], $t->stake);
                    }
                }
                $t->status = 'cancelled';
                $t->version++;
                $t->save();
            });
        }
    }

    /**
     * @template T
     *
     * @param  Closure(TienLenTable): T  $fn
     * @return T
     */
    private function locked(int $id, Closure $fn): mixed
    {
        return DB::transaction(function () use ($id, $fn) {
            $t = TienLenTable::whereKey($id)->lockForUpdate()->first() ?? throw new GameException('Không tìm thấy bàn');

            return $fn($t);
        });
    }
}
