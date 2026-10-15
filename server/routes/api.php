<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\FarmController;
use App\Http\Controllers\GameRoomController;
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

    // game room: betting tables (caro)
    Route::get('/games/tables', [GameRoomController::class, 'lobby']);
    Route::post('/games/tables', [GameRoomController::class, 'create']);
    Route::get('/games/tables/{id}', [GameRoomController::class, 'show'])->whereNumber('id');
    Route::post('/games/tables/{id}/join', [GameRoomController::class, 'join'])->whereNumber('id');
    Route::post('/games/tables/{id}/bot', [GameRoomController::class, 'bot'])->whereNumber('id');
    Route::post('/games/tables/{id}/cancel', [GameRoomController::class, 'cancel'])->whereNumber('id');
    Route::post('/games/tables/{id}/move', [GameRoomController::class, 'move'])->whereNumber('id');
    Route::post('/games/tables/{id}/resign', [GameRoomController::class, 'resign'])->whereNumber('id');
});
