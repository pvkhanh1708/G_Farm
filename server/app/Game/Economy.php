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
}
