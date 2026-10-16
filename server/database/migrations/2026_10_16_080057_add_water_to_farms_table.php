<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('farms', function (Blueprint $table) {
            /** When each pen's water was last filled: {chicken: ms, cow: ms}; it runs dry after a while. */
            $table->json('water')->nullable()->after('dog');
        });
    }

    public function down(): void
    {
        Schema::table('farms', fn (Blueprint $table) => $table->dropColumn('water'));
    }
};
