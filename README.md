# Omarchy Downloads Plugin

A self-contained native `yt-dlp` download manager and Quickshell bar widget for Omarchy.

## Features

- **High-Performance Backend (`Bun`):** Asynchronous download daemon supporting concurrency pooling (max 3 active downloads, overflow queued), surgical process cancellation, and atomic state persistence with strict permissions (`0600`).
- **RAM Thumbnail Caching (`tmpfs`):** Automatic preview generation stored in `/tmp/<user>/omarchy-thumbnails/` (permission `0700`), avoiding SSD wear and ensuring automatic cleanup on reboot.
- **Native Browser Integration:** Chromium / Brave extension support via Native Messaging Host (`omarchy-chromium-ytdlp-host`) with SSRF protection and URL validation.
- **Quickshell UI:** Dynamic bar widget (`BarWidget.qml`) that stays visible during active downloads or for 1 hour after completion/failure for quick review, featuring a full floating panel (`Panel.qml`) with progress, queue, and action buttons.
- **CLI Client (`omarchy-download-manager`):** Full command-line control for terminal users.
- **Systemd Integration:** Managed user service (`omarchy-download-manager.service`) ensuring reliable background execution.

---

## Quick Installation (One Command)

Clone the repository directly into your Omarchy plugins directory and run the automated installer:

```bash
git clone https://github.com/RandintN/omarchy-plugin-downloads.git ~/.config/omarchy/plugins/robson.downloads
~/.config/omarchy/plugins/robson.downloads/install.sh
```

The installer detects your environment, configures Bun, installs the binaries under `~/.local/bin` and `~/.local/share/omarchy/bin`, sets up the Native Messaging Host, enables the user Systemd service, and enables the widget in your Omarchy shell.

---

## CLI Usage

```bash
# Add a real download URL
omarchy-download-manager --add "https://www.youtube.com/watch?v=VIDEO_ID"

# Add a simulated download for testing concurrency
omarchy-download-manager --add "https://simulate/video1"

# Remove a specific download item by its alphanumeric ID
omarchy-download-manager --remove "<item_id>"

# Cancel an active or queued download
omarchy-download-manager --cancel "<item_id>"

# Clear all completed and failed downloads
omarchy-download-manager --clear
```

---

## License

MIT License - Copyright (c) 2026 [Robson Cassiano](https://eu.robsoncassiano.software)
