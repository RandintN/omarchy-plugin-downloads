#!/usr/bin/env bash
set -e

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
USER_BIN="$HOME/.local/bin"
USER_SHARE="$HOME/.local/share/omarchy/bin"
SYSTEMD_USER_DIR="$HOME/.config/systemd/user"
CHROME_NATIVE_DIR="$HOME/.config/chromium/NativeMessagingHosts"
BRAVE_NATIVE_DIR="$HOME/.config/BraveSoftware/Brave-Browser/NativeMessagingHosts"

echo "=== Instalando Omarchy Downloads Backend ==="

# 1. Verificar dependências
for cmd in bun yt-dlp ffmpeg; do
  if ! command -v "$cmd" &> /dev/null; then
    echo "ERRO: O comando obrigatório '$cmd' não foi encontrado no PATH." >&2
    exit 1
  fi
done

# 2. Descobrir caminho do bun
BUN_PATH=$(which bun)
echo "Bun detectado em: $BUN_PATH"

# 3. Criar diretórios necessários
mkdir -p "$USER_BIN" "$USER_SHARE" "$SYSTEMD_USER_DIR" "$CHROME_NATIVE_DIR"

# 4. Copiar binários e core
echo "Copiando binários e scripts..."
cp "$PLUGIN_DIR/backend/omarchy-download-daemon" "$USER_SHARE/"
cp "$PLUGIN_DIR/backend/download-manager-core.ts" "$USER_SHARE/"
cp "$PLUGIN_DIR/backend/omarchy-download-manager" "$USER_BIN/"
cp "$PLUGIN_DIR/backend/omarchy-chromium-ytdlp-host" "$USER_BIN/"

chmod +x "$USER_SHARE/omarchy-download-daemon"
chmod +x "$USER_BIN/omarchy-download-manager"
chmod +x "$USER_BIN/omarchy-chromium-ytdlp-host"

# 5. Configurar e instalar Native Messaging Host para Chromium/Brave
echo "Configurando Native Messaging Host..."
sed "s|\$HOME|$HOME|g" "$PLUGIN_DIR/backend/com.omarchy.ytdlp.json" > "$CHROME_NATIVE_DIR/com.omarchy.ytdlp.json"
if [ -d "$(dirname "$BRAVE_NATIVE_DIR")" ]; then
  mkdir -p "$BRAVE_NATIVE_DIR"
  cp "$CHROME_NATIVE_DIR/com.omarchy.ytdlp.json" "$BRAVE_NATIVE_DIR/com.omarchy.ytdlp.json"
fi

# 6. Configurar e habilitar serviço Systemd
echo "Configurando serviço Systemd..."
sed "s|ExecStart=.*|ExecStart=$BUN_PATH run $USER_SHARE/omarchy-download-daemon|" "$PLUGIN_DIR/backend/omarchy-download-manager.service" > "$SYSTEMD_USER_DIR/omarchy-download-manager.service"

systemctl --user daemon-reload
systemctl --user enable omarchy-download-manager.service
systemctl --user restart omarchy-download-manager.service

echo "=== Instalação Concluída com Sucesso! ==="
echo "O daemon foi iniciado e o plugin QML está pronto para uso no Omarchy."
