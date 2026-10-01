import { WebPlugin } from "@capacitor/core";

// In a browser the page already gets env(safe-area-inset-*) from viewport-fit=cover; nothing to do.
export class SolEdgeWeb extends WebPlugin {
  async getInsets() {
    return { top: 0, bottom: 0, left: 0, right: 0, keyboard: 0, native: false };
  }
  async setBarStyle() {}
}
