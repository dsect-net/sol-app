// Sol's connection to the fleet: the agents, the shared desktop they work on, and DMs with them.
//
// Everything goes to the Sol gateway on Tritium (quantum-os/desk/sol_gateway.py) at /api/sol,
// behind team.dsect.net's tailnet identity gate. There is no login and no key in this bundle:
// the tailnet says who you are, and the gateway decides what you may do. Off the tailnet the
// calls fail, and the Agents tab says so instead of pretending.

const TEAM = "https://team.dsect.net";

function isNative() {
  return Boolean(window.Capacitor?.isNativePlatform?.());
}

// Where the gateway lives, seen from wherever this bundle is running.
export function solApiBase() {
  const override = import.meta.env.VITE_SOL_API;
  if (override) return override.replace(/\/$/, "");
  if (window.location.origin === TEAM) return "/api/sol"; // served by team.dsect.net itself
  if (isNative()) return TEAM + "/api/sol"; // the APK: https://localhost -> the tailnet host
  if (import.meta.env.DEV && import.meta.env.VITE_SOL_DEV_PROXY) return "/api/sol"; // opt-in vite proxy
  return "";
}

export const fleetEnabled = () => Boolean(solApiBase());

async function call(path, { method = "GET", body } = {}) {
  const base = solApiBase();
  if (!base) throw new Error("Sol isn't connected to the fleet in this build.");
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      // Every state change carries this. A page on another site can only send it after a
      // CORS preflight, and the gateway only lets Sol's own origins through.
      ...(method !== "GET" ? { "X-Sol-Request": "1" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  let data = {};
  let parsed = false;
  try {
    data = await res.json();
    parsed = data !== null && typeof data === "object";
  } catch {
    /* screenshot or empty body */
  }
  // A 200 that isn't JSON is not the gateway: a dev server or a misrouted proxy answering with
  // an HTML page. Taking it for an empty fleet crashed the whole app (Agents.jsx read
  // data.agents.map of undefined, and nothing caught it).
  if (res.ok && !parsed) {
    const err = new Error("Something answered at the fleet address, but it isn't the Sol gateway.");
    err.status = res.status;
    err.code = "not_gateway";
    throw err;
  }
  if (!parsed) data = {};
  if (!res.ok) {
    const err = new Error(data.detail || `The fleet didn't answer (${res.status}). Sol keeps retrying.`);
    err.status = res.status;
    err.code = data.error;
    throw err;
  }
  return data;
}

export const fleet = {
  me: () => call("/me"),
  agents: () => call("/agents"),
  desk: () => call("/desk"),
  takeover: () => call("/desk/takeover", { method: "POST", body: {} }),
  handback: (note) => call("/desk/handback", { method: "POST", body: { note: note || "" } }),
  dismiss: () => call("/desk/dismiss", { method: "POST", body: {} }),
  dm: (agentId, since = 0) => call(`/dm/${agentId}?since=${since}`),
  sendDm: (agentId, text) => call(`/dm/${agentId}`, { method: "POST", body: { text } }),
  // How Qubit works: {front_desk, cloud_agents_first, can_change}. Changing it is admin-only.
  qubitSettings: () => call("/qubit/settings"),
  setQubitSettings: (changes) => call("/qubit/settings", { method: "POST", body: changes }),
  // The Warden's approval requests (hub admins see them) and the answer: once | always | deny.
  approvals: () => call("/approvals"),
  decideApproval: (id, choice) => call(`/approvals/${id}`, { method: "POST", body: { choice } }),
  screenshotUrl: () => `${solApiBase()}/desk/screenshot.png?t=${Date.now()}`,
  // The live desktop. `view` can only watch (the server drops input); `control` is Scott's.
  streamUrl: (mode) => {
    const base = solApiBase();
    const abs = base.startsWith("http") ? base : window.location.origin + base;
    return abs.replace(/^http/, "ws") + `/desk/${mode === "control" ? "control" : "view"}`;
  },
};

// "4m ago" for relative times; the relay and the workstation both report seconds.
export function ago(seconds) {
  if (seconds == null) return "";
  if (seconds < 45) return "just now";
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
