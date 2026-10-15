<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Planting extends Model
{
    public $timestamps = false;

    protected $fillable = ['tile', 'crop', 'planted_at'];

    protected function casts(): array
    {
        return [
            'tile' => 'integer',
            'planted_at' => 'integer',
        ];
    }

    public function farm(): BelongsTo
    {
        return $this->belongsTo(Farm::class);
    }
}
