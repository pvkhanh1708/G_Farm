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
        $this->farms->touch($request->user());

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

    public function dig(Request $request): JsonResponse
    {
        $data = $request->validate([
            'tiles' => ['required', 'array', 'min:1', 'max:500'],
            'tiles.*' => ['integer', 'min:0'],
        ]);

        return $this->respond($request, fn () => ['dug' => $this->farms->dig($request->user(), $data['tiles'])]);
    }

    public function sell(Request $request): JsonResponse
    {
        $data = $request->validate([
            'crop' => ['required', 'string', Rule::in($this->eco->itemIds())],
            'qty' => ['required', 'integer', 'min:1'],
        ]);

        return $this->respond($request, fn () => ['earned' => $this->farms->sell($request->user(), $data['crop'], $data['qty'])]);
    }

    public function unlock(Request $request): JsonResponse
    {
        return $this->respond($request, fn () => ['tile' => $this->farms->unlockNext($request->user())]);
    }

    public function upgrade(Request $request): JsonResponse
    {
        $kind = $request->validate(['kind' => ['required', Rule::in(['soil', 'sprinkler'])]])['kind'];

        return $this->respond($request, fn () => ['level' => $this->farms->upgrade($request->user(), $kind)]);
    }

    public function fertilize(Request $request): JsonResponse
    {
        $data = $request->validate(['tiles' => ['required', 'array', 'min:1', 'max:500'], 'tiles.*' => ['integer', 'min:0']]);

        return $this->respond($request, fn () => ['fertilized' => $this->farms->fertilize($request->user(), $data['tiles'])]);
    }

    public function deliver(Request $request): JsonResponse
    {
        $id = $request->validate(['id' => ['required', 'string', 'max:16']])['id'];

        return $this->respond($request, fn () => $this->farms->deliverOrder($request->user(), $id));
    }

    public function skip(Request $request): JsonResponse
    {
        $id = $request->validate(['id' => ['required', 'string', 'max:16']])['id'];

        return $this->respond($request, fn () => $this->farms->skipOrder($request->user(), $id));
    }

    public function claimQuest(Request $request): JsonResponse
    {
        $i = $request->validate(['index' => ['required', 'integer', 'min:0', 'max:10']])['index'];

        return $this->respond($request, fn () => $this->farms->claimQuest($request->user(), $i));
    }

    public function claimLogin(Request $request): JsonResponse
    {
        return $this->respond($request, fn () => $this->farms->claimLogin($request->user()));
    }

    public function buyAnimal(Request $request): JsonResponse
    {
        $type = $request->validate(['type' => ['required', 'string', 'max:16']])['type'];

        return $this->respond($request, fn () => ['count' => $this->farms->buyAnimal($request->user(), $type)]);
    }

    public function collect(Request $request): JsonResponse
    {
        $which = $request->validate(['which' => ['nullable', 'array', 'max:20'], 'which.*' => ['integer', 'min:0']])['which'] ?? null;

        return $this->respond($request, fn () => $this->farms->collectAnimals($request->user(), $which));
    }

    public function feed(Request $request): JsonResponse
    {
        $which = $request->validate(['which' => ['nullable', 'array', 'max:20'], 'which.*' => ['integer', 'min:0']])['which'] ?? null;

        return $this->respond($request, fn () => $this->farms->feedAnimals($request->user(), $which));
    }

    public function water(Request $request): JsonResponse
    {
        $type = $request->validate(['type' => ['required', 'string', 'max:16']])['type'];

        return $this->respond($request, fn () => $this->farms->water($request->user(), $type));
    }

    public function expandPen(Request $request): JsonResponse
    {
        $type = $request->validate(['type' => ['required', 'string', 'max:16']])['type'];

        return $this->respond($request, fn () => $this->farms->expandPen($request->user(), $type));
    }

    public function expandMachine(Request $request): JsonResponse
    {
        $id = $request->validate(['machine' => ['required', 'string', 'max:16']])['machine'];

        return $this->respond($request, fn () => $this->farms->expandMachine($request->user(), $id));
    }

    public function buyDog(Request $request): JsonResponse
    {
        return $this->respond($request, fn () => $this->farms->buyDog($request->user()));
    }

    public function buyMachine(Request $request): JsonResponse
    {
        $id = $request->validate(['machine' => ['required', 'string', 'max:16']])['machine'];

        return $this->respond($request, fn () => $this->farms->buyMachine($request->user(), $id));
    }

    public function startJob(Request $request): JsonResponse
    {
        $data = $request->validate(['machine' => ['required', 'string', 'max:16'], 'output' => ['required', 'string', 'max:16']]);

        return $this->respond($request, fn () => $this->farms->startJob($request->user(), $data['machine'], $data['output']));
    }

    public function collectGoods(Request $request): JsonResponse
    {
        $id = $request->validate(['machine' => ['nullable', 'string', 'max:16']])['machine'] ?? null;

        return $this->respond($request, fn () => $this->farms->collectGoods($request->user(), $id));
    }

    public function news(Request $request): JsonResponse
    {
        return $this->respond($request, fn () => $this->farms->news($request->user()));
    }

    public function neighbours(Request $request): JsonResponse
    {
        return $this->respond($request, fn () => $this->farms->neighbours($request->user()));
    }

    public function visit(Request $request, int $id): JsonResponse
    {
        return $this->respond($request, fn () => $this->farms->visit($request->user(), $id));
    }

    /** The result carries the neighbour's farm as it is after the action. */
    public function steal(Request $request, int $id): JsonResponse
    {
        $tile = $request->validate(['tile' => ['required', 'integer', 'min:0']])['tile'];

        return $this->respond($request, fn () => [...$this->farms->steal($request->user(), $id, $tile), 'farm' => $this->farms->visit($request->user(), $id)]);
    }

    public function help(Request $request, int $id): JsonResponse
    {
        $tile = $request->validate(['tile' => ['required', 'integer', 'min:0']])['tile'];

        return $this->respond($request, fn () => [...$this->farms->help($request->user(), $id, $tile), 'farm' => $this->farms->visit($request->user(), $id)]);
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
