# Omarchy Downloads Plugin

Gerenciador e monitor de downloads nativo do Omarchy baseado em `yt-dlp`, Bun, Quickshell QML e Systemd.

## Arquitetura Autocontida

Este plugin é totalmente autocontido. Ele emparelha a camada visual (Quickshell QML) com um backend robusto instalado automaticamente pelo script de setup.

Componentes do sistema integrados:
- **Daemon Assíncrono (`Bun`):** Gerencia pool de concorrência (máx 3 ativos, excedentes na fila), cancelamento cirúrgico de processos, cache de miniaturas em RAM (`tmpfs` em `/tmp`) e persistência atômica com permissões restritas (`0600`).
- **Native Messaging Host:** Integração direta com a extensão do navegador Chromium / Brave.
- **Cliente CLI / IPC (`omarchy-download-manager`):** Permite controle total via terminal (`--add`, `--remove`, `--cancel`, `--clear`).
- **Serviço Systemd:** Garante persistência e execução contínua em segundo plano no escopo do usuário.

## Instalação Rápida (Um Comando)

Em qualquer máquina Omarchy, clone o repositório diretamente no diretório de plugins e execute o instalador:

```bash
git clone https://github.com/RandintN/omarchy-plugin-downloads.git ~/.config/omarchy/plugins/robson.downloads
~/.config/omarchy/plugins/robson.downloads/install.sh
```

O script detecta o ambiente, configura o Bun, instala os binários em `~/.local/bin` e `~/.local/share/omarchy/bin`, configura o Native Messaging Host, ativa o serviço Systemd e deixa o widget pronto na barra do Omarchy.
