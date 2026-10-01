import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// Opt-in dev proxy to the Sol gateway, for working on the Agents tab on Tritium itself:
//
//   SOL_DEV_GATEWAY=http://127.0.0.1:8990 SOL_DEV_LOGIN=you@example.com npm run dev
//
// In production nginx proves who you are (tailnet identity) and passes X-Tailnet-Login; here the
// dev server stands in for it, so this only ever targets a gateway on your own loopback.
// SOL_DEV_STREAM (optional) points the desk websockets at a local stream bridge.
export default defineConfig(({ mode }) => {
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), "SOL_DEV_") };
  const gateway = env.SOL_DEV_GATEWAY;
  const proxy = {};
  if (gateway) {
    if (env.SOL_DEV_STREAM) {
      proxy["^/api/sol/desk/(view|control)$"] = {
        target: env.SOL_DEV_STREAM,
        ws: true,
        rewrite: (p) => p.replace(/^\/api\/sol\/desk/, ""),
      };
    }
    proxy["/api/sol"] = {
      target: gateway,
      rewrite: (p) => p.replace(/^\/api\/sol/, ""),
      headers: { "X-Tailnet-Login": env.SOL_DEV_LOGIN || "" },
    };
  }
  // Tell the bundle whether the proxy exists. Without it every /api/sol request falls through to
  // Vite's index.html with a 200, and the Agents tab used to take that for a fleet.
  return {
    plugins: [react()],
    server: { proxy },
    define: { "import.meta.env.VITE_SOL_DEV_PROXY": JSON.stringify(gateway ? "1" : "") },
  };
});
