<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('game_tables', function (Blueprint $table) {
            $table->id();
            $table->string('game', 16);
            /** Coins each side puts in; held from the moment a seat is taken. */
            $table->unsignedBigInteger('stake');
            /** waiting | playing | finished | cancelled */
            $table->string('status', 12)->index();
            $table->foreignId('host_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('guest_id')->nullable()->constrained('users')->cascadeOnDelete();
            $table->boolean('vs_bot')->default(false);
            /** Game-specific state (caro: 15x15 cells, 0 empty, 1 host, 2 guest/bot). */
            $table->json('board');
            /** Side to move: 1 host, 2 guest/bot. */
            $table->unsignedTinyInteger('turn')->default(1);
            $table->unsignedInteger('moves')->default(0);
            $table->json('last_move')->nullable();
            /** 1 or 2 = that side won, 0 = draw, null = not finished. */
            $table->unsignedTinyInteger('winner')->nullable();
            /** why it ended: line | resign | timeout | draw */
            $table->string('end_reason', 12)->nullable();
            $table->json('win_line')->nullable();
            /** Unix ms by which the side to move must play. */
            $table->unsignedBigInteger('turn_deadline')->nullable();
            /** Bumped on every change, so clients can poll cheaply. */
            $table->unsignedInteger('version')->default(1);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('game_tables');
    }
};
