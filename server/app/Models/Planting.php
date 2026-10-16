<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Planting extends Model
{
    public $timestamps = false;

    protected $fillable = ['tile', 'crop', 'planted_at', 'stolen', 'thieves', 'helpers', 'fertilized'];

    protected function casts(): array
    {
        return [
            'tile' => 'integer',
            'planted_at' => 'integer',
            'stolen' => 'integer',
            'thieves' => 'array',
            'helpers' => 'array',
            'fertilized' => 'boolean',
        ];
    }

    public function farm(): BelongsTo
    {
        return $this->belongsTo(Farm::class);
    }
}
