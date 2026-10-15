<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('farms', function (Blueprint $table) {
            /** Farm-wide upgrades: soil (+yield), sprinkler (-growth time). */
            $table->unsignedTinyInteger('soil_level')->default(0)->after('unlocked');
            $table->unsignedTinyInteger('sprinkler_level')->default(0)->after('soil_level');
            /** Order board: list of {items: {crop: qty}, coins, xp}. */
            $table->json('orders')->nullable()->after('inventory');
            /** Daily quests + login streak: {date, quests, streak, lastLogin, loginClaimed}. */
            $table->json('daily')->nullable()->after('orders');
            /** Owned animals: list of {type, lastCollect}. */
            $table->json('animals')->nullable()->after('daily');
            /** Game room record for the leaderboard: wins and net coins won. */
            $table->unsignedInteger('game_wins')->default(0)->after('animals');
            $table->unsignedBigInteger('game_winnings')->default(0)->after('game_wins');
            $table->index('coins');
            $table->index(['level', 'xp']);
            $table->index('unlocked');
            $table->index('game_wins');
            $table->index('game_winnings');
        });
    }

    public function down(): void
    {
        Schema::table('farms', function (Blueprint $table) {
            $table->dropIndex(['coins']);
            $table->dropIndex(['level', 'xp']);
            $table->dropIndex(['unlocked']);
            $table->dropIndex(['game_wins']);
            $table->dropIndex(['game_winnings']);
            $table->dropColumn(['soil_level', 'sprinkler_level', 'orders', 'daily', 'animals', 'game_wins', 'game_winnings']);
        });
    }
};
