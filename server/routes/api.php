<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\FarmController;
use Illuminate\Support\Facades\Route;

Route::middleware('throttle:auth')->group(function () {
    Route::post('/auth/guest', [AuthController::class, 'guest']);
    Route::post('/auth/login', [AuthController::class, 'login']);
});

Route::middleware(['auth:sanctum', 'throttle:game'])->group(function () {
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/auth/register', [AuthController::class, 'register']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);

    Route::get('/farm', [FarmController::class, 'show']);
    Route::post('/farm/plant', [FarmController::class, 'plant']);
    Route::post('/farm/harvest', [FarmController::class, 'harvest']);
    Route::post('/farm/sell', [FarmController::class, 'sell']);
    Route::post('/farm/unlock', [FarmController::class, 'unlock']);
    Route::post('/farm/reset', [FarmController::class, 'reset']);
});
