#!/bin/bash
set -e

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"

cat > "$BIN_DIR/atlas" <<EOF
#!/bin/bash
exec python3 "$REPO_DIR/atlas.py" "\$@"
EOF

chmod +x "$BIN_DIR/atlas" "$REPO_DIR/atlas.py"

echo "✦ Project Atlas v1.0.0 installed to $BIN_DIR/atlas"
echo "  Run 'atlas .' inside any project folder!"
