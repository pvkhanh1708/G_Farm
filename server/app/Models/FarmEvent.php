<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Something a neighbour did on a farm (stole, got caught by the dog, watered). */
class FarmEvent extends Model
{
    const UPDATED_AT = null;

    protected $fillable = ['user_id', 'actor_id', 'type', 'crop', 'qty', 'coins', 'seen'];

    protected function casts(): array
    {
        return ['qty' => 'integer', 'coins' => 'integer', 'seen' => 'boolean'];
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
