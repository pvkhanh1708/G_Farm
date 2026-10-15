<?php

namespace App\Providers;

use App\Auth\GoogleIdToken;
use App\Game\Economy;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(Economy::class, fn () => new Economy(config('game.economy_path')));
        $this->app->bind(GoogleIdToken::class, fn () => new GoogleIdToken(config('services.google.client_id')));
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // the client batches harvests/plantings, but an active player still sends a few actions per second
        RateLimiter::for('game', fn (Request $request) => Limit::perMinute(300)->by($request->user()?->id ?: $request->ip()));
        RateLimiter::for('auth', fn (Request $request) => Limit::perMinute(20)->by($request->ip()));
    }
}
