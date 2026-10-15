#!/usr/bin/env bash
# Server-side update for the Hostinger layout (repo cloned into the game's public_html):
#   game  = <repo>/game   (built and committed on the dev machine; served via the root .htaccess)
#   api   = <repo>/api    (api subdomain document root; Laravel app in <repo>/server)
#
#   ./deploy.sh                 git pull + update the API (composer, migrations, caches)
#   ./deploy.sh --install-hook  make a plain `git pull` run the API update automatically
#   ./deploy.sh --after-pull    API update only (what the hook runs)
# See DEPLOY.md.
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(pwd)"

# Hostinger: `php84` / `composer84` are the PHP 8.4 CLI tools (override with PHP=... COMPOSER_BIN=...).
PHP="${PHP:-php84}"
COMPOSER_BIN="${COMPOSER_BIN:-composer84}"

after_pull() {
  echo "==> PHP $("$PHP" -r 'echo PHP_VERSION;') ($PHP)"
  cd "$ROOT/server"
  if [ ! -f .env ]; then
    echo "server/.env is missing: copy server/.env.production.example to server/.env and fill it in (DEPLOY.md)" >&2
    exit 1
  fi
  "$COMPOSER_BIN" install --no-dev --optimize-autoloader --no-interaction
  "$PHP" artisan migrate --force
  "$PHP" artisan config:cache
  "$PHP" artisan route:cache
  "$PHP" artisan event:cache
  chmod -R ug+rwX storage bootstrap/cache
  cd "$ROOT"

  # the game build is committed, so warn when sources moved on without a rebuild
  local src game
  src="$(git log -1 --format=%ct -- client shared)"
  game="$(git log -1 --format=%ct -- game)"
  if [ -n "$src" ] && [ -n "$game" ] && [ "$src" -gt "$game" ]; then
    echo "!! game/ is older than client/ or shared/: run 'npm run build' on the dev machine, commit game/ and push" >&2
  fi
  echo "==> Done: game $(git log -1 --format='%h %cd' --date=short -- game), api $(git log -1 --format='%h %cd' --date=short -- server api shared)"
}

case "${1:-}" in
  --install-hook)
    printf '#!/usr/bin/env bash\n# installed by deploy.sh: update the API after every git pull\nexec "%s/deploy.sh" --after-pull\n' "$ROOT" > .git/hooks/post-merge
    chmod +x .git/hooks/post-merge
    echo "Installed .git/hooks/post-merge: 'git pull' now updates the API too."
    ;;
  --after-pull)
    after_pull
    ;;
  "")
    echo "==> git pull"
    # hooks off here, so the API update below runs exactly once
    git -c core.hooksPath=/dev/null pull --ff-only
    after_pull
    ;;
  *)
    echo "usage: $0 [--install-hook | --after-pull]" >&2
    exit 2
    ;;
esac
