#!/usr/bin/env bash
set -euo pipefail

# Only curated public demo reference assets; never sync submissions or private data.
SOURCE_DIR="reference"
BUCKET="log-data"
if [[ ! -d "$SOURCE_DIR" ]]; then
  echo "No reference directory; nothing to sync."
  exit 0
fi

count=0
while IFS= read -r -d '' file; do
  key="${file#"$SOURCE_DIR"/}"
  if [[ "$key" == *'..'* || "$key" == .* || "$key" == */.* ]]; then
    echo "Unsafe object key: $key" >&2
    exit 1
  fi
  echo "Uploading $key -> r2://$BUCKET/$key"
  npx wrangler r2 object put "$BUCKET/$key" --file "$file" --remote
  count=$((count + 1))
done < <(find "$SOURCE_DIR" -type f -print0 | sort -z)

echo "Uploaded $count reference object(s). Existing objects are not deleted."
