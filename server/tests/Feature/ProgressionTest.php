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

    /** Several players' tokens in one test: Sanctum must not reuse the previous request's user. */
    public function json($method, $uri, array $data = [], array $headers = [], $options = 0)
    {
        $this->app['auth']->forgetGuards();

        return parent::json($method, $uri, $data, $headers, $options);
    }

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
        // once per planting: repeating it used to make crops ripen almost at once
        $this->postJson('/farm/fertilize', ['tiles' => [0]], $h)->assertStatus(422)->assertJsonPath('state.plantings.0.fertilized', true);
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
        // a place in the pen first (level + coins), then the hen
        $this->postJson('/farm/animals/buy', ['type' => 'chicken'], $h)->assertStatus(422)->assertJsonPath('message', 'Hãy mở chỗ trong chuồng Gà trước');
        $this->postJson('/farm/pens/expand', ['type' => 'cow'], $h)->assertStatus(422)->assertJsonPath('message', 'Cần đạt cấp 15');
        $place = $hen['slots'][0]['cost'];
        $this->postJson('/farm/pens/expand', ['type' => 'chicken'], $h)->assertOk()->assertJsonPath('state.penSlots.chicken', 1)->assertJsonPath('state.coins', 10_000 - $place);
        $this->postJson('/farm/pens/expand', ['type' => 'chicken'], $h)->assertStatus(422)->assertJsonPath('message', 'Cần đạt cấp '.$hen['slots'][1]['level']);
        $this->postJson('/farm/animals/buy', ['type' => 'chicken'], $h)->assertOk()->assertJsonPath('state.coins', 10_000 - $place - $hen['price']);
        $this->postJson('/farm/animals/buy', ['type' => 'chicken'], $h)->assertStatus(422)->assertJsonPath('message', 'Chuồng đã đủ 1 chỗ, hãy mở thêm chỗ');
        $this->postJson('/farm/animals/collect', [], $h)->assertStatus(422);
        $f = Farm::where('user_id', $id)->first();
        $f->animals = [['type' => 'chicken', 'fedAt' => 1000]];
        $f->save();
        $this->postJson('/farm/animals/collect', [], $h)->assertOk()->assertJsonPath('state.inventory.egg', 1)->assertJsonPath('state.animals.0.fedAt', null);
        $this->postJson('/farm/sell', ['crop' => 'egg', 'qty' => 1], $h)->assertOk()->assertJsonPath('result.earned', $hen['sellPrice']);

        // hungry now: no product until it is fed with wheat from the barn
        $this->postJson('/farm/animals/collect', [], $h)->assertStatus(422);
        $this->postJson('/farm/animals/feed', [], $h)->assertStatus(422)->assertJsonPath('message', 'Cần 3 Lúa mì trong kho để cho ăn');
        Farm::where('user_id', $id)->update(['inventory' => ['wheat' => 5], 'water' => ['chicken' => 1000]]);
        // the trough ran dry: no eating until it is refilled
        $this->postJson('/farm/animals/feed', [], $h)->assertStatus(422)->assertJsonPath('message', 'Máng nước chuồng gà cạn rồi, hãy đổ nước trước');
        $this->postJson('/farm/animals/water', ['type' => 'chicken'], $h)->assertOk();
        $this->postJson('/farm/animals/feed', [], $h)->assertOk()->assertJsonPath('result.fed', 1)->assertJsonPath('state.inventory.wheat', 2);
        $this->postJson('/farm/animals/feed', [], $h)->assertStatus(422)->assertJsonPath('message', 'Không có con nào đói');
    }

    public function test_workshop_machines_queue_and_collect(): void
    {
        [$h, $id] = $this->guest(['coins' => 5000, 'level' => 4, 'inventory' => ['wheat' => 7]]);
        $this->postJson('/farm/machines/start', ['machine' => 'mill', 'output' => 'flour'], $h)->assertStatus(422);
        $this->postJson('/farm/machines/buy', ['machine' => 'bakery'], $h)->assertStatus(422);
        $this->postJson('/farm/machines/buy', ['machine' => 'mill'], $h)->assertOk()->assertJsonPath('state.coins', 3800);
        $this->postJson('/farm/machines/start', ['machine' => 'mill', 'output' => 'flour'], $h)->assertOk();
        // one batch place to start with; the second needs level 6 and 800 coins
        $this->postJson('/farm/machines/start', ['machine' => 'mill', 'output' => 'flour'], $h)->assertStatus(422);
        $this->postJson('/farm/machines/expand', ['machine' => 'mill'], $h)->assertStatus(422)->assertJsonPath('message', 'Cần đạt cấp 6');
        Farm::where('user_id', $id)->update(['level' => 6]);
        $this->postJson('/farm/machines/expand', ['machine' => 'mill'], $h)->assertOk()->assertJsonPath('state.machines.mill.slots', 2)->assertJsonPath('state.coins', 3000);
        $res = $this->postJson('/farm/machines/start', ['machine' => 'mill', 'output' => 'flour'], $h)->assertOk()->assertJsonPath('state.inventory.wheat', 1);
        // the second batch waits for the first
        $q = $res->json('state.machines.mill.queue');
        $this->assertSame(60_000, $q[1]['readyAt'] - $q[0]['readyAt']);
        $this->postJson('/farm/machines/start', ['machine' => 'mill', 'output' => 'flour'], $h)->assertStatus(422)->assertJsonPath('message', 'Cối xay đã xếp đủ 2 mẻ');
        $this->postJson('/farm/machines/collect', [], $h)->assertStatus(422);

        $f = Farm::where('user_id', $id)->first();
        $f->machines = ['mill' => ['queue' => [['output' => 'flour', 'readyAt' => 1000], ['output' => 'flour', 'readyAt' => PHP_INT_MAX]]]];
        $f->save();
        $this->postJson('/farm/machines/collect', [], $h)->assertOk()
            ->assertJsonPath('result.goods.flour', 1)->assertJsonPath('state.inventory.flour', 1)->assertJsonCount(1, 'state.machines.mill.queue');
        $this->postJson('/farm/sell', ['crop' => 'flour', 'qty' => 1], $h)->assertOk()->assertJsonPath('result.earned', 25);
    }

    public function test_neighbours_steal_help_dog_and_news(): void
    {
        [$owner, $ownerId] = $this->guest(['coins' => 1000, 'level' => 5, 'unlocked' => 6]);
        [$thief, $thiefId] = $this->guest(['coins' => 1000, 'level' => 5]);
        [$third] = $this->guest(['coins' => 1000, 'level' => 5]);
        $this->postJson('/farm/plant', ['tiles' => [0, 1], 'crop' => 'carrot'], $owner)->assertOk();
        $this->postJson('/farm/plant', ['tiles' => [2], 'crop' => 'tomato'], $owner)->assertOk();
        Planting::whereIn('tile', [0, 1])->update(['planted_at' => 1000]);

        $this->getJson('/neighbors', $thief)->assertOk()->assertJsonPath('result.0.id', $ownerId)->assertJsonPath('result.0.ripe', 2);
        $this->getJson("/neighbors/$ownerId", $thief)->assertOk()->assertJsonPath('result.plantings.0.steal', 1)->assertJsonPath('result.stealsLeft', 20);
        $this->getJson("/neighbors/$thiefId", $thief)->assertStatus(422);

        // carrots yield 4: a thief takes 25% (1), once per tile; a second thief too; then it is closed
        $this->postJson("/neighbors/$ownerId/steal", ['tile' => 0], $thief)->assertOk()
            ->assertJsonPath('result.caught', false)->assertJsonPath('result.qty', 1)->assertJsonPath('state.inventory.carrot', 1)
            ->assertJsonPath('result.farm.plantings.0.steal', 0)->assertJsonPath('result.farm.stealsLeft', 19);
        $this->postJson("/neighbors/$ownerId/steal", ['tile' => 0], $thief)->assertStatus(422);
        $this->postJson("/neighbors/$ownerId/steal", ['tile' => 2], $thief)->assertStatus(422);
        $this->postJson("/neighbors/$ownerId/steal", ['tile' => 0], $third)->assertOk();

        // the owner harvests what is left and reads who came
        $this->getJson('/farm', $owner)->assertJsonPath('state.news', 2)->assertJsonPath('state.plantings.0.stolen', 2);
        $this->postJson('/farm/harvest', ['tiles' => [0, 1]], $owner)->assertOk()->assertJsonPath('state.inventory.carrot', 2 + 4);
        $this->getJson('/farm/news', $owner)->assertOk()->assertJsonCount(2, 'result')->assertJsonPath('result.0.type', 'steal')->assertJsonPath('result.0.qty', 1);
        $this->getJson('/farm', $owner)->assertJsonPath('state.news', 0);

        // watering a growing crop: it grows faster, the helper earns a little, once per tile
        $before = Planting::where('tile', 2)->value('planted_at');
        $this->postJson("/neighbors/$ownerId/help", ['tile' => 2], $thief)->assertOk()->assertJsonPath('result.coins', 5)->assertJsonPath('result.farm.plantings.0.helped', true);
        $this->assertGreaterThan(3000, $before - Planting::where('tile', 2)->value('planted_at'));
        $this->postJson("/neighbors/$ownerId/help", ['tile' => 2], $thief)->assertStatus(422);

        // a guard dog that always bites: no crops, a fine paid to the owner
        $this->postJson('/farm/plant', ['tiles' => [3], 'crop' => 'carrot'], $owner)->assertOk();
        Planting::where('tile', 3)->update(['planted_at' => 1000]);
        Farm::where('user_id', $ownerId)->update(['dog' => true, 'coins' => 0]);
        $eco = json_decode(file_get_contents(base_path('../shared/economy.json')), true);
        config(['game.dog_catch_chance' => 1.1]);
        $fine = $eco['neighbors']['dog']['fineBase'] + 5 * $eco['neighbors']['dog']['finePerLevel'];
        $this->postJson("/neighbors/$ownerId/steal", ['tile' => 3], $third)->assertOk()
            ->assertJsonPath('result.caught', true)->assertJsonPath('result.fine', $fine);
        $this->assertSame($fine, Farm::where('user_id', $ownerId)->value('coins'));
    }

}
