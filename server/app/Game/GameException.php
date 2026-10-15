<?php

namespace App\Game;

use RuntimeException;

/** A rejected player action; the message is shown to the player as-is. */
class GameException extends RuntimeException {}
