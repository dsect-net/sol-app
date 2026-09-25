import React, { useLayoutEffect, useRef, useState } from "react";

const createElement = (type, props, key) =>
  React.createElement(type, key === undefined ? props : { ...props, key });

const Icon = ({ name: l, size: t = 22 }) => {
  let a = {
    menu: "M3 12h12M3 6h18M3 18h18",
    sun: "M12 2v2m0 16v2M4 12H2m4.314-5.686L4.9 4.9m12.786 1.414L19.1 4.9M6.314 17.69 4.9 19.104m12.786-1.414 1.414 1.414M22 12h-2m-3 0a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z",
    moon: "M22 15.844a10.424 10.424 0 0 1-4.306.925c-5.779 0-10.463-4.684-10.463-10.462 0-1.536.33-2.994.925-4.307A10.464 10.464 0 0 0 2 11.538C2 17.316 6.684 22 12.462 22c4.243 0 7.896-2.526 9.538-6.156Z",
    chat: "M4 4.5h16a2 2 0 0 1 2 2V16a2 2 0 0 1-2 2H9l-5 3v-4.2A2 2 0 0 1 2 15V6.5a2 2 0 0 1 2-2Z",
    library:
      "M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2V4ZM8 2h11a2 2 0 0 1 2 2v13M8 8h7M8 12h7",
    idea: "M8.2 14.6A7 7 0 1 1 15.8 14.6c-.8.6-1.3 1.4-1.4 2.4H9.6c-.1-1-.6-1.8-1.4-2.4ZM9 21h6M10 17h4",
    goal: "M3 3h18v18H3zM7.5 12l3 3 6-7",
    more: "M6 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm12 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM6 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm12 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z",
    plus: "M12 5v14m-7-7h14",
    send: "M10.5 13.5 21 3M10.627 13.828l2.628 6.758c.232.596.347.893.514.98a.5.5 0 0 0 .462 0c.167-.086.283-.384.515-.979l6.59-16.888c.21-.537.315-.806.258-.977a.5.5 0 0 0-.316-.316c-.172-.057-.44.048-.978.257L3.413 9.253c-.595.233-.893.349-.98.516a.5.5 0 0 0 0 .461c.087.167.385.283.98.514l6.758 2.629c.121.046.182.07.233.106a.5.5 0 0 1 .116.117c.037.05.06.111.107.232Z",
    mic: "M19 10v2a7 7 0 0 1-7 7m-7-9v2a7 7 0 0 0 7 7m0 0v3m-4 0h8m-4-7a3 3 0 0 1-3-3V5a3 3 0 1 1 6 0v7a3 3 0 0 1-3 3Z",
    search: "m21 21-3.5-3.5m2.5-6a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0Z",
    newchat:
      "M12 13.5v-6m-3 3h6M7 18v2.335c0 .533 0 .8.11.937a.5.5 0 0 0 .39.188c.176 0 .384-.167.8-.5l2.385-1.908c.487-.39.731-.585 1.002-.724.241-.122.497-.212.762-.267.299-.061.61-.061 1.235-.061H16.2c1.68 0 2.52 0 3.162-.327a3 3 0 0 0 1.311-1.311C21 15.72 21 14.88 21 13.2V7.8c0-1.68 0-2.52-.327-3.162a3 3 0 0 0-1.311-1.311C18.72 3 17.88 3 16.2 3H7.8c-1.68 0-2.52 0-3.162.327a3 3 0 0 0-1.311 1.311C3 5.28 3 6.12 3 7.8V14c0 .93 0 1.395.102 1.777a3 3 0 0 0 2.122 2.12C5.605 18 6.07 18 7 18Z",
    settings:
      "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm0-5v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4m0-12.8L17 7M7 17l-1.4 1.4",
    x: "M6 6l12 12M18 6 6 18",
    reply: "m9 17-5-5 5-5M4 12h9a7 7 0 0 1 7 7",
    copy: "M8 8h11v11H8zM5 16H4V4h12v1",
    star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z",
    trash: "M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6",
    photo: "M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9h.01",
    camera: "M3 8h4l2-3h6l2 3h4v11H3zM12 11a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
    video:
      "M4 6h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Zm13 4 5-3v10l-5-3",
    file: "M6 2h8l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 1v5h5",
    codex: "M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Zm0 16A2.5 2.5 0 0 1 6.5 19H20M8 7h8M8 11h6",
    users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87m-2-11.26a4 4 0 0 1 0 7.75",
    agent: "M12 2v3m-6 4h12a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3Zm2 5h.01M17 14h.01M8 18h8",
    plug: "M9 7V3m6 4V3M6 7h12v4a6 6 0 0 1-12 0V7Zm6 10v4",
    skill: "M12 2l2.2 4.8L19 5l-1.8 4.8L22 12l-4.8 2.2L19 19l-4.8-1.8L12 22l-2.2-4.8L5 19l1.8-4.8L2 12l4.8-2.2L5 5l4.8 1.8L12 2Zm0 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
    spark: "M12 2l1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5L12 2Z",
    pin: "M8 3h8l-1 6 3 3H6l3-3-1-6Zm4 9v9",
    download: "M12 3v12m0 0 5-5m-5 5-5-5M5 21h14",
    forward: "m15 7 5 5-5 5M20 12H9a5 5 0 0 0-5 5",
    share: "M12 16V3m0 0L7 8m5-5 5 5M5 12v8h14v-8",
    select:
      "M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3m13 5h3a2 2 0 0 0 2-2v-3M8 8h8v8H8z",
    details: "M12 8h.01M11 12h1v4h1M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z",
    chevron: "m9 6 6 6-6 6",
    image: "M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5",
    play: "m9 6 10 6-10 6V6Z",
    pause: "M9 6v12M15 6v12",
    compose:
      "M13.5 5.5 18.5 10.5M4 20h4.2L19 9.2a2.1 2.1 0 0 0-3-3L5.2 17H4v3ZM14 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-9",
  };
  let f = {
      chat: "M5.8 3h12.4A3.8 3.8 0 0 1 22 6.8v8.1a3.8 3.8 0 0 1-3.8 3.8H10l-5.2 3a1.2 1.2 0 0 1-1.8-1V6.8A3.8 3.8 0 0 1 6.8 3Z",
      library:
        "M5 3h12a3 3 0 0 1 3 3v13a2 2 0 0 1-2 2H6a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2Zm3 4.5a1 1 0 0 0 0 2h7a1 1 0 1 0 0-2H8Zm0 5a1 1 0 1 0 0 2h7a1 1 0 1 0 0-2H8Z",
      ideas:
        "M12 2a7.5 7.5 0 0 0-4.8 13.27c.74.62 1.3 1.33 1.53 2.12l.11.36h6.32l.11-.36c.23-.79.79-1.5 1.53-2.12A7.5 7.5 0 0 0 12 2Zm-3 18h6a1 1 0 0 1-1 2h-4a1 1 0 0 1-1-2Z",
      goals:
        "M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 5a5 5 0 1 1-5 5 5 5 0 0 1 5-5Zm0 3a2 2 0 1 0 2 2 2 2 0 0 0-2-2Z",
      more: "M5 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm7 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm7 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z",
    },
    o = l.endsWith("Filled"),
    r = o ? f[l.slice(0, -6)] : a[l] || a.chat;
  return createElement("svg", {
    viewBox: "0 0 24 24",
    width: t,
    height: t,
    fill: o ? "currentColor" : "none",
    stroke: o ? "none" : "currentColor",
    strokeWidth: "1.8",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
    children: createElement("path", { d: r }),
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
