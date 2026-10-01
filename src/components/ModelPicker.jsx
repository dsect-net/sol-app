// Choosing which local model Sol talks to, per conversation (TRI-017: "local brains in the
// picker", with lane and aligned/open).
//
// The list comes from the Sol gateway's GET /models, which knows every llama-server on Tritium,
// which GPU it runs on, and whether it is up right now. Only the gateway can offer a real
// choice: talking straight to one llama-server, there is exactly one model behind the URL.
import React, { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { Dialog } from "./Overlays";

const createElement = (type, props, key) =>
  React.createElement(type, key === undefined ? props : { ...props, key });

// Plain words for each lane. The device is a fact from the gateway, so it is shown as is.
const LANE = {
  fast: "Fast",
  balanced: "Balanced",
  deep: "Deep",
  cpu: "Backup",
};

export function laneLabel(m) {
  if (!m) return "";
  return [LANE[m.lane] || m.lane, m.device].filter(Boolean).join(" · ");
}

// GET {gatewayBase}/models -> [{id, label, lane, device, alignment, context, note, shared, up}]
export function useLocalModels(gatewayBase, open, nonce = 0) {
  let [state, setState] = useState({ phase: "idle", models: [] });
  useEffect(() => {
    if (!gatewayBase || !open) return undefined;
    let alive = true;
    setState((s) => ({ ...s, phase: "loading" }));
    fetch(gatewayBase + "/models", { cache: "no-store" })
      .then(async (r) => {
        let data = null;
        try {
          data = await r.json();
        } catch {
          /* not the gateway */
        }
        if (!r.ok || !data || !Array.isArray(data.models)) {
          throw new Error(r.ok ? "Something answered, but it isn't the Sol gateway." : `The gateway said ${r.status}.`);
        }
        if (alive) setState({ phase: "done", models: data.models });
      })
      .catch((e) => alive && setState({ phase: "error", models: [], error: e.message || String(e) }));
    return () => {
      alive = false;
    };
  }, [gatewayBase, open, nonce]);
  return state;
}

export function ModelSheet({ gatewayBase, current, choose, close }) {
  let { phase, models, error } = useLocalModels(gatewayBase, true);
  // Once the list is in, put focus on the chosen model (the dialog's own first focus lands on
  // Close, where the arrow keys do nothing).
  let listRef = React.useRef(null);
  useEffect(() => {
    if (phase !== "done" || !listRef.current) return undefined;
    // After the overlay's own first-focus (a requestAnimationFrame): if /models answers first,
    // that would otherwise move focus back to Close (review).
    let raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        let el = listRef.current && listRef.current.querySelector('[role="radio"][tabindex="0"]');
        if (el) el.focus();
      }),
    );
    return () => cancelAnimationFrame(raf);
  }, [phase]);
  // A radio group is one Tab stop; the arrow keys move between the models that are up.
  let selectable = models.filter((m) => m.up),
    focusId = (selectable.find((m) => m.id === current) || selectable[0] || {}).id;
  let onKeyDown = (e) => {
    let keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    if (!(e.key in keys) || !selectable.length) return;
    e.preventDefault();
    let radios = [...e.currentTarget.querySelectorAll('[role="radio"]:not(:disabled)')],
      at = radios.indexOf(document.activeElement),
      next = at < 0 ? radios[0] : radios[(at + keys[e.key] + radios.length) % radios.length];
    if (next) next.focus();
  };

  let body;
  if (phase === "error") {
    body = createElement("p", { className: "dialog-note", role: "alert", children: "Couldn't load the models: " + error });
  } else if (phase !== "done") {
    body = createElement("p", { className: "dialog-note", children: "Checking which models are up…" });
  } else {
    body = createElement("div", {
      className: "model-list",
      ref: listRef,
      role: "radiogroup",
      "aria-label": "Local models",
      onKeyDown,
      children: models.map((m) =>
        createElement(
          "button",
          {
            type: "button",
            role: "radio",
            "aria-checked": m.id === current,
            tabIndex: m.id === focusId ? 0 : -1,
            disabled: !m.up,
            className: "model-row" + (m.id === current ? " is-current" : ""),
            onClick: () => {
              choose(m.id);
              close();
            },
            children: [
              createElement("span", {
                className: "model-row-main",
                children: [
                  createElement("b", { children: m.label || m.id }),
                  createElement("span", {
                    className: "model-row-lane",
                    children: laneLabel(m) + (m.alignment === "open" ? " · Open" : ""),
                  }),
                  m.note && createElement("span", { className: "model-row-note", children: m.note }),
                  m.shared &&
                    createElement("span", {
                      className: "model-row-warn",
                      children: [
                        createElement(Icon, { name: "alert", size: 14 }),
                        " ",
                        m.shared,
                      ],
                    }),
                ],
              }),
              createElement("span", {
                className: "model-row-state",
                // State is a word and a mark, never colour alone
                children: !m.up
                  ? m.status === "loading"
                    ? "Loading"
                    : "Offline"
                  : m.id === current
                    ? createElement(Icon, { name: "check", size: 18 })
                    : null,
              }),
            ],
          },
          m.id,
        ),
      ),
    });
  }

  return createElement(Dialog, {
    title: "Model for this chat",
    close,
    type: "model",
    children: [
      createElement("p", {
        className: "dialog-note",
        children: "All of these run on Tritium. Nothing leaves the house.",
      }, "note"),
      createElement(React.Fragment, { children: body }, "body"),
    ],
  });
}
