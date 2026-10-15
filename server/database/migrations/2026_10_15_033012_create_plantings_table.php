<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('plantings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('farm_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('tile');
            $table->string('crop', 32);
            /** Unix epoch in milliseconds (server clock), matching the client's Date.now(). */
            $table->unsignedBigInteger('planted_at');
            $table->unique(['farm_id', 'tile']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('plantings');
    }
};
