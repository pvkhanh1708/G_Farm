<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('plantings', function (Blueprint $table) {
            /** Fertilizer works once per planting (repeating it made crops ripen almost at once). */
            $table->boolean('fertilized')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('plantings', fn (Blueprint $table) => $table->dropColumn('fertilized'));
    }
};
