<?php

namespace Tests\Feature;

use App\Game\Economy;
use App\Models\Farm;
use App\Models\Planting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class FarmApiTest extends TestCase
{
    use RefreshDatabase;

    private function guest(): array
    {
        $res = $this->postJson('/auth/guest')->assertCreated();

        return ['Authorization' => 'Bearer '.$res->json('token')];
    }

    private function ripen(int $tile): void
    {
        Planting::where('tile', $tile)->update(['planted_at' => 1000]);
    }

    public function test_guest_gets_a_starting_farm(): void
    {
        $h = $this->guest();
        $this->getJson('/farm', $h)
            ->assertOk()
            ->assertJsonPath('state.coins', 50)
            ->assertJsonPath('state.level', 1)
            ->assertJsonPath('state.unlocked', 4)
            ->assertJsonPath('state.inventory.carrot', 0)
            ->assertJsonStructure(['serverTime']);
    }

    public function test_farm_requires_a_token(): void
    {
        $this->getJson('/farm')->assertUnauthorized();
    }

    public function test_plant_harvest_sell_loop(): void
    {
        $h = $this->guest();
        $this->postJson('/farm/plant', ['tiles' => [0, 1], 'crop' => 'carrot'], $h)
            ->assertOk()
            ->assertJsonPath('result.planted', [0, 1])
            ->assertJsonPath('state.coins', 50 - 2 * 7);

        // not ripe yet: rejected with the authoritative state attached
        $this->postJson('/farm/harvest', ['tiles' => [0]], $h)
            ->assertStatus(422)
            ->assertJsonPath('message', 'Cây chưa chín')
            ->assertJsonPath('state.plantings.0.crop', 'carrot');

        $this->ripen(0);
        $this->ripen(1);
        $this->postJson('/farm/harvest', ['tiles' => [0, 1]], $h)
            ->assertOk()
            ->assertJsonPath('result.harvested', [0, 1])
            ->assertJsonPath('state.inventory.carrot', 8)
            ->assertJsonPath('state.xp', 2);

        $sell = app(Economy::class)->crop('carrot')['sellPrice'];
        $this->postJson('/farm/sell', ['crop' => 'carrot', 'qty' => 99], $h)
            ->assertOk()
            ->assertJsonPath('result.earned', 8 * $sell)
            ->assertJsonPath('state.coins', 50 - 14 + 8 * $sell)
            ->assertJsonPath('state.inventory.carrot', 0);
    }

    public function test_plant_stops_when_coins_run_out_and_skips_owned_or_locked_tiles(): void
    {
        $h = $this->guest();
        // 50 coins buy 7 carrots, but only tiles 0..3 are owned
        $this->postJson('/farm/plant', ['tiles' => [0, 1, 2, 3, 4, 9], 'crop' => 'carrot'], $h)
            ->assertJsonPath('result.planted', [0, 1, 2, 3]);
        $this->postJson('/farm/plant', ['tiles' => [0], 'crop' => 'carrot'], $h)
            ->assertStatus(422);
    }

    public function test_locked_crops_are_rejected(): void
    {
        $h = $this->guest();
        $this->postJson('/farm/plant', ['tiles' => [0], 'crop' => 'sunflower'], $h)
            ->assertStatus(422)
            ->assertJsonPath('message', 'Hướng dương mở ở cấp 34');
        $this->postJson('/farm/plant', ['tiles' => [0], 'crop' => 'banana'], $h)->assertStatus(422)->assertJsonValidationErrors('crop');
    }

    public function test_leveling_grants_coins_and_land(): void
    {
        $h = $this->guest();
        $eco = app(Economy::class);
        $this->postJson('/farm/plant', ['tiles' => [0, 1, 2, 3], 'crop' => 'carrot'], $h);
        foreach ([0, 1, 2, 3] as $t) {
            $this->ripen($t);
        }
        $coins = Farm::first()->coins;
        // 4 carrots = 4 XP; level 1 needs xpToNext(1)
        $this->assertSame(5, $eco->xpToNext(1));
        $this->postJson('/farm/harvest', ['tiles' => [0, 1, 2, 3]], $h)->assertJsonPath('result.levelUps', []);
        Farm::first()->update(['xp' => 4]);
        $this->postJson('/farm/plant', ['tiles' => [0], 'crop' => 'carrot'], $h);
        $this->ripen(0);
        $this->postJson('/farm/harvest', ['tiles' => [0]], $h)
            ->assertJsonPath('result.levelUps', [2])
            ->assertJsonPath('state.level', 2)
            ->assertJsonPath('state.xp', 0)
            ->assertJsonPath('state.coins', $coins - 7 + $eco->levelReward(2));
    }

    public function test_land_is_gated_by_level_and_coins(): void
    {
        $h = $this->guest();
        Farm::first()->update(['coins' => 10_000]);
        // level 1 may own 5 tiles: one purchase allowed
        $this->postJson('/farm/unlock', [], $h)->assertOk()->assertJsonPath('result.tile', 4)->assertJsonPath('state.coins', 10_000 - 40);
        $this->postJson('/farm/unlock', [], $h)->assertStatus(422)->assertJsonPath('message', 'Cần đạt cấp 2 để mở thêm đất');
        Farm::first()->update(['level' => 2, 'coins' => 10]);
        $this->postJson('/farm/unlock', [], $h)->assertStatus(422)->assertJsonPath('message', 'Không đủ xu!');
    }

    public function test_register_then_login_on_another_device_keeps_the_farm(): void
    {
        $h = $this->guest();
        $this->postJson('/farm/plant', ['tiles' => [2], 'crop' => 'carrot'], $h);
        $this->postJson('/auth/register', ['name' => 'Lan', 'email' => 'lan@example.com', 'password' => 'secret123'], $h)
            ->assertOk()->assertJsonPath('user.isGuest', false);

        $login = $this->postJson('/auth/login', ['email' => 'lan@example.com', 'password' => 'secret123'])->assertOk();
        $this->getJson('/farm', ['Authorization' => 'Bearer '.$login->json('token')])
            ->assertJsonPath('state.plantings.2.crop', 'carrot');

        $this->postJson('/auth/login', ['email' => 'lan@example.com', 'password' => 'wrong'])->assertStatus(422);
    }

    public function test_dig_clears_tiles_without_refund(): void
    {
        $h = $this->guest();
        $this->postJson('/farm/plant', ['tiles' => [0, 1, 2], 'crop' => 'carrot'], $h);
        $this->postJson('/farm/dig', ['tiles' => [0, 2, 3]], $h)
            ->assertOk()
            ->assertJsonPath('result.dug', [0, 2])
            ->assertJsonPath('state.coins', 50 - 3 * 7)
            ->assertJsonPath('state.plantings.1.crop', 'carrot');
        $this->postJson('/farm/dig', ['tiles' => [0]], $h)->assertStatus(422);
    }

    public function test_reset(): void
    {
        $h = $this->guest();
        $this->postJson('/farm/plant', ['tiles' => [0], 'crop' => 'carrot'], $h);
        $this->postJson('/farm/reset', [], $h)->assertOk()->assertJsonPath('state.coins', 50)->assertJsonPath('state.plantings', []);
    }
}
