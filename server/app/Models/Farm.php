<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Farm extends Model
{
    protected $fillable = ['coins', 'level', 'xp', 'unlocked', 'inventory'];

    protected function casts(): array
    {
        return [
            'coins' => 'integer',
            'level' => 'integer',
            'xp' => 'integer',
            'unlocked' => 'integer',
            'inventory' => 'array',
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
