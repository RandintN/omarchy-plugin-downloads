/**
 * Suíte TDD do Omarchy yt-dlp Download Manager (core de estado).
 *
 * Execução:
 *   bun test /home/robson/omarchy-ytdlp-src/download-manager.test.ts
 *
 * Cobre: isGenericStreamTitle, addDownload (incl. dedup), updateItem,
 * removeItem, clearCompleted, cancelDownload e persistência atômica.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, statSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DownloadManager,
  isGenericStreamTitle,
  type DownloadItem
} from "./download-manager-core";

let stateDir: string;
let stateFile: string;

function newManager(): DownloadManager {
  // Trava o estado em um arquivo limpo por teste
  if (existsSync(stateFile)) rmSync(stateFile);
  return new DownloadManager(stateFile);
}

beforeAll(() => {
  stateDir = mkdtempSync(join(tmpdir(), "omarchy-dl-test-"));
  stateFile = join(stateDir, "downloads.json");
});

afterAll(() => {
  rmSync(stateDir, { recursive: true, force: true });
});

describe("isGenericStreamTitle", () => {
  test("rejeita títulos genéricos exatos", () => {
    for (const t of ["master", "index", "playlist", "video", "stream", "manifest", "Checking video...", "Downloading video...", "Downloaded video"]) {
      expect(isGenericStreamTitle(t)).toBe(true);
    }
  });

  test("rejeita variações com extensão/sufixo", () => {
    expect(isGenericStreamTitle("master.m3u8")).toBe(true);
    expect(isGenericStreamTitle("MANIFEST")).toBe(true);
    expect(isGenericStreamTitle("stream.mp4")).toBe(true);
  });

  test("aceita títulos reais", () => {
    expect(isGenericStreamTitle("Alice in the Dream Prison 1")).toBe(false);
    expect(isGenericStreamTitle("Video game review #12")).toBe(false);
  });

  test("trata vazio/undefined como genérico", () => {
    expect(isGenericStreamTitle("")).toBe(true);
    expect(isGenericStreamTitle(undefined)).toBe(true);
  });
});

describe("addDownload", () => {
  test("cria item com campos padrão", () => {
    const m = newManager();
    const id = m.addDownload("https://example.com/video1");
    const item = m.getItem(id)!;
    expect(item.url).toBe("https://example.com/video1");
    expect(item.title).toBe("Checking video...");
    expect(item.percent).toBe(0);
    expect(item.status).toBe("queued");
    expect(item.addedAt).toBeGreaterThan(0);
  });

  test("preserva título custom e referer", () => {
    const m = newManager();
    const id = m.addDownload("https://example.com/v", "Meu Título", "downloading", "https://ref.example.com");
    const item = m.getItem(id)!;
    expect(item.title).toBe("Meu Título");
    expect(item.referer).toBe("https://ref.example.com");
    expect(item.status).toBe("downloading");
  });

  test("URL simulate recebe título dedicado", () => {
    const m = newManager();
    const id = m.addDownload("https://simulate/video1");
    expect(m.getItem(id)!.title).toBe("Simulated Video");
  });

  test("dedup: mesma URL em download retorne o mesmo id", () => {
    const m = newManager();
    const id1 = m.addDownload("https://example.com/x", undefined, "downloading");
    const id2 = m.addDownload("https://example.com/x");
    expect(id2).toBe(id1);
    expect(m.getItems()).toHaveLength(1);
  });

  test("dedup: mesmo referer retorne o mesmo id", () => {
    const m = newManager();
    const id1 = m.addDownload("https://a.example.com/v", undefined, "downloading", "https://ref.example.com/page");
    const id2 = m.addDownload("https://outro.example.com/v", undefined, "queued", "https://ref.example.com/page");
    expect(id2).toBe(id1);
  });

  test("dedup: item completed com arquivo existente retorne o mesmo id", () => {
    const m = newManager();
    const filePath = join(stateDir, "done.mp4");
    writeFileSync(filePath, "x");
    const id1 = m.addDownload("https://example.com/done");
    m.updateItem(id1, { status: "completed", percent: 100, filepath: filePath });
    const id2 = m.addDownload("https://example.com/done");
    expect(id2).toBe(id1);
  });

  test("sem dedup: item completed antigo sem arquivo crie novo id", () => {
    const m = newManager();
    const id1 = m.addDownload("https://example.com/old");
    // Backdate addedAt para escapar da janela de dedup de 5s (anti-duplo clique)
    const oneHourAgo = Date.now() - 3600_000;
    m.updateItem(id1, { status: "completed", percent: 100, completedAt: oneHourAgo, addedAt: oneHourAgo });
    const id2 = m.addDownload("https://example.com/old");
    expect(id2).not.toBe(id1);
    expect(m.getItems()).toHaveLength(2);
  });
});

describe("updateItem", () => {
  test("atualiza percent e título", () => {
    const m = newManager();
    const id = m.addDownload("https://example.com/u");
    m.updateItem(id, { percent: 42, title: "Título" });
    const item = m.getItem(id)!;
    expect(item.percent).toBe(42);
    expect(item.title).toBe("Título");
  });

  test("transição para completed preenche completedAt automaticamente", () => {
    const m = newManager();
    const id = m.addDownload("https://example.com/c");
    m.updateItem(id, { status: "completed", percent: 100 });
    expect(m.getItem(id)!.completedAt).toBeGreaterThan(0);
  });

  test("id inexistente não quebra e não cria item", () => {
    const m = newManager();
    expect(() => m.updateItem("inexistente123", { percent: 10 })).not.toThrow();
    expect(m.getItems()).toHaveLength(0);
  });
});

describe("removeItem", () => {
  test("remove o item do estado", () => {
    const m = newManager();
    const id = m.addDownload("https://example.com/r");
    m.removeItem(id);
    expect(m.getItem(id)).toBeUndefined();
    expect(m.getItems()).toHaveLength(0);
  });
});

describe("clearCompleted", () => {
  test("mantém apenas downloading/queued", () => {
    const m = newManager();
    const a = m.addDownload("https://example.com/a", undefined, "downloading");
    const b = m.addDownload("https://example.com/b", undefined, "queued");
    const c = m.addDownload("https://example.com/c");
    m.updateItem(c, { status: "completed", percent: 100 });
    const d = m.addDownload("https://example.com/d");
    m.updateItem(d, { status: "failed", error: "x" });

    m.clearCompleted();

    const ids = m.getItems().map(i => i.id).sort();
    expect(ids).toEqual([a, b].sort());
  });
});

describe("cancelDownload", () => {
  test("downloading → failed com 'Cancelled by user'", () => {
    const m = newManager();
    const id = m.addDownload("https://example.com/cancel", undefined, "downloading");
    m.cancelDownload(id);
    const item = m.getItem(id)!;
    expect(item.status).toBe("failed");
    expect(item.error).toBe("Cancelled by user");
  });

  test("item completed não é alterado", () => {
    const m = newManager();
    const id = m.addDownload("https://example.com/keep");
    m.updateItem(id, { status: "completed", percent: 100 });
    m.cancelDownload(id);
    expect(m.getItem(id)!.status).toBe("completed");
  });
});

describe("persistência atômica", () => {
  test("arquivo de estado é criado com permissão 0600", () => {
    const m = newManager();
    m.addDownload("https://example.com/perm");
    const mode = statSync(stateFile).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  test("não deixa arquivos .tmp órfãos após salvar", () => {
    const m = newManager();
    m.addDownload("https://example.com/t1");
    m.addDownload("https://example.com/t2");
    m.updateItem(m.getItems()[0].id, { percent: 50 });
    const orphans = readdirSync(stateDir).filter(f => f.includes(".tmp."));
    expect(orphans).toHaveLength(0);
  });

  test("estado sobrevive a nova instância (round-trip)", () => {
    const m1 = newManager();
    const id = m1.addDownload("https://example.com/rt", "Persistido", "downloading");
    m1.updateItem(id, { percent: 77 });

    const m2 = new DownloadManager(stateFile);
    const item = m2.getItem(id)!;
    expect(item.percent).toBe(77);
    expect(item.title).toBe("Persistido");
    expect(item.status).toBe("downloading");
  });

  test("JSON corrompido preserva estado em memória e cria backup .corrupt.bak", () => {
    const m = newManager();
    const id = m.addDownload("https://example.com/corrupt");
    writeFileSync(stateFile, "{não é json válido");

    // loadStateSync não deve lançar
    expect(() => m.loadStateSync()).not.toThrow();
    // item continua acessível em memória
    expect(m.getItem(id)).toBeDefined();
    // backup da versão corrompida foi criado
    expect(existsSync(`${stateFile}.corrupt.bak`)).toBe(true);
  });

  test("estado vazio/ausente carrega lista vazia", () => {
    const m = newManager();
    expect(m.getItems()).toHaveLength(0);
  });
});
