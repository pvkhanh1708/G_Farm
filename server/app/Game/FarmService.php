<?php

namespace App\Game;

use App\Models\Farm;
use App\Models\Planting;
use App\Models\User;
use Closure;
use Illuminate\Support\Facades\DB;

/**
 * Authoritative game rules. Mirrors client/src/game/state/store.ts: the
 * client applies actions optimistically, the server re-checks them here and
 * its state wins. Every action locks the farm row so concurrent requests from
 * one player apply in order.
 */
class FarmService
{
    public function __construct(private Economy $eco) {}

    public static function nowMs(): int
    {
        return (int) floor(microtime(true) * 1000);
    }

    public function create(User $user): Farm
    {
        return $user->farm()->create([
            'coins' => $this->eco->startingCoins(),
            'level' => 1,
            'xp' => 0,
            'unlocked' => $this->eco->startUnlocked(),
            'inventory' => (object) [],
        ]);
    }

    public function farmFor(User $user): Farm
    {
        return $user->farm ?? $this->create($user);
    }

    /** Snapshot in the client's GameState shape. */
    public function state(Farm $farm): array
    {
        $inventory = [];
        foreach ($this->eco->cropIds() as $id) {
            $inventory[$id] = (int) ($farm->inventory[$id] ?? 0);
        }
        $plantings = [];
        foreach ($farm->plantings()->orderBy('tile')->get() as $p) {
            $plantings[(string) $p->tile] = ['crop' => $p->crop, 'plantedAt' => $p->planted_at];
        }

        return [
            'coins' => $farm->coins,
            'level' => $farm->level,
            'xp' => $farm->xp,
            'unlocked' => $farm->unlocked,
            'inventory' => (object) $inventory,
            'plantings' => (object) $plantings,
        ];
    }

    /**
     * Sow one crop on the given tiles, in order, until the wallet runs out.
     *
     * @param  list<int>  $tiles
     * @return list<int> tiles actually planted
     */
    public function plant(User $user, array $tiles, string $cropId): array
    {
        return $this->locked($user, function (Farm $farm) use ($tiles, $cropId) {
            $crop = $this->eco->crop($cropId) ?? throw new GameException('Hạt giống không tồn tại');
            if ($crop['unlockLevel'] > $farm->level) {
                throw new GameException("{$crop['name']} mở ở cấp {$crop['unlockLevel']}");
            }
            $taken = $farm->plantings()->whereIn('tile', $tiles)->pluck('tile')->all();
            $now = self::nowMs();
            $planted = [];
            foreach (array_values(array_unique($tiles)) as $tile) {
                if ($tile < 0 || $tile >= $farm->unlocked || in_array($tile, $taken, true)) {
                    continue;
                }
                if ($farm->coins < $crop['seedPrice']) {
                    break;
                }
                $farm->coins -= $crop['seedPrice'];
                $farm->plantings()->create(['tile' => $tile, 'crop' => $cropId, 'planted_at' => $now + count($planted) * $this->eco->plantStaggerMs()]);
                $planted[] = $tile;
            }
            if (! $planted) {
                throw new GameException($farm->coins < $crop['seedPrice'] ? 'Không đủ xu!' : 'Không có ô đất trống để gieo');
            }
            $farm->save();

            return $planted;
        });
    }

    /**
     * Harvest ripe crops on the given tiles; unripe or empty tiles are skipped.
     *
     * @param  list<int>  $tiles
     * @return array{harvested: list<int>, xp: int, levelUps: list<int>}
     */
    public function harvest(User $user, array $tiles): array
    {
        return $this->locked($user, function (Farm $farm) use ($tiles) {
            $now = self::nowMs() + config('game.harvest_grace_ms');
            $inventory = $farm->inventory;
            $harvested = [];
            $xp = 0;
            /** @var Planting $p */
            foreach ($farm->plantings()->whereIn('tile', $tiles)->get() as $p) {
                $crop = $this->eco->crop($p->crop);
                if (! $crop || $now < $p->planted_at + $crop['growSeconds'] * 1000) {
                    continue;
                }
                $inventory[$p->crop] = ($inventory[$p->crop] ?? 0) + $crop['yield'];
                $xp += $crop['xp'];
                $harvested[] = $p->tile;
                $p->delete();
            }
            if (! $harvested) {
                throw new GameException('Cây chưa chín');
            }
            $farm->inventory = $inventory;
            $levelUps = $this->addXp($farm, $xp);
            $farm->save();

            return ['harvested' => $harvested, 'xp' => $xp, 'levelUps' => $levelUps];
        });
    }

    /** @return int coins earned */
    public function sell(User $user, string $cropId, int $qty): int
    {
        return $this->locked($user, function (Farm $farm) use ($cropId, $qty) {
            $crop = $this->eco->crop($cropId) ?? throw new GameException('Nông sản không tồn tại');
            $inventory = $farm->inventory;
            $n = min($qty, (int) ($inventory[$cropId] ?? 0));
            if ($n <= 0) {
                throw new GameException('Kho không còn nông sản này');
            }
            $inventory[$cropId] -= $n;
            $earned = $n * $crop['sellPrice'];
            $farm->inventory = $inventory;
            $farm->coins += $earned;
            $farm->save();

            return $earned;
        });
    }

    /** Buy the next tile in order. @return int the tile index */
    public function unlockNext(User $user): int
    {
        return $this->locked($user, function (Farm $farm) {
            if ($farm->unlocked >= $this->eco->tileCap($farm->level)) {
                $need = $this->eco->levelForTiles($farm->unlocked + 1);
                throw new GameException("Cần đạt cấp {$need} để mở thêm đất");
            }
            $cost = $this->eco->unlockCost($farm->unlocked);
            if ($farm->coins < $cost) {
                throw new GameException('Không đủ xu!');
            }
            $farm->coins -= $cost;
            $tile = $farm->unlocked++;
            $farm->save();

            return $tile;
        });
    }

    public function reset(User $user): void
    {
        $this->locked($user, function (Farm $farm) {
            $farm->plantings()->delete();
            $farm->fill([
                'coins' => $this->eco->startingCoins(),
                'level' => 1,
                'xp' => 0,
                'unlocked' => $this->eco->startUnlocked(),
                'inventory' => (object) [],
            ])->save();
        });
    }

    /** Add XP, rolling over into level-ups; each level grants coins. @return list<int> levels reached */
    private function addXp(Farm $farm, int $gain): array
    {
        $levels = [];
        $farm->xp += $gain;
        while ($farm->xp >= $this->eco->xpToNext($farm->level)) {
            $farm->xp -= $this->eco->xpToNext($farm->level);
            $farm->level++;
            $farm->coins += $this->eco->levelReward($farm->level);
            $levels[] = $farm->level;
        }

        return $levels;
    }

    /**
     * @template T
     *
     * @param  Closure(Farm): T  $fn
     * @return T
     */
    private function locked(User $user, Closure $fn): mixed
    {
        $this->farmFor($user);

        return DB::transaction(function () use ($user, $fn) {
            $farm = Farm::where('user_id', $user->id)->lockForUpdate()->firstOrFail();

            return $fn($farm);
        });
    }
}
