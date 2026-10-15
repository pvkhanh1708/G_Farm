<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

$app = Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        // the API has its own subdomain (api.nongtrai.io.vn), so no /api prefix
        api: __DIR__.'/../routes/api.php',
        apiPrefix: '',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // behind a CDN/proxy: take the client IP (rate limits) and https scheme from proxy headers
        $middleware->trustProxies(at: env('TRUSTED_PROXIES', '127.0.0.1'));
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // this app only serves the game API: always answer errors as JSON
        $exceptions->shouldRenderJsonWhen(fn () => true);
    })->create();

// public dir is <repo>/api (the api subdomain's document root), not server/public
$app->usePublicPath(dirname(__DIR__, 2).'/api');

return $app;
