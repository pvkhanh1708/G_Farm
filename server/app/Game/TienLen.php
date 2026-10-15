<?php

namespace App\Game;

/**
 * Tiến lên miền Nam rules. A card is an int 0..51: rank * 4 + suit, where rank 0 = 3,
 * 1 = 4, ..., 11 = A, 12 = 2 and suit 0 ♠ < 1 ♣ < 2 ♦ < 3 ♥, so card order is plain int order.
 *
 * Combos: single, pair, triple, four (tứ quý), straight (sảnh, ≥3 consecutive ranks, no 2),
 * pairs (đôi thông, ≥3 consecutive pairs, no 2). A combo beats one of the same type and length
 * with a higher top card. Chopping (chặt): 3 đôi thông beats a single 2; tứ quý beats a single 2,
 * a pair of 2s and 3 đôi thông; 4 đôi thông beats a single 2, a pair of 2s, tứ quý and 3 đôi thông.
 */
class TienLen
{
    public const TWO = 12;

    public static function rank(int $c): int
    {
        return intdiv($c, 4);
    }

    /** @return list<list<int>> four sorted hands of 13 */
    public static function deal(): array
    {
        $deck = range(0, 51);
        shuffle($deck);
        $hands = array_chunk($deck, 13);
        foreach ($hands as &$h) {
            sort($h);
        }

        return $hands;
    }

    /**
     * @param  list<int>  $cards
     * @return array{type: string, len: int, top: int}|null
     */
    public static function combo(array $cards): ?array
    {
        $cards = array_values(array_unique($cards));
        sort($cards);
        $n = count($cards);
        if ($n === 0) {
            return null;
        }
        $ranks = array_map([self::class, 'rank'], $cards);
        $top = $cards[$n - 1];
        $same = count(array_unique($ranks)) === 1;
        if ($n === 1) {
            return ['type' => 'single', 'len' => 1, 'top' => $top];
        }
        if ($same) {
            return match ($n) {
                2 => ['type' => 'pair', 'len' => 2, 'top' => $top],
                3 => ['type' => 'triple', 'len' => 3, 'top' => $top],
                4 => ['type' => 'four', 'len' => 4, 'top' => $top],
                default => null,
            };
        }
        if (in_array(self::TWO, $ranks, true)) {
            return null;
        }
        // straight: distinct consecutive ranks
        if ($n >= 3 && count(array_unique($ranks)) === $n && $ranks[$n - 1] - $ranks[0] === $n - 1) {
            return ['type' => 'straight', 'len' => $n, 'top' => $top];
        }
        // consecutive pairs
        if ($n >= 6 && $n % 2 === 0) {
            for ($i = 0; $i < $n; $i += 2) {
                if ($ranks[$i] !== $ranks[$i + 1] || ($i > 0 && $ranks[$i] !== $ranks[$i - 2] + 1)) {
                    return null;
                }
            }

            return ['type' => 'pairs', 'len' => intdiv($n, 2), 'top' => $top];
        }

        return null;
    }

    /** Whether combo $a may be played on top of $prev (null = leading). */
    public static function beats(array $a, ?array $prev): bool
    {
        if ($prev === null) {
            return true;
        }
        if ($a['type'] === $prev['type'] && $a['len'] === $prev['len']) {
            return $a['top'] > $prev['top'];
        }
        $prevTwo = self::rank($prev['top']) === self::TWO;
        $pairs4 = $a['type'] === 'pairs' && $a['len'] >= 4;
        $pairs3 = $a['type'] === 'pairs' && $a['len'] === 3;

        return match (true) {
            $prev['type'] === 'single' && $prevTwo => $pairs3 || $pairs4 || $a['type'] === 'four',
            $prev['type'] === 'pair' && $prevTwo => $pairs4 || $a['type'] === 'four',
            $prev['type'] === 'four' => $pairs4,
            $prev['type'] === 'pairs' && $prev['len'] === 3 => $pairs4 || $a['type'] === 'four',
            default => false,
        };
    }

    /**
     * Every playable combo in a hand (small hands: enumerate by type).
     *
     * @param  list<int>  $hand
     * @return list<list<int>>
     */
    public static function options(array $hand): array
    {
        sort($hand);
        $byRank = [];
        foreach ($hand as $c) {
            $byRank[self::rank($c)][] = $c;
        }
        $out = [];
        foreach ($hand as $c) {
            $out[] = [$c];
        }
        foreach ($byRank as $cards) {
            $k = count($cards);
            for ($i = 0; $i < $k; $i++) {
                for ($j = $i + 1; $j < $k; $j++) {
                    $out[] = [$cards[$i], $cards[$j]];
                }
            }
            if ($k >= 3) {
                $out[] = array_slice($cards, 0, 3);
                $out[] = array_slice($cards, -3);
            }
            if ($k === 4) {
                $out[] = $cards;
            }
        }
        // straights and consecutive pairs (lowest/highest card picks per rank)
        $ranks = array_keys($byRank);
        sort($ranks);
        foreach ($ranks as $start) {
            if ($start === self::TWO) {
                continue;
            }
            $lowSeq = [];
            $highSeq = [];
            $pairSeq = [];
            for ($r = $start; $r < self::TWO && isset($byRank[$r]); $r++) {
                $lowSeq[] = $byRank[$r][0];
                $highSeq[] = $byRank[$r][count($byRank[$r]) - 1];
                if (count($lowSeq) >= 3) {
                    $out[] = $lowSeq;
                    $out[] = $highSeq;
                }
                if (count($byRank[$r]) >= 2 && count($pairSeq) === 2 * ($r - $start)) {
                    $pairSeq[] = $byRank[$r][count($byRank[$r]) - 2];
                    $pairSeq[] = $byRank[$r][count($byRank[$r]) - 1];
                    if (count($pairSeq) >= 6) {
                        $out[] = $pairSeq;
                    }
                }
            }
        }

        return $out;
    }

    /**
     * Bot play: lead with its lowest card's best small combo; follow with the cheapest
     * combo that beats the table, keeping 2s and bombs unless the hand is nearly empty.
     *
     * @param  list<int>  $hand
     * @return list<int>|null null = pass
     */
    public static function botPlay(array $hand, ?array $prev, bool $mustHave3s): ?array
    {
        $candidates = [];
        foreach (self::options($hand) as $cards) {
            $c = self::combo($cards);
            if (! $c || ! self::beats($c, $prev)) {
                continue;
            }
            if ($mustHave3s && ! in_array(0, $cards, true)) {
                continue;
            }
            $candidates[] = [$cards, $c];
        }
        if (! $candidates) {
            return null;
        }
        $endgame = count($hand) <= 4;
        // playing the whole hand at once wins
        foreach ($candidates as [$cards]) {
            if (count($cards) === count($hand)) {
                return $cards;
            }
        }
        $cost = function (array $cards, array $c) use ($prev, $endgame): float {
            $usesTwo = count(array_filter($cards, fn ($x) => self::rank($x) === self::TWO));
            $bomb = in_array($c['type'], ['four', 'pairs'], true);
            $score = self::rank($c['top']) * 10 + $c['top'] / 10;
            if ($prev === null) {
                // leading: shed many low cards at once
                $score -= count($cards) * 6;
                $score += self::rank(min($cards)) * 8;
            }
            if (! $endgame) {
                $score += $usesTwo * 120 + ($bomb ? 200 : 0);
            }

            return $score;
        };
        usort($candidates, fn ($x, $y) => $cost($x[0], $x[1]) <=> $cost($y[0], $y[1]));
        [$cards, $c] = $candidates[0];
        // when following, hold back 2s and bombs early in the game
        if ($prev !== null && ! $endgame && ($cost($cards, $c) >= 120)) {
            return null;
        }

        return $cards;
    }
}
