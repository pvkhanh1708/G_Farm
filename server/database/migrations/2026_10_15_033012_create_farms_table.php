<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('farms', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('coins');
            $table->unsignedInteger('level')->default(1);
            /** XP collected toward the next level. */
            $table->unsignedBigInteger('xp')->default(0);
            /** Tiles 0..unlocked-1 are owned; tiles open strictly in order. */
            $table->unsignedInteger('unlocked');
            /** Crop id => count. */
            $table->json('inventory');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('farms');
    }
};
