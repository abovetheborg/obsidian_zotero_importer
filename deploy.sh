#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script_src="$repo_root/scripts/zotero_picker.js"
template_src="$repo_root/templates/temp.md"
template_target_name="Create Literature Note From Zotero.md"
script_dest="${ZOTERO_PICKER_SCRIPT_DIR:-}"
template_dest="${ZOTERO_TEMPLATE_DIR:-}"
force=0
dryrun=0

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Options:
  --script-dir DIR      Target Obsidian Templater user scripts directory.
  --template-dir DIR    Target Templater template directory.
  --force               Overwrite existing destination files.
  --dry-run             Print actions without copying.
  -h, --help            Show this help message.

Environment variables:
  ZOTERO_PICKER_SCRIPT_DIR   Path to the target user script directory.
  ZOTERO_TEMPLATE_DIR        Path to the target template directory.

Example:
  ./deploy.sh --script-dir ~/Vault/.obsidian/plugins/templater/user-scripts \
              --template-dir ~/Vault/Templates
EOF
}

copy_file() {
  local src="$1"
  local dest_dir="$2"
  local dest_name="${3:-$(basename "$src")}"
  local dest_file="$dest_dir/$dest_name"

  if [ -z "$dest_dir" ]; then
    return 0
  fi

  printf 'Deploying %s -> %s\n' "$src" "$dest_file"
  if [ "$dryrun" -eq 1 ]; then
    return 0
  fi

  mkdir -p "$dest_dir"

  if [ -e "$dest_file" ] && [ "$force" -eq 0 ]; then
    echo "Error: $dest_file already exists. Use --force to overwrite." >&2
    exit 1
  fi

  cp "$src" "$dest_file"
}

if [ "$#" -eq 0 ] && [ -z "$script_dest" ] && [ -z "$template_dest" ]; then
  usage
  exit 1
fi

while [ "$#" -gt 0 ]; do
  case "$1" in
    --script-dir)
      shift
      script_dest="${1:-}"
      ;;
    --template-dir)
      shift
      template_dest="${1:-}"
      ;;
    --force)
      force=1
      ;;
    --dry-run)
      dryrun=1
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
  shift
done

if [ -z "$script_dest" ] && [ -z "$template_dest" ]; then
  echo "Error: Missing target directory. Provide --script-dir and/or --template-dir, or set ZOTERO_PICKER_SCRIPT_DIR/ZOTERO_TEMPLATE_DIR." >&2
  usage
  exit 1
fi

copy_file "$script_src" "$script_dest"
copy_file "$template_src" "$template_dest" "$template_target_name"

echo "Deploy complete."
