#!/usr/bin/env bash
# Copies vleo-power-tool.html from the source directory into public/VLEO/index.html,
# applying two permanent patches:
#   1. Logo src → NEOWATT_logo.png (which lives in public/VLEO/)
#   2. Appends closing })(); </script> </body> </html> if the file is truncated

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SRC="C:/Users/matth/Documents/Matt work/NEOWATT/IT/VLEO study/vleo-power-tool.html"
DEST="$REPO_ROOT/public/VLEO/index.html"

echo "Copying $SRC → $DEST"
cp "$SRC" "$DEST"

echo "Patching logo src..."
sed -i 's|src="NEOWATT-logo-text.png"|src="NEOWATT_logo.png"|g' "$DEST"

echo "Checking for truncated file (missing outer IIFE close)..."
# The outer IIFE close should appear near the very end (last 10 lines).
# If it's only found mid-file (line 1056), the file is truncated.
LAST_IIFE=$(grep -n '})();' "$DEST" | tail -1 | cut -d: -f1)
TOTAL=$(wc -l < "$DEST")
NEAR_END=$(( TOTAL - 10 ))

if [ "$LAST_IIFE" -lt "$NEAR_END" ]; then
  echo "File truncated — appending closing tags..."
  printf '\n})();\n</script>\n</body>\n</html>\n' >> "$DEST"
else
  echo "File looks complete."
fi

echo "Done. public/VLEO/index.html is ready."
