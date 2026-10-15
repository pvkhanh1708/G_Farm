<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tienlen_tables', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('stake');
            /** waiting | playing | finished | cancelled */
            $table->string('status', 12)->index();
            $table->foreignId('host_id')->constrained('users')->cascadeOnDelete();
            /** 4 seats: {user: id|null, bot: bool, name: string|null} */
            $table->json('seats');
            /** seat => card ids (0..51 = rank * 4 + suit, rank 0 = 3 ... 12 = 2, suit ♠♣♦♥) */
            $table->json('hands')->nullable();
            $table->unsignedTinyInteger('turn')->nullable();
            /** Seat that played the combo on the table (leads the next round if all pass). */
            $table->unsignedTinyInteger('leader')->nullable();
            /** Combo to beat: {cards, type, len, top} or null when the turn leads freely. */
            $table->json('combo')->nullable();
            /** Seats that passed this round. */
            $table->json('passed')->nullable();
            /** The first play of the game must contain 3♠. */
            $table->boolean('first_trick')->default(true);
            $table->unsignedTinyInteger('winner')->nullable();
            /** Last action shown to everyone: {seat, kind: play|pass, cards}. */
            $table->json('last_action')->nullable();
            $table->unsignedBigInteger('turn_deadline')->nullable();
            /** Bots wait until this time (ms) so their plays can be seen. */
            $table->unsignedBigInteger('act_after')->nullable();
            $table->unsignedInteger('version')->default(1);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tienlen_tables');
    }
};
