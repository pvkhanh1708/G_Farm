<?php

namespace App\Game;

use App\Models\Farm;
use App\Models\FarmEvent;
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
            $plantings[(string) $p->tile] = ['crop' => $p->crop, 'plantedAt' => $p->planted_at, 'stolen' => $p->stolen, 'fertilized' => $p->fertilized];
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
            'machines' => (object) ($farm->machines ?? []),
            'dog' => $farm->dog,
            'water' => (object) ($farm->water ?? []),
            'penSlots' => (object) ($farm->pen_slots ?? []),
            'news' => FarmEvent::where('user_id', $farm->user_id)->where('seen', false)->count(),
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
                // neighbours may have taken some already
                $inventory[$p->crop] = ($inventory[$p->crop] ?? 0) + max(0, $this->eco->harvestAmount($crop, $farm->soil_level) - $p->stolen);
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
                'machines' => null,
                'dog' => false,
                'water' => null,
                'pen_slots' => null,
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
                // once per planting
                if ($left <= 1000 || $p->fertilized) {
                    continue;
                }
                $cost = $this->eco->fertilizerCost($crop);
                if ($farm->coins < $cost) {
                    break;
                }
                $farm->coins -= $cost;
                $p->planted_at -= (int) round($left * $this->eco->raw('fertilizer')['cut']);
                $p->fertilized = true;
                $p->save();
                $done[] = $p->tile;
            }
            if (! $done) {
                throw new GameException('Không bón được: cây đã chín, đã bón rồi hoặc thiếu xu');
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
            $orders[] = $this->newOrder($farm);
        }
        $farm->orders = $orders;
    }

    private function newOrder(Farm $farm): array
    {
        $level = $farm->level;
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
        // sometimes a good from a machine the farm owns
        $goods = [];
        foreach (array_keys($farm->machines ?? []) as $mid) {
            foreach ($this->eco->machine($mid)['recipes'] as $r) {
                $goods[] = $this->eco->good($r['output']);
            }
        }
        if ($goods && random_int(1, 100) <= 45) {
            $g = $goods[array_rand($goods)];
            $qty = random_int(1, 3);
            $items[$g['id']] = $qty;
            $value += $qty * $g['sellPrice'];
            $xp += $qty * $g['xp'];
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
            $orders[$i] = $this->newOrder($farm);
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
            $orders[$i] = $this->newOrder($farm);
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
            $places = $farm->pen_slots[$type] ?? 0;
            if (count(array_filter($animals, fn ($x) => $x['type'] === $type)) >= $places) {
                throw new GameException($places ? "Chuồng đã đủ {$places} chỗ, hãy mở thêm chỗ" : "Hãy mở chỗ trong chuồng {$a['name']} trước");
            }
            if ($farm->coins < $a['price']) {
                throw new GameException('Không đủ xu!');
            }
            $farm->coins -= $a['price'];
            // a new animal arrives fed: its first product is on the house
            $animals[] = ['type' => $type, 'fedAt' => self::nowMs()];
            $farm->animals = $animals;
            $farm->water = [...($farm->water ?? []), $type => self::nowMs()];
            $farm->save();

            return count($animals);
        });
    }

    /**
     * Feed the hungry animals (or only those at `which`) from the barn: each eats its feed
     * crop and starts making its product.
     *
     * @param  list<int>|null  $which
     * @return array{fed: int}
     */
    public function feedAnimals(User $user, ?array $which = null): array
    {
        return $this->locked($user, function (Farm $farm) use ($which) {
            $animals = $farm->animals ?? [];
            $inv = $farm->inventory;
            $fed = 0;
            $short = null;
            $dry = null;
            foreach ($animals as $i => $x) {
                if (($which !== null && ! in_array($i, $which, true)) || ($x['fedAt'] ?? null) !== null) {
                    continue;
                }
                if (! $this->hasWater($farm, $x['type'])) {
                    $dry ??= $x['type'];
                    continue;
                }
                $feed = $this->eco->animal($x['type'])['feed'];
                if (($inv[$feed['crop']] ?? 0) < $feed['qty']) {
                    $short ??= $feed;
                    continue;
                }
                $inv[$feed['crop']] -= $feed['qty'];
                $animals[$i]['fedAt'] = self::nowMs();
                $fed++;
            }
            if (! $fed && $dry && ! $short) {
                $name = $dry === 'cow' ? 'chuồng bò' : 'chuồng gà';
                throw new GameException("Máng nước {$name} cạn rồi, hãy đổ nước trước");
            }
            if (! $fed) {
                throw new GameException($short
                    ? "Cần {$short['qty']} {$this->eco->crop($short['crop'])['name']} trong kho để cho ăn"
                    : 'Không có con nào đói');
            }
            $farm->animals = $animals;
            $farm->inventory = $inv;
            $farm->save();

            return ['fed' => $fed];
        });
    }

    /**
     * Collect every ready product (or only from the animals at `which` indexes); the
     * animals are hungry again afterwards.
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
                if (($x['fedAt'] ?? null) === null || $now < $x['fedAt'] + $a['period'] * 1000) {
                    continue;
                }
                $inv[$a['product']] = ($inv[$a['product']] ?? 0) + 1;
                $xp += $a['xp'];
                $animals[$i]['fedAt'] = null;
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

    private function hasWater(Farm $farm, string $type): bool
    {
        $at = $farm->water[$type] ?? null;

        return $at !== null && self::nowMs() < $at + $this->eco->raw('water')['minutes'] * 60_000;
    }

    /** Fill a pen's water (free); animals only eat while there is water. */
    public function water(User $user, string $type): void
    {
        $this->locked($user, function (Farm $farm) use ($type) {
            $this->eco->animal($type) ?? throw new GameException('Chuồng không tồn tại');
            $farm->water = [...($farm->water ?? []), $type => self::nowMs()];
            $farm->save();
        });
    }

    /**
     * Open the next place in a pen. Each place needs its own level and costs coins (economy: animals[].slots).
     *
     * @return array{slots: int}
     */
    public function expandPen(User $user, string $type): array
    {
        return $this->locked($user, function (Farm $farm) use ($type) {
            $a = $this->eco->animal($type) ?? throw new GameException('Chuồng không tồn tại');
            $have = $farm->pen_slots[$type] ?? 0;
            $next = $a['slots'][$have] ?? throw new GameException('Chuồng đã mở hết chỗ');
            $this->pay($farm, $next['level'], $next['cost']);
            $farm->pen_slots = [...($farm->pen_slots ?? []), $type => $have + 1];
            $farm->save();

            return ['slots' => $have + 1];
        });
    }

    /** Open one more batch place on a machine (economy: machines[].slots, after the first). */
    public function expandMachine(User $user, string $id): array
    {
        return $this->locked($user, function (Farm $farm) use ($id) {
            $m = $this->eco->machine($id) ?? throw new GameException('Máy không tồn tại');
            $machines = $farm->machines ?? [];
            if (! isset($machines[$id])) {
                throw new GameException("Chưa có {$m['name']}");
            }
            $have = $machines[$id]['slots'] ?? 1;
            $next = $m['slots'][$have - 1] ?? throw new GameException("{$m['name']} đã mở hết ô");
            $this->pay($farm, $next['level'], $next['cost']);
            $machines[$id]['slots'] = $have + 1;
            $farm->machines = $machines;
            $farm->save();

            return ['slots' => $have + 1];
        });
    }

    /** Level check, then take the coins. */
    private function pay(Farm $farm, int $level, int $cost): void
    {
        if ($farm->level < $level) {
            throw new GameException("Cần đạt cấp {$level}");
        }
        if ($farm->coins < $cost) {
            throw new GameException('Không đủ xu!');
        }
        $farm->coins -= $cost;
    }

    public function buyDog(User $user): void
    {
        $this->locked($user, function (Farm $farm) {
            $dog = $this->eco->raw('neighbors')['dog'];
            if ($farm->dog) {
                throw new GameException('Đã có chó canh');
            }
            if ($farm->level < $dog['unlockLevel']) {
                throw new GameException("{$dog['name']} mở ở cấp {$dog['unlockLevel']}");
            }
            if ($farm->coins < $dog['price']) {
                throw new GameException('Không đủ xu!');
            }
            $farm->coins -= $dog['price'];
            $farm->dog = true;
            $farm->save();
        });
    }

    // ---------------------------------------------------------------- workshop

    public function buyMachine(User $user, string $id): void
    {
        $this->locked($user, function (Farm $farm) use ($id) {
            $m = $this->eco->machine($id) ?? throw new GameException('Máy không tồn tại');
            $machines = $farm->machines ?? [];
            if (isset($machines[$id])) {
                throw new GameException("Đã có {$m['name']}");
            }
            if ($farm->level < $m['unlockLevel']) {
                throw new GameException("{$m['name']} mở ở cấp {$m['unlockLevel']}");
            }
            if ($farm->coins < $m['price']) {
                throw new GameException('Không đủ xu!');
            }
            $farm->coins -= $m['price'];
            // a new machine has one batch place; more are opened with expandMachine
            $machines[$id] = ['queue' => [], 'slots' => 1];
            $farm->machines = $machines;
            $farm->save();
        });
    }

    /** Queue one batch of `output` on a machine: the ingredients leave the barn now. */
    public function startJob(User $user, string $machineId, string $output): array
    {
        return $this->locked($user, function (Farm $farm) use ($machineId, $output) {
            $m = $this->eco->machine($machineId) ?? throw new GameException('Máy không tồn tại');
            $machines = $farm->machines ?? [];
            if (! isset($machines[$machineId])) {
                throw new GameException("Chưa có {$m['name']}");
            }
            $recipe = $this->eco->recipe($m, $output) ?? throw new GameException('Công thức không tồn tại');
            $queue = $machines[$machineId]['queue'];
            $places = $machines[$machineId]['slots'] ?? 1;
            if (count($queue) >= $places) {
                throw new GameException("{$m['name']} đã xếp đủ {$places} mẻ");
            }
            $inv = $farm->inventory;
            foreach ($recipe['inputs'] as $item => $qty) {
                if (($inv[$item] ?? 0) < $qty) {
                    throw new GameException('Kho chưa đủ nguyên liệu');
                }
            }
            foreach ($recipe['inputs'] as $item => $qty) {
                $inv[$item] -= $qty;
            }
            // batches run one after another
            $start = max(self::nowMs(), $queue ? end($queue)['readyAt'] : 0);
            $queue[] = ['output' => $output, 'readyAt' => $start + $recipe['seconds'] * 1000];
            $machines[$machineId]['queue'] = $queue;
            $farm->machines = $machines;
            $farm->inventory = $inv;
            $farm->save();

            return end($queue);
        });
    }

    /** Take every finished batch (of one machine, or all) into the barn. */
    public function collectGoods(User $user, ?string $machineId = null): array
    {
        return $this->locked($user, function (Farm $farm) use ($machineId) {
            $now = self::nowMs() + config('game.harvest_grace_ms');
            $machines = $farm->machines ?? [];
            $inv = $farm->inventory;
            $got = [];
            $xp = 0;
            foreach ($machines as $id => $state) {
                if ($machineId !== null && $id !== $machineId) {
                    continue;
                }
                $left = [];
                foreach ($state['queue'] as $job) {
                    if ($job['readyAt'] > $now) {
                        $left[] = $job;
                        continue;
                    }
                    $inv[$job['output']] = ($inv[$job['output']] ?? 0) + 1;
                    $got[$job['output']] = ($got[$job['output']] ?? 0) + 1;
                    $xp += $this->eco->good($job['output'])['xp'];
                }
                $machines[$id]['queue'] = $left;
            }
            if (! $got) {
                throw new GameException('Chưa có mẻ nào xong');
            }
            $farm->machines = $machines;
            $farm->inventory = $inv;
            $levelUps = $this->addXp($farm, $xp);
            $farm->save();

            return ['goods' => $got, 'xp' => $xp, 'levelUps' => $levelUps];
        });
    }

    // ---------------------------------------------------------------- neighbours

    /** Crops a thief would take from this planting right now (0 = nothing to take). */
    /** Whether a thief may still try this crop: ripe, and nobody has tried it yet (a miss counts). */
    private function stealable(Farm $owner, Planting $p, int $now, int $thiefId): int
    {
        $crop = $this->eco->crop($p->crop);

        return $crop && $now >= $p->planted_at + $this->eco->growMs($crop, $owner->sprinkler_level) && ! $p->thieves ? 1 : 0;
    }

    /**
     * What one theft takes: 25% of the tile on average. The whole part is taken, the rest is a chance,
     * so a one-fruit durian is taken 1 time in 4 and missed otherwise. A tile of several keeps at least one.
     */
    private function stealRoll(Farm $owner, Planting $p): int
    {
        $full = $this->eco->harvestAmount($this->eco->crop($p->crop), $owner->soil_level);
        $share = $full * $this->eco->raw('neighbors')['stealShare'];
        // tests pin the roll with config('game.steal_roll')
        $roll = config('game.steal_roll') ?? mt_rand() / mt_getrandmax();
        $qty = (int) floor($share) + ($roll < $share - floor($share) ? 1 : 0);

        return $full > 1 ? min($qty, $full - 1) : $qty;
    }

    /** Recently active farms to visit, those with crops to take first. */
    public function neighbours(User $user): array
    {
        $now = self::nowMs();
        $rows = [];
        $farms = Farm::with(['user:id,name,avatar', 'plantings'])->where('user_id', '!=', $user->id)->orderByDesc('updated_at')->limit(40)->get();
        foreach ($farms as $f) {
            $ripe = $f->plantings->filter(fn (Planting $p) => $this->stealable($f, $p, $now, $user->id) > 0)->count();
            $rows[] = ['id' => $f->user_id, 'name' => $f->user->name, 'avatar' => $f->user->avatar, 'level' => $f->level, 'ripe' => $ripe, 'dog' => $f->dog];
        }
        usort($rows, fn ($a, $b) => $b['ripe'] <=> $a['ripe']);

        return array_slice($rows, 0, 15);
    }

    /** Another player's farm as a visitor sees it. */
    public function visit(User $viewer, int $ownerId): array
    {
        $owner = Farm::with(['user:id,name,avatar', 'plantings'])->where('user_id', $ownerId)->first();
        if (! $owner || $ownerId === $viewer->id) {
            throw new GameException('Không tìm thấy nông trại');
        }
        $now = self::nowMs();
        // read fresh: right after a theft the user's cached farm still has the old counters
        $mine = Farm::where('user_id', $viewer->id)->first() ?? $this->farmFor($viewer);
        $this->rollDaily($mine);
        $cfg = $this->eco->raw('neighbors');

        return [
            'id' => $ownerId,
            'name' => $owner->user->name,
            'avatar' => $owner->user->avatar,
            'level' => $owner->level,
            'unlocked' => $owner->unlocked,
            'dog' => $owner->dog,
            'plantings' => $owner->plantings->sortBy('tile')->values()->map(fn (Planting $p) => [
                'tile' => $p->tile,
                'crop' => $p->crop,
                'plantedAt' => $p->planted_at,
                'growMs' => $this->eco->growMs($this->eco->crop($p->crop), $owner->sprinkler_level),
                'steal' => $this->stealable($owner, $p, $now, $viewer->id),
                // each crop can be watered once, by one neighbour
                'helped' => ! empty($p->helpers),
            ]),
        ];
    }

    /** Lock the visitor's and the owner's farms (always in id order, so two visits cannot deadlock). */
    private function lockedPair(User $visitor, int $ownerId, Closure $fn): mixed
    {
        $this->farmFor($visitor);
        if ($ownerId === $visitor->id) {
            throw new GameException('Đây là nông trại của bạn');
        }

        return DB::transaction(function () use ($visitor, $ownerId, $fn) {
            $farms = Farm::whereIn('user_id', [$visitor->id, $ownerId])->orderBy('id')->lockForUpdate()->get()->keyBy('user_id');
            $owner = $farms[$ownerId] ?? throw new GameException('Không tìm thấy nông trại');
            $mine = $farms[$visitor->id];
            $this->rollDaily($mine);

            return $fn($mine, $owner);
        });
    }

    /** @return array{caught: bool, crop: string, qty: int, fine: int} */
    public function steal(User $thief, int $ownerId, int $tile): array
    {
        return $this->lockedPair($thief, $ownerId, function (Farm $mine, Farm $owner) use ($thief, $tile) {
            $cfg = $this->eco->raw('neighbors');
            $p = $owner->plantings()->where('tile', $tile)->lockForUpdate()->first() ?? throw new GameException('Ô này không có cây');
            if (! $this->stealable($owner, $p, self::nowMs(), $thief->id)) {
                throw new GameException('Ô này không hái được nữa');
            }
            $qty = $this->stealRoll($owner, $p);
            $p->thieves = [...($p->thieves ?? []), $thief->id];
            $dog = $cfg['dog'];
            // tests pin the odds with config('game.dog_catch_chance')
            if ($owner->dog && mt_rand() / mt_getrandmax() < (config('game.dog_catch_chance') ?? $dog['catchChance'])) {
                // caught by the dog: no crops, and a fine paid to the owner
                $fine = min($mine->coins, $dog['fineBase'] + $dog['finePerLevel'] * $mine->level);
                $mine->coins -= $fine;
                $owner->coins += $fine;
                $p->save();
                $mine->save();
                $owner->save();
                $this->event($owner, $thief, 'caught', $p->crop, 0, $fine);

                return ['caught' => true, 'crop' => $p->crop, 'qty' => 0, 'fine' => $fine];
            }
            $p->stolen += $qty;
            $p->save();
            $inv = $mine->inventory;
            $inv[$p->crop] = ($inv[$p->crop] ?? 0) + $qty;
            $mine->inventory = $inv;
            $mine->save();
            $owner->touch();
            $this->event($owner, $thief, 'steal', $p->crop, $qty, 0);

            return ['caught' => false, 'crop' => $p->crop, 'qty' => $qty, 'fine' => 0];
        });
    }

    /** Water a neighbour's growing crop: it grows faster, the helper earns a little. */
    public function help(User $helper, int $ownerId, int $tile): array
    {
        return $this->lockedPair($helper, $ownerId, function (Farm $mine, Farm $owner) use ($helper, $tile) {
            $cfg = $this->eco->raw('neighbors');
            $p = $owner->plantings()->where('tile', $tile)->lockForUpdate()->first() ?? throw new GameException('Ô này không có cây');
            if (! empty($p->helpers)) {
                throw new GameException('Cây này đã được tưới rồi');
            }
            $left = $p->planted_at + $this->eco->growMs($this->eco->crop($p->crop), $owner->sprinkler_level) - self::nowMs();
            if ($left <= 1000) {
                throw new GameException('Cây đã chín, không cần tưới');
            }
            $p->planted_at -= (int) round($left * $cfg['helpCut']);
            $p->helpers = [...($p->helpers ?? []), $helper->id];
            $p->save();
            $mine->coins += $cfg['helpCoins'];
            $levelUps = $this->addXp($mine, $cfg['helpXp']);
            $mine->save();
            $owner->touch();
            $this->event($owner, $helper, 'help', $p->crop, 0, 0);

            return ['coins' => $cfg['helpCoins'], 'xp' => $cfg['helpXp'], 'levelUps' => $levelUps];
        });
    }

    private function event(Farm $owner, User $actor, string $type, ?string $crop, int $qty, int $coins): void
    {
        FarmEvent::create(['user_id' => $owner->user_id, 'actor_id' => $actor->id, 'type' => $type, 'crop' => $crop, 'qty' => $qty, 'coins' => $coins]);
    }

    /** The latest things neighbours did on this farm; reading them marks them seen. */
    public function news(User $user): array
    {
        $events = FarmEvent::with('actor:id,name,avatar')->where('user_id', $user->id)->orderByDesc('id')->limit(30)->get();
        FarmEvent::where('user_id', $user->id)->where('seen', false)->update(['seen' => true]);

        return $events->map(fn (FarmEvent $e) => [
            'id' => $e->id,
            'type' => $e->type,
            'actor' => ['id' => $e->actor_id, 'name' => $e->actor?->name, 'avatar' => $e->actor?->avatar],
            'crop' => $e->crop,
            'qty' => $e->qty,
            'coins' => $e->coins,
            'seen' => $e->seen,
            'at' => $e->created_at?->getTimestampMs(),
        ])->all();
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
