<?php

namespace App\Http\Controllers;

use App\Models\Farm;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Top players by farm (coins, level, tiles) or by game room record (wins, net
 * coins won), plus the caller's own rank.
 */
class LeaderboardController extends Controller
{
    private const LIMIT = 50;

    /** board => column it ranks by */
    private const COLUMNS = ['coins' => 'coins', 'level' => 'level', 'tiles' => 'unlocked', 'wins' => 'game_wins', 'winnings' => 'game_winnings'];

    public function __invoke(Request $request, string $board): JsonResponse
    {
        $col = self::COLUMNS[$board];
        $rows = Farm::query()
            ->join('users', 'users.id', '=', 'farms.user_id')
            ->when($board === 'wins' || $board === 'winnings', fn ($q) => $q->where($col, '>', 0))
            ->orderByDesc($col)
            ->when($board === 'level', fn ($q) => $q->orderByDesc('xp'))
            ->orderBy('farms.id')
            ->limit(self::LIMIT)
            ->get(['users.id', 'users.name', 'users.avatar', 'farms.coins', 'farms.level', 'farms.xp', 'farms.unlocked', 'farms.game_wins', 'farms.game_winnings']);

        $mine = Farm::where('user_id', $request->user()->id)->first();
        $me = null;
        if ($mine) {
            $ahead = Farm::where($col, '>', $mine->$col)
                ->when($board === 'level', fn ($q) => $q->orWhere(fn ($q) => $q->where('level', $mine->level)->where('xp', '>', $mine->xp)))
                ->count();
            $me = ['rank' => $ahead + 1, 'value' => $mine->$col, 'level' => $mine->level];
        }

        // equal scores share a rank (1, 2, 2, 4), matching the caller's own rank
        $rank = 0;
        $prev = null;
        $ranks = $rows->map(function ($r, $i) use ($board, $col, &$rank, &$prev) {
            $key = $board === 'level' ? [$r->level, $r->xp] : $r->$col;
            if ($key !== $prev) {
                $rank = $i + 1;
                $prev = $key;
            }

            return $rank;
        });

        return response()->json([
            'board' => $board,
            'rows' => $rows->map(fn ($r, $i) => [
                'rank' => $ranks[$i],
                'id' => $r->id,
                'name' => $r->name,
                'avatar' => $r->avatar,
                'level' => $r->level,
                'value' => $r->$col,
            ]),
            'me' => $me,
        ]);
    }
}
