#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WIKI_SRC_DIR="$ROOT_DIR/docs/wiki"
TMP_DIR="$(mktemp -d)"
DRY_RUN=0

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

usage() {
  cat <<'EOF'
Publish docs/wiki pages to the GitHub wiki repository.

Usage:
  scripts/publish-wiki.sh [--repo <owner/repo>] [--dry-run]

Options:
  --repo      GitHub repository in owner/name form. Defaults to origin remote.
  --dry-run   Render/sync wiki files locally without pushing.
EOF
}

repo_slug=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      repo_slug="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ ! -d "$WIKI_SRC_DIR" ]]; then
  echo "Missing docs/wiki directory: $WIKI_SRC_DIR" >&2
  exit 1
fi

if [[ -z "$repo_slug" ]]; then
  origin_url="$(git -C "$ROOT_DIR" remote get-url origin)"
  case "$origin_url" in
    git@github.com:*.git)
      repo_slug="${origin_url#git@github.com:}"
      repo_slug="${repo_slug%.git}"
      ;;
    https://github.com/*.git)
      repo_slug="${origin_url#https://github.com/}"
      repo_slug="${repo_slug%.git}"
      ;;
    *)
      echo "Could not infer GitHub repo from origin: $origin_url" >&2
      echo "Pass --repo <owner/repo> explicitly." >&2
      exit 1
      ;;
  esac
fi

wiki_remote="git@github.com:${repo_slug}.wiki.git"
if [[ "${GITHUB_WIKI_REMOTE:-}" != "" ]]; then
  wiki_remote="$GITHUB_WIKI_REMOTE"
fi

echo "Wiki source: $WIKI_SRC_DIR"
echo "Wiki remote: $wiki_remote"

if [[ $DRY_RUN -eq 1 ]]; then
  mkdir -p "$TMP_DIR/wiki"
  cp "$WIKI_SRC_DIR"/*.md "$TMP_DIR/wiki/"
  echo "Dry run complete. Synced files:"
  ls -1 "$TMP_DIR/wiki" | sed 's/^/  - /'
  exit 0
fi

git clone "$wiki_remote" "$TMP_DIR/wiki"
cp "$WIKI_SRC_DIR"/*.md "$TMP_DIR/wiki/"

git -C "$TMP_DIR/wiki" add .

if git -C "$TMP_DIR/wiki" diff --cached --quiet; then
  echo "No wiki changes to publish."
  exit 0
fi

git -C "$TMP_DIR/wiki" commit -m "docs: sync wiki from docs/wiki"
git -C "$TMP_DIR/wiki" push origin HEAD
echo "Wiki published."
