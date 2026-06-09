#!/usr/bin/env bash
set -euo pipefail

TYPE="patch"
SKIP_LOCKFILE=0
SKIP_BUILD=0

usage() {
  cat <<'EOF'
Usage:
  ./scripts/release-ext.sh [patch|minor|major] [--skip-lockfile] [--skip-build]

Examples:
  ./scripts/release-ext.sh
  ./scripts/release-ext.sh minor
  ./scripts/release-ext.sh major --skip-build
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    patch|minor|major)
      TYPE="$1"
      shift
      ;;
    --skip-lockfile)
      SKIP_LOCKFILE=1
      shift
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

run_step() {
  local name="$1"
  shift
  printf '\n==> %s\n' "$name"
  "$@"
}

cd "$FRONTEND_DIR"

run_step "Bump version ($TYPE)" npm run bump -- "$TYPE"

if [[ "$SKIP_LOCKFILE" -eq 0 ]]; then
  run_step "Sync package-lock.json" npm install --package-lock-only --ignore-scripts
fi

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  run_step "Build extension package" npm run build:ext
fi

VERSION="$(node -p "require('./package.json').version")"
ZIP_PATH="$FRONTEND_DIR/catheadtab-v$VERSION.zip"

printf '\nDone. Version: %s\n' "$VERSION"
if [[ -f "$ZIP_PATH" ]]; then
  printf 'Package: %s\n' "$ZIP_PATH"
fi

cat <<EOF

Suggested commit:
  git add frontend/package.json frontend/package-lock.json frontend/public/manifest.json
  git commit -m "chore: bump version to v$VERSION"
EOF
