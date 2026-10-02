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

## Performance & Resource Benchmark

Empirical benchmark executing a stress test of 30 concurrent simulated downloads managed by the Bun daemon (pool limit of 3 active downloads with 27 queued, dynamic slot recycling, and atomic state synchronization):

| Metric | Result | Notes |
| :--- | :--- | :--- |
| **Total Test Duration** | 121.1s | 30 downloads processed across 10 sequential 3-slot batches |
| **Average CPU Load** | 0.27% | Measured via `/proc/[pid]/stat` ticks on AMD Ryzen (16 threads) |
| **Peak CPU Load** | 2.00% | Brief spike during slot handoff and queue shift |
| **Idle / Baseline RSS** | 33.1 MB | JavaScriptCore runtime baseline in sleep/idle state |
| **Peak Memory (RSS)** | 40.9 MB | +7.8 MB memory delta under full 30-item queue load |
| **Post-Run Settled RSS** | 34.3 MB | Reclaimed automatically via `Bun.gc(true)` upon queue drain |
| **SSD Physical Writes** | 5.82 MB | Cumulative `write_bytes` across all 30 items (~198 KB per download) |
| **Write Syscalls (`syscw`)** | 1,557 | Average of 51 atomic writes per full download lifecycle |
| **Staging & Thumbnails** | 0 MB SSD wear | Temporary video chunks and thumbnails operate in `tmpfs` (`/tmp`) |

## Removing

To remove the Quickshell plugin:

```bash
omarchy plugin remove robson.downloads
```

To remove backend daemons and service configuration:

```bash
systemctl --user stop omarchy-download-manager.service
systemctl --user disable omarchy-download-manager.service
rm -f ~/.config/systemd/user/omarchy-download-manager.service
rm -f ~/.local/bin/omarchy-download-manager ~/.local/bin/omarchy-chromium-ytdlp-host
rm -f ~/.local/share/omarchy/bin/omarchy-download-daemon ~/.local/share/omarchy/bin/download-manager-core.ts
rm -f ~/.config/chromium/NativeMessagingHosts/com.omarchy.ytdlp.json
systemctl --user daemon-reload
```

State files (`~/.local/state/omarchy/downloads.json`) and downloaded video files are kept.

---

## License

MIT License - Copyright (c) 2026 [Robson Cassiano](https://eu.robsoncassiano.software)
