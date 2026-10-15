<?php

use Illuminate\Foundation\Application;
use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

// This folder is Laravel's public dir, kept at the repo root so the api subdomain can point
// at <repo>/api while the app itself lives in <repo>/server.
$server = __DIR__.'/../server';

// Determine if the application is in maintenance mode...
if (file_exists($maintenance = $server.'/storage/framework/maintenance.php')) {
    require $maintenance;
}

// Register the Composer autoloader...
require $server.'/vendor/autoload.php';

// Bootstrap Laravel and handle the request...
/** @var Application $app */
$app = require_once $server.'/bootstrap/app.php';

$app->handleRequest(Request::capture());
