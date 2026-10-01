import React, { useLayoutEffect, useRef, useState } from "react";
import {
  BookOpen, Bot, Camera, Check, ChevronLeft, ChevronRight, Copy, Download, Ellipsis, File, Flag,
  Folder, Forward, Image, Info, Lightbulb, ListChecks, Menu, MessageCircle, Mic, Monitor, Moon,
  Pause, PenLine, Pin, Play, Plug, Plus, Reply, Search, Send, Settings, Share, Sparkles, SquarePen,
  Star, Sun, Trash2, TriangleAlert, Users, Video, Wrench, X, Link,
} from "lucide-react";

const createElement = (type, props, key) =>
  React.createElement(type, key === undefined ? props : { ...props, key });

// Lucide (lucide.dev), one icon family for the whole app (Scott, 2026-10-01: "an official icon
// set"). It replaced ~45 hand-drawn paths with mismatched strokes. The `name`s are unchanged, so
// no call site moved; tree-shaking ships only the icons named here.
//
// One stroke weight, 1.5, matched to Sol's regular-weight text. Icons are currentColor and take
// state from CSS. "<name>Filled" is the active tab: the same icon filled. The tab icons are picked
// so that a fill doesn't swallow any inner line.
const ICONS = {
  menu: Menu, sun: Sun, moon: Moon,
  chat: MessageCircle, library: Folder, idea: Lightbulb, ideas: Lightbulb,
  goal: Flag, goals: Flag, agents: Users, users: Users, agent: Bot, desk: Monitor,
  chevronLeft: ChevronLeft, chevron: ChevronRight, more: Ellipsis,
  plus: Plus, send: Send, mic: Mic, search: Search, newchat: SquarePen, compose: PenLine,
  settings: Settings, x: X, reply: Reply, copy: Copy, star: Star, trash: Trash2,
  photo: Image, image: Image, camera: Camera, video: Video, file: File, codex: BookOpen,
  plug: Plug, skill: Wrench, spark: Sparkles, pin: Pin, download: Download, check: Check,
  forward: Forward, share: Share, select: ListChecks, details: Info, alert: TriangleAlert,
  play: Play, pause: Pause, link: Link,
};
// Icons whose filled form muddles (Users' overlapping figures): active = a heavier stroke instead
const NO_FILL = new Set(["agents", "users"]);

const Icon = ({ name: l, size: t = 22 }) => {
  let filled = l.endsWith("Filled"),
    base = filled ? l.slice(0, -6) : l,
    Glyph = ICONS[base] || MessageCircle,
    solid = filled && !NO_FILL.has(base);
  return createElement(Glyph, {
    size: t,
    strokeWidth: filled && !solid ? 2.25 : 1.5,
    absoluteStrokeWidth: false,
    fill: solid ? "currentColor" : "none",
    "aria-hidden": "true",
    focusable: "false",
  });
};
function useViewportTooltip(preferredSide) {
  let wrapRef = useRef(null),
    tooltipRef = useRef(null),
    [placement, setPlacement] = useState({ side: preferredSide, shift: 0 });
  let place = () => {
    requestAnimationFrame(() => {
      let wrap = wrapRef.current,
        tip = tooltipRef.current;
      if (!wrap || !tip) return;
      let anchor = wrap.getBoundingClientRect(),
        shell = wrap.closest(".app-shell"),
        shellRect = shell ? shell.getBoundingClientRect() : { left: 0, right: innerWidth },
        width = tip.offsetWidth,
        height = tip.offsetHeight,
        side = preferredSide;
      if (side === "top" && anchor.top < height + 12) side = "bottom";
      if (side === "bottom" && innerHeight - anchor.bottom < height + 12)
        side = "top";
      let rawLeft = anchor.left + anchor.width / 2 - width / 2,
        minLeft = Math.max(8, shellRect.left + 8),
        maxLeft = Math.min(innerWidth - width - 8, shellRect.right - width - 8),
        safeLeft = Math.max(minLeft, Math.min(maxLeft, rawLeft));
      setPlacement({ side, shift: Math.round(safeLeft - rawLeft) });
    });
  };
  useLayoutEffect(() => {
    let refresh = () => place();
    addEventListener("resize", refresh);
    return () => removeEventListener("resize", refresh);
  }, [preferredSide]);
  return { wrapRef, tooltipRef, placement, place };
}
function ButtonUtility({
  label,
  icon,
  onClick,
  className = "",
  color = "tertiary",
  tooltipSide = "bottom",
  disabled = false,
  type = "button",
  size = 18,
}) {
  let tooltip = useViewportTooltip(tooltipSide);
  return createElement("span", {
    ref: tooltip.wrapRef,
    className: "utility-wrap",
    onPointerEnter: tooltip.place,
    onFocusCapture: tooltip.place,
    children: [
      createElement("button", {
        type,
        className:
          "utility-button " + (color === "danger" ? "danger " : "") + className,
        onClick,
        onPointerDown: (e) => e.stopPropagation(),
        disabled,
        "aria-label": label,
        children: createElement(Icon, { name: icon, size }),
      }),
      createElement("span", {
        ref: tooltip.tooltipRef,
        className: "utility-tooltip tooltip-at-" + tooltip.placement.side,
        style: { "--tooltip-shift-x": tooltip.placement.shift + "px" },
        role: "tooltip",
        children: label,
      }),
    ],
  });
}
function ComposerActionButton({ sendMode, disabled, onRecord }) {
  let label = sendMode ? "Send message" : "Record voice message",
    tooltip = useViewportTooltip("top");
  return createElement("span", {
    ref: tooltip.wrapRef,
    className: "utility-wrap composer-action-wrap",
    onPointerEnter: tooltip.place,
    onFocusCapture: tooltip.place,
    children: [
      createElement("button", {
        type: sendMode ? "submit" : "button",
        className:
          "utility-button round-button composer-action-button " +
          (sendMode ? "is-send" : "is-mic"),
        onClick: sendMode ? undefined : onRecord,
        onPointerDown: (e) => e.stopPropagation(),
        disabled,
        "aria-label": label,
        children: createElement("span", {
          className: "composer-action-icons",
          "aria-hidden": "true",
          children: [
            createElement("span", {
              className: "composer-action-icon composer-action-mic",
              children: createElement(Icon, { name: "mic", size: 18 }),
            }),
            createElement("span", {
              className: "composer-action-icon composer-action-send",
              children: createElement(Icon, { name: "send", size: 18 }),
            }),
          ],
        }),
      }),
      createElement("span", {
        ref: tooltip.tooltipRef,
        className: "utility-tooltip tooltip-at-" + tooltip.placement.side,
        style: { "--tooltip-shift-x": tooltip.placement.shift + "px" },
        role: "tooltip",
        children: label,
      }),
    ],
  });
}

export { Icon, ButtonUtility, ComposerActionButton };
