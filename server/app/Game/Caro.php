<?php

namespace App\Game;

/**
 * Gomoku-style caro on a 15x15 board: five (or more) in a row wins.
 * Cells: 0 empty, 1 host (X), 2 guest or bot (O). Index = y * SIZE + x.
 */
class Caro
{
    public const SIZE = 15;

    public const WIN = 5;

    private const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

    /** @return list<int> */
    public static function emptyBoard(): array
    {
        return array_fill(0, self::SIZE * self::SIZE, 0);
    }

    public static function inside(int $x, int $y): bool
    {
        return $x >= 0 && $y >= 0 && $x < self::SIZE && $y < self::SIZE;
    }

    /**
     * The winning line through (x, y) for its owner, or null.
     *
     * @param  list<int>  $b
     * @return list<array{0:int,1:int}>|null
     */
    public static function winLine(array $b, int $x, int $y): ?array
    {
        $side = $b[$y * self::SIZE + $x];
        if (! $side) {
            return null;
        }
        foreach (self::DIRS as [$dx, $dy]) {
            $line = [[$x, $y]];
            foreach ([1, -1] as $sgn) {
                for ($k = 1; $k < self::SIZE; $k++) {
                    $cx = $x + $dx * $k * $sgn;
                    $cy = $y + $dy * $k * $sgn;
                    if (! self::inside($cx, $cy) || $b[$cy * self::SIZE + $cx] !== $side) {
                        break;
                    }
                    $line[] = [$cx, $cy];
                }
            }
            if (count($line) >= self::WIN) {
                usort($line, fn ($a, $c) => $a[0] <=> $c[0] ?: $a[1] <=> $c[1]);

                return $line;
            }
        }

        return null;
    }

    /** @param list<int> $b */
    public static function full(array $b): bool
    {
        return ! in_array(0, $b, true);
    }

    /**
     * Bot move: score every empty cell near existing stones for attack (own lines)
     * and defence (opponent lines); take the best. Strong enough to punish open
     * threes and to finish its own fours.
     *
     * @param  list<int>  $b
     * @return array{0:int,1:int}
     */
    public static function botMove(array $b, int $me): array
    {
        $them = 3 - $me;
        $n = self::SIZE;
        if (! array_filter($b)) {
            return [intdiv($n, 2), intdiv($n, 2)];
        }
        $best = null;
        $bestScore = -1;
        for ($y = 0; $y < $n; $y++) {
            for ($x = 0; $x < $n; $x++) {
                if ($b[$y * $n + $x] || ! self::nearStone($b, $x, $y)) {
                    continue;
                }
                $score = self::cellScore($b, $x, $y, $me) * 1.1 + self::cellScore($b, $x, $y, $them);
                // a little centre bias breaks ties toward useful space
                $score -= (abs($x - 7) + abs($y - 7)) * 0.5;
                if ($score > $bestScore) {
                    $bestScore = $score;
                    $best = [$x, $y];
                }
            }
        }

        return $best ?? [intdiv($n, 2), intdiv($n, 2)];
    }

    /** @param list<int> $b */
    private static function nearStone(array $b, int $x, int $y): bool
    {
        for ($dy = -2; $dy <= 2; $dy++) {
            for ($dx = -2; $dx <= 2; $dx++) {
                $cx = $x + $dx;
                $cy = $y + $dy;
                if (self::inside($cx, $cy) && $b[$cy * self::SIZE + $cx]) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * How good it would be for `side` to play (x, y): sum over the 4 directions of
     * the line it would make, by length and open ends.
     *
     * @param  list<int>  $b
     */
    private static function cellScore(array $b, int $x, int $y, int $side): float
    {
        $total = 0;
        foreach (self::DIRS as [$dx, $dy]) {
            $count = 1;
            $open = 0;
            foreach ([1, -1] as $sgn) {
                $k = 1;
                while (true) {
                    $cx = $x + $dx * $k * $sgn;
                    $cy = $y + $dy * $k * $sgn;
                    if (! self::inside($cx, $cy)) {
                        break;
                    }
                    $v = $b[$cy * self::SIZE + $cx];
                    if ($v === $side) {
                        $count++;
                        $k++;

                        continue;
                    }
                    if ($v === 0) {
                        $open++;
                    }
                    break;
                }
            }
            $total += match (true) {
                $count >= 5 => 1_000_000,
                $count === 4 && $open === 2 => 100_000,
                $count === 4 && $open === 1 => 12_000,
                $count === 3 && $open === 2 => 6_000,
                $count === 3 && $open === 1 => 500,
                $count === 2 && $open === 2 => 250,
                $count === 2 && $open === 1 => 40,
                $open > 0 => 8,
                default => 0,
            };
        }

        return $total;
    }
}
