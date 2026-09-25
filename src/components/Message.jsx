import React, { Fragment, useEffect, useRef, useState } from "react";
import { ButtonUtility, Icon } from "./Icon";
import { timeLabel, tokenizeMentions } from "../data/prototypeData";

const createElement = (type, props, key) =>
  React.createElement(type, key === undefined ? props : { ...props, key });

function safeExternalUrl(value) {
  try {
    let url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch (e) {
    return null;
  }
}
function extractFirstUrl(text) {
  let match = String(text || "").match(/https?:\/\/[^\s<>()\]]+/i);
  if (!match) return null;
  let value = match[0].replace(/[.,!?;:'"]+$/g, "");
  return safeExternalUrl(value) ? value : null;
}
function inlineMarkdown(text, keyPrefix, renderTokens) {
  let pattern =
      /(\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s<]+|`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_)/g,
    out = [],
    last = 0,
    match,
    index = 0;
  let plain = (value, key) => {
    if (!value) return;
    if (renderTokens)
      out.push(
        createElement(
          Fragment,
          { children: renderTokens(tokenizeMentions(value)) },
          key,
        ),
      );
    else out.push(value);
  };
  while ((match = pattern.exec(text))) {
    plain(text.slice(last, match.index), keyPrefix + "p" + index);
    let token = match[0],
      key = keyPrefix + "t" + index++;
    if (token[0] === "[") {
      let parts = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/),
        url = parts && safeExternalUrl(parts[2]);
      url
        ? out.push(
            createElement(
              "a",
              {
                href: url.href,
                target: "_blank",
                rel: "noopener noreferrer",
                onPointerDown: (e) => e.stopPropagation(),
                onClick: (e) => e.stopPropagation(),
                children: parts[1],
              },
              key,
            ),
          )
        : plain(token, key);
    } else if (/^https?:\/\//i.test(token)) {
      let clean = token.replace(/[.,!?;:'"]+$/g, ""),
        tail = token.slice(clean.length),
        url = safeExternalUrl(clean);
      url
        ? out.push(
            createElement(
              "a",
              {
                href: url.href,
                target: "_blank",
                rel: "noopener noreferrer",
                onPointerDown: (e) => e.stopPropagation(),
                onClick: (e) => e.stopPropagation(),
                children: clean,
              },
              key,
            ),
          )
        : plain(clean, key);
      if (tail) plain(tail, key + "tail");
    } else if (token[0] === "`")
      out.push(createElement("code", { children: token.slice(1, -1) }, key));
    else if (token.startsWith("**") || token.startsWith("__"))
      out.push(
        createElement(
          "strong",
          {
            children: inlineMarkdown(
              token.slice(2, -2),
              key + "b",
              renderTokens,
            ),
          },
          key,
        ),
      );
    else if (token.startsWith("~~"))
      out.push(
        createElement(
          "s",
          {
            children: inlineMarkdown(
              token.slice(2, -2),
              key + "s",
              renderTokens,
            ),
          },
          key,
        ),
      );
    else
      out.push(
        createElement(
          "em",
          {
            children: inlineMarkdown(
              token.slice(1, -1),
              key + "e",
              renderTokens,
            ),
          },
          key,
        ),
      );
    last = match.index + token.length;
  }
  plain(text.slice(last), keyPrefix + "end");
  return out;
}
function highlightCode(code, language) {
  if (!/^(?:js|jsx|javascript|ts|tsx|typescript)$/i.test(language || ""))
    return code;
  let pattern = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|`(?:\\.|[^`])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:const|let|var|function|return|if|else|async|await|import|export|from|new|true|false|null)\b|\b\d+(?:\.\d+)?\b)/g,
    output = [],
    last = 0,
    index = 0,
    match;
  while ((match = pattern.exec(code))) {
    if (match.index > last) output.push(code.slice(last, match.index));
    let token = match[0],
      type = token.startsWith("//") || token.startsWith("/*")
        ? "comment"
        : /^[`'\"]/.test(token)
          ? "string"
          : /^\d/.test(token)
            ? "number"
            : "keyword";
    output.push(
      createElement("span", { className: "syntax-" + type, children: token }, "syntax-" + index++),
    );
    last = match.index + token.length;
  }
  if (last < code.length) output.push(code.slice(last));
  return output;
}
function CodeBlock({ code, language }) {
  let [copied, setCopied] = useState(false),
    copy = (e) => {
      e.stopPropagation();
      if (navigator.clipboard && navigator.clipboard.writeText)
        navigator.clipboard
          .writeText(code)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          })
          .catch(() => {});
    };
  return createElement("div", {
    className: "code-block",
    children: [
      createElement("div", {
        className: "code-head",
        children: [
          createElement("span", { children: language || "code" }),
          createElement(ButtonUtility, {
            label: copied ? "Copied" : "Copy code",
            icon: "copy",
            onClick: copy,
            tooltipSide: "top",
          }),
        ],
      }),
      createElement("pre", {
        children: createElement("code", { children: highlightCode(code, language) }),
      }),
    ],
  });
}
function markdownBlocks(text, renderTokens) {
  let source = String(text || ""),
    children = [],
    fence = /```([^\n`]*)\n?([\s\S]*?)```/g,
    last = 0,
    match,
    section = 0;
  let addText = (chunk, prefix) => {
    let lines = chunk.split("\n"),
      i = 0;
    while (i < lines.length) {
      if (!lines[i].trim()) {
        i++;
        continue;
      }
      let bullet = lines[i].match(/^\s*[-+*]\s+(.+)$/),
        ordered = lines[i].match(/^\s*\d+\.\s+(.+)$/),
        quote = lines[i].match(/^\s*>\s?(.*)$/);
      if (bullet || ordered) {
        let tag = ordered ? "ol" : "ul",
          items = [];
        while (i < lines.length) {
          let item = lines[i].match(
            ordered ? /^\s*\d+\.\s+(.+)$/ : /^\s*[-+*]\s+(.+)$/,
          );
          if (!item) break;
          items.push(
            createElement(
              "li",
              {
                children: inlineMarkdown(
                  item[1],
                  prefix + "li" + i,
                  renderTokens,
                ),
              },
              prefix + "li" + i,
            ),
          );
          i++;
        }
        children.push(
          createElement(tag, { children: items }, prefix + tag + i),
        );
        continue;
      }
      if (quote) {
        let parts = [];
        while (i < lines.length) {
          let q = lines[i].match(/^\s*>\s?(.*)$/);
          if (!q) break;
          parts.push(q[1]);
          i++;
        }
        children.push(
          createElement(
            "blockquote",
            {
              children: inlineMarkdown(
                parts.join(" "),
                prefix + "q" + i,
                renderTokens,
              ),
            },
            prefix + "q" + i,
          ),
        );
        continue;
      }
      let paragraph = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^\s*(?:[-+*]\s+|\d+\.\s+|>)/.test(lines[i])
      )
        paragraph.push(lines[i++]);
      let content = [];
      paragraph.forEach((line, lineIndex) => {
        content.push(
          ...inlineMarkdown(
            line,
            prefix + "p" + i + "-" + lineIndex,
            renderTokens,
          ),
        );
        if (lineIndex < paragraph.length - 1)
          content.push(
            createElement("br", {}, prefix + "br" + i + "-" + lineIndex),
          );
      });
      children.push(
        createElement("p", { children: content }, prefix + "para" + i),
      );
    }
  };
  while ((match = fence.exec(source))) {
    addText(source.slice(last, match.index), "s" + section + "-");
    children.push(
      createElement(
        CodeBlock,
        { language: match[1].trim(), code: match[2].replace(/\n$/, "") },
        "code" + section,
      ),
    );
    last = match.index + match[0].length;
    section++;
  }
  addText(source.slice(last), "s" + section + "-");
  return children;
}
function RichMessage({ text, renderTokens }) {
  return createElement("div", {
    className: "markdown-body",
    children: markdownBlocks(text, renderTokens),
  });
}
function LinkPreview({ preview, url }) {
  let data = preview || { url },
    parsed = safeExternalUrl(data.url);
  if (!parsed) return null;
  let domain = data.domain || parsed.hostname.replace(/^www\./, ""),
    rich = !!(data.title || data.description);
  return createElement("a", {
    className: "link-preview " + (rich ? "rich" : "compact"),
    href: parsed.href,
    target: "_blank",
    rel: "noopener noreferrer",
    onPointerDown: (e) => e.stopPropagation(),
    onClick: (e) => e.stopPropagation(),
    "aria-label": "Open " + domain + " in a new tab",
    children: [
      createElement("span", {
        className: "link-preview-copy",
        children: [
          createElement("span", {
            className: "link-preview-source",
            children: [
              createElement("span", {
                className: "link-mark",
                "aria-hidden": "true",
                children: domain.charAt(0),
              }),
              createElement("span", { children: domain }),
            ],
          }),
          data.title && createElement("strong", { children: data.title }),
          data.description &&
            createElement("small", { children: data.description }),
          !rich &&
            createElement("small", {
              className: "link-preview-url",
              children: parsed.href,
            }),
        ],
      }),
      rich &&
        createElement("span", {
          className: "link-preview-visual",
          "aria-hidden": "true",
          children: createElement("span", { className: "preview-window" }),
        }),
    ],
  });
}
function Message({
  message,
  index,
  groupedTop,
  groupedBottom,
  begin,
  move,
  end,
  context,
  openImage,
  renderTokens,
  pinned,
  starred,
  chooseChip,
  retryDemo,
  showSender,
}) {
  let [expanded, setExpanded] = useState(false),
    rowClass =
      "message-row " +
      message.role +
      " entering " +
      (groupedTop ? "grouped-top " : "") +
      (groupedBottom ? "grouped-bottom " : "") +
      (message.deleting ? "deleting" : ""),
    isLong =
      (message.text || "").length > 430 ||
      (message.text || "").split("\n").length > 7;
  if (message.role === "system")
    return createElement("div", {
      className: rowClass,
      "data-message-id": message.id,
      style: { "--delay": Math.min(index, 8) * 24 + "ms" },
      children: createElement("div", {
        className: "system-row",
        role: "status",
        children: message.text,
      }),
    });
  let textBody =
      message.text &&
      createElement(RichMessage, { text: message.text, renderTokens }),
    previewUrl = !message.linkPreview && extractFirstUrl(message.text);
  return createElement("div", {
    className: rowClass,
    "data-message-id": message.id,
    style: { "--delay": Math.min(index, 8) * 24 + "ms" },
    children: [
      showSender && message.role === "assistant" && !groupedTop &&
        createElement("span", {
          className: "message-sender",
          children: message.sender || "Sol",
        }),
      createElement("div", {
        className: "bubble-wrap",
        children: [
          message.reply &&
            createElement("div", {
              className: "reply-quote",
              children: message.reply,
            }),
          message.image
            ? createElement("button", {
                className: "image-bubble",
                onPointerDown: (e) => begin(e, message),
                onPointerMove: (e) => move(e, message),
                onPointerUp: (e) => end(e, message),
                onPointerCancel: (e) => end(e, message),
                onContextMenu: (e) => context(e, message),
                onClick: (e) =>
                  openImage(message.image, e.currentTarget, message),
                "aria-label": "Open shared image",
                children: [
                  createElement("img", {
                    src: message.image,
                    alt: message.name || message.caption || "Shared image",
                  }),
                  message.caption &&
                    createElement("span", { children: message.caption }),
                ],
              })
            : message.audioBlob || message.audioUrl || message.demoTone
              ? createElement("div", {
                  className: "bubble",
                  onPointerDown: (e) => begin(e, message),
                  onPointerMove: (e) => move(e, message),
                  onPointerUp: (e) => end(e, message),
                  onPointerCancel: (e) => end(e, message),
                  onContextMenu: (e) => context(e, message),
                  tabIndex: 0,
                  role: "button",
                  "aria-label": "Press and hold for message actions",
                  children: createElement(AudioBubble, { message }),
                })
              : createElement("div", {
                  className:
                    "bubble " +
                    (message.role === "user" ? "sent-pop " : "") +
                    (message.thinking ? "thinking-demo " : "") +
                    (message.errorState ? "error-demo " : "") +
                    (isLong && !expanded ? "is-collapsed" : ""),
                  onPointerDown: (e) => begin(e, message),
                  onPointerMove: (e) => move(e, message),
                  onPointerUp: (e) => end(e, message),
                  onPointerCancel: (e) => end(e, message),
                  onPointerLeave: (e) => {
                    if (e.pointerType === "mouse") end(e, message);
                  },
                  onContextMenu: (e) => context(e, message),
                  tabIndex: 0,
                  role: "button",
                  "aria-label": "Press and hold for message actions",
                  children: [
                    message.thinking &&
                      createElement("span", {
                        className: "thinking-spark",
                        "aria-hidden": "true",
                        children: "✦",
                      }),
                    createElement("span", {
                      className: "message-copy",
                      children: textBody,
                    }),
                    (message.linkPreview || previewUrl) &&
                      createElement(LinkPreview, {
                        preview: message.linkPreview,
                        url: previewUrl,
                      }),
                    message.streaming &&
                      createElement("i", {
                        className: "cursor",
                        "aria-hidden": "true",
                        children: "▍",
                      }),
                    isLong &&
                      createElement("button", {
                        className: "read-toggle",
                        onPointerDown: (e) => e.stopPropagation(),
                        onClick: (e) => {
                          e.stopPropagation();
                          setExpanded((x) => !x);
                        },
                        children: expanded ? "Show less" : "Read more",
                      }),
                    message.errorState &&
                      message.errorState !== "success" &&
                      createElement("button", {
                        className: "retry-button",
                        disabled: message.errorState === "retrying",
                        onPointerDown: (e) => e.stopPropagation(),
                        onClick: (e) => {
                          e.stopPropagation();
                          retryDemo(message);
                        },
                        children:
                          message.errorState === "retrying"
                            ? "Retrying…"
                            : "Retry",
                      }),
                  ],
                }),
          message.chips &&
            createElement("div", {
              className: "quick-replies",
              "aria-label": "Quick replies",
              children: message.chips.map((label) =>
                createElement(
                  "button",
                  {
                    disabled: message.chipsUsed,
                    onClick: () => chooseChip(message, label),
                    children: label,
                  },
                  label,
                ),
              ),
            }),
          message.reactions &&
            message.reactions.length > 0 &&
            createElement("div", {
              className: "reaction-stack",
              children: createElement("span", {
                children:
                  message.reactions.length === 1
                    ? message.reactions[0]
                    : createElement(Fragment, {
                        children: [
                          message.reactions
                            .slice(0, 2)
                            .map((item, i) =>
                              createElement("b", { children: item }, item + i),
                            ),
                          message.reactions.length > 2 &&
                            createElement("small", {
                              children: "+" + (message.reactions.length - 2),
                            }),
                        ],
                      }),
              }),
            }),
          message.reaction &&
            createElement("span", {
              key: message.reaction,
              className:
                "reaction " + (message.reactionRemoving ? "is-removing" : ""),
              children: message.reaction,
            }),
          starred &&
            createElement("span", {
              className: "star-badge",
              "aria-label": "Starred",
              children: createElement(Icon, { name: "star", size: 12 }),
            }),
          pinned &&
            createElement("span", {
              className: "pin-badge",
              "aria-label": "Pinned",
              children: createElement(Icon, { name: "pin", size: 12 }),
            }),
        ],
      }),
      !groupedBottom &&
        createElement("div", {
          className: "message-meta",
          children: [
            createElement("time", {
              dateTime: message.at,
              children: timeLabel(message.at),
            }),
            message.role === "user" &&
              createElement("span", {
                className: "delivery",
                "aria-label":
                  message.status === "delivered" ? "Delivered" : "Sent",
                children: message.status === "delivered" ? "✓✓" : "✓",
              }),
          ],
        }),
    ],
  });
}
function AudioBubble({ message }) {
  let [audio, setAudio] = useState(null),
    [playing, setPlaying] = useState(false),
    [progress, setProgress] = useState(0),
    toneRef = useRef(null),
    duration = message.duration || 0,
    bars = 32;
  useEffect(
    () => () => {
      if (audio) audio.pause();
      if (toneRef.current) {
        clearInterval(toneRef.current.timer);
        try {
          toneRef.current.osc.stop();
        } catch (e) {}
        toneRef.current.ctx.close();
      }
    },
    [audio],
  );
  let ensure = () => {
    if (audio) return audio;
    if (!message.audioUrl) return null;
    let el = new Audio(message.audioUrl);
    el.ontimeupdate = () =>
      setProgress(el.duration ? el.currentTime / el.duration : 0);
    el.onloadedmetadata = () => {};
    el.onended = () => {
      setPlaying(false);
      setProgress(0);
    };
    setAudio(el);
    return el;
  };
  let stopTone = (reset = false) => {
    let tone = toneRef.current;
    if (!tone) return;
    clearInterval(tone.timer);
    try {
      tone.osc.stop();
    } catch (e) {}
    tone.ctx.close().catch(() => {});
    toneRef.current = null;
    setPlaying(false);
    if (reset) setProgress(0);
  };
  let startTone = () => {
    let Ctx = window.AudioContext || window.webkitAudioContext,
      ctx = new Ctx(),
      osc = ctx.createOscillator(),
      gain = ctx.createGain(),
      started = performance.now() - progress * duration * 1000;
    osc.type = "sine";
    osc.frequency.value = 220;
    gain.gain.value = 0.025;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    let timer = setInterval(() => {
      let p = Math.min(1, (performance.now() - started) / (duration * 1000));
      setProgress(p);
      osc.frequency.value = 220 + Math.sin(p * 24) * 28;
      if (p >= 1) stopTone(true);
    }, 60);
    toneRef.current = { ctx, osc, timer, started };
    setPlaying(true);
  };
  let toggle = (e) => {
    e.stopPropagation();
    if (message.demoTone) {
      if (playing) stopTone();
      else startTone();
      return;
    }
    let el = ensure();
    if (!el) return;
    if (el.paused) {
      el.play()
        .then(() => setPlaying(true))
        .catch(() => {});
    } else {
      el.pause();
      setPlaying(false);
    }
  };
  let setPosition = (next) => {
    next = Math.max(0, Math.min(1, next));
    setProgress(next);
    if (toneRef.current)
      toneRef.current.started = performance.now() - next * duration * 1000;
    let el = ensure();
    if (el && el.duration) el.currentTime = next * el.duration;
  };
  let seek = (e) => {
    e.stopPropagation();
    let rect = e.currentTarget.getBoundingClientRect();
    setPosition((e.clientX - rect.left) / rect.width);
  };
  let keySeek = (e) => {
    if (
      e.key !== "ArrowLeft" &&
      e.key !== "ArrowRight" &&
      e.key !== "Home" &&
      e.key !== "End"
    )
      return;
    e.preventDefault();
    e.stopPropagation();
    setPosition(
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? 1
          : progress + (e.key === "ArrowRight" ? 0.05 : -0.05),
    );
  };
  let current = duration * progress,
    head = Math.min(bars - 1, Math.floor(progress * bars));
  return createElement("div", {
    className: "audio-bubble",
    children: [
      createElement("button", {
        type: "button",
        className: "audio-play " + (playing ? "is-playing" : ""),
        onClick: toggle,
        onPointerDown: (e) => e.stopPropagation(),
        "aria-label": playing ? "Pause voice message" : "Play voice message",
        children: createElement(Icon, {
          name: playing ? "pause" : "play",
          size: 18,
        }),
      }),
      createElement("div", {
        className: "audio-main",
        children: [
          createElement("div", {
            className: "audio-waveform " + (playing ? "is-playing" : ""),
            role: "slider",
            tabIndex: 0,
            "aria-label": "Voice message progress",
            "aria-valuemin": 0,
            "aria-valuemax": Math.round(duration),
            "aria-valuenow": Math.round(current),
            onPointerDown: seek,
            onPointerMove: (e) => {
              if (e.buttons === 1) seek(e);
            },
            onKeyDown: keySeek,
            children: Array.from({ length: bars }, (_, i) =>
              createElement(
                "i",
                {
                  className:
                    (i <= head && progress > 0 ? "played " : "") +
                    (i === head ? "playhead" : ""),
                  style: { height: 7 + ((i * 13) % 20) + "px" },
                },
                i,
              ),
            ),
          }),
          createElement("div", {
            className: "audio-times",
            children: [
              createElement("span", {
                children: formatDurationStatic(current),
              }),
              createElement("span", {
                children: formatDurationStatic(duration),
              }),
            ],
          }),
        ],
      }),
    ],
  });
}
function formatDurationStatic(seconds) {
  let safe = Math.max(0, Math.floor(seconds || 0));
  return Math.floor(safe / 60) + ":" + String(safe % 60).padStart(2, "0");
}

export { Message };
