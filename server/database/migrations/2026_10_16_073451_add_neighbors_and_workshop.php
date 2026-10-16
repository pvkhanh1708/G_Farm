<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('farms', function (Blueprint $table) {
            /** Workshop: {machineId: {queue: [{recipe, readyAt}]}} for the machines owned. */
            $table->json('machines')->nullable()->after('animals');
            /** Guard dog: catches some thieves. */
            $table->boolean('dog')->default(false)->after('machines');
        });

        Schema::table('plantings', function (Blueprint $table) {
            /** Crops taken by neighbours from this tile, and who took them / helped it grow. */
            $table->unsignedSmallInteger('stolen')->default(0);
            $table->json('thieves')->nullable();
            $table->json('helpers')->nullable();
        });

        /** What neighbours did on a farm, shown to its owner. */
        Schema::create('farm_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('actor_id')->constrained('users')->cascadeOnDelete();
            $table->string('type', 16); // steal | caught | help
            $table->string('crop', 32)->nullable();
            $table->unsignedInteger('qty')->default(0);
            $table->unsignedInteger('coins')->default(0);
            $table->boolean('seen')->default(false);
            $table->timestamp('created_at')->useCurrent();
            $table->index(['user_id', 'id']);
        });

        // animals now produce only after being fed: what was "last collected" becomes "fed at"
        DB::table('farms')->whereNotNull('animals')->orderBy('id')->each(function ($farm) {
            $animals = array_map(fn ($a) => ['type' => $a['type'], 'fedAt' => $a['fedAt'] ?? $a['lastCollect'] ?? null], json_decode($farm->animals, true) ?: []);
            DB::table('farms')->where('id', $farm->id)->update(['animals' => json_encode($animals)]);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('farm_events');
        Schema::table('plantings', fn (Blueprint $table) => $table->dropColumn(['stolen', 'thieves', 'helpers']));
        Schema::table('farms', fn (Blueprint $table) => $table->dropColumn(['machines', 'dog']));
    }
};
