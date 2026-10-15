<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GameTable extends Model
{
    protected $fillable = ['game', 'stake', 'status', 'host_id', 'guest_id', 'vs_bot', 'board', 'turn', 'moves', 'last_move', 'winner', 'end_reason', 'win_line', 'turn_deadline', 'version'];

    protected function casts(): array
    {
        return [
            'stake' => 'integer',
            'vs_bot' => 'boolean',
            'board' => 'array',
            'turn' => 'integer',
            'moves' => 'integer',
            'last_move' => 'array',
            'winner' => 'integer',
            'win_line' => 'array',
            'turn_deadline' => 'integer',
            'version' => 'integer',
        ];
    }

    public function host(): BelongsTo
    {
        return $this->belongsTo(User::class, 'host_id');
    }

    public function guest(): BelongsTo
    {
        return $this->belongsTo(User::class, 'guest_id');
    }

    /** 1 for the host, 2 for the guest, null for a spectator. */
    public function sideOf(int $userId): ?int
    {
        return match ($userId) {
            $this->host_id => 1,
            $this->guest_id => 2,
            default => null,
        };
    }
}
