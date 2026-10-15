<?php

namespace App\Http\Controllers;

use App\Game\Economy;
use App\Game\FarmService;
use App\Game\GameException;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Every response carries the full authoritative farm state plus the server
 * clock, so the client can reconcile its optimistic copy and correct for skew.
 */
class FarmController extends Controller
{
    public function __construct(private FarmService $farms, private Economy $eco) {}

    public function show(Request $request): JsonResponse
    {
        return $this->respond($request, fn () => null);
    }

    public function plant(Request $request): JsonResponse
    {
        $data = $request->validate([
            'tiles' => ['required', 'array', 'min:1', 'max:500'],
            'tiles.*' => ['integer', 'min:0'],
            'crop' => ['required', 'string', Rule::in($this->eco->cropIds())],
        ]);

        return $this->respond($request, fn () => ['planted' => $this->farms->plant($request->user(), $data['tiles'], $data['crop'])]);
    }

    public function harvest(Request $request): JsonResponse
    {
        $data = $request->validate([
            'tiles' => ['required', 'array', 'min:1', 'max:500'],
            'tiles.*' => ['integer', 'min:0'],
        ]);

        return $this->respond($request, fn () => $this->farms->harvest($request->user(), $data['tiles']));
    }

    public function sell(Request $request): JsonResponse
    {
        $data = $request->validate([
            'crop' => ['required', 'string', Rule::in($this->eco->cropIds())],
            'qty' => ['required', 'integer', 'min:1'],
        ]);

        return $this->respond($request, fn () => ['earned' => $this->farms->sell($request->user(), $data['crop'], $data['qty'])]);
    }

    public function unlock(Request $request): JsonResponse
    {
        return $this->respond($request, fn () => ['tile' => $this->farms->unlockNext($request->user())]);
    }

    public function reset(Request $request): JsonResponse
    {
        return $this->respond($request, fn () => $this->farms->reset($request->user()));
    }

    private function respond(Request $request, Closure $action): JsonResponse
    {
        $user = $request->user();
        try {
            $result = $action();
            $status = 200;
            $error = null;
        } catch (GameException $e) {
            $result = null;
            $status = 422;
            $error = $e->getMessage();
        }

        return response()->json([
            'ok' => $error === null,
            'message' => $error,
            'result' => $result,
            'state' => $this->farms->state($this->farms->farmFor($user)->refresh()),
            'serverTime' => FarmService::nowMs(),
        ], $status);
    }
}
