#!/usr/bin/env bash
# Pull the latest code and rebuild both sites. Run on the server from the repo root.
# See DEPLOY.md.
set -euo pipefail
cd "$(dirname "$0")"

echo "==> git pull"
git pull --ff-only

echo "==> API (server/)"
cd server
composer install --no-dev --optimize-autoloader --no-interaction
php artisan migrate --force
php artisan config:cache
php artisan route:cache
php artisan event:cache
cd ..

if command -v npm >/dev/null 2>&1; then
  echo "==> Game (client/)"
  cd client
  npm ci --no-audit --no-fund
  npm run build
  cd ..
else
  echo "==> npm not found: build client/ locally and upload client/dist (DEPLOY.md, step 5B)"
fi

echo "Done."
