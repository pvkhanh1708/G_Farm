<?php

return [
    /*
     * Economy data shared with the client (prices, yields, XP, level and land
     * formulas). Both sides must read the same file so the server validates
     * actions with exactly the numbers the player sees.
     */
    'economy_path' => env('GAME_ECONOMY_PATH', base_path('../shared/economy.json')),

    /*
     * Harvests are accepted this many milliseconds before the server thinks a
     * crop is ripe, to absorb request latency and small clock differences.
     */
    'harvest_grace_ms' => (int) env('GAME_HARVEST_GRACE_MS', 2000),
];
