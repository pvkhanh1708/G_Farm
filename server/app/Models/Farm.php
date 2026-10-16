<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Farm extends Model
{
    protected $fillable = ['coins', 'level', 'xp', 'unlocked', 'inventory', 'soil_level', 'sprinkler_level', 'orders', 'daily', 'animals', 'game_wins', 'game_winnings', 'machines', 'dog'];

    protected function casts(): array
    {
        return [
            'coins' => 'integer',
            'level' => 'integer',
            'xp' => 'integer',
            'unlocked' => 'integer',
            'inventory' => 'array',
            'soil_level' => 'integer',
            'sprinkler_level' => 'integer',
            'orders' => 'array',
            'daily' => 'array',
            'animals' => 'array',
            'game_wins' => 'integer',
            'game_winnings' => 'integer',
            'machines' => 'array',
            'dog' => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function plantings(): HasMany
    {
        return $this->hasMany(Planting::class);
    }
}
