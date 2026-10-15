<?php

namespace App\Http\Controllers;

use App\Auth\GoogleIdToken;
use App\Game\FarmService;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Players start as guests (a device-held token, no credentials). Registering
 * attaches an email/password to the same account so the farm can be loaded on
 * another device; logging in swaps the device over to that account.
 */
class AuthController extends Controller
{
    public function __construct(private FarmService $farms) {}

    public function guest(): JsonResponse
    {
        $user = User::create(['name' => 'Nông dân', 'is_guest' => true]);
        $user->update(['name' => "Nông dân #{$user->id}"]);
        $this->farms->create($user);

        return $this->withToken($user, 201);
    }

    /**
     * Sign in with a Google ID token. Order of preference:
     *  1. the Google account is already linked -> log into that farm;
     *  2. the caller is signed in (guest or email account) -> attach Google to them, keeping this farm;
     *  3. a password account uses the same email -> link Google to it;
     *  4. otherwise a new player with a fresh farm.
     */
    public function google(Request $request, GoogleIdToken $google): JsonResponse
    {
        if (! $google->enabled()) {
            return response()->json(['message' => 'Đăng nhập Google chưa được bật trên máy chủ'], 503);
        }
        $data = $request->validate(['credential' => ['required', 'string', 'max:4096']]);
        $g = $google->verify($data['credential']) ?? throw ValidationException::withMessages(['credential' => 'Không xác minh được tài khoản Google, hãy thử lại']);

        $current = $request->user('sanctum');
        $user = User::where('google_id', $g['sub'])->first();
        if (! $user && $current) {
            $user = $current;
        }
        $user ??= User::where('email', $g['email'])->first();
        if (! $user) {
            $user = User::create(['name' => $g['name'], 'is_guest' => false]);
            $this->farms->create($user);
        }

        // a guest picks up the Google name; an existing name is kept
        $user->fill([
            'google_id' => $g['sub'],
            'avatar' => $g['picture'],
            'is_guest' => false,
            'name' => $user->is_guest ? mb_substr($g['name'], 0, 40) : $user->name,
            'email' => $user->email ?: (User::where('email', $g['email'])->whereKeyNot($user->id)->exists() ? null : $g['email']),
        ])->save();

        return $this->withToken($user->refresh());
    }

    public function register(Request $request): JsonResponse
    {
        $user = $request->user();
        $data = $request->validate([
            'name' => ['required', 'string', 'max:40'],
            'email' => ['required', 'email', 'max:190', Rule::unique('users', 'email')->ignore($user->id)],
            'password' => ['required', 'string', 'min:6', 'max:100'],
        ]);
        $user->update([...$data, 'is_guest' => false]);

        return response()->json(['user' => $this->userJson($user)]);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);
        $user = User::where('email', $data['email'])->first();
        if (! $user || ! $user->password || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['email' => 'Email hoặc mật khẩu không đúng']);
        }

        return $this->withToken($user);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['ok' => true]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => $this->userJson($request->user())]);
    }

    private function withToken(User $user, int $status = 200): JsonResponse
    {
        return response()->json([
            'token' => $user->createToken('game')->plainTextToken,
            'user' => $this->userJson($user),
        ], $status);
    }

    private function userJson(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'isGuest' => $user->is_guest,
            'google' => $user->google_id !== null,
            'avatar' => $user->avatar,
            'hasPassword' => $user->password !== null,
        ];
    }
}
