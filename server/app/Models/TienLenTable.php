<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TienLenTable extends Model
{
    protected $table = 'tienlen_tables';

    protected $fillable = ['stake', 'status', 'host_id', 'seats', 'hands', 'turn', 'leader', 'combo', 'passed', 'first_trick', 'winner', 'last_action', 'turn_deadline', 'act_after', 'version'];

    protected function casts(): array
    {
        return [
            'stake' => 'integer',
            'seats' => 'array',
            'hands' => 'array',
            'turn' => 'integer',
            'leader' => 'integer',
            'combo' => 'array',
            'passed' => 'array',
            'first_trick' => 'boolean',
            'winner' => 'integer',
            'last_action' => 'array',
            'turn_deadline' => 'integer',
            'act_after' => 'integer',
            'version' => 'integer',
        ];
    }

    public function seatOf(int $userId): ?int
    {
        foreach ($this->seats as $i => $s) {
            if (($s['user'] ?? null) === $userId) {
                return $i;
            }
        }

        return null;
    }
}
