import React, { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { ago, fleet, fleetEnabled } from "../fleet";

// Same call shape as the rest of Sol, but a `children` array is passed as arguments, so React
// treats it as fixed positions rather than a list: static children need no keys (mapped lists
// still carry theirs).
const createElement = (type, props, key) => {
  let { children, ...rest } = props || {},
    p = key === undefined ? rest : { ...rest, key };
  return Array.isArray(children)
    ? React.createElement(type, p, ...children)
    : React.createElement(type, p, children);
};

const STATE_LABEL = {
  working: "Working",
  blocked: "Needs you",
  idle: "Idle",
};

// Poll the gateway: every 3 s while the Agents tab or an agent is open, every 15 s otherwise so
// a handoff still reaches the banner, and not at all while the app is in the background.
export function useFleet(focused) {
  let [data, setData] = useState(null),
    [me, setMe] = useState(null),
    [error, setError] = useState(null),
    enabled = fleetEnabled();

  let refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      setData(await fleet.agents());
      setError(null);
    } catch (e) {
      setError(e);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    fleet.me().then(setMe, setError);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let timer,
      alive = true;
    let tick = async () => {
      if (!document.hidden) await refresh();
      if (alive) timer = setTimeout(tick, focused ? 3000 : 15000);
    };
    tick();
    let wake = () => !document.hidden && refresh();
    document.addEventListener("visibilitychange", wake);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [enabled, focused, refresh]);

  return { enabled, data, me, error, refresh };
}

function StateDot({ state }) {
  return createElement("span", {
    className: "agent-state state-" + state,
    children: [
      createElement("i", { "aria-hidden": "true" }),
      STATE_LABEL[state] || state,
    ],
  });
}

function AgentAvatar({ agent, size = "md" }) {
  return createElement("span", {
    className: "agent-avatar avatar-" + size + " avatar-" + agent.id,
    "aria-hidden": "true",
    children: agent.name.slice(0, 1),
  });
}

const ACTION_LABEL = {
  exec: "Ran a command",
  launch: "Opened an app",
  click: "Using the desk",
  type: "Typing at the desk",
  key: "Using the desk",
  claim: "Took the desk",
  release: "Left the desk",
  handoff: "Asked for you",
};

function activityLine(a) {
  if (a.handoff) return a.handoff.reason;
  if (a.status?.text) return a.status.text;
  if (a.last_action) {
    let what = ACTION_LABEL[a.last_action.action] || a.last_action.action;
    return a.last_action_age_s != null ? `${what} · ${ago(a.last_action_age_s)}` : what;
  }
  if (a.relay_seen_age_s != null) return `On the relay ${ago(a.relay_seen_age_s)}`;
  return "No activity on the desk yet";
}

// Who has the shared desk right now, in a sentence.
function deskLine(desk, agents) {
  if (!desk) return "The desk isn't answering. Sol keeps retrying.";
  let name = (id) => agents.find((a) => a.workspace === id)?.name || id;
  if (desk.holder_kind === "human") return "You have the desk.";
  if (desk.holder) return `${name(desk.holder)} is using the desk.`;
  return "The desk is free. Agents work headless until they need it.";
}

export function HandoffBanner({ data, open }) {
  let h = data?.desk?.handoff;
  if (!h || h.status === "scott_has_desk") return null;
  let agent = data.agents.find((a) => a.workspace === h.bot);
  if (!agent) return null;
  return createElement("button", {
    className: "handoff-banner",
    onClick: () => open(agent.id),
    children: [
      createElement(AgentAvatar, { agent, size: "sm" }),
      createElement("span", {
        children: [
          createElement("b", { children: `${agent.name} needs you at the desk` }),
          createElement("small", { children: h.reason }),
        ],
      }),
      createElement("em", { children: "Open" }),
    ],
  });
}

export function AgentsScreen({ active, fleetState, open }) {
  let { enabled, data, error, me } = fleetState;
  let body;
  if (!enabled) {
    body = createElement("div", {
      className: "empty-state compact",
      children: [
        createElement("h2", { children: "Fleet not connected" }),
        createElement("p", {
          children: "This build of Sol isn't pointed at the fleet. Open Sol from team.dsect.net or the Android app.",
        }),
      ],
    });
  } else if (!data && error) {
    body = createElement("div", {
      className: "empty-state compact",
      children: [
        createElement("h2", { children: "Can't reach the fleet" }),
        createElement("p", {
          children:
            error.status === 401
              ? "Sol couldn't tell who you are. Connect to the tailnet and try again."
              : `${error.message}. Sol keeps retrying.`,
        }),
      ],
    });
  } else if (!data) {
    body = createElement("p", { className: "agents-loading", children: "Connecting to the fleet…" });
  } else {
    body = [
      error &&
        createElement(
          "p",
          {
            className: "desk-note",
            role: "status",
            children: "Couldn't refresh. Showing the last known state; Sol keeps retrying.",
          },
          "stale",
        ),
      createElement(
        "div",
        {
          className: "desk-card",
          children: [
            createElement("span", {
              className: "desk-card-icon",
              "aria-hidden": "true",
              children: createElement(Icon, { name: "desk", size: 20 }),
            }),
            createElement("span", {
              children: [
                createElement("b", { children: "Shared desk" }),
                createElement("small", { children: deskLine(data.desk, data.agents) }),
              ],
            }),
          ],
        },
        "desk",
      ),
      createElement(
        "div",
        {
          className: "card-stack agent-list",
          children: (Array.isArray(data.agents) ? data.agents : []).map((a) =>
            createElement(
              "button",
              {
                className: "agent-row" + (a.state === "blocked" ? " is-blocked" : ""),
                onClick: () => open(a.id),
                "aria-label": `${a.name}, ${STATE_LABEL[a.state] || a.state}${a.unread ? `, ${a.unread} unread` : ""}. ${activityLine(a)}`,
                children: [
                  createElement(AgentAvatar, { agent: a }),
                  createElement("span", {
                    className: "agent-row-text",
                    children: [
                      createElement("span", {
                        className: "agent-row-top",
                        children: [
                          createElement("b", { children: a.name }),
                          createElement(StateDot, { state: a.state }),
                        ],
                      }),
                      createElement("small", { children: activityLine(a) }),
                    ],
                  }),
                  a.unread
                    ? createElement("span", {
                        className: "agent-unread",
                        "aria-label": `${a.unread} unread`,
                        children: a.unread > 99 ? "99+" : a.unread,
                      })
                    : createElement("span", { "aria-hidden": "true" }),
                ],
              },
              a.id,
            ),
          ),
        },
        "list",
      ),
    ];
  }
  return createElement("section", {
    className: "screen content-screen agents-screen " + (active ? "active" : ""),
    "aria-label": "Agents",
    children: [
      body,
    ],
  });
}

// The live desktop. Connected only while this is mounted, so the workstation encodes nothing
// when nobody is watching. `view` is enforced server-side: x11vnc drops input on that socket.
function DeskViewer({ mode }) {
  let host = useRef(null),
    [phase, setPhase] = useState("connecting"),
    [still, setStill] = useState(() => fleet.screenshotUrl());

  useEffect(() => {
    let rfb,
      closed = false;
    setPhase("connecting");
    // noVNC is loaded on demand: it is most of the weight of this feature, and Sol should not
    // pay for it at startup.
    import("@novnc/novnc")
      .then(({ default: RFB }) => {
        if (closed) return;
        rfb = new RFB(host.current, fleet.streamUrl(mode), { shared: true });
        rfb.viewOnly = mode !== "control";
        rfb.scaleViewport = true;
        rfb.resizeSession = false;
        rfb.focusOnClick = mode === "control";
        rfb.addEventListener("connect", () => !closed && setPhase("live"));
        rfb.addEventListener("disconnect", () => !closed && setPhase("offline"));
      })
      .catch(() => !closed && setPhase("offline"));
    return () => {
      closed = true;
      try {
        rfb?.disconnect();
      } catch {
        /* already gone */
      }
    };
  }, [mode]);

  // Until the stream is up (or if it can't come up), show a still frame, refreshed every 5 s.
  useEffect(() => {
    if (phase === "live") return;
    let t = setInterval(() => setStill(fleet.screenshotUrl()), 5000);
    return () => clearInterval(t);
  }, [phase]);

  return createElement("div", {
    className: "desk-viewer mode-" + mode + " phase-" + phase,
    children: [
      createElement("div", { ref: host, className: "desk-canvas" }),
      phase !== "live" &&
        createElement("img", {
          className: "desk-still",
          src: still,
          alt: "Latest still of the desk",
        }),
      createElement("span", {
        className: "desk-badge",
        role: "status",
        children:
          phase === "live"
            ? mode === "control"
              ? "Live · you're in control"
              : "Live · view only"
            : phase === "connecting"
              ? "Connecting…"
              : "Still frame · live view unavailable",
      }),
    ],
  });
}

function DmThread({ agent, me }) {
  let [messages, setMessages] = useState([]),
    [draft, setDraft] = useState(""),
    [sending, setSending] = useState(false),
    [error, setError] = useState(""),
    [loaded, setLoaded] = useState(false),
    // The gateway's answer state for this DM: {pending, seconds, error}. Agents with
    // instant_replies are answered by the REAL agent through its Hermes API (sol_gateway.py);
    // the others are never imitated, and the thread says when they will see it.
    [answer, setAnswer] = useState(null),
    [instant, setInstant] = useState(Boolean(agent.instant_replies)),
    lastId = useRef(0),
    list = useRef(null),
    // poll() reschedules the next check now: after a send, the faster polling starts at once
    // instead of up to 3 s later (review).
    poll = useRef(() => {});

  // A poll in flight and a send can both bring back the same message; keep one (review).
  let append = (incoming) =>
    setMessages((m) => {
      let seen = new Set(m.map((x) => x.id));
      return [...m, ...incoming.filter((x) => !seen.has(x.id))];
    });

  useEffect(() => {
    let alive = true,
      timer,
      pending = false;
    lastId.current = 0;
    setAnswer(null);
    setMessages([]);
    setLoaded(false);
    let tick = async () => {
      try {
        let r = await fleet.dm(agent.id, lastId.current);
        if (!alive) return;
        if (r.messages.length) {
          lastId.current = Math.max(lastId.current, r.messages[r.messages.length - 1].id);
          append(r.messages);
        }
        setAnswer(r.answer || null);
        if (typeof r.instant_replies === "boolean") setInstant(r.instant_replies);
        setError("");
        setLoaded(true);
        pending = Boolean(r.answer && r.answer.pending);
      } catch {
        if (alive) setError("Messages didn't load. Sol retries every few seconds.");
      }
      // Faster while the agent is working on a reply, so it shows up when it lands
      if (alive) timer = setTimeout(tick, pending ? 1500 : 3000);
    };
    poll.current = () => {
      pending = true;
      clearTimeout(timer);
      if (alive) timer = setTimeout(tick, 1500);
    };
    tick();
    return () => {
      alive = false;
      clearTimeout(timer);
      poll.current = () => {};
    };
  }, [agent.id]);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages.length]);

  let send = async (e) => {
    e.preventDefault();
    let text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    try {
      let r = await fleet.sendDm(agent.id, text);
      setDraft("");
      if (r.answer) setAnswer(r.answer);
      if (r.message) append([r.message]);
      if (r.answer && r.answer.pending) poll.current();
    } catch {
      setError("Couldn't send. Your message is still here; try again.");
    }
    setSending(false);
  };

  return createElement("div", {
    className: "dm-thread",
    children: [
      createElement("div", {
        ref: list,
        className: "dm-list",
        // Announce new messages, not the whole history when the thread opens.
        "aria-live": loaded ? "polite" : "off",
        children: messages.length
          ? messages.map((m) =>
              createElement(
                "div",
                {
                  className: "dm-msg " + (m.author === me?.handle ? "mine" : "theirs"),
                  children: [
                    createElement("small", { children: m.author_display || m.author }),
                    createElement("p", { children: m.content }),
                  ],
                },
                m.id,
              ),
            )
          : createElement("p", {
              className: "dm-empty",
              children: instant
                ? `No messages with ${agent.name} yet. ${agent.name} answers here, usually within a minute.`
                : `No messages with ${agent.name} yet. ${agent.name} reads DMs when they next check in; replies land here.`,
            }),
      }),
      answer && answer.pending &&
        createElement("p", {
          className: "dm-thinking",
          role: "status",
          children: [
            createElement("span", { className: "dm-dots", "aria-hidden": "true", children: [createElement("i", {}, 1), createElement("i", {}, 2), createElement("i", {}, 3)] }),
            `${agent.name} is thinking`,
            // A real agent turn can take a minute or more; say so rather than look frozen. Shown,
            // not announced: a live region would re-read it on every poll (review).
            answer.seconds >= 20 && createElement("span", { "aria-hidden": "true", children: ` · ${answer.seconds}s` }),
          ],
        }),
      answer && !answer.pending && answer.error &&
        createElement("p", { className: "dm-error", role: "alert", children: answer.error }),
      error && createElement("p", { className: "dm-error", role: "alert", children: error }),
      createElement("form", {
        className: "dm-composer",
        onSubmit: send,
        children: [
          createElement("input", {
            value: draft,
            onChange: (e) => setDraft(e.target.value),
            placeholder: instant ? `Message ${agent.name}` : `Message ${agent.name} (replies when they check in)`,
            "aria-label": `Message ${agent.name}`,
            maxLength: 2000,
          }),
          createElement("button", {
            type: "submit",
            className: "primary-button",
            disabled: !draft.trim() || sending,
            children: sending ? "Sending…" : "Send",
          }),
        ],
      }),
    ],
  });
}

export function AgentSheet({ agentId, fleetState, close }) {
  let { data, me, refresh } = fleetState,
    agent = data?.agents.find((a) => a.id === agentId),
    desk = data?.desk,
    [busy, setBusy] = useState(false),
    [note, setNote] = useState(""),
    [err, setErr] = useState(""),
    closeRef = useRef(null);

  // Focus moves in once per agent, and back to whatever opened the sheet when it closes. It must
  // not re-run on every poll: that yanked focus out of the DM box mid-sentence.
  useEffect(() => {
    let opener = document.activeElement;
    closeRef.current?.focus();
    return () => opener?.focus?.();
  }, [agentId]);
  useEffect(() => {
    let onKey = (e) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  if (!agent) return null;
  let scottHasDesk = desk?.holder_kind === "human",
    handoff = desk?.handoff?.bot === agent.workspace ? desk.handoff : null,
    canControl = Boolean(me?.can_take_over);

  let act = async (fn, failed) => {
    setBusy(true);
    setErr("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      // A refusal from the gateway already says why (e.g. admin only); anything else is ours.
      setErr(e.status === 403 || e.status === 409 ? e.message : failed);
    }
    setBusy(false);
  };

  let deskActions;
  if (!canControl) {
    deskActions = createElement("p", {
      className: "desk-note",
      children: "You can watch. Only a hub admin can take over the desk.",
    });
  } else if (scottHasDesk) {
    deskActions = createElement("div", {
      className: "desk-actions",
      children: [
        createElement("input", {
          value: note,
          onChange: (e) => setNote(e.target.value),
          placeholder: handoff ? `Note for ${agent.name} (optional)` : "Note (optional)",
          "aria-label": "Note to leave when you hand the desk back",
          maxLength: 500,
        }),
        createElement("button", {
          className: "primary-button",
          disabled: busy,
          onClick: () =>
            act(
              () => fleet.handback(note).then(() => setNote("")),
              "Couldn't hand the desk back. Try again.",
            ),
          children: handoff ? `Hand back to ${agent.name}` : "Hand back",
        }),
      ],
    });
  } else {
    deskActions = createElement("div", {
      className: "desk-actions",
      children: [
        createElement("button", {
          className: "primary-button",
          disabled: busy,
          onClick: () => act(fleet.takeover, "Couldn't take over the desk. Try again."),
          children: "Take over",
        }),
        handoff &&
          createElement("button", {
            className: "secondary-link",
            disabled: busy,
            onClick: () => act(fleet.dismiss, "Couldn't dismiss the request. Try again."),
            children: "Dismiss request",
          }),
      ],
    });
  }

  return createElement("div", {
    className: "agent-sheet",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": `${agent.name}`,
    children: [
      createElement("header", {
        className: "agent-sheet-head",
        children: [
          createElement("button", {
            ref: closeRef,
            className: "sheet-back",
            onClick: close,
            "aria-label": "Close",
            children: createElement(Icon, { name: "chevronLeft", size: 22 }),
          }),
          createElement(AgentAvatar, { agent }),
          createElement("span", {
            className: "agent-sheet-title",
            children: [
              createElement("b", { children: agent.name }),
              createElement("small", { children: agent.role }),
            ],
          }),
          createElement(StateDot, { state: agent.state }),
        ],
      }),
      createElement("div", {
        className: "agent-sheet-body",
        children: [
          handoff &&
            createElement("div", {
              className: "handoff-callout",
              role: "alert",
              children: [
                createElement("b", {
                  children: scottHasDesk ? "You're helping with:" : `${agent.name} needs you:`,
                }),
                createElement("p", { children: handoff.reason }),
              ],
            }),
          !handoff && createElement("p", { className: "agent-activity", children: activityLine(agent) }),
          createElement(DeskViewer, { mode: scottHasDesk && canControl ? "control" : "view" }),
          deskActions,
          err && createElement("p", { className: "dm-error", role: "alert", children: err }),
          createElement("h3", { className: "sheet-section", children: "Messages" }),
          // Keyed by agent: a reply still in flight for one agent must not land in another's thread (review).
          createElement(DmThread, { agent, me }, agent.id),
        ],
      }),
    ],
  });
}
