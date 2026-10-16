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
            /** Places opened in each pen: {chicken: n, cow: n}. Each place costs a level and coins. */
            $table->json('pen_slots')->nullable()->after('animals');
        });

        // farms keep what they had: their animals' places, and three batches per machine they built
        DB::table('farms')->orderBy('id')->each(function ($farm) {
            $animals = json_decode($farm->animals ?? '[]', true) ?: [];
            $slots = [];
            foreach ($animals as $a) {
                $slots[$a['type']] = ($slots[$a['type']] ?? 0) + 1;
            }
            $machines = json_decode($farm->machines ?? '{}', true) ?: [];
            foreach ($machines as $id => $m) {
                $machines[$id]['slots'] = $m['slots'] ?? 3;
            }
            DB::table('farms')->where('id', $farm->id)->update([
                'pen_slots' => $slots ? json_encode($slots) : null,
                'machines' => $machines ? json_encode($machines) : $farm->machines,
            ]);
        });
    }

    public function down(): void
    {
        Schema::table('farms', fn (Blueprint $table) => $table->dropColumn('pen_slots'));
    }
};
