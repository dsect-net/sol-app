import { registerPlugin } from "@capacitor/core";

const SolUpdater = registerPlugin("SolUpdater", {
  web: () => import("./web.js").then((m) => new m.SolUpdaterWeb()),
});

export { SolUpdater };
