import { WebPlugin } from "@capacitor/core";

export class SolUpdaterWeb extends WebPlugin {
  async downloadUpdate() {
    throw new Error("SolUpdater is only available in the native Android app.");
  }
  async installUpdate() {
    throw new Error("SolUpdater is only available in the native Android app.");
  }
  async getInstallPermission() {
    return { granted: false };
  }
  async openInstallPermissionSettings() {
    throw new Error("SolUpdater is only available in the native Android app.");
  }
}
