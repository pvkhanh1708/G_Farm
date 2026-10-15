<?php

namespace App\Http\Controllers;

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
        return ['id' => $user->id, 'name' => $user->name, 'email' => $user->email, 'isGuest' => $user->is_guest];
    }
}
