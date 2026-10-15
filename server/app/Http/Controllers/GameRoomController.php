<?php

namespace App\Http\Controllers;

use App\Game\FarmService;
use App\Game\GameException;
use App\Game\GameRoomService;
use App\Models\GameTable;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Game room: betting tables. Responses carry the table view plus the player's farm state. */
class GameRoomController extends Controller
{
    public function __construct(private GameRoomService $room, private FarmService $farms) {}

    public function lobby(Request $request): JsonResponse
    {
        $game = $request->validate(['game' => ['required', Rule::in(GameRoomService::GAMES)]])['game'];

        return $this->respond($request, fn () => $this->room->lobby($request->user(), $game), false);
    }

    public function create(Request $request): JsonResponse
    {
        $data = $request->validate([
            'game' => ['required', Rule::in(GameRoomService::GAMES)],
            'stake' => ['required', 'integer', 'min:'.GameRoomService::MIN_STAKE, 'max:1000000000000'],
        ]);

        return $this->respond($request, fn () => $this->room->create($request->user(), $data['game'], $data['stake']));
    }

    public function show(Request $request, int $id): JsonResponse
    {
        return $this->respond($request, fn () => $this->room->show($request->user(), $id));
    }

    public function join(Request $request, int $id): JsonResponse
    {
        return $this->respond($request, fn () => $this->room->join($request->user(), $id));
    }

    public function bot(Request $request, int $id): JsonResponse
    {
        return $this->respond($request, fn () => $this->room->playBot($request->user(), $id));
    }

    public function cancel(Request $request, int $id): JsonResponse
    {
        return $this->respond($request, fn () => $this->room->cancel($request->user(), $id));
    }

    public function move(Request $request, int $id): JsonResponse
    {
        $data = $request->validate(['x' => ['required', 'integer'], 'y' => ['required', 'integer']]);

        return $this->respond($request, fn () => $this->room->move($request->user(), $id, $data['x'], $data['y']));
    }

    public function resign(Request $request, int $id): JsonResponse
    {
        return $this->respond($request, fn () => $this->room->resign($request->user(), $id));
    }

    /** @param bool $isTable whether the action returns a GameTable to render as a view */
    private function respond(Request $request, Closure $action, bool $isTable = true): JsonResponse
    {
        $user = $request->user();
        try {
            $result = $action();
            if ($isTable && $result instanceof GameTable) {
                $result = $this->room->view($result, $user);
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
