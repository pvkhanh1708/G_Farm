<?php

namespace Tests\Feature;

use App\Game\Caro;
use App\Models\Farm;
use App\Models\GameTable;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GameRoomTest extends TestCase
{
    use RefreshDatabase;

    /** Several players per test: drop the cached auth user so each request uses its own token. */
    public function json($method, $uri, array $data = [], array $headers = [], $options = 0)
    {
        $this->app['auth']->forgetGuards();

        return parent::json($method, $uri, $data, $headers, $options);
    }

    /** @return array{0: array, 1: int} auth header and user id, with `coins` in the farm */
    private function player(int $coins): array
    {
        $res = $this->postJson('/auth/guest')->json();
        Farm::where('user_id', $res['user']['id'])->update(['coins' => $coins]);

        return [['Authorization' => 'Bearer '.$res['token']], $res['user']['id']];
    }

    private function coins(int $userId): int
    {
        return Farm::where('user_id', $userId)->value('coins');
    }

    public function test_stake_is_held_and_winner_takes_the_pot_minus_fee(): void
    {
        [$a, $aid] = $this->player(1000);
        [$b, $bid] = $this->player(1000);
        $id = $this->postJson('/games/tables', ['game' => 'caro', 'stake' => 200], $a)->assertOk()->json('result.id');
        $this->assertSame(800, $this->coins($aid));

        $this->getJson('/games/tables?game=caro', $b)->assertJsonPath('result.tables.0.id', $id)->assertJsonPath('result.tables.0.stake', 200);
        $this->postJson("/games/tables/$id/join", [], $b)->assertOk()->assertJsonPath('result.status', 'playing')->assertJsonPath('result.you', 2);
        $this->assertSame(800, $this->coins($bid));

        // host (X) plays a row at y=7, guest plays y=8
        for ($i = 0; $i < 4; $i++) {
            $this->postJson("/games/tables/$id/move", ['x' => $i, 'y' => 7], $a)->assertOk();
            $this->postJson("/games/tables/$id/move", ['x' => $i, 'y' => 8], $b)->assertOk();
        }
        $this->postJson("/games/tables/$id/move", ['x' => 4, 'y' => 7], $a)
            ->assertOk()
            ->assertJsonPath('result.status', 'finished')
            ->assertJsonPath('result.winner', 1)
            ->assertJsonPath('result.endReason', 'line')
            ->assertJsonPath('result.payout', 380);
        $this->assertSame(800 + 380, $this->coins($aid));
        $this->assertSame(800, $this->coins($bid));
        $this->getJson('/leaderboard/wins', $b)->assertOk()
            ->assertJsonPath('rows.0.id', $aid)->assertJsonPath('rows.0.value', 1)->assertJsonCount(1, 'rows')
            ->assertJsonPath('me.value', 0);
        $this->getJson('/leaderboard/winnings', $a)->assertJsonPath('rows.0.value', 180)->assertJsonPath('me.rank', 1);
    }

    public function test_farm_leaderboards_rank_by_coins_level_and_tiles(): void
    {
        [$a, $aid] = $this->player(500);
        [$b, $bid] = $this->player(900);
        \App\Models\Farm::where('user_id', $aid)->update(['level' => 7, 'xp' => 10, 'unlocked' => 30]);
        \App\Models\Farm::where('user_id', $bid)->update(['level' => 7, 'xp' => 50, 'unlocked' => 12]);
        $this->getJson('/leaderboard/coins', $a)->assertOk()->assertJsonPath('rows.0.id', $bid)->assertJsonPath('me.rank', 2)->assertJsonPath('me.value', 500);
        $this->getJson('/leaderboard/level', $a)->assertJsonPath('rows.0.id', $bid)->assertJsonPath('me.rank', 2);
        $this->getJson('/leaderboard/tiles', $a)->assertJsonPath('rows.0.value', 30)->assertJsonPath('me.rank', 1);
        $this->getJson('/leaderboard/nope', $a)->assertNotFound();
    }

    public function test_turns_and_cells_are_enforced(): void
    {
        [$a] = $this->player(1000);
        [$b] = $this->player(1000);
        $id = $this->postJson('/games/tables', ['game' => 'caro', 'stake' => 100], $a)->json('result.id');
        $this->postJson("/games/tables/$id/join", [], $b);
        $this->postJson("/games/tables/$id/move", ['x' => 0, 'y' => 0], $b)->assertStatus(422)->assertJsonPath('message', 'Chưa tới lượt bạn');
        $this->postJson("/games/tables/$id/move", ['x' => 0, 'y' => 0], $a)->assertOk();
        $this->postJson("/games/tables/$id/move", ['x' => 0, 'y' => 0], $b)->assertStatus(422)->assertJsonPath('message', 'Ô này đã có quân');
        $this->postJson("/games/tables/$id/move", ['x' => 15, 'y' => 0], $b)->assertStatus(422);
        [$c] = $this->player(1000);
        $this->getJson("/games/tables/$id", $c)->assertStatus(422);
    }

    public function test_cannot_bet_more_than_you_have_or_open_two_tables(): void
    {
        [$a] = $this->player(150);
        $this->postJson('/games/tables', ['game' => 'caro', 'stake' => 200], $a)->assertStatus(422)->assertJsonPath('message', 'Không đủ xu để đặt cược');
        $this->postJson('/games/tables', ['game' => 'caro', 'stake' => 50], $a)->assertStatus(422);
        $this->postJson('/games/tables', ['game' => 'caro', 'stake' => 100], $a)->assertOk();
        $this->postJson('/games/tables', ['game' => 'caro', 'stake' => 100], $a)->assertStatus(422);
    }

    public function test_cancel_refunds_and_resign_pays_the_opponent(): void
    {
        [$a, $aid] = $this->player(1000);
        $id = $this->postJson('/games/tables', ['game' => 'caro', 'stake' => 300], $a)->json('result.id');
        $this->postJson("/games/tables/$id/cancel", [], $a)->assertOk()->assertJsonPath('result.status', 'cancelled');
        $this->assertSame(1000, $this->coins($aid));

        [$b, $bid] = $this->player(1000);
        $id = $this->postJson('/games/tables', ['game' => 'caro', 'stake' => 100], $a)->json('result.id');
        $this->postJson("/games/tables/$id/join", [], $b);
        $this->postJson("/games/tables/$id/resign", [], $a)->assertOk()->assertJsonPath('result.winner', 2)->assertJsonPath('result.endReason', 'resign');
        $this->assertSame(900, $this->coins($aid));
        $this->assertSame(900 + 190, $this->coins($bid));
    }

    public function test_timeout_loses_the_turn(): void
    {
        [$a, $aid] = $this->player(1000);
        [$b, $bid] = $this->player(1000);
        $id = $this->postJson('/games/tables', ['game' => 'caro', 'stake' => 100], $a)->json('result.id');
        $this->postJson("/games/tables/$id/join", [], $b);
        GameTable::whereKey($id)->update(['turn_deadline' => 1000]); // host's clock ran out
        $this->getJson("/games/tables/$id", $b)->assertJsonPath('result.status', 'finished')->assertJsonPath('result.winner', 2)->assertJsonPath('result.endReason', 'timeout');
        $this->assertSame(1090, $this->coins($bid));
    }

    public function test_bot_stake_is_capped_and_pays_half(): void
    {
        [$a, $aid] = $this->player(100_000);
        $id = $this->postJson('/games/tables', ['game' => 'caro', 'stake' => 5000], $a)->json('result.id');
        $this->postJson("/games/tables/$id/bot", [], $a)->assertStatus(422)->assertJsonPath('message', 'Chơi với máy cược tối đa 100 xu');
        Farm::where('user_id', $aid)->update(['level' => 50]);
        $this->postJson("/games/tables/$id/bot", [], $a)->assertOk()->assertJsonPath('result.payout', (int) floor(5000 * 1.5 * 0.95));
    }

    public function test_bot_answers_every_move_and_blocks_an_open_four(): void
    {
        [$a, $aid] = $this->player(1000);
        $id = $this->postJson('/games/tables', ['game' => 'caro', 'stake' => 100], $a)->json('result.id');
        $this->postJson("/games/tables/$id/bot", [], $a)->assertOk()->assertJsonPath('result.vsBot', true)->assertJsonPath('result.players.2', 'Máy');
        $res = $this->postJson("/games/tables/$id/move", ['x' => 7, 'y' => 7], $a)->assertOk();
        $this->assertSame(2, $res->json('result.moves'));
        $this->assertSame(1, $res->json('result.turn'));

        // a board where X has an open three: the bot must block one end
        $b = Caro::emptyBoard();
        foreach ([[5, 7], [6, 7], [7, 7]] as [$x, $y]) {
            $b[$y * 15 + $x] = 1;
        }
        $b[0] = 2;
        [$bx, $by] = Caro::botMove($b, 2);
        $this->assertTrue(in_array([$bx, $by], [[4, 7], [8, 7]], true), "bot played $bx,$by");
    }

    public function test_bot_finishes_its_own_four(): void
    {
        $b = Caro::emptyBoard();
        foreach ([[3, 3], [4, 4], [5, 5], [6, 6]] as [$x, $y]) {
            $b[$y * 15 + $x] = 2;
        }
        foreach ([[0, 0], [0, 1], [0, 2]] as [$x, $y]) {
            $b[$y * 15 + $x] = 1;
        }
        $this->assertTrue(in_array(Caro::botMove($b, 2), [[2, 2], [7, 7]], true));
    }
}
