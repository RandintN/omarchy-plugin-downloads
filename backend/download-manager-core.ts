import { mkdirSync, existsSync, chmodSync, renameSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";

export interface DownloadItem {
  id: string;
  url: string;
  title: string;
  percent: number;
  status: "queued" | "downloading" | "completed" | "failed";
  filepath?: string;
  error?: string;
  referer?: string;
  addedAt: number;
  completedAt?: number;
}

const GENERIC_TITLES = new Set([
  "master",
  "index",
  "playlist",
  "video",
  "stream",
  "manifest",
  "checking video...",
  "downloading video...",
  "downloaded video"
]);

export function isGenericStreamTitle(title?: string): boolean {
  if (!title) return true;
  const clean = title.trim().toLowerCase();
  if (GENERIC_TITLES.has(clean)) return true;
  return /^(master|index|playlist|video|stream|manifest)(?:\.[a-z0-9]+)?$/i.test(clean);
}


export class DownloadManager {
  private stateFilePath: string;
  private items: Map<string, DownloadItem> = new Map();

  constructor(stateFilePath?: string) {
    this.stateFilePath = stateFilePath || join(Bun.env.XDG_STATE_HOME || join(Bun.env.HOME || "", ".local/state"), "omarchy/downloads.json");
    const dir = dirname(this.stateFilePath);
    mkdirSync(dir, { recursive: true });
    try { chmodSync(dir, 0o700); } catch {}
    this.loadStateSync();
  }

  loadStateSync() {
    try {
      if (existsSync(this.stateFilePath)) {
        const fileContent = readFileSync(this.stateFilePath, "utf-8").trim();
        if (fileContent.length > 0) {
          const parsed = JSON.parse(fileContent);
          if (Array.isArray(parsed)) {
            this.items.clear();
            for (const item of parsed) {
              if (item && typeof item.id === "string") {
                this.items.set(item.id, item);
              }
            }
          }
        }
      }
    } catch (e) {
      try {
        if (existsSync(this.stateFilePath)) {
          copyFileSync(this.stateFilePath, `${this.stateFilePath}.corrupt.bak`);
        }
      } catch {}
      console.error("Falha ao analisar estado JSON, mantendo estado em memória:", e);
    }
  }

  saveState() {
    try {
      const list = Array.from(this.items.values());
      const tempPath = `${this.stateFilePath}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 6)}`;
      const payload = JSON.stringify(list, null, 2);

      writeFileSync(tempPath, payload, "utf-8");
      try { chmodSync(tempPath, 0o600); } catch {}
      renameSync(tempPath, this.stateFilePath);
      try { chmodSync(this.stateFilePath, 0o600); } catch {}
    } catch (e) {
      console.error("Erro ao salvar estado atômico:", e);
    }
  }

  getItems(): DownloadItem[] {
    return Array.from(this.items.values());
  }

  getItem(id: string): DownloadItem | undefined {
    return this.items.get(id);
  }

  addDownload(url: string, customTitle?: string, initialStatus: "queued" | "downloading" = "queued", referer?: string): string {
    this.loadStateSync();

    const now = Date.now();
    const matchingItems: DownloadItem[] = [];

    for (const existing of this.items.values()) {
      const isMatch =
        existing.url === url ||
        Boolean(referer && existing.url === referer) ||
        Boolean(existing.referer && existing.referer === url) ||
        Boolean(referer && existing.referer && existing.referer === referer);

      if (isMatch) {
        matchingItems.push(existing);
      }
    }

    for (const existing of matchingItems) {
      if (existing.status === "downloading" || existing.status === "queued" || (now - existing.addedAt < 5000)) {
        return existing.id;
      }
    }

    for (const existing of matchingItems) {
      if (existing.status === "completed") {
        const fileExists = Boolean(existing.filepath && existsSync(existing.filepath));
        const completedRecently = (now - (existing.completedAt ?? existing.addedAt)) < 60000;
        if (fileExists || completedRecently) {
          return existing.id;
        }
      }
    }

    const id = now.toString() + Math.random().toString(36).substring(2, 6);
    const item: DownloadItem = {
      id,
      url,
      title: customTitle || (url.includes("simulate") ? "Simulated Video" : "Checking video..."),
      percent: initialStatus === "completed" ? 100 : 0,
      status: initialStatus,
      ...(initialStatus === "completed" ? { completedAt: now } : {}),
      ...(referer ? { referer } : {}),
      addedAt: now
    };
    this.items.set(id, item);
    this.saveState();
    return id;
  }

  updateItem(id: string, update: Partial<DownloadItem>) {
    this.loadStateSync();
    const item = this.items.get(id);
    if (item) {
      if (update.status === "completed" && !update.completedAt && !item.completedAt) {
        update.completedAt = Date.now();
      }
      Object.assign(item, update);
      this.saveState();
    }
  }

  removeItem(id: string) {
    this.loadStateSync();
    if (this.items.has(id)) {
      this.items.delete(id);
      this.saveState();
    }
  }

  clearCompleted() {
    this.loadStateSync();
    const activeOnly = Array.from(this.items.values()).filter(item => item.status === "downloading" || item.status === "queued");
    this.items.clear();
    for (const item of activeOnly) {
      this.items.set(item.id, item);
    }
    this.saveState();
  }

  cancelDownload(id: string) {
    this.loadStateSync();
    const item = this.items.get(id);
    if (item && (item.status === "downloading" || item.status === "queued")) {
      item.status = "failed";
      item.error = "Cancelled by user";
      this.saveState();
    }
  }
}
