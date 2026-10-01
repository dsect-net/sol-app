import { registerPlugin } from "@capacitor/core";

const SolEdge = registerPlugin("SolEdge", {
  web: () => import("./web.js").then((m) => new m.SolEdgeWeb()),
});

export { SolEdge };
