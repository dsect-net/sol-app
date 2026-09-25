import React from "react";
import { Icon } from "./Icon";
import { UpdaterCard } from "./UpdaterCard";

const createElement = (type, props, key) =>
  React.createElement(type, key === undefined ? props : { ...props, key });

function SettingToggle({ on, set, label, note, icon }) {
  return createElement("button", {
    className: "setting-row",
    role: "switch",
    "aria-checked": on,
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
function LibraryScreen({ active, threads, choose }) {
  return createElement("section", {
    className: "screen content-screen " + (active ? "active" : ""),
    children: [
      createElement("div", {
        className: "intro",
        children: [
          createElement("h2", { children: "Recent conversations" }),
          createElement("p", {
            children: "Pick up where you left off with Sol.",
          }),
        ],
      }),
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
      createElement("div", {
        className: "intro",
        children: [
          createElement("h2", { children: "Capture a spark" }),
          createElement("p", {
            children: "Keep a thought nearby while this prototype is open.",
          }),
        ],
      }),
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
      createElement("div", {
        className: "intro",
        children: [
          createElement("h2", { children: "What you’re moving toward" }),
          createElement("p", {
            children:
              "Clear next steps, kept close to the conversations that shaped them.",
          }),
        ],
      }),
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
        children: "Plan a next step with Sol",
      }),
    ],
  });
}
function SettingsScreen({
  active,
  streaming,
  setStreaming,
  haptics,
  setHaptics,
  theme,
  setTheme,
  openConfig,
  openConnectors,
  openSkills,
  demoMode,
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
            on: haptics,
            set: setHaptics,
            label: "Haptics",
            note: "Crisp feedback on supported devices",
            icon: "mic",
          }),
        ],
      }),
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
                children: createElement(Icon, { name: "photo", size: 18 }),
              }),
              createElement("span", {
                children: [
                  createElement("b", { children: "ComfyUI" }),
                  createElement("small", {
                    children: demoMode ? "Not connected · Demo mode" : "Configured",
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
                  createElement("small", { children: "Enable tools for Sol" }),
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
