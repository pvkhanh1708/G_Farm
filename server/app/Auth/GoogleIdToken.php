<?php

namespace App\Auth;

use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Verifies the ID token ("credential") that Google Identity Services hands the
 * game client: signature against Google's published keys, audience = our
 * OAuth client id, issuer, expiry and a verified email.
 */
class GoogleIdToken
{
    public const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

    public function __construct(private ?string $clientId) {}

    public function enabled(): bool
    {
        return (bool) $this->clientId;
    }

    /**
     * @return array{sub: string, email: string, name: string, picture: ?string}|null
     */
    public function verify(string $jwt): ?array
    {
        if (! $this->clientId) {
            return null;
        }
        JWT::$leeway = 60;
        try {
            $claims = (array) JWT::decode($jwt, JWK::parseKeySet($this->keys()));
        } catch (Throwable) {
            // maybe Google rotated its keys since we cached them: refetch once
            try {
                Cache::forget('google-oauth-certs');
                $claims = (array) JWT::decode($jwt, JWK::parseKeySet($this->keys()));
            } catch (Throwable) {
                return null;
            }
        }
        $issuerOk = in_array($claims['iss'] ?? null, ['accounts.google.com', 'https://accounts.google.com'], true);
        if (! $issuerOk || ($claims['aud'] ?? null) !== $this->clientId || empty($claims['sub']) || empty($claims['email']) || ($claims['email_verified'] ?? false) !== true) {
            return null;
        }

        return [
            'sub' => (string) $claims['sub'],
            'email' => (string) $claims['email'],
            'name' => (string) ($claims['name'] ?? strstr($claims['email'], '@', true)),
            'picture' => $claims['picture'] ?? null,
        ];
    }

    /** Google rotates its keys every few days; an hour of caching is plenty. */
    private function keys(): array
    {
        return Cache::remember('google-oauth-certs', 3600, fn () => Http::timeout(5)->get(self::CERTS_URL)->throw()->json());
    }
}
