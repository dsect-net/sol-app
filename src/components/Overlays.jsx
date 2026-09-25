import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ButtonUtility, Icon } from "./Icon";
import { reduceMotion } from "../data/prototypeData";

const createElement = (type, props, key) =>
  React.createElement(type, key === undefined ? props : { ...props, key });

function Autocomplete({ picker, items, activeIndex, select }) {
  if (!picker || !items.length) return null;
  return createElement("div", {
    className: "autocomplete-panel",
    id: "composer-suggestions",
    "data-autocomplete": "true",
    role: "listbox",
    "aria-label":
      picker.type === "mention"
        ? "Mention suggestions"
        : picker.type === "demo"
          ? "Prototype demos"
          : "Slash commands",
    children: [
      createElement("div", {
        className: "autocomplete-heading",
        children:
          picker.type === "mention"
            ? "Mention someone"
            : picker.type === "demo"
              ? "Prototype demos"
              : "Commands",
      }),
      items.map((item, index) =>
        createElement(
          "button",
          {
            type: "button",
            id: "suggestion-" + index,
            className: "autocomplete-row",
            role: "option",
            "aria-selected": index === activeIndex,
            onPointerDown: (e) => e.preventDefault(),
            onClick: () => select(item),
            children: [
              picker.type === "mention"
                ? createElement("span", {
                    className: "autocomplete-avatar",
                    children: item.name
                      .split(" ")
                      .map((part) => part[0])
                      .join("")
                      .slice(0, 2),
                  })
                : createElement("span", {
                    className: "command-icon",
                    children: createElement(Icon, {
                      name: item.icon,
                      size: 18,
                    }),
                  }),
              createElement("span", {
                className: "autocomplete-copy",
                children: [
                  createElement("b", {
                    children: picker.type === "mention" ? item.name : item.name,
                  }),
                  createElement("small", {
                    children:
                      picker.type === "mention" ? item.kind : item.description,
                  }),
                ],
              }),
              createElement("kbd", { "aria-hidden": "true", children: "↵" }),
            ],
          },
          item.name,
        ),
      ),
    ],
  });
}
function Drawer({
  threads,
  search,
  setSearch,
  close,
  choose,
  newChat,
  settings,
  exportChat,
  activeId,
  draft,
}) {
  let filtered = threads.filter((t) =>
    (t.title + " " + t.preview).toLowerCase().includes(search.toLowerCase()),
  );
  return createElement("div", {
    className: "drawer-layer open",
    "data-overlay": "drawer",
    role: "dialog",
    "aria-modal": "true",
    "aria-label": "Conversations",
    children: [
      createElement("button", {
        className: "drawer-scrim",
        "aria-label": "Close conversations",
        onClick: close,
      }),
      createElement("aside", {
        className: "drawer",
        children: [
          createElement("div", {
            className: "drawer-top",
            children: [
              createElement("strong", { children: "Conversations" }),
              createElement(ButtonUtility, {
                className: "drawer-close",
                label: "Close conversations",
                icon: "x",
                size: 19,
                onClick: close,
              }),
            ],
          }),
          createElement("button", {
            className: "new-chat-button",
            onClick: newChat,
            children: [createElement(Icon, { name: "newchat" }), " New chat"],
          }),
          createElement("label", {
            className: "search",
            children: [
              createElement(Icon, { name: "search", size: 18 }),
              createElement("input", {
                value: search,
                onChange: (e) => setSearch(e.target.value),
                placeholder: "Search chats",
                "aria-label": "Search conversations",
              }),
              search &&
                createElement("button", {
                  type: "button",
                  className: "search-clear",
                  onClick: () => setSearch(""),
                  "aria-label": "Clear conversation search",
                  children: createElement(Icon, { name: "x", size: 15 }),
                }),
            ],
          }),
          createElement("div", {
            className: "thread-list",
            children: ["Today", "Previous 7 days"].map((group) =>
              createElement(
                "div",
                {
                  children: [
                    createElement("h3", { children: group }),
                    filtered
                      .filter((t) => t.group === group)
                      .map((t, rowIndex) =>
                        createElement(
                          "div",
                          {
                            className: "thread-item",
                            style: { "--row": rowIndex },
                            children: [
                              createElement("button", {
                                className: "thread-open",
                                onClick: () => choose(t.id),
                                children: [
                                  createElement("span", {
                                    children: [
                                      createElement("b", { children: t.title }),
                                      createElement("small", {
                                        children: t.preview,
                                      }),
                                      t.id === activeId &&
                                        draft.trim() &&
                                        createElement("i", {
                                          className: "draft-badge",
                                          children: "Draft",
                                        }),
                                    ],
                                  }),
                                  createElement("time", { children: t.time }),
                                ],
                              }),
                              createElement("button", {
                                className: "thread-export",
                                onClick: () => exportChat(t),
                                "aria-label":
                                  "Export " + t.title + " as Markdown",
                                title: "Export as Markdown",
                                children: createElement(Icon, {
                                  name: "download",
                                  size: 17,
                                }),
                              }),
                            ],
                          },
                          t.id,
                        ),
                      ),
                  ],
                },
                group,
              ),
            ),
          }),
          createElement("div", {
            className: "profile",
            children: [
              createElement("span", {
                className: "profile-avatar",
                children: "SG",
              }),
              createElement("span", {
                children: [
                  createElement("b", { children: "Scotty" }),
                  createElement("small", { children: "Free plan" }),
                ],
              }),
              createElement(ButtonUtility, {
                label: "Open settings",
                icon: "settings",
                tooltipSide: "top",
                onClick: settings,
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function ContextMenu({ menu, act, dismiss }) {
  let [submenu, setSubmenu] = useState(null),
    [details, setDetails] = useState(false),
    [position, setPosition] = useState(null),
    menuRef = useRef(null);
  let chooseReaction = (event, emoji) => {
    let button = event.currentTarget;
    if (reduceMotion()) {
      act("reaction", emoji);
      return;
    }
    button.classList.remove("reaction-tap");
    requestAnimationFrame(() => button.classList.add("reaction-tap"));
    setTimeout(() => act("reaction", emoji), 150);
  };
  useLayoutEffect(() => {
    let node = menuRef.current,
      shell = node && node.closest(".app-shell");
    if (!node || !shell) return;
    let shellRect = shell.getBoundingClientRect(),
      anchor = menu.anchor || {
        left: menu.x,
        top: menu.y,
        right: menu.x,
        bottom: menu.y,
      },
      width = 240,
      height = Math.min(node.scrollHeight, shellRect.height - 24),
      left =
        menu.role === "user"
          ? anchor.right - shellRect.left - width
          : anchor.left - shellRect.left;
    left = Math.max(12, Math.min(shellRect.width - width - 12, left));
    let below = anchor.bottom - shellRect.top + 8,
      above = anchor.top - shellRect.top - height - 8,
      belowSpace = shellRect.height - below - 12,
      aboveSpace = anchor.top - shellRect.top - 12,
      useBelow = belowSpace >= height || belowSpace >= aboveSpace,
      top = useBelow ? below : above;
    top = Math.max(12, Math.min(shellRect.height - height - 12, top));
    setPosition({
      left,
      top,
      originX: Math.max(
        18,
        Math.min(width - 18, menu.x - shellRect.left - left),
      ),
      originY: useBelow ? 0 : height,
      submenuLeft: left + width + 7 + 216 > shellRect.width - 8,
    });
  }, [menu.messageId, submenu, details]);
  let item = (icon, label, action, addon, extra = {}) =>
    createElement(
      "button",
      {
        type: "button",
        className: "menu-item " + (extra.className || ""),
        role: "menuitem",
        onClick: action,
        "aria-expanded": extra.expanded,
        children: [
          createElement(Icon, { name: icon, size: 18 }),
          createElement("span", { children: label }),
          addon
            ? createElement("span", {
                className: "menu-addon",
                children: addon,
              })
            : extra.chevron
              ? createElement("span", {
                  className: "menu-chevron",
                  "aria-hidden": "true",
                  children: "›",
                })
              : null,
        ],
      },
      extra.key || label,
    );
  let back = (target = null) =>
    item(
      "reply",
      "Back",
      () => {
        setDetails(false);
        setSubmenu(target);
      },
      null,
      { className: "submenu-back" },
    );
  return createElement("div", {
    className: "context-layer",
    "data-overlay": "menu",
    onPointerDown: (e) => {
      if (e.target === e.currentTarget) dismiss();
    },
    children: createElement("div", {
      ref: menuRef,
      className: "context-menu " + (position ? "positioned" : ""),
      role: "menu",
      "aria-label": "Message actions",
      style: position
        ? {
            "--menu-left": position.left + "px",
            "--menu-top": position.top + "px",
            "--menu-origin-x": position.originX + "px",
            "--menu-origin-y": position.originY + "px",
          }
        : undefined,
      children: createElement("div", {
        className: "context-scroll",
        children: [
          createElement("div", {
            className: "emoji-row",
            children: ["❤️", "👍", "😂", "😮", "😢", "🙏"].map((emoji) =>
              createElement(
                "button",
                {
                  type: "button",
                  onClick: (event) => chooseReaction(event, emoji),
                  "aria-label": "React " + emoji,
                  role: "menuitem",
                  children: emoji,
                },
                emoji,
              ),
            ),
          }),
          createElement("div", {
            className: "menu-section",
            children: [
              item("reply", "Reply", () => act("reply")),
              item("copy", "Copy", () => act("copy"), "⌘C"),
              menu.role === "assistant" &&
                item("star", menu.starred ? "Unstar" : "Star", () =>
                  act("star"),
                ),
              menu.role === "assistant" &&
                item("pin", menu.pinned ? "Unpin" : "Pin", () => act("pin")),
            ],
          }),
          createElement("div", {
            className: "menu-separator",
            role: "separator",
          }),
          createElement("div", {
            className: "menu-section",
            children: [
              item("forward", "Forward", () => act("forward")),
              item("download", "Export as Markdown", () =>
                act("export-markdown"),
              ),
            ],
          }),
          createElement("div", {
            className: "menu-separator",
            role: "separator",
          }),
          createElement("div", {
            className: "menu-section",
            children: createElement("div", {
              className: "context-item-wrap",
              onMouseEnter: () => setSubmenu("more"),
              children: [
                item(
                  "more",
                  "More",
                  () => setSubmenu(submenu === "more" ? null : "more"),
                  null,
                  { chevron: true, expanded: !!submenu },
                ),
                (submenu === "more" || submenu === "save") &&
                  createElement("div", {
                    className:
                      "context-submenu " +
                      (position && position.submenuLeft ? "flip-left" : ""),
                    role: "menu",
                    "aria-label": "More message actions",
                    children: [
                      back(),
                      item("copy", "Copy text", () => act("copy-text")),
                      item("select", "Select messages", () => act("select")),
                      item(
                        "details",
                        "Message details",
                        () => setDetails((x) => !x),
                        null,
                        { expanded: details },
                      ),
                      details &&
                        createElement("div", {
                          className: "message-details",
                          role: "status",
                          children: [
                            createElement("div", {
                              children: [
                                createElement("b", { children: "Time: " }),
                                new Date(menu.at).toLocaleString(),
                              ],
                            }),
                            createElement("div", {
                              children: [
                                createElement("b", { children: "ID: " }),
                                menu.messageId,
                              ],
                            }),
                          ],
                        }),
                      menu.isImage &&
                        createElement("div", {
                          className: "context-item-wrap",
                          onMouseEnter: () => setSubmenu("save"),
                          children: [
                            item(
                              "image",
                              "Save as",
                              () =>
                                setSubmenu(
                                  submenu === "save" ? "more" : "save",
                                ),
                              null,
                              { chevron: true, expanded: submenu === "save" },
                            ),
                            submenu === "save" &&
                              createElement("div", {
                                className:
                                  "context-submenu " +
                                  (position && position.submenuLeft
                                    ? "flip-left"
                                    : ""),
                                role: "menu",
                                "aria-label": "Save image as",
                                children: [
                                  back("more"),
                                  item("image", "PNG", () =>
                                    act("save-image", "png"),
                                  ),
                                  item("image", "JPG", () =>
                                    act("save-image", "jpg"),
                                  ),
                                  item("download", "Markdown", () =>
                                    act("save-image", "markdown"),
                                  ),
                                ],
                              }),
                          ],
                        }),
                    ],
                  }),
              ],
            }),
          }),
          createElement("div", {
            className: "menu-separator",
            role: "separator",
          }),
          createElement("div", {
            className: "menu-section",
            children: item("trash", "Delete", () => act("delete"), null, {
              className: "danger",
            }),
          }),
        ],
      }),
    }),
  });
}
function AttachSheet({ close, camera, photos, videos, files, codex }) {
  useEffect(() => {
    let dismiss = (event) => {
      if (!event.target.closest(".attachment-menu")) close();
    };
    window.addEventListener("scroll", dismiss, true);
    return () => window.removeEventListener("scroll", dismiss, true);
  }, [close]);
  let row = (icon, label, action) =>
    createElement(
      "button",
      {
        type: "button",
        onClick: action,
        children: [
          createElement("span", {
            className: "attachment-icon",
            "aria-hidden": "true",
            children: createElement(Icon, { name: icon, size: 19 }),
          }),
          createElement("span", { children: label }),
        ],
      },
      label,
    );
  return createElement("div", {
    className: "modal-layer attachment-layer",
    "data-overlay": "attach",
    onPointerDown: (e) => e.target === e.currentTarget && close(),
    children: createElement("div", {
      className: "action-sheet attachment-menu",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "Add attachment",
      children: [
        row("camera", "Camera", camera),
        row("photo", "Photos", photos),
        row("video", "Videos", videos),
        row("file", "Files", files),
        row("codex", "Upload from Codex", codex),
      ],
    }),
  });
}
function Dialog({ title, close, children, type }) {
  return createElement("div", {
    className: "modal-layer",
    "data-overlay": type,
    onPointerDown: (e) => e.target === e.currentTarget && close(),
    children: createElement("div", {
      className: "dialog",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "dialog-title",
      children: [
        createElement("div", {
          className: "dialog-head",
          children: [
            createElement("h2", { id: "dialog-title", children: title }),
            createElement(ButtonUtility, {
              label: "Close dialog",
              icon: "x",
              onClick: close,
            }),
          ],
        }),
        children,
      ],
    }),
  });
}

export { Autocomplete, Drawer, ContextMenu, AttachSheet, Dialog };
