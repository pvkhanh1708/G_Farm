<?php

namespace Tests\Feature;

use App\Game\TienLen;
use App\Models\Farm;
use App\Models\TienLenTable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TienLenTest extends TestCase
{
    use RefreshDatabase;

    public function json($method, $uri, array $data = [], array $headers = [], $options = 0)
    {
        $this->app['auth']->forgetGuards();

        return parent::json($method, $uri, $data, $headers, $options);
    }

    /** card id from rank (3..15 where 11=J,12=Q,13=K,14=A,15=2) and suit 0..3 */
    private static function c(int $rank, int $suit = 0): int
    {
        return ($rank - 3) * 4 + $suit;
    }

    private function player(int $coins): array
    {
        $res = $this->postJson('/auth/guest')->json();
        Farm::where('user_id', $res['user']['id'])->update(['coins' => $coins]);

        return [['Authorization' => 'Bearer '.$res['token']], $res['user']['id']];
    }

    public function test_combo_detection(): void
    {
        $c = fn (...$x) => TienLen::combo($x);
        $this->assertSame('single', $c(self::c(5))['type']);
        $this->assertSame('pair', $c(self::c(5, 0), self::c(5, 3))['type']);
        $this->assertSame('triple', $c(self::c(9, 0), self::c(9, 1), self::c(9, 2))['type']);
        $this->assertSame('four', $c(self::c(9, 0), self::c(9, 1), self::c(9, 2), self::c(9, 3))['type']);
        $this->assertSame('straight', $c(self::c(3), self::c(4, 2), self::c(5))['type']);
        $this->assertNull($c(self::c(13), self::c(14), self::c(15)), 'no 2 in a straight');
        $this->assertNull($c(self::c(3), self::c(5), self::c(6)));
        $pairs = $c(self::c(4, 0), self::c(4, 1), self::c(5, 0), self::c(5, 1), self::c(6, 0), self::c(6, 1));
        $this->assertSame(['pairs', 3], [$pairs['type'], $pairs['len']]);
        $this->assertNull($c(self::c(5), self::c(5, 1), self::c(7)));
    }

    public function test_beating_and_chopping(): void
    {
        $two = TienLen::combo([self::c(15, 3)]);
        $pairTwo = TienLen::combo([self::c(15, 0), self::c(15, 1)]);
        $four = TienLen::combo([self::c(7, 0), self::c(7, 1), self::c(7, 2), self::c(7, 3)]);
        $pairs3 = TienLen::combo([self::c(4, 0), self::c(4, 1), self::c(5, 0), self::c(5, 1), self::c(6, 0), self::c(6, 1)]);
        $pairs4 = TienLen::combo([self::c(4, 0), self::c(4, 1), self::c(5, 0), self::c(5, 1), self::c(6, 0), self::c(6, 1), self::c(7, 0), self::c(7, 1)]);
        $this->assertTrue(TienLen::beats(TienLen::combo([self::c(10, 3)]), TienLen::combo([self::c(10, 2)])), '10♥ beats 10♦');
        $this->assertFalse(TienLen::beats(TienLen::combo([self::c(10, 2)]), TienLen::combo([self::c(10, 3)])));
        $this->assertFalse(TienLen::beats(TienLen::combo([self::c(5), self::c(5, 1)]), TienLen::combo([self::c(9)])), 'type must match');
        $this->assertTrue(TienLen::beats($pairs3, $two));
        $this->assertFalse(TienLen::beats($pairs3, $pairTwo));
        $this->assertTrue(TienLen::beats($four, $two));
        $this->assertTrue(TienLen::beats($four, $pairTwo));
        $this->assertTrue(TienLen::beats($four, $pairs3));
        $this->assertTrue(TienLen::beats($pairs4, $four));
        $this->assertTrue(TienLen::beats($pairs4, $pairTwo));
        $this->assertFalse(TienLen::beats($four, TienLen::combo([self::c(9)])), 'no chopping a plain single');
    }

    public function test_bot_plays_legally_and_a_full_bot_game_finishes(): void
    {
        $hands = TienLen::deal();
        $this->assertCount(52, array_unique(array_merge(...$hands)));
        // simulate four bots
        $turn = 0;
        foreach ($hands as $i => $h) {
            if (in_array(0, $h, true)) {
                $turn = $i;
            }
        }
        $combo = null;
        $leader = null;
        $passed = [];
        $first = true;
        for ($step = 0; $step < 500; $step++) {
            $cards = TienLen::botPlay($hands[$turn], $combo, $first);
            if ($cards) {
                $c = TienLen::combo($cards);
                $this->assertNotNull($c);
                $this->assertTrue(TienLen::beats($c, $combo));
                $hands[$turn] = array_values(array_diff($hands[$turn], $cards));
                $combo = $c;
                $leader = $turn;
                $first = false;
                if (! $hands[$turn]) {
                    break;
                }
            } else {
                $this->assertNotNull($combo, 'a leading bot always plays');
                $passed[] = $turn;
            }
            for ($k = 1; $k <= 4; $k++) {
                $s = ($turn + $k) % 4;
                if ($s === $leader) {
                    $combo = null;
                    $passed = [];
                    $turn = $s;
                    break;
                }
                if (! in_array($s, $passed, true)) {
                    $turn = $s;
                    break;
                }
            }
        }
        $this->assertTrue(collect($hands)->contains(fn ($h) => ! $h), 'someone ran out of cards');
    }

    public function test_table_flow_with_bots_and_payout(): void
    {
        [$a, $aid] = $this->player(10_000);
        [$b, $bid] = $this->player(10_000);
        $id = $this->postJson('/games/tienlen', ['stake' => 1000], $a)->assertOk()->json('result.id');
        $this->getJson('/games/tienlen', $b)->assertJsonPath('result.tables.0.id', $id)->assertJsonPath('result.tables.0.players', 1);
        $this->postJson("/games/tienlen/$id/join", [], $b)->assertOk()->assertJsonPath('result.you', 1);
        $this->postJson("/games/tienlen/$id/start", [], $b)->assertStatus(422);
        $res = $this->postJson("/games/tienlen/$id/start", [], $a)->assertOk()->assertJsonPath('result.status', 'playing');
        $this->assertCount(13, $res->json('result.hand'));
        $this->assertTrue($res->json('result.seats.2.bot'));
        $this->assertSame(9000, Farm::where('user_id', $aid)->value('coins'));

        // rig the deal: A holds 3♠ and one more card, so two plays win
        $t = TienLenTable::find($id);
        $hands = $t->hands;
        $all = array_merge(...$hands);
        $rest = array_values(array_diff($all, [0, 51]));
        $hands = [[0, 51], array_slice($rest, 0, 13), array_slice($rest, 13, 13), array_slice($rest, 26)];
        $t->update(['hands' => $hands, 'turn' => 0, 'first_trick' => true, 'combo' => null, 'passed' => [], 'leader' => null]);

        $this->postJson("/games/tienlen/$id/play", ['cards' => [51]], $a)->assertStatus(422)->assertJsonPath('message', 'Lượt đầu phải đánh có 3♠');
        $this->postJson("/games/tienlen/$id/play", ['cards' => [0]], $b)->assertStatus(422)->assertJsonPath('message', 'Chưa tới lượt bạn');
        $this->postJson("/games/tienlen/$id/play", ['cards' => [0]], $a)->assertOk()->assertJsonPath('result.turn', 1);
        // B passes; bots get their turns (past their pause) until A must act again
        $this->postJson("/games/tienlen/$id/pass", [], $b)->assertOk();
        for ($i = 0; $i < 6; $i++) {
            TienLenTable::whereKey($id)->update(['act_after' => 0]);
            $v = $this->getJson("/games/tienlen/$id", $a)->json('result');
            if ($v['turn'] === 0) {
                break;
            }
        }
        $this->assertSame(0, $v['turn']);
        // 2♥ is the highest single: nothing can be on the table that it does not beat, unless chopped
        $res = $this->postJson("/games/tienlen/$id/play", ['cards' => [51]], $a);
        if ($res->status() === 200) {
            $res->assertJsonPath('result.status', 'finished')->assertJsonPath('result.winner', 0);
            $this->assertSame(9000 + 3800, Farm::where('user_id', $aid)->value('coins'));
            $this->assertSame(9000, Farm::where('user_id', $bid)->value('coins'));
        }
    }

    public function test_leave_refunds_and_timeout_auto_plays(): void
    {
        [$a, $aid] = $this->player(5000);
        [$b, $bid] = $this->player(5000);
        $id = $this->postJson('/games/tienlen', ['stake' => 500], $a)->json('result.id');
        $this->postJson("/games/tienlen/$id/join", [], $b);
        $this->postJson("/games/tienlen/$id/leave", [], $b)->assertOk();
        $this->assertSame(5000, Farm::where('user_id', $bid)->value('coins'));
        $this->postJson('/games/tables', ['game' => 'caro', 'stake' => 100], $a)->assertStatus(422);

        $this->postJson("/games/tienlen/$id/start", [], $a)->assertOk();
        $t = TienLenTable::find($id);
        $hands = $t->hands;
        // move 3♠ to A, so A's turn times out
        foreach ($hands as $i => $h) {
            if (in_array(0, $h, true) && $i !== 0) {
                [$hands[0], $hands[$i]] = [$hands[$i], $hands[0]];
            }
        }
        $t->update(['hands' => $hands, 'turn' => 0, 'turn_deadline' => 1000]);
        $v = $this->getJson("/games/tienlen/$id", $a)->assertOk()->json('result');
        $this->assertSame([0], $v['lastAction']['cards'], 'timed-out leader plays 3♠');
    }
}
