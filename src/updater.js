import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import { SolUpdater } from "sol-updater";

// Rolling release published by the Android APK workflow. version.json is a
// static release asset, so the app can fetch it with no API auth or rate
// limits: {"versionCode": 42, "versionName": "2026.09.25-42", "apkUrl": "..."}.
export const UPDATE_FEED_URL =
  "https://github.com/dsect-net/sol-app/releases/download/experimental/version.json";
export const UPDATE_APK_FILE = "sol-experimental.apk";

export function isNativeApp() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Installed build per @capacitor/app: build = Android versionCode. */
export async function getInstalledBuild() {
  const info = await CapApp.getInfo();
  return {
    versionCode: parseInt(info.build, 10) || 0,
    versionName: info.version || "",
  };
}

export async function checkForUpdate() {
  const res = await fetch(UPDATE_FEED_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Update feed unavailable (HTTP ${res.status})`);
  const feed = await res.json();
  const installed = await getInstalledBuild();
  const remoteCode = parseInt(feed.versionCode, 10) || 0;
  return {
    feed,
    installed,
    available: remoteCode > installed.versionCode,
  };
}

export async function getInstallPermission() {
  const { granted } = await SolUpdater.getInstallPermission();
  return granted;
}

export async function openInstallPermissionSettings() {
  await SolUpdater.openInstallPermissionSettings();
}

/**
 * Downloads the APK, calling onProgress({progress, bytesDownloaded, bytesTotal}).
 * Resolves with {path} when the download completes.
 */
export async function downloadUpdate(feed, onProgress) {
  const url = feed.apkUrl;
  if (!url) throw new Error("Update feed has no APK URL");
  const listener = await SolUpdater.addListener("downloadProgress", (e) => {
    onProgress && onProgress(e);
  });
  try {
    return await SolUpdater.downloadUpdate({
      url,
      fileName: UPDATE_APK_FILE,
    });
  } finally {
    await listener.remove();
  }
}

/** Fires the Android package installer for the downloaded APK. */
export async function installUpdate() {
  await SolUpdater.installUpdate();
}
