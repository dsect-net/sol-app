// The Warden's approval cards (Scott, 2026-10-01: "can we integrate approval cards for
// permissions?"). When Qubit wants to do something sensitive - change the house, use a saved
// password, open something up on the network, post as Scott - the Warden plugin in its Hermes holds
// the action and asks here. Nothing happens until Scott answers; no answer is a no.
//
// The requests come from the Sol gateway (GET /approvals, hub admins only); the answer goes back
// to it (POST /approvals/<id>), which signs it so Qubit can't answer for itself.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { fleet, fleetEnabled } from "../fleet";
import { Icon } from "./Icon";
import { ASSISTANT } from "../data/prototypeData";

const createElement = (type, props, key) =>
  React.createElement(type, key === undefined ? props : { ...props, key });

// Which icon a request wears, from the Warden rule that raised it.
function iconFor(ruleKey) {
  let k = String(ruleKey || "").replace(/^warden:/, "");
  if (k.startsWith("ha:")) return "house";
  if (k.startsWith("browser_vault")) return "key";
  if (k.startsWith("cron:")) return "clock";
  if (k === "exposure") return "globe";
  if (k === "purchase") return "cart";
  if (k.startsWith("connections:")) return "plug";
  if (k.startsWith("discord") || k.startsWith("yb_")) return "chat";
  return "shield";
}

// Polls while `enabled` and the app is in front. 2 s: a request waits for Scott, and Qubit's turn
// waits with it.
export function useApprovals(enabled) {
  let [state, setState] = useState({ approvals: [], canDecide: false, problem: null });
  // Bumped by each polling loop: a reply from a loop that has since stopped is dropped (review).
  let gen = useRef(0);
  let load = useCallback(async (mine = gen.current) => {
    try {
      let r = await fleet.approvals();
      if (gen.current === mine)
        setState({ approvals: r.approvals || [], canDecide: Boolean(r.can_decide), problem: r.warden_problem || null });
    } catch {
      /* off the tailnet or not the gateway: no cards */
    }
  }, []);
  useEffect(() => {
    let mine = ++gen.current;
    if (!enabled || !fleetEnabled()) {
      setState((s) => (s.approvals.length ? { ...s, approvals: [] } : s));
      return undefined;
    }
    let timer;
    let tick = async () => {
      if (document.visibilityState === "visible") await load(mine);
      if (gen.current === mine) timer = setTimeout(tick, 2000);
    };
    tick();
    return () => {
      gen.current++;
      clearTimeout(timer);
    };
  }, [enabled, load]);
  let decide = async (id, choice) => {
    await fleet.decideApproval(id, choice);
    setState((s) => ({ ...s, approvals: s.approvals.filter((a) => a.id !== id) }));
    load();
  };
  return { ...state, decide, reload: load };
}

function timeLeft(expires, now) {
  let s = Math.max(0, Math.round(expires - now / 1000));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

export function ApprovalCard({ approval, decide, canDecide }) {
  let [busy, setBusy] = useState(""),
    [err, setErr] = useState(""),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    let t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  let answer = async (choice) => {
    setBusy(choice);
    setErr("");
    try {
      await decide(approval.id, choice);
    } catch (e) {
      setErr(e.status === 404 ? "This request already ended." : "That didn't go through. Try again.");
      setBusy("");
    }
  };
  let titleId = "approval-title-" + approval.id,
    expired = approval.expires && approval.expires * 1000 <= now;
  return createElement("section", {
    className: "approval-card",
    role: "group",
    "aria-labelledby": titleId,
    children: [
      createElement("div", {
        className: "approval-head",
        children: [
          createElement("span", {
            className: "approval-icon",
            "aria-hidden": "true",
            children: createElement(Icon, { name: iconFor(approval.rule_key), size: 22 }),
          }),
          createElement("h3", {
            id: titleId,
            children: `Allow ${ASSISTANT.name} to ${approval.title}?`,
          }),
        ],
      }),
      createElement("p", {
        className: "approval-note",
        children: `${ASSISTANT.name} is waiting for you and won't do this unless you allow it.`,
      }),
      approval.details &&
        createElement("pre", { className: "approval-details", tabIndex: 0, children: approval.details }),
      canDecide
        ? createElement("div", {
            className: "approval-actions",
            children: [
              createElement("button", {
                type: "button",
                className: "approval-allow",
                disabled: Boolean(busy) || expired,
                onClick: () => answer("once"),
                children: busy === "once" ? "Allowing…" : "Allow",
              }),
              createElement("button", {
                type: "button",
                className: "approval-deny",
                disabled: Boolean(busy) || expired,
                onClick: () => answer("deny"),
                children: busy === "deny" ? "Denying…" : "Deny",
              }),
            ],
          })
        : createElement("p", { className: "approval-note", children: "Only a hub admin can answer this." }),
      createElement("div", {
        className: "approval-foot",
        children: [
          // Says exactly what it would cover; not offered at all for the kinds that are asked every
          // time (network exposure, passwords, messages as Scott, Qubit's own setup) (review).
          canDecide &&
            approval.always_scope &&
            createElement("button", {
              type: "button",
              className: "approval-always",
              disabled: Boolean(busy) || expired,
              onClick: () => answer("always"),
              children: "Always allow " + approval.always_scope,
            }),
          createElement("span", {
            className: "approval-time",
            children: expired ? "Timed out: not done" : "Answer within " + timeLeft(approval.expires, now),
          }),
        ],
      }),
      err && createElement("p", { className: "approval-error", role: "alert", children: err }),
    ],
  });
}

// The cards for a conversation with Qubit, plus one polite announcement when a new one arrives.
export function ApprovalStack({ approvals, decide, canDecide }) {
  let [said, setSaid] = useState("");
  let seen = useRef(new Set()),
    box = useRef(null);
  useEffect(() => {
    let fresh = approvals.filter((a) => !seen.current.has(a.id));
    fresh.forEach((a) => seen.current.add(a.id));
    if (!fresh.length) return;
    setSaid(`${ASSISTANT.name} needs your approval: ${fresh[fresh.length - 1].title}.`);
    // A new request comes into view, buttons and all (they were below the fold).
    let reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.current?.scrollIntoView({ block: "end", behavior: reduce ? "auto" : "smooth" });
  }, [approvals]);
  return createElement("div", {
    ref: box,
    className: "approval-stack",
    children: [
      createElement("p", { className: "sr-only", "aria-live": "polite", children: said }),
      ...approvals.map((a) => createElement(ApprovalCard, { approval: a, decide, canDecide }, a.id)),
    ],
  });
}
