<?php

namespace App\Game;

use RuntimeException;

/**
 * Read-only view of shared/economy.json plus the level/land formulas.
 * Mirrors client/src/game/config.ts; keep the two in step.
 */
class Economy
{
    /** @var array<string, mixed> */
    private array $data;

    /** @var array<string, array<string, mixed>> */
    private array $crops = [];

    public function __construct(string $path)
    {
        $json = @file_get_contents($path);
        if ($json === false) {
            throw new RuntimeException("Economy data not found at {$path}");
        }
        $this->data = json_decode($json, true, flags: JSON_THROW_ON_ERROR);
        foreach ($this->data['crops'] as $crop) {
            $this->crops[$crop['id']] = $crop;
        }
    }

    public function startingCoins(): int
    {
        return $this->data['startingCoins'];
    }

    public function startUnlocked(): int
    {
        return $this->data['startUnlocked'];
    }

    public function plantStaggerMs(): int
    {
        return $this->data['plantStaggerMs'];
    }

    /** @return array<string, mixed>|null */
    public function crop(string $id): ?array
    {
        return $this->crops[$id] ?? null;
    }

    /** @return list<string> */
    public function cropIds(): array
    {
        return array_keys($this->crops);
    }

    public function xpToNext(int $level): int
    {
        return (int) round($this->data['xp']['base'] * $level ** $this->data['xp']['exponent']);
    }

    /** Tiles a player of this level may own: one more per level. */
    public function tileCap(int $level): int
    {
        return $this->startUnlocked() + $level;
    }

    public function levelForTiles(int $count): int
    {
        return max(1, $count - $this->startUnlocked());
    }

    public function levelReward(int $level): int
    {
        return $this->data['levelRewardPerLevel'] * $level;
    }

    public function unlockCost(int $unlockedCount): int
    {
        $extra = max(0, $unlockedCount - $this->startUnlocked());
        $c = $this->data['tileCost'];

        return (int) (round(($c['base'] + $c['factor'] * $extra ** $c['exponent']) / 10) * 10);
    }

    /** @return list<string> */
    public function cropsUnlockedAt(int $level): array
    {
        return array_values(array_map(fn ($c) => $c['id'], array_filter($this->crops, fn ($c) => $c['unlockLevel'] === $level)));
    }

    // ---------------------------------------------------------------- progression (mirrors client/src/game/config.ts)

    public function raw(string $key): mixed
    {
        return $this->data[$key];
    }

    /** Coins to raise an upgrade from `level` to `level + 1`. */
    public function upgradeCost(string $kind, int $level): int
    {
        $u = $this->data['upgrades'][$kind];

        return (int) (round($u['baseCost'] * $u['growth'] ** $level / 10) * 10);
    }

    /** Growth time of a crop with the sprinkler at `sprinkler`. */
    public function growMs(array $crop, int $sprinkler): int
    {
        return (int) round($crop['growSeconds'] * 1000 * (1 - $this->data['upgrades']['sprinkler']['speedPerLevel'] * $sprinkler));
    }

    /** Crops harvested from one tile with the soil at `soil`. */
    public function harvestAmount(array $crop, int $soil): int
    {
        return $crop['yield'] + (int) round($crop['yield'] * $this->data['upgrades']['soil']['yieldPerLevel'] * $soil);
    }

    public function fertilizerCost(array $crop): int
    {
        return max(1, (int) round($crop['seedPrice'] * $this->data['fertilizer']['costShare']));
    }

    /** @return array<string, mixed>|null */
    public function animal(string $id): ?array
    {
        foreach ($this->data['animals'] as $a) {
            if ($a['id'] === $id) {
                return $a;
            }
        }

        return null;
    }

    /** Sellable item: a crop, an animal product or a workshop good, as {name, sellPrice}. */
    public function item(string $id): ?array
    {
        if ($c = $this->crop($id)) {
            return $c;
        }
        foreach ($this->data['animals'] as $a) {
            if ($a['product'] === $id) {
                return ['id' => $id, 'name' => $a['productName'], 'sellPrice' => $a['sellPrice']];
            }
        }

        return $this->good($id);
    }

    /** @return list<string> */
    public function itemIds(): array
    {
        return [...$this->cropIds(), ...array_column($this->data['animals'], 'product'), ...array_column($this->data['goods'], 'id')];
    }

    /** Workshop good: {id, name, sellPrice, xp}. */
    public function good(string $id): ?array
    {
        foreach ($this->data['goods'] as $g) {
            if ($g['id'] === $id) {
                return $g;
            }
        }

        return null;
    }

    /** @return array<string, mixed>|null */
    public function machine(string $id): ?array
    {
        foreach ($this->data['machines'] as $m) {
            if ($m['id'] === $id) {
                return $m;
            }
        }

        return null;
    }

    /** @return list<array<string, mixed>> */
    public function machines(): array
    {
        return $this->data['machines'];
    }

    /** The recipe of `machine` that makes `output`. */
    public function recipe(array $machine, string $output): ?array
    {
        foreach ($machine['recipes'] as $r) {
            if ($r['output'] === $output) {
                return $r;
            }
        }

        return null;
    }
}
