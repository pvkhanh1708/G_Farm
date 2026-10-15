<?php

namespace Tests\Feature;

use App\Auth\GoogleIdToken;
use App\Models\Farm;
use App\Models\User;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/** Google is played by a local RSA key whose public half is served as the fake JWKS. */
class GoogleLoginTest extends TestCase
{
    use RefreshDatabase;

    private const CLIENT_ID = 'test-client.apps.googleusercontent.com';

    private static string $privateKey;

    private static array $jwks;

    protected function setUp(): void
    {
        parent::setUp();
        if (! isset(self::$privateKey)) {
            // test-only key (not Google's): PHP on Windows cannot generate keys without openssl.cnf
            self::$privateKey = file_get_contents(__DIR__.'/../Fixtures/google-test-key.pem');
            $rsa = openssl_pkey_get_details(openssl_pkey_get_private(self::$privateKey))['rsa'];
            $b64 = fn ($bin) => rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
            self::$jwks = ['keys' => [['kty' => 'RSA', 'alg' => 'RS256', 'use' => 'sig', 'kid' => 'test-kid', 'n' => $b64($rsa['n']), 'e' => $b64($rsa['e'])]]];
        }
        config(['services.google.client_id' => self::CLIENT_ID]);
        Http::fake([GoogleIdToken::CERTS_URL => Http::response(self::$jwks)]);
    }

    private function credential(array $overrides = []): string
    {
        $claims = array_merge([
            'iss' => 'https://accounts.google.com',
            'aud' => self::CLIENT_ID,
            'sub' => '1234567890',
            'email' => 'lan@gmail.com',
            'email_verified' => true,
            'name' => 'Lan Nguyễn',
            'picture' => 'https://example.com/a.png',
            'iat' => time(),
            'exp' => time() + 3600,
        ], $overrides);

        return JWT::encode($claims, self::$privateKey, 'RS256', 'test-kid');
    }

    public function test_guest_signing_in_keeps_their_farm(): void
    {
        $guest = $this->postJson('/auth/guest')->json();
        $h = ['Authorization' => 'Bearer '.$guest['token']];
        $this->postJson('/farm/plant', ['tiles' => [1], 'crop' => 'carrot'], $h)->assertOk();

        $res = $this->postJson('/auth/google', ['credential' => $this->credential()], $h)
            ->assertOk()
            ->assertJsonPath('user.id', $guest['user']['id'])
            ->assertJsonPath('user.isGuest', false)
            ->assertJsonPath('user.google', true)
            ->assertJsonPath('user.name', 'Lan Nguyễn')
            ->assertJsonPath('user.email', 'lan@gmail.com');

        // the same Google account on another device lands on that farm
        $other = $this->postJson('/auth/guest')->json();
        $again = $this->postJson('/auth/google', ['credential' => $this->credential()], ['Authorization' => 'Bearer '.$other['token']])
            ->assertJsonPath('user.id', $guest['user']['id']);
        $this->getJson('/farm', ['Authorization' => 'Bearer '.$again->json('token')])->assertJsonPath('state.plantings.1.crop', 'carrot');
        $this->assertNotEmpty($res->json('token'));
    }

    public function test_new_google_player_gets_a_new_farm(): void
    {
        $res = $this->postJson('/auth/google', ['credential' => $this->credential(['sub' => '999', 'email' => 'moi@gmail.com'])])->assertOk();
        $this->assertSame(1, User::count());
        $this->assertSame(1, Farm::count());
        $this->getJson('/farm', ['Authorization' => 'Bearer '.$res->json('token')])->assertJsonPath('state.coins', 50);
    }

    public function test_links_to_a_password_account_with_the_same_email(): void
    {
        $guest = $this->postJson('/auth/guest')->json();
        $h = ['Authorization' => 'Bearer '.$guest['token']];
        $this->postJson('/auth/register', ['name' => 'Lan', 'email' => 'lan@gmail.com', 'password' => 'secret123'], $h)->assertOk();

        $this->postJson('/auth/google', ['credential' => $this->credential()])
            ->assertOk()
            ->assertJsonPath('user.id', $guest['user']['id'])
            ->assertJsonPath('user.name', 'Lan')
            ->assertJsonPath('user.hasPassword', true);
    }

    public function test_rejects_forged_or_foreign_tokens(): void
    {
        $this->postJson('/auth/google', ['credential' => $this->credential(['aud' => 'someone-else'])])->assertStatus(422);
        $this->postJson('/auth/google', ['credential' => $this->credential(['email_verified' => false])])->assertStatus(422);
        $this->postJson('/auth/google', ['credential' => $this->credential(['iss' => 'https://evil.example'])])->assertStatus(422);
        $this->postJson('/auth/google', ['credential' => $this->credential(['exp' => time() - 3600])])->assertStatus(422);
        $forged = JWT::encode(['sub' => '1', 'aud' => self::CLIENT_ID], str_repeat('not-google-secret-', 4), 'HS256', 'test-kid');
        $this->postJson('/auth/google', ['credential' => $forged])->assertStatus(422);
        $this->assertSame(0, User::count());
    }

    public function test_disabled_without_client_id(): void
    {
        config(['services.google.client_id' => null]);
        $this->postJson('/auth/google', ['credential' => $this->credential()])->assertStatus(503);
    }
}
