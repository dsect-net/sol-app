import React, { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { UpdaterCard } from "./UpdaterCard";
import { fleet, fleetEnabled } from "../fleet";

const createElement = (type, props, key) =>
  React.createElement(type, key === undefined ? props : { ...props, key });

function SettingToggle({ on, set, label, note, icon, disabled, describedBy }) {
  return createElement("button", {
    className: "setting-row",
    role: "switch",
    "aria-checked": on,
    "aria-describedby": describedBy,
    disabled,
    onClick: (e) => set(!on, e.currentTarget),
    children: [
      createElement("span", {
        className: "setting-icon",
        "aria-hidden": "true",
        children: createElement(Icon, { name: icon, size: 18 }),
      }),
      createElement("span", {
        children: [
          createElement("b", { children: label }),
          createElement("small", { children: note }),
        ],
      }),
      createElement("span", {
        className: "toggle-hit",
        "aria-hidden": "true",
        children: createElement("i", {
          className: "switch " + (on ? "on" : ""),
          children: createElement("u", {}),
        }),
      }),
    ],
  });
}
// More > Qubit: how Qubit answers (Scott, 2026-10-01). Lives on the gateway, not in this app, so it
// is the same on every device; only a hub admin can change it.
function QubitSettings({ active }) {
  let [st, setSt] = useState(null),
    [err, setErr] = useState(""),
    [saving, setSaving] = useState(false),
    // Bumped by every change: a slower GET that started earlier must not overwrite it (review).
    gen = React.useRef(0);
  useEffect(() => {
    if (!active || !fleetEnabled()) return undefined;
    let alive = true,
      mine = gen.current;
    fleet
      .qubitSettings()
      .then((r) => alive && gen.current === mine && setSt(r))
      .catch(() => {});          // off the tailnet: no section, rather than an alert on every visit
    return () => {
      alive = false;
    };
  }, [active]);
  if (!fleetEnabled() || !st) return null;
  let change = async (key, value) => {
    let was = st[key];
    gen.current += 1;
    setSt((s) => ({ ...s, [key]: value }));
    setErr("");
    setSaving(true);
    try {
      let r = await fleet.setQubitSettings({ [key]: value });
      setSt(r);
    } catch (e) {
      setSt((s) => ({ ...s, [key]: was }));   // only the one that failed
      setErr(e.status === 403 ? "Only a hub admin can change this." : "That didn't save. Try again.");
    }
    setSaving(false);
  };
  let locked = !st.can_change || saving;
  return createElement(React.Fragment, {
    children: [
      createElement("h3", { className: "section-label", children: "Qubit" }),
      createElement("div", {
        className: "settings-card",
        children: [
          createElement(SettingToggle, {
            on: Boolean(st.front_desk),
            set: (v) => change("front_desk", v),
            label: "Front desk",
            note: "Quick replies right away; bigger asks go to Qubit's full brain",
            icon: "agent",
            disabled: locked,
            describedBy: st.can_change ? undefined : "qubit-settings-note",
          }),
          createElement(SettingToggle, {
            on: Boolean(st.cloud_agents_first),
            set: (v) => change("cloud_agents_first", v),
            label: "Use cloud agents first",
            note: "Helpers try Gemini first (free, rate-limited), then local",
            icon: "cloud",
            disabled: locked,
            describedBy: st.can_change ? undefined : "qubit-settings-note",
          }),
        ],
      }),
      !st.can_change &&
        createElement("p", { id: "qubit-settings-note", className: "settings-note", children: "Only a hub admin can change these." }),
      // The Warden checks itself: its plugin, its switch in Qubit's config and its key (2026-10-01)
      st.warden_problem &&
        createElement("p", { className: "settings-error", role: "status", children: "Warden: " + st.warden_problem }),
      err && createElement("p", { className: "settings-error", role: "alert", children: err }),
    ],
  });
}
function LibraryScreen({ active, threads, choose }) {
  return createElement("section", {
    className: "screen content-screen " + (active ? "active" : ""),
    children: [
      createElement("div", {
        className: "card-stack",
        children: threads
          .slice(0, 6)
          .map((t) =>
            createElement(
              "button",
              {
                className: "conversation-card",
                onClick: () => choose(t.id),
                children: [
                  createElement("span", {
                    className: "mini-avatar",
                    children: createElement(Icon, { name: "chat" }),
                  }),
                  createElement("span", {
                    children: [
                      createElement("b", { children: t.title }),
                      createElement("small", { children: t.preview }),
                    ],
                  }),
                  createElement("time", { children: t.time }),
                ],
              },
              t.id,
            ),
          ),
      }),
    ],
  });
}
function IdeasScreen({ active, ideas, draft, setDraft, add, inputRef }) {
  return createElement("section", {
    className: "screen content-screen " + (active ? "active" : ""),
    children: [
      createElement("form", {
        className: "idea-composer",
        onSubmit: (e) => {
          e.preventDefault();
          add();
        },
        children: [
          createElement("input", {
            ref: inputRef,
            value: draft,
            onChange: (e) => setDraft(e.target.value),
            placeholder: "A title, question, or fragment…",
            "aria-label": "New idea",
          }),
          createElement("button", {
            className: "primary-button",
            disabled: !draft.trim(),
            children: "New idea",
          }),
        ],
      }),
      ideas.length
        ? createElement("div", {
            className: "idea-list",
            children: ideas.map((item) =>
              createElement(
                "article",
                {
                  children: [
                    createElement("b", { children: item.text }),
                    createElement("small", { children: "Added this session" }),
                  ],
                },
                item.id,
              ),
            ),
          })
        : createElement("div", {
            className: "empty-state compact",
            children: [
              createElement("div", {
                className: "empty-symbol",
                children: createElement(Icon, { name: "idea", size: 34 }),
              }),
              createElement("h2", { children: "No saved ideas yet" }),
              createElement("p", {
                children:
                  "Capture one above, then bring it into a conversation when you’re ready.",
              }),
              createElement("button", {
                className: "primary-button",
                onClick: () => inputRef.current && inputRef.current.focus(),
                children: "Write an idea",
              }),
            ],
          }),
    ],
  });
}
function GoalsScreen({ active, start }) {
  return createElement("section", {
    className: "screen content-screen " + (active ? "active" : ""),
    children: [
      createElement("h3", {
        className: "section-label",
        children: "In progress",
      }),
      createElement("div", {
        className: "goal-card",
        children: [
          createElement("i", { children: "65%" }),
          createElement("span", {
            children: [
              createElement("b", { children: "Shape the first Sol prototype" }),
              createElement("small", {
                children: "Next: review the chat experience",
              }),
            ],
          }),
        ],
      }),
      createElement("div", {
        className: "goal-card",
        children: [
          createElement("i", { children: "30%" }),
          createElement("span", {
            children: [
              createElement("b", {
                children: "Build a sustainable weekly rhythm",
              }),
              createElement("small", {
                children: "Next: choose three anchor routines",
              }),
            ],
          }),
        ],
      }),
      createElement("button", {
        className: "primary-button goal-action",
        onClick: start,
        children: "Plan a next step with Qubit",
      }),
    ],
  });
}
function SettingsScreen({
  active,
  streaming,
  setStreaming,
  collapseLong,
  setCollapseLong,
  haptics,
  setHaptics,
  theme,
  setTheme,
  openConfig,
  openConnectors,
  openSkills,
  backendStatus,
}) {
  return createElement("section", {
    className: "screen content-screen " + (active ? "active" : ""),
    children: [
      createElement("div", {
        className: "plan-card",
        children: [
          createElement("div", {
            children: [
              createElement("b", { children: "Free plan" }),
              createElement("span", { children: "33% used" }),
            ],
          }),
          createElement("p", { children: "Weekly limit resets Sep 28" }),
          createElement("i", { children: createElement("u", {}) }),
        ],
      }),
      createElement("h3", { className: "section-label", children: "Chat" }),
      createElement("div", {
        className: "settings-card",
        children: [
          createElement(SettingToggle, {
            on: streaming,
            set: setStreaming,
            label: "Streaming responses",
            note: "Show replies as they arrive",
            icon: "spark",
          }),
          createElement(SettingToggle, {
            on: collapseLong,
            set: setCollapseLong,
            label: "Collapse long messages",
            note: "Fold long replies behind Read more",
            icon: "collapse",
          }),
          createElement(SettingToggle, {
            on: haptics,
            set: setHaptics,
            label: "Haptics",
            note: "Crisp feedback on supported devices",
            icon: "mic",
          }),
        ],
      }),
      createElement(QubitSettings, { active }),
      createElement("h3", {
        className: "section-label",
        children: "Appearance",
      }),
      createElement("div", {
        className: "settings-card",
        children: createElement(SettingToggle, {
          on: theme === "light",
          set: (value) => setTheme(value ? "light" : "dark"),
          label: "Light appearance",
          note: "Switch between light and dark themes",
          icon: theme === "light" ? "sun" : "moon",
        }),
      }),
      createElement("h3", {
        className: "section-label",
        children: "Integrations",
      }),
      createElement("div", {
        className: "settings-card",
        children: [
          createElement("button", {
            className: "setting-row",
            onClick: (e) => openConfig(e.currentTarget),
            children: [
              createElement("span", {
                className: "setting-icon",
                "aria-hidden": "true",
                children: createElement(Icon, { name: "spark", size: 18 }),
              }),
              createElement("span", {
                children: [
                  createElement("b", { children: "Backend / Model" }),
                  createElement("small", {
                    children: backendStatus,
                  }),
                ],
              }),
              createElement("em", { "aria-hidden": "true", children: "›" }),
            ],
          }),
          createElement("button", {
            className: "setting-row",
            onClick: (e) => openConnectors(e.currentTarget),
            children: [
              createElement("span", {
                className: "setting-icon",
                "aria-hidden": "true",
                children: createElement(Icon, { name: "plug", size: 18 }),
              }),
              createElement("span", {
                children: [
                  createElement("b", { children: "MCP connectors" }),
                  createElement("small", { children: "3 available · Prototype" }),
                ],
              }),
              createElement("em", { "aria-hidden": "true", children: "›" }),
            ],
          }),
          createElement("button", {
            className: "setting-row",
            onClick: (e) => openSkills(e.currentTarget),
            children: [
              createElement("span", {
                className: "setting-icon",
                "aria-hidden": "true",
                children: createElement(Icon, { name: "skill", size: 18 }),
              }),
              createElement("span", {
                children: [
                  createElement("b", { children: "Skills" }),
                  createElement("small", { children: "Enable tools for Qubit" }),
                ],
              }),
              createElement("em", { "aria-hidden": "true", children: "›" }),
            ],
          }),
        ],
      }),
      createElement(UpdaterCard, { key: "updater" }),
    ],
  });
}

export { LibraryScreen, IdeasScreen, GoalsScreen, SettingsScreen };
