#!/usr/bin/env bash
set -euo pipefail
SOURCE_DIR="Log-data"
BUCKET="log-data"
[[ -d "$SOURCE_DIR" ]] || { echo "No Log-data folder"; exit 0; }
count=0
while IFS= read -r -d '' file; do
  key="${file#"$SOURCE_DIR"/}"
  # Only explicitly approved public sample files may be synced.
  case "$key" in
    Example.jpg|Example.json|log-template.json) ;;
    *) echo "Skipping non-allowlisted object: $key"; continue ;;
  esac
  echo "Sync $file -> r2://$BUCKET/$key"
  npx wrangler r2 object put "$BUCKET/$key" --file "$file" --remote
  count=$((count+1))
done < <(find "$SOURCE_DIR" -maxdepth 1 -type f -print0 | sort -z)
echo "Uploaded $count object(s). No R2 objects deleted."
