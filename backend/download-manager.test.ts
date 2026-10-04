import { expect, test, describe, beforeEach, afterEach } from "bun:test";
import { unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DownloadManager, isGenericStreamTitle } from "./download-manager-core";

const TEST_STATE_FILE = join("/tmp", `test-downloads-${Date.now()}-${Math.random().toString(36).substring(2, 6)}.json`);

describe("Download Manager Core", () => {
  let manager: DownloadManager;

  beforeEach(() => {
    manager = new DownloadManager(TEST_STATE_FILE);
  });

  afterEach(() => {
    if (existsSync(TEST_STATE_FILE)) {
      try { unlinkSync(TEST_STATE_FILE); } catch {}
    }
  });

  test("isGenericStreamTitle detects generic stream titles correctly", () => {
    expect(isGenericStreamTitle("master")).toBe(true);
    expect(isGenericStreamTitle("index.m3u8")).toBe(true);
    expect(isGenericStreamTitle("video")).toBe(true);
    expect(isGenericStreamTitle("checking video...")).toBe(true);
    expect(isGenericStreamTitle("My Awesome Video")).toBe(false);
    expect(isGenericStreamTitle("How to code in TypeScript")).toBe(false);
  });

  test("addDownload creates a new queued item", () => {
    const id = manager.addDownload("https://example.com/video.mp4", "Example Title");
    expect(id).toBeDefined();

    const item = manager.getItem(id);
    expect(item).toBeDefined();
    expect(item?.url).toBe("https://example.com/video.mp4");
    expect(item?.title).toBe("Example Title");
    expect(item?.status).toBe("queued");
    expect(item?.percent).toBe(0);
  });

  test("addDownload deduplicates rapid identical calls", () => {
    const id1 = manager.addDownload("https://example.com/video.mp4", "Example Title");
    const id2 = manager.addDownload("https://example.com/video.mp4", "Example Title");
    expect(id1).toBe(id2);
  });

  test("updateItem updates percent and status", () => {
    const id = manager.addDownload("https://example.com/video2.mp4", "Video 2");
    manager.updateItem(id, { percent: 50, status: "downloading" });

    const item = manager.getItem(id);
    expect(item?.percent).toBe(50);
    expect(item?.status).toBe("downloading");
  });

  test("cancelDownload marks queued item as failed with user cancellation", () => {
    const id = manager.addDownload("https://example.com/video3.mp4", "Video 3");
    manager.cancelDownload(id);

    const item = manager.getItem(id);
    expect(item?.status).toBe("failed");
    expect(item?.error).toBe("Cancelled by user");
  });

  test("clearCompleted removes completed and failed items", () => {
    const id1 = manager.addDownload("https://example.com/queued.mp4", "Queued");
    const id2 = manager.addDownload("https://example.com/done.mp4", "Done");
    manager.updateItem(id2, { status: "completed", percent: 100 });

    const id3 = manager.addDownload("https://example.com/failed.mp4", "Failed");
    manager.cancelDownload(id3);

    manager.clearCompleted();

    const items = manager.getItems();
    expect(items.length).toBe(1);
    expect(items[0].id).toBe(id1);
  });
});
