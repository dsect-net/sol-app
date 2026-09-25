import React, { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import {
  checkForUpdate,
  downloadUpdate,
  getInstalledBuild,
  getInstallPermission,
  installUpdate,
  isNativeApp,
  openInstallPermissionSettings,
} from "../updater";

const createElement = (type, props, key) =>
  React.createElement(type, key === undefined ? props : { ...props, key });

// Update states: idle | checking | uptodate | available | downloading |
// ready | needpermission | installing | error
function UpdaterCard() {
  const [native, setNative] = useState(null);
  const [status, setStatus] = useState("idle");
  const [installed, setInstalled] = useState(null);
  const [remote, setRemote] = useState(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const busy = useRef(false);

  useEffect(() => {
    const isNative = isNativeApp();
    setNative(isNative);
    if (!isNative) return;
    getInstalledBuild()
      .then(setInstalled)
      .catch(() => {});
  }, []);

  if (native !== true) return null;

  const run = async (fn) => {
    if (busy.current) return;
    busy.current = true;
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e && e.message ? e.message : "Something went wrong");
      setStatus("error");
    } finally {
      busy.current = false;
    }
  };

  const onCheck = () =>
    run(async () => {
      setStatus("checking");
      const result = await checkForUpdate();
      setInstalled(result.installed);
      setRemote(result.feed);
      setStatus(result.available ? "available" : "uptodate");
    });

  const onDownload = () =>
    run(async () => {
      setStatus("downloading");
      setProgress(0);
      await downloadUpdate(remote, (e) => {
        setProgress(Math.max(0, Math.min(100, e.progress || 0)));
      });
      setStatus("ready");
    });

  const onInstall = () =>
    run(async () => {
      const granted = await getInstallPermission();
      if (!granted) {
        setStatus("needpermission");
        return;
      }
      setStatus("installing");
      await installUpdate();
      // The package installer takes over from here; if the user backs out,
      // they land back on the ready state.
      setStatus("ready");
    });

  const onAllowInstalls = () =>
    run(async () => {
      await openInstallPermissionSettings();
    });

  const versionLine =
    installed != null
      ? `Installed build ${installed.versionCode}${
          installed.versionName ? ` · ${installed.versionName}` : ""
        }`
      : "Checking installed build…";

  let body;
  if (status === "checking") {
    body = statusRow("Updates", "Checking for updates…", "spark");
  } else if (status === "uptodate") {
    body = statusRow("Up to date", versionLine, "check");
  } else if (status === "available") {
    body = [
      statusRow(
        `Update available · build ${remote.versionCode}`,
        remote.versionName || "A new experimental build is ready",
        "download"
      ),
      actionButton("Download update", onDownload),
    ];
  } else if (status === "downloading") {
    body = [
      statusRow(
        `Downloading… ${progress}%`,
        `Build ${remote.versionCode} · ${remote.versionName || ""}`.trim(),
        "download"
      ),
      createElement("div", {
        className: "updater-progress",
        key: "progress",
        role: "progressbar",
        "aria-valuenow": progress,
        "aria-valuemin": 0,
        "aria-valuemax": 100,
        children: createElement("u", { style: { width: progress + "%" } }),
      }),
    ];
  } else if (status === "ready") {
    body = [
      statusRow(
        "Ready to install",
        `Build ${remote.versionCode} downloaded`,
        "check"
      ),
      actionButton("Install update", onInstall),
    ];
  } else if (status === "needpermission") {
    body = [
      statusRow(
        "Permission needed",
        "Android asks once per app: allow Sol to install updates",
        "settings"
      ),
      actionButton("Allow installs", onAllowInstalls),
      actionButton("Install update", onInstall, true),
    ];
  } else if (status === "installing") {
    body = statusRow("Opening installer…", "Confirm the install to finish", "spark");
  } else if (status === "error") {
    body = [
      statusRow("Couldn't check for updates", error, "x"),
      actionButton("Try again", onCheck, true),
    ];
  } else {
    body = [
      statusRow("App updates", versionLine, "download"),
      actionButton("Check for updates", onCheck),
    ];
  }

  return [
    createElement("h3", {
      className: "section-label",
      key: "label",
      children: "App updates",
    }),
    createElement("div", {
      className: "settings-card updater-card",
      key: "card",
      children: body,
    }),
  ];
}

function statusRow(title, note, icon) {
  return createElement("div", {
    className: "setting-row updater-status",
    key: "status",
    children: [
      createElement("span", {
        className: "setting-icon",
        "aria-hidden": "true",
        children: createElement(Icon, { name: icon, size: 18 }),
      }),
      createElement("span", {
        children: [
          createElement("b", { children: title }),
          createElement("small", { children: note }),
        ],
      }),
    ],
  });
}

function actionButton(label, onClick, secondary) {
  return createElement(
    "button",
    {
      className: secondary ? "updater-button secondary" : "updater-button",
      onClick,
      key: label,
    },
    label
  );
}

export { UpdaterCard };
