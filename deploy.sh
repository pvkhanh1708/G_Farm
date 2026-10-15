#!/usr/bin/env bash
# Update the API after `git push`: run on the server from the repo root.
#   ./deploy.sh                      (uses `php` on PATH)
#   PHP=/opt/alt/php84/usr/bin/php ./deploy.sh   (Hostinger: pick the PHP 8.4 CLI)
# The game client is built on your own machine (`npm run package`) and uploaded; see DEPLOY.md.
set -euo pipefail
cd "$(dirname "$0")"
PHP="${PHP:-php}"
# run composer with the chosen PHP when it is a PHP script/phar (not a shell wrapper)
composer_run() {
  local bin
  bin="$(command -v composer)"
  if head -n1 "$bin" | grep -q php; then "$PHP" "$bin" "$@"; else "$bin" "$@"; fi
}

echo "==> PHP: $("$PHP" -r 'echo PHP_VERSION;')"
echo "==> git pull"
git pull --ff-only

echo "==> API (server/)"
cd server
composer_run install --no-dev --optimize-autoloader --no-interaction
"$PHP" artisan migrate --force
"$PHP" artisan config:cache
"$PHP" artisan route:cache
"$PHP" artisan event:cache
cd ..

echo "Done."
