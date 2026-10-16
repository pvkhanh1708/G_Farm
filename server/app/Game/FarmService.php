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
        foreach ($this->eco->itemIds() as $id) {
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
            'soil' => $farm->soil_level,
            'sprinkler' => $farm->sprinkler_level,
            'orders' => $farm->orders ?? [],
            'daily' => $farm->daily,
            'animals' => $farm->animals ?? [],
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
            $this->questProgress($farm, 'plant', count($planted));
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
            $clock = self::nowMs();
            $now = $clock + config('game.harvest_grace_ms');
            $inventory = $farm->inventory;
            $harvested = [];
            $xp = 0;
            /** @var Planting $p */
            foreach ($farm->plantings()->whereIn('tile', $tiles)->get() as $p) {
                $crop = $this->eco->crop($p->crop);
                if (! $crop || $now < $p->planted_at + $this->eco->growMs($crop, $farm->sprinkler_level)) {
                    continue;
                }
                $inventory[$p->crop] = ($inventory[$p->crop] ?? 0) + $this->eco->harvestAmount($crop, $farm->soil_level);
                $xp += $crop['xp'];
                $harvested[] = $p->tile;
                $p->delete();
            }
            if (! $harvested) {
                throw new GameException('Cây chưa chín');
            }
            $farm->inventory = $inventory;
            $levelUps = $this->addXp($farm, $xp);
            $this->questProgress($farm, 'harvest', count($harvested));
            $farm->save();

            return ['harvested' => $harvested, 'xp' => $xp, 'levelUps' => $levelUps];
        });
    }

    /**
     * Dig up the crops on the given tiles (growing or ripe), with no refund and no harvest.
     *
     * @param  list<int>  $tiles
     * @return list<int> tiles cleared
     */
    public function dig(User $user, array $tiles): array
    {
        return $this->locked($user, function (Farm $farm) use ($tiles) {
            $found = $farm->plantings()->whereIn('tile', $tiles)->pluck('tile')->all();
            if (! $found) {
                throw new GameException('Không có cây để đào');
            }
            $farm->plantings()->whereIn('tile', $found)->delete();

            return array_values(array_map('intval', $found));
        });
    }

    /** @return int coins earned */
    public function sell(User $user, string $cropId, int $qty): int
    {
        return $this->locked($user, function (Farm $farm) use ($cropId, $qty) {
            $crop = $this->eco->item($cropId) ?? throw new GameException('Nông sản không tồn tại');
            $inventory = $farm->inventory;
            $n = min($qty, (int) ($inventory[$cropId] ?? 0));
            if ($n <= 0) {
                throw new GameException('Kho không còn nông sản này');
            }
            $inventory[$cropId] -= $n;
            $earned = $n * $crop['sellPrice'];
            $farm->inventory = $inventory;
            $farm->coins += $earned;
            $this->questProgress($farm, 'sell', $earned);
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
                'soil_level' => 0,
                'sprinkler_level' => 0,
                'orders' => null,
                'daily' => null,
                'animals' => null,
            ])->save();
        });
    }

    // ---------------------------------------------------------------- upgrades, fertilizer

    public function upgrade(User $user, string $kind): int
    {
        return $this->locked($user, function (Farm $farm) use ($kind) {
            $u = $this->eco->raw('upgrades')[$kind] ?? throw new GameException('Nâng cấp không tồn tại');
            $col = $kind === 'soil' ? 'soil_level' : 'sprinkler_level';
            if ($farm->level < $u['unlockLevel']) {
                throw new GameException("{$u['name']} mở ở cấp {$u['unlockLevel']}");
            }
            if ($farm->$col >= $u['max']) {
                throw new GameException('Đã nâng cấp tối đa');
            }
            $cost = $this->eco->upgradeCost($kind, $farm->$col);
            if ($farm->coins < $cost) {
                throw new GameException('Không đủ xu!');
            }
            $farm->coins -= $cost;
            $farm->$col++;
            $farm->save();

            return $farm->$col;
        });
    }

    /**
     * Halve the remaining growth time of the crops on `tiles` (growing only).
     *
     * @param  list<int>  $tiles
     * @return list<int>
     */
    public function fertilize(User $user, array $tiles): array
    {
        return $this->locked($user, function (Farm $farm) use ($tiles) {
            $now = self::nowMs();
            $done = [];
            foreach ($farm->plantings()->whereIn('tile', $tiles)->get() as $p) {
                $crop = $this->eco->crop($p->crop);
                $left = $p->planted_at + $this->eco->growMs($crop, $farm->sprinkler_level) - $now;
                if ($left <= 1000) {
                    continue;
                }
                $cost = $this->eco->fertilizerCost($crop);
                if ($farm->coins < $cost) {
                    break;
                }
                $farm->coins -= $cost;
                $p->planted_at -= (int) round($left * $this->eco->raw('fertilizer')['cut']);
                $p->save();
                $done[] = $p->tile;
            }
            if (! $done) {
                throw new GameException('Không bón được: cây đã chín hoặc thiếu xu');
            }
            $farm->save();

            return $done;
        });
    }

    // ---------------------------------------------------------------- orders

    /** Fill empty order slots with fresh orders for the farm's level. */
    private function refillOrders(Farm $farm): void
    {
        $cfg = $this->eco->raw('orders');
        if ($farm->level < $cfg['unlockLevel']) {
            return;
        }
        $orders = $farm->orders ?? [];
        while (count($orders) < $cfg['slots']) {
            $orders[] = $this->newOrder($farm->level);
        }
        $farm->orders = $orders;
    }

    private function newOrder(int $level): array
    {
        $cfg = $this->eco->raw('orders');
        $pool = array_values(array_filter(array_map(fn ($id) => $this->eco->crop($id), $this->eco->cropIds()), fn ($c) => $c['unlockLevel'] <= $level));
        // favour the crops the player unlocked most recently
        $pool = array_slice($pool, -6);
        shuffle($pool);
        $kinds = min(count($pool), random_int(1, 3));
        $items = [];
        $value = 0;
        $xp = 0;
        foreach (array_slice($pool, 0, $kinds) as $c) {
            $qty = $c['yield'] * random_int(2, 5);
            $items[$c['id']] = $qty;
            $value += $qty * $c['sellPrice'];
            $xp += $qty / $c['yield'] * $c['xp'];
        }

        return ['id' => bin2hex(random_bytes(4)), 'items' => $items, 'coins' => (int) round($value * $cfg['coinMultiplier']), 'xp' => max(1, (int) round($xp * $cfg['xpMultiplier']))];
    }

    /** @return array{coins: int, xp: int, levelUps: list<int>} */
    public function deliverOrder(User $user, string $id): array
    {
        return $this->locked($user, function (Farm $farm) use ($id) {
            $this->refillOrders($farm);
            $orders = $farm->orders;
            $i = array_search($id, array_column($orders, 'id'), true);
            if ($i === false) {
                throw new GameException('Đơn hàng không còn');
            }
            $order = $orders[$i];
            $inv = $farm->inventory;
            foreach ($order['items'] as $crop => $qty) {
                if (($inv[$crop] ?? 0) < $qty) {
                    throw new GameException('Kho chưa đủ hàng cho đơn này');
                }
            }
            foreach ($order['items'] as $crop => $qty) {
                $inv[$crop] -= $qty;
            }
            $farm->inventory = $inv;
            $farm->coins += $order['coins'];
            $levelUps = $this->addXp($farm, $order['xp']);
            $orders[$i] = $this->newOrder($farm->level);
            $farm->orders = $orders;
            $this->questProgress($farm, 'order', 1);
            $farm->save();

            return ['coins' => $order['coins'], 'xp' => $order['xp'], 'levelUps' => $levelUps];
        });
    }

    public function skipOrder(User $user, string $id): void
    {
        $this->locked($user, function (Farm $farm) use ($id) {
            $this->refillOrders($farm);
            $orders = $farm->orders;
            $i = array_search($id, array_column($orders, 'id'), true);
            if ($i === false) {
                throw new GameException('Đơn hàng không còn');
            }
            $orders[$i] = $this->newOrder($farm->level);
            $farm->orders = $orders;
            $farm->save();
        });
    }

    // ---------------------------------------------------------------- daily quests + login streak

    private static function today(): string
    {
        return now('Asia/Ho_Chi_Minh')->toDateString();
    }

    /** Start a new day's quests (keeps the login streak). */
    private function rollDaily(Farm $farm): void
    {
        $today = self::today();
        $daily = $farm->daily ?? ['streak' => 0, 'lastLogin' => null];
        if (($daily['date'] ?? null) === $today) {
            return;
        }
        $lvl = $farm->level;
        $quests = [];
        foreach ($this->eco->raw('quests') as $q) {
            if ($q['type'] === 'order' && $lvl < $this->eco->raw('orders')['unlockLevel']) {
                continue;
            }
            $target = (int) round($q['target'] * ($q['type'] === 'sell' ? (1 + $lvl * 0.6) : (1 + $lvl * 0.05)));
            $quests[] = [
                'type' => $q['type'],
                'name' => str_replace('{n}', number_format($target, 0, ',', '.'), $q['name']),
                'target' => $target,
                'progress' => 0,
                'coins' => (int) round($q['coins'] * (1 + $lvl * 0.4)),
                'xp' => (int) round($q['xp'] * (1 + $lvl * 0.2)),
                'claimed' => false,
            ];
        }
        $farm->daily = [...$daily, 'date' => $today, 'quests' => $quests, 'loginClaimed' => false];
    }

    private function questProgress(Farm $farm, string $type, int $amount): void
    {
        $this->rollDaily($farm);
        $daily = $farm->daily;
        foreach ($daily['quests'] as &$q) {
            if ($q['type'] === $type && ! $q['claimed']) {
                $q['progress'] = min($q['target'], $q['progress'] + $amount);
            }
        }
        unset($q);
        $farm->daily = $daily;
    }

    /** Called when the farm is loaded: daily quests and orders exist and are current. */
    public function touch(User $user): void
    {
        $this->locked($user, function (Farm $farm) {
            $before = [$farm->daily, $farm->orders];
            $this->rollDaily($farm);
            $this->refillOrders($farm);
            if ($before !== [$farm->daily, $farm->orders]) {
                $farm->save();
            }
        });
    }

    /** @return array{coins: int, xp: int, levelUps: list<int>} */
    public function claimQuest(User $user, int $index): array
    {
        return $this->locked($user, function (Farm $farm) use ($index) {
            $this->rollDaily($farm);
            $daily = $farm->daily;
            $q = $daily['quests'][$index] ?? throw new GameException('Nhiệm vụ không tồn tại');
            if ($q['claimed'] || $q['progress'] < $q['target']) {
                throw new GameException($q['claimed'] ? 'Đã nhận thưởng' : 'Chưa hoàn thành nhiệm vụ');
            }
            $daily['quests'][$index]['claimed'] = true;
            $farm->daily = $daily;
            $farm->coins += $q['coins'];
            $levelUps = $this->addXp($farm, $q['xp']);
            $farm->save();

            return ['coins' => $q['coins'], 'xp' => $q['xp'], 'levelUps' => $levelUps];
        });
    }

    /** Daily login reward; the streak grows on consecutive days (cycling through the rewards), else restarts. */
    public function claimLogin(User $user): array
    {
        return $this->locked($user, function (Farm $farm) {
            $this->rollDaily($farm);
            $daily = $farm->daily;
            if ($daily['loginClaimed']) {
                throw new GameException('Hôm nay đã nhận quà');
            }
            $yesterday = now('Asia/Ho_Chi_Minh')->subDay()->toDateString();
            $rewards = $this->eco->raw('login');
            $streak = ($daily['lastLogin'] ?? null) === $yesterday ? $daily['streak'] % count($rewards) + 1 : 1;
            $coins = (int) round($rewards[$streak - 1] * (1 + $farm->level * 0.2));
            $farm->daily = [...$daily, 'streak' => $streak, 'lastLogin' => $daily['date'], 'loginClaimed' => true];
            $farm->coins += $coins;
            $farm->save();

            return ['coins' => $coins, 'streak' => $streak];
        });
    }

    // ---------------------------------------------------------------- animals

    public function buyAnimal(User $user, string $type): int
    {
        return $this->locked($user, function (Farm $farm) use ($type) {
            $a = $this->eco->animal($type) ?? throw new GameException('Con vật không tồn tại');
            if ($farm->level < $a['unlockLevel']) {
                throw new GameException("{$a['name']} mở ở cấp {$a['unlockLevel']}");
            }
            $animals = $farm->animals ?? [];
            if (count(array_filter($animals, fn ($x) => $x['type'] === $type)) >= $a['max']) {
                throw new GameException("Chuồng đã đủ {$a['max']} con");
            }
            if ($farm->coins < $a['price']) {
                throw new GameException('Không đủ xu!');
            }
            $farm->coins -= $a['price'];
            $animals[] = ['type' => $type, 'lastCollect' => self::nowMs()];
            $farm->animals = $animals;
            $farm->save();

            return count($animals);
        });
    }

    /**
     * Collect every ready product (or only from the animals at `which` indexes).
     *
     * @param  list<int>|null  $which
     * @return array{collected: int, xp: int, levelUps: list<int>}
     */
    public function collectAnimals(User $user, ?array $which = null): array
    {
        return $this->locked($user, function (Farm $farm) use ($which) {
            $now = self::nowMs() + config('game.harvest_grace_ms');
            $animals = $farm->animals ?? [];
            $inv = $farm->inventory;
            $n = 0;
            $xp = 0;
            foreach ($animals as $i => $x) {
                if ($which !== null && ! in_array($i, $which, true)) {
                    continue;
                }
                $a = $this->eco->animal($x['type']);
                if ($now < $x['lastCollect'] + $a['period'] * 1000) {
                    continue;
                }
                $inv[$a['product']] = ($inv[$a['product']] ?? 0) + 1;
                $xp += $a['xp'];
                $animals[$i]['lastCollect'] = self::nowMs();
                $n++;
            }
            if (! $n) {
                throw new GameException('Chưa có sản phẩm để thu');
            }
            $farm->animals = $animals;
            $farm->inventory = $inv;
            $levelUps = $this->addXp($farm, $xp);
            $farm->save();

            return ['collected' => $n, 'xp' => $xp, 'levelUps' => $levelUps];
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
