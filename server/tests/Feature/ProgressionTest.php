<?php

namespace Tests\Feature;

use App\Game\Economy;
use App\Models\Farm;
use App\Models\Planting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProgressionTest extends TestCase
{
    use RefreshDatabase;

    private function guest(array $farm = []): array
    {
        $res = $this->postJson('/auth/guest')->json();
        Farm::where('user_id', $res['user']['id'])->update($farm);

        return [['Authorization' => 'Bearer '.$res['token']], $res['user']['id']];
    }

    public function test_upgrades_cost_coins_and_change_yield_and_growth(): void
    {
        $eco = app(Economy::class);
        [$h, $id] = $this->guest(['coins' => 100_000, 'level' => 20]);
        $this->postJson('/farm/upgrade', ['kind' => 'soil'], $h)->assertOk()->assertJsonPath('state.soil', 1)
            ->assertJsonPath('state.coins', 100_000 - $eco->upgradeCost('soil', 0));
        $this->postJson('/farm/upgrade', ['kind' => 'sprinkler'], $h)->assertOk()->assertJsonPath('state.sprinkler', 1);
        Farm::where('user_id', $id)->update(['soil_level' => 10]);
        $this->postJson('/farm/upgrade', ['kind' => 'soil'], $h)->assertStatus(422)->assertJsonPath('message', 'Đã nâng cấp tối đa');

        // soil 10 doubles the yield; sprinkler shortens growth
        $this->postJson('/farm/plant', ['tiles' => [0], 'crop' => 'carrot'], $h);
        $carrot = $eco->crop('carrot');
        Planting::where('tile', 0)->update(['planted_at' => now()->getTimestampMs() - $eco->growMs($carrot, 1) - 3000]);
        $this->postJson('/farm/harvest', ['tiles' => [0]], $h)->assertOk()->assertJsonPath('state.inventory.carrot', $carrot['yield'] * 2);
        $this->assertLessThan($carrot['growSeconds'] * 1000, $eco->growMs($carrot, 1));
    }

    public function test_upgrade_is_level_gated(): void
    {
        [$h] = $this->guest(['coins' => 100_000, 'level' => 1]);
        $this->postJson('/farm/upgrade', ['kind' => 'sprinkler'], $h)->assertStatus(422);
    }

    public function test_fertilizer_halves_remaining_time(): void
    {
        [$h] = $this->guest(['coins' => 1000, 'level' => 5]);
        $this->postJson('/farm/plant', ['tiles' => [0], 'crop' => 'tomato'], $h);
        $before = Planting::where('tile', 0)->value('planted_at');
        $this->postJson('/farm/fertilize', ['tiles' => [0]], $h)->assertOk()->assertJsonPath('result.fertilized', [0]);
        $moved = $before - Planting::where('tile', 0)->value('planted_at');
        $this->assertEqualsWithDelta(45_000 / 2, $moved, 1500);
    }

    public function test_orders_deliver_and_skip(): void
    {
        [$h, $id] = $this->guest(['coins' => 0, 'level' => 5]);
        $orders = $this->getJson('/farm', $h)->assertOk()->json('state.orders');
        $this->assertCount(3, $orders);
        $o = $orders[0];
        $this->postJson('/farm/orders/deliver', ['id' => $o['id']], $h)->assertStatus(422);
        Farm::where('user_id', $id)->update(['inventory' => $o['items']]);
        $res = $this->postJson('/farm/orders/deliver', ['id' => $o['id']], $h)->assertOk()->assertJsonPath('state.coins', $o['coins']);
        $this->assertCount(3, $res->json('state.orders'));
        $this->assertNotContains($o['id'], array_column($res->json('state.orders'), 'id'));
        $other = $res->json('state.orders.1.id');
        $this->postJson('/farm/orders/skip', ['id' => $other], $h)->assertOk();
    }

    public function test_daily_quests_and_login_streak(): void
    {
        [$h, $id] = $this->guest(['coins' => 1000, 'level' => 1]);
        $daily = $this->getJson('/farm', $h)->json('state.daily');
        $this->assertFalse($daily['loginClaimed']);
        $plant = collect($daily['quests'])->search(fn ($q) => $q['type'] === 'plant');
        $this->postJson('/farm/login-reward', [], $h)->assertOk()->assertJsonPath('result.streak', 1);
        $this->postJson('/farm/login-reward', [], $h)->assertStatus(422);
        $this->postJson('/farm/quests/claim', ['index' => $plant], $h)->assertStatus(422);
        $target = $daily['quests'][$plant]['target'];
        Farm::where('user_id', $id)->update(['unlocked' => $target]);
        $this->postJson('/farm/plant', ['tiles' => range(0, $target - 1), 'crop' => 'carrot'], $h)->assertOk()
            ->assertJsonPath("state.daily.quests.$plant.progress", $target);
        $this->postJson('/farm/quests/claim', ['index' => $plant], $h)->assertOk();
        $this->postJson('/farm/quests/claim', ['index' => $plant], $h)->assertStatus(422);

        // yesterday's login continues the streak
        $f = Farm::where('user_id', $id)->first();
        $f->daily = [...$f->daily, 'date' => '2000-01-01', 'lastLogin' => now('Asia/Ho_Chi_Minh')->subDay()->toDateString(), 'streak' => 3];
        $f->save();
        $this->postJson('/farm/login-reward', [], $h)->assertOk()->assertJsonPath('result.streak', 4);
    }

    public function test_animals_buy_collect_and_sell(): void
    {
        $eco = app(Economy::class);
        $hen = $eco->animal('chicken');
        [$h, $id] = $this->guest(['coins' => 10_000, 'level' => $hen['unlockLevel']]);
        $this->postJson('/farm/animals/buy', ['type' => 'cow'], $h)->assertStatus(422);
        $this->postJson('/farm/animals/buy', ['type' => 'chicken'], $h)->assertOk()->assertJsonPath('state.coins', 10_000 - $hen['price']);
        $this->postJson('/farm/animals/collect', [], $h)->assertStatus(422);
        $f = Farm::where('user_id', $id)->first();
        $f->animals = [['type' => 'chicken', 'lastCollect' => 1000]];
        $f->save();
        $this->postJson('/farm/animals/collect', [], $h)->assertOk()->assertJsonPath('state.inventory.egg', 1);
        $this->postJson('/farm/sell', ['crop' => 'egg', 'qty' => 1], $h)->assertOk()->assertJsonPath('result.earned', $hen['sellPrice']);
    }

}
