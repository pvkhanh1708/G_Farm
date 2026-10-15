<?php

namespace App\Http\Controllers;

use App\Game\FarmService;
use App\Game\GameException;
use App\Game\GameRoomService;
use App\Game\TienLenService;
use App\Models\TienLenTable;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Tiến lên tables. Responses carry the table view plus the player's farm state. */
class TienLenController extends Controller
{
    public function __construct(private TienLenService $tl, private FarmService $farms) {}

    public function lobby(Request $request): JsonResponse
    {
        return $this->respond($request, fn () => $this->tl->lobby($request->user()));
    }

    public function create(Request $request): JsonResponse
    {
        $stake = $request->validate(['stake' => ['required', 'integer', 'min:'.GameRoomService::MIN_STAKE, 'max:1000000000000']])['stake'];

        return $this->respond($request, fn () => $this->tl->create($request->user(), $stake));
    }

    public function show(Request $request, int $id): JsonResponse
    {
        return $this->respond($request, fn () => $this->tl->show($request->user(), $id));
    }

    public function join(Request $request, int $id): JsonResponse
    {
        return $this->respond($request, fn () => $this->tl->join($request->user(), $id));
    }

    public function leave(Request $request, int $id): JsonResponse
    {
        return $this->respond($request, fn () => $this->tl->leave($request->user(), $id));
    }

    public function start(Request $request, int $id): JsonResponse
    {
        return $this->respond($request, fn () => $this->tl->startNow($request->user(), $id));
    }

    public function play(Request $request, int $id): JsonResponse
    {
        $cards = $request->validate(['cards' => ['required', 'array', 'min:1', 'max:13'], 'cards.*' => ['integer', 'min:0', 'max:51']])['cards'];

        return $this->respond($request, fn () => $this->tl->play($request->user(), $id, $cards));
    }

    public function pass(Request $request, int $id): JsonResponse
    {
        return $this->respond($request, fn () => $this->tl->pass($request->user(), $id));
    }

    private function respond(Request $request, Closure $action): JsonResponse
    {
        $user = $request->user();
        try {
            $result = $action();
            if ($result instanceof TienLenTable) {
                $result = $this->tl->view($result, $user);
            }
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
