import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// updater.js is the self-update path for sideloaded Sol APKs. Its plugin
// calls are plumbing, but the decisions around them are real logic: which
// HTTP stack fetches the feed (native CapacitorHttp bypasses the CORS
// block that broke web fetch on phones), how the feed body is parsed, and
// whether remote versionCode > installed build means "update available".
// Mock all three Capacitor/plugin modules and pin those decisions.
const mocks = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  httpGet: vi.fn(),
  getInfo: vi.fn(),
  getInstallPermission: vi.fn(),
  openInstallPermissionSettings: vi.fn(),
  addListener: vi.fn(),
  downloadUpdate: vi.fn(),
  installUpdate: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: mocks.isNativePlatform },
  CapacitorHttp: { get: mocks.httpGet },
}));

vi.mock("@capacitor/app", () => ({
  App: { getInfo: mocks.getInfo },
}));

vi.mock("sol-updater", () => ({
  SolUpdater: {
    getInstallPermission: mocks.getInstallPermission,
    openInstallPermissionSettings: mocks.openInstallPermissionSettings,
    addListener: mocks.addListener,
    downloadUpdate: mocks.downloadUpdate,
    installUpdate: mocks.installUpdate,
  },
}));

import {
  UPDATE_FEED_URL,
  UPDATE_APK_FILE,
  isNativeApp,
  getInstalledBuild,
  checkForUpdate,
  getInstallPermission,
  openInstallPermissionSettings,
  downloadUpdate,
  installUpdate,
} from "./updater.js";

const FEED = { versionCode: 43, versionName: "2026.10.30-43", apkUrl: "https://example.test/sol.apk" };

function stubWebFeed(feed = FEED) {
  mocks.isNativePlatform.mockReturnValue(false);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => feed })),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isNativePlatform.mockReturnValue(false);
  mocks.getInfo.mockResolvedValue({ build: "42", version: "2026.09.25-42" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("constants", () => {
  it("points at the rolling experimental release feed and APK name", () => {
    expect(UPDATE_FEED_URL).toBe(
      "https://github.com/dsect-net/sol-app/releases/download/experimental/version.json",
    );
    expect(UPDATE_APK_FILE).toBe("sol-experimental.apk");
  });
});

describe("isNativeApp", () => {
  it("passes through the Capacitor platform check", () => {
    mocks.isNativePlatform.mockReturnValue(true);
    expect(isNativeApp()).toBe(true);
    mocks.isNativePlatform.mockReturnValue(false);
    expect(isNativeApp()).toBe(false);
  });

  it("returns false instead of throwing when the bridge is unavailable", () => {
    mocks.isNativePlatform.mockImplementation(() => {
      throw new Error("no bridge");
    });
    expect(isNativeApp()).toBe(false);
  });
});

describe("getInstalledBuild", () => {
  it("parses the Android versionCode out of the build string", async () => {
    mocks.getInfo.mockResolvedValue({ build: "42", version: "2026.09.25-42" });
    await expect(getInstalledBuild()).resolves.toEqual({
      versionCode: 42,
      versionName: "2026.09.25-42",
    });
  });

  it("falls back to 0 / empty string for unparseable or missing info", async () => {
    mocks.getInfo.mockResolvedValue({ build: "not-a-number", version: undefined });
    await expect(getInstalledBuild()).resolves.toEqual({ versionCode: 0, versionName: "" });
    mocks.getInfo.mockResolvedValue({});
    await expect(getInstalledBuild()).resolves.toEqual({ versionCode: 0, versionName: "" });
  });
});

describe("checkForUpdate (web path)", () => {
  it("reports an update only when the feed versionCode is strictly newer", async () => {
    stubWebFeed({ ...FEED, versionCode: 43 });
    await expect(checkForUpdate()).resolves.toMatchObject({ available: true });

    stubWebFeed({ ...FEED, versionCode: 42 });
    await expect(checkForUpdate()).resolves.toMatchObject({ available: false });

    stubWebFeed({ ...FEED, versionCode: 41 });
    await expect(checkForUpdate()).resolves.toMatchObject({ available: false });
  });

  it("returns the feed and installed build alongside the verdict", async () => {
    stubWebFeed();
    const result = await checkForUpdate();
    expect(result.feed).toEqual(FEED);
    expect(result.installed).toEqual({ versionCode: 42, versionName: "2026.09.25-42" });
  });

  it("coerces a string versionCode from the feed before comparing", async () => {
    stubWebFeed({ ...FEED, versionCode: "43" });
    await expect(checkForUpdate()).resolves.toMatchObject({ available: true });
    stubWebFeed({ ...FEED, versionCode: "junk" });
    await expect(checkForUpdate()).resolves.toMatchObject({ available: false });
  });

  it("fetches the feed URL with no-store caching and never touches native HTTP", async () => {
    stubWebFeed();
    await checkForUpdate();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(UPDATE_FEED_URL, { cache: "no-store" });
    expect(mocks.httpGet).not.toHaveBeenCalled();
  });

  it("throws with the HTTP status when the web feed request fails", async () => {
    mocks.isNativePlatform.mockReturnValue(false);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })),
    );
    await expect(checkForUpdate()).rejects.toThrow("Update feed unavailable (HTTP 503)");
  });
});

describe("checkForUpdate (native path)", () => {
  beforeEach(() => {
    mocks.isNativePlatform.mockReturnValue(true);
  });

  it("fetches via CapacitorHttp with no-cache headers, not web fetch", async () => {
    vi.stubGlobal("fetch", vi.fn());
    mocks.httpGet.mockResolvedValue({ status: 200, data: JSON.stringify(FEED) });
    await expect(checkForUpdate()).resolves.toMatchObject({ available: true });
    expect(mocks.httpGet).toHaveBeenCalledWith({
      url: UPDATE_FEED_URL,
      headers: { "Cache-Control": "no-cache" },
      responseType: "text",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("parses a string feed body and passes an object body through untouched", async () => {
    mocks.httpGet.mockResolvedValue({ status: 200, data: JSON.stringify(FEED) });
    await expect((await checkForUpdate()).feed).toEqual(FEED);

    mocks.httpGet.mockResolvedValue({ status: 200, data: FEED });
    await expect((await checkForUpdate()).feed).toEqual(FEED);
  });

  it("throws with the HTTP status on a non-2xx native response", async () => {
    mocks.httpGet.mockResolvedValue({ status: 404, data: "" });
    await expect(checkForUpdate()).rejects.toThrow("Update feed unavailable (HTTP 404)");
    mocks.httpGet.mockResolvedValue({ status: 301, data: "" });
    await expect(checkForUpdate()).rejects.toThrow("Update feed unavailable (HTTP 301)");
  });
});

describe("install permission", () => {
  it("returns only the granted flag from the plugin", async () => {
    mocks.getInstallPermission.mockResolvedValue({ granted: true });
    await expect(getInstallPermission()).resolves.toBe(true);
    mocks.getInstallPermission.mockResolvedValue({ granted: false });
    await expect(getInstallPermission()).resolves.toBe(false);
  });

  it("delegates opening the permission settings", async () => {
    mocks.openInstallPermissionSettings.mockResolvedValue(undefined);
    await openInstallPermissionSettings();
    expect(mocks.openInstallPermissionSettings).toHaveBeenCalledTimes(1);
  });
});

describe("downloadUpdate", () => {
  function stubListener() {
    const remove = vi.fn(async () => {});
    const state = { callback: null, remove };
    mocks.addListener.mockImplementation(async (event, cb) => {
      state.callback = cb;
      return { remove };
    });
    return state;
  }

  it("rejects a feed with no APK URL before registering any listener", async () => {
    await expect(downloadUpdate({ versionCode: 43 })).rejects.toThrow(
      "Update feed has no APK URL",
    );
    await expect(downloadUpdate({ apkUrl: "" })).rejects.toThrow("Update feed has no APK URL");
    expect(mocks.addListener).not.toHaveBeenCalled();
    expect(mocks.downloadUpdate).not.toHaveBeenCalled();
  });

  it("downloads under the fixed APK filename and removes the listener after", async () => {
    const state = stubListener();
    mocks.downloadUpdate.mockResolvedValue({ path: "/downloads/sol-experimental.apk" });
    await expect(downloadUpdate(FEED)).resolves.toEqual({
      path: "/downloads/sol-experimental.apk",
    });
    expect(mocks.addListener).toHaveBeenCalledWith("downloadProgress", expect.any(Function));
    expect(mocks.downloadUpdate).toHaveBeenCalledWith({
      url: FEED.apkUrl,
      fileName: UPDATE_APK_FILE,
    });
    expect(state.remove).toHaveBeenCalledTimes(1);
  });

  it("forwards progress events to onProgress and tolerates a missing callback", async () => {
    const state = stubListener();
    mocks.downloadUpdate.mockResolvedValue({ path: "/x" });
    const seen = [];
    await downloadUpdate(FEED, (e) => seen.push(e));
    state.callback({ progress: 0.5, bytesDownloaded: 10, bytesTotal: 20 });
    expect(seen).toEqual([{ progress: 0.5, bytesDownloaded: 10, bytesTotal: 20 }]);

    const state2 = stubListener();
    await downloadUpdate(FEED);
    expect(() => state2.callback({ progress: 1 })).not.toThrow();
  });

  it("still removes the listener when the download itself fails", async () => {
    const state = stubListener();
    mocks.downloadUpdate.mockRejectedValue(new Error("network died"));
    await expect(downloadUpdate(FEED)).rejects.toThrow("network died");
    expect(state.remove).toHaveBeenCalledTimes(1);
  });
});

describe("installUpdate", () => {
  it("delegates to the plugin installer", async () => {
    mocks.installUpdate.mockResolvedValue(undefined);
    await installUpdate();
    expect(mocks.installUpdate).toHaveBeenCalledTimes(1);
  });
});
