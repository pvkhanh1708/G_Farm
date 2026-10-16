<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\FarmController;
use App\Http\Controllers\GameRoomController;
use App\Http\Controllers\LeaderboardController;
use App\Http\Controllers\TienLenController;
use Illuminate\Support\Facades\Route;

Route::middleware('throttle:auth')->group(function () {
    Route::post('/auth/guest', [AuthController::class, 'guest']);
    Route::post('/auth/login', [AuthController::class, 'login']);
    // optional bearer token: a guest signing in keeps their farm
    Route::post('/auth/google', [AuthController::class, 'google']);
});

Route::middleware(['auth:sanctum', 'throttle:game'])->group(function () {
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/auth/register', [AuthController::class, 'register']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);

    Route::get('/farm', [FarmController::class, 'show']);
    Route::post('/farm/plant', [FarmController::class, 'plant']);
    Route::post('/farm/harvest', [FarmController::class, 'harvest']);
    Route::post('/farm/dig', [FarmController::class, 'dig']);
    Route::post('/farm/sell', [FarmController::class, 'sell']);
    Route::post('/farm/unlock', [FarmController::class, 'unlock']);
    Route::post('/farm/reset', [FarmController::class, 'reset']);
    Route::post('/farm/upgrade', [FarmController::class, 'upgrade']);
    Route::post('/farm/fertilize', [FarmController::class, 'fertilize']);
    Route::post('/farm/orders/deliver', [FarmController::class, 'deliver']);
    Route::post('/farm/orders/skip', [FarmController::class, 'skip']);
    Route::post('/farm/quests/claim', [FarmController::class, 'claimQuest']);
    Route::post('/farm/login-reward', [FarmController::class, 'claimLogin']);
    Route::post('/farm/animals/buy', [FarmController::class, 'buyAnimal']);
    Route::post('/farm/animals/collect', [FarmController::class, 'collect']);
    Route::post('/farm/animals/feed', [FarmController::class, 'feed']);
    Route::post('/farm/animals/water', [FarmController::class, 'water']);
    Route::post('/farm/dog', [FarmController::class, 'buyDog']);
    Route::post('/farm/machines/buy', [FarmController::class, 'buyMachine']);
    Route::post('/farm/machines/start', [FarmController::class, 'startJob']);
    Route::post('/farm/machines/collect', [FarmController::class, 'collectGoods']);
    Route::get('/farm/news', [FarmController::class, 'news']);
    Route::get('/neighbors', [FarmController::class, 'neighbours']);
    Route::get('/neighbors/{id}', [FarmController::class, 'visit'])->whereNumber('id');
    Route::post('/neighbors/{id}/steal', [FarmController::class, 'steal'])->whereNumber('id');
    Route::post('/neighbors/{id}/help', [FarmController::class, 'help'])->whereNumber('id');

    // game room: betting tables (caro)
    Route::get('/leaderboard/{board}', LeaderboardController::class)->whereIn('board', ['coins', 'level', 'tiles', 'wins', 'winnings']);

    Route::get('/games/tables', [GameRoomController::class, 'lobby']);
    Route::post('/games/tables', [GameRoomController::class, 'create']);
    Route::get('/games/tables/{id}', [GameRoomController::class, 'show'])->whereNumber('id');
    Route::post('/games/tables/{id}/join', [GameRoomController::class, 'join'])->whereNumber('id');
    Route::post('/games/tables/{id}/bot', [GameRoomController::class, 'bot'])->whereNumber('id');
    Route::post('/games/tables/{id}/cancel', [GameRoomController::class, 'cancel'])->whereNumber('id');
    Route::post('/games/tables/{id}/move', [GameRoomController::class, 'move'])->whereNumber('id');
    Route::post('/games/tables/{id}/resign', [GameRoomController::class, 'resign'])->whereNumber('id');

    // tiến lên (up to 4 players, bots fill empty seats)
    Route::get('/games/tienlen', [TienLenController::class, 'lobby']);
    Route::post('/games/tienlen', [TienLenController::class, 'create']);
    Route::get('/games/tienlen/{id}', [TienLenController::class, 'show'])->whereNumber('id');
    Route::post('/games/tienlen/{id}/join', [TienLenController::class, 'join'])->whereNumber('id');
    Route::post('/games/tienlen/{id}/leave', [TienLenController::class, 'leave'])->whereNumber('id');
    Route::post('/games/tienlen/{id}/start', [TienLenController::class, 'start'])->whereNumber('id');
    Route::post('/games/tienlen/{id}/play', [TienLenController::class, 'play'])->whereNumber('id');
    Route::post('/games/tienlen/{id}/pass', [TienLenController::class, 'pass'])->whereNumber('id');
});
