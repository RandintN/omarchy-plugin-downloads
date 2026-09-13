#!/usr/bin/env bash
set -e

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
USER_BIN="$HOME/.local/bin"
USER_SHARE="$HOME/.local/share/omarchy/bin"
SYSTEMD_USER_DIR="$HOME/.config/systemd/user"
CHROME_NATIVE_DIR="$HOME/.config/chromium/NativeMessagingHosts"
BRAVE_NATIVE_DIR="$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"

echo "=== Installing Omarchy Downloads Backend ==="

# 1. Check dependencies
for cmd in bun yt-dlp ffmpeg; do
  if ! command -v "$cmd" &> /dev/null; then
    echo "ERROR: Required command '$cmd' was not found in PATH." >&2
    exit 1
  fi
done

# 2. Detect bun path
BUN_PATH=$(which bun)
echo "Bun detected at: $BUN_PATH"

# 3. Create required directories
mkdir -p "$USER_BIN" "$USER_SHARE" "$SYSTEMD_USER_DIR" "$CHROME_NATIVE_DIR"

# 4. Copy binaries and core
echo "Copying binaries and scripts..."
cp "$PLUGIN_DIR/backend/omarchy-download-daemon" "$USER_SHARE/"
cp "$PLUGIN_DIR/backend/download-manager-core.ts" "$USER_SHARE/"
cp "$PLUGIN_DIR/backend/omarchy-download-manager" "$USER_BIN/"
cp "$PLUGIN_DIR/backend/omarchy-chromium-ytdlp-host" "$USER_BIN/"

chmod +x "$USER_SHARE/omarchy-download-daemon"
chmod +x "$USER_BIN/omarchy-download-manager"
chmod +x "$USER_BIN/omarchy-chromium-ytdlp-host"

# 5. Configure and install Native Messaging Host for Chromium/Brave
echo "Configuring Native Messaging Host..."
sed "s|\$HOME|$HOME|g" "$PLUGIN_DIR/backend/com.omarchy.ytdlp.json" > "$CHROME_NATIVE_DIR/com.omarchy.ytdlp.json"
if [ -d "$(dirname "$BRAVE_NATIVE_DIR")" ]; then
  mkdir -p "$BRAVE_NATIVE_DIR"
  cp "$CHROME_NATIVE_DIR/com.omarchy.ytdlp.json" "$BRAVE_NATIVE_DIR/com.omarchy.ytdlp.json"
fi

# 6. Configure and enable Systemd service
echo "Configuring Systemd service..."
sed "s|ExecStart=.*|ExecStart=$BUN_PATH run $USER_SHARE/omarchy-download-daemon|" "$PLUGIN_DIR/backend/omarchy-download-manager.service" > "$SYSTEMD_USER_DIR/omarchy-download-manager.service"

systemctl --user daemon-reload
systemctl --user enable omarchy-download-manager.service
systemctl --user restart omarchy-download-manager.service

echo "=== Installation Completed Successfully! ==="
echo "The daemon has been started and the Quickshell plugin is ready for use."
