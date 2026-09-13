# Omarchy Downloads Plugin

Interface visual (Quickshell QML) para o gerenciador de downloads assíncrono do Omarchy.

## Arquitetura

Este plugin funciona como a camada de visualização (View) e controle na barra do Omarchy, integrando-se via IPC e arquivo de estado (`~/.local/state/omarchy/downloads.json`) com os seguintes componentes de sistema:

- **Daemon de Fundo:** `omarchy-download-daemon` (gerenciado pelo systemd do usuário).
- **Native Messaging Host:** `omarchy-chromium-ytdlp-host` para integração com a extensão do navegador.
- **CLI:** `omarchy-download-manager` para interações via terminal.
