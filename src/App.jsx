import React, {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Autocomplete,
  AttachSheet,
  ContextMenu,
  Dialog,
  Drawer,
} from "./components/Overlays";
import { ButtonUtility, ComposerActionButton, Icon } from "./components/Icon";
import { Message } from "./components/Message";
import { ApprovalStack, useApprovals } from "./components/ApprovalCard";
import {
  GoalsScreen,
  IdeasScreen,
  LibraryScreen,
  SettingsScreen,
} from "./components/Screens";
import {
  ASSISTANT,
  cannedReplies,
  dayKey,
  dayLabel,
  demoCommands,
  downloadImageSource,
  initialThreads,
  mentionRoster,
  nowIso,
  reduceMotion,
  slashCommands,
  storage,
  tokenizeComposer,
  tokenizeMentions,
} from "./data/prototypeData";
import { useViewportHeight } from "./hooks/useViewportHeight";
import {
  getBackendConfig,
  saveBackendConfig,
  isDemoMode,
  isBackendVerified,
  saveBackendVerified,
  RECOMMENDED_BACKEND,
  gatewayBase,
  isGatewayUrl,
  recommendedBackend,
  autoConnect,
  QUBIT_MODEL,
} from "./config/backend";
import { ModelSheet, laneLabel, useLocalModels } from "./components/ModelPicker";
import { sendChatCompletion, fetchModels, testConnection } from "./api/chat";
import {
  generateComfyImage,
  testComfyConnection as testComfyApi,
} from "./api/comfyui";
import {
  getComfyConfig,
  saveComfyConfig,
  isComfyUnconfigured,
  isComfyVerified,
  saveComfyVerified,
  RECOMMENDED_COMFYUI,
} from "./config/comfyui";
import { AgentSheet, AgentsScreen, HandoffBanner, useFleet } from "./components/Agents";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { SolEdge } from "sol-edge";

const createElement = (type, props, key) =>
  React.createElement(type, key === undefined ? props : { ...props, key });

function SolApp() {
  let [theme, setTheme] = useState(() => storage.get("theme", "light")),
    [tab, setTab] = useState("chat"),
    [threads, setThreads] = useState(initialThreads),
    [activeId, setActiveId] = useState("focus"),
    [drawerSearch, setDrawerSearch] = useState(""),
    [draft, setDraft] = useState(""),
    [typing, setTyping] = useState(false),
    // Off by default (Scott, 2026-10-01): the typing bubble, then the whole reply at once. A new
    // key on purpose: the old "streaming" was written on every launch, so every install already
    // has true saved and a changed default would never reach it. More > Streaming turns it on.
    [streamingEnabled, setStreamingEnabled] = useState(() =>
      storage.get("streamReplies", false),
    ),
    [streaming, setStreaming] = useState(false),
    // Long messages in full unless this is on (Scott, 2026-10-01: a toggle, not the default).
    [collapseLong, setCollapseLong] = useState(() => storage.get("collapseLong", false)),
    [haptics, setHaptics] = useState(() => storage.get("haptics", true)),
    [replying, setReplying] = useState(null),
    [overlay, setOverlay] = useState(null),
    [toast, setToast] = useState(""),
    [previews, setPreviews] = useState([]),
    [generation, setGeneration] = useState(null),
    [imagePrompt, setImagePrompt] = useState(""),
    [config, setConfig] = useState(() => getBackendConfig()),
    // ComfyUI image generation settings (src/config/comfyui.js). Empty base
    // URL means /imagine stays in simulated preview mode.
    [comfyConfig, setComfyConfig] = useState(() => getComfyConfig()),
    [comfyTestState, setComfyTestState] = useState({ phase: "idle" }),
    // Per-conversation model, used when the backend is the Sol gateway (where every local
    // model shares one URL). threadId -> model id; a missing entry means the saved default.
    [threadModels, setThreadModels] = useState(() => storage.get("threadModels", {})),
    [modelsNonce, setModelsNonce] = useState(0),
    [discoveredModels, setDiscoveredModels] = useState([]),
    [discoverState, setDiscoverState] = useState({ phase: "idle" }),
    [testState, setTestState] = useState({ phase: "idle" }),
    [mcpConnectors, setMcpConnectors] = useState([
      { id: "codex", name: "Quantum Codex", note: "Knowledge and project files", connected: true },
      { id: "github", name: "GitHub", note: "Repositories and pull requests", connected: false },
      { id: "home", name: "Home Assistant", note: "Smart-home tools", connected: false },
    ]),
    [skills, setSkills] = useState([
      { id: "research", name: "Research", note: "Gather and synthesize sources", enabled: true },
      { id: "calendar", name: "Calendar", note: "Plan around your schedule", enabled: true },
      { id: "images", name: "Image generation", note: "Create visual concepts", enabled: false },
      { id: "code", name: "Code review", note: "Explain and improve code", enabled: true },
    ]),
    [zoomed, setZoomed] = useState(false),
    [away, setAway] = useState(false),
    [newCount, setNewCount] = useState(0),
    [ideas, setIdeas] = useState([]),
    [ideaDraft, setIdeaDraft] = useState(""),
    [picker, setPicker] = useState(null),
    [pickerIndex, setPickerIndex] = useState(0),
    [pins, setPins] = useState(() => storage.get("pins", {})),
    [stars, setStars] = useState(() => storage.get("stars", {})),
    [searchOpen, setSearchOpen] = useState(false),
    [messageQuery, setMessageQuery] = useState(""),
    [searchIndex, setSearchIndex] = useState(0),
    [recording, setRecording] = useState(null),
    [threadLoading, setThreadLoading] = useState(false),
    [agentOpen, setAgentOpen] = useState(null);
  // The fleet polls fast while you're looking at it, slowly otherwise (for the handoff banner).
  let fleetState = useFleet(tab === "agents" || Boolean(agentOpen));
  // A new handoff is also announced (the toast is role=status), not only drawn as a banner.
  let handoffId = fleetState.data?.desk?.handoff?.id;
  useEffect(() => {
    let h = fleetState.data?.desk?.handoff;
    if (!h || h.status === "scott_has_desk") return;
    let who = fleetState.data.agents.find((a) => a.workspace === h.bot);
    notify(`${who ? who.name : h.bot} needs you at the desk`);
  }, [handoffId]); // once per handoff, not on every poll
  let chatRef = useRef(null),
    contentRef = useRef(null),
    textareaRef = useRef(null),
    backdropRef = useRef(null),
    ideaRef = useRef(null),
    toastTimer = useRef(null),
    longTimer = useRef(null),
    gesture = useRef(null),
    rubber = useRef(null),
    streamRef = useRef(null),
    backendAbort = useRef(null),
    typingTimer = useRef(null),
    replyTimer = useRef(null),
    generationTimers = useRef([]),
    comfyAbort = useRef(null),
    mounted = useRef(true),
    activeRef = useRef(activeId),
    stickRef = useRef(true),
    overlayTrigger = useRef(null),
    suppressTap = useRef(0),
    lastSend = useRef(0),
    objectUrls = useRef(new Set()),
    audioUrls = useRef(new Set()),
    replyIndex = useRef(0),
    focusTimer = useRef(null),
    rubberFrame = useRef(null),
    latestRef = useRef(null),
    draftTimer = useRef(null),
    recorderRef = useRef(null),
    recordStreamRef = useRef(null),
    recordTimerRef = useRef(null),
    recordFrameRef = useRef(null),
    recordModeRef = useRef("discard"),
    recordStartRef = useRef(0),
    recordDurationRef = useRef(0),
    audioContextRef = useRef(null),
    drawerGesture = useRef(null);
  // Connect to the Sol gateway by itself on any tailnet device (see autoConnect)
  useEffect(() => {
    let alive = true;
    autoConnect().then((cfg) => {
      if (alive && cfg) setConfig(cfg);
    });
    return () => {
      alive = false;
    };
  }, []);
  let viaGateway = !isDemoMode(config) && isGatewayUrl(config.baseUrl),
    gwBase = viaGateway ? gatewayBase() || config.baseUrl.replace(/\/v1$/i, "") : "",
    localModels = useLocalModels(gwBase, viaGateway, modelsNonce),
    // The Warden's requests. Shown in a one-to-one chat with Qubit (Scott, 2026-10-01).
    // Only while the chat tab is open: Qubit's DM thread (Agents tab) polls for itself (review).
    warden = useApprovals(viaGateway && tab === "chat"),
    modelFor = (threadId) => (viaGateway && threadModels[threadId]) || config.model,
    modelInfo = (id) => localModels.models.find((m) => m.id === id),
    chooseModel = (threadId, modelId) => {
      setThreadModels((cur) => {
        let next = { ...cur, [threadId]: modelId };
        storage.set("threadModels", next);
        return next;
      });
      setModelsNonce((n) => n + 1); // the header's up/down state was fetched once and went stale
      haptic("light");
    },
    dropThreadModel = (threadId) =>
      setThreadModels((cur) => {
        let next = { ...cur };
        delete next[threadId];
        storage.set("threadModels", next);
        return next;
      }),
    // Who is answering in a one-to-one chat. Qubit, unless this chat was pointed at a bare local
    // model on the gateway: then it's that model, by name - never a model calling itself Qubit.
    assistantName = (threadId) => {
      // Demo mode is Qubit's demo; any real backend that isn't Qubit answers under its own name.
      let id = isDemoMode(config) ? "" : viaGateway ? modelFor(threadId) : config.model;
      if (!id || id === QUBIT_MODEL) return ASSISTANT.name;
      let m = modelInfo(id);
      return (m && m.label) || id;
    },
    chipText = (threadId) => {
      let id = modelFor(threadId),
        m = modelInfo(id);
      if (!m) return id;
      return m.label + " · " + (m.up === false ? "offline" : laneLabel(m).split(" · ")[0]);
    };
  let activeThread = threads.find((x) => x.id === activeId) || threads[0],
    messages = activeThread ? activeThread.messages : [];
  // Cards belong where Qubit itself is answering: a one-to-one chat on the gateway, model qubit.
  let approvalsHere =
    viaGateway &&
    warden.approvals.length > 0 &&
    (!activeThread || activeThread.type === "dm") &&
    modelFor(activeId) === QUBIT_MODEL;
  // A request Qubit is waiting on, while this chat isn't one where its card shows: say so once.
  let toldAbout = useRef(new Set());
  useEffect(() => {
    if (approvalsHere) {
      warden.approvals.forEach((a) => toldAbout.current.add(a.id));   // seen in place: no toast later
      return;
    }
    let fresh = warden.approvals.filter((a) => !toldAbout.current.has(a.id));
    fresh.forEach((a) => toldAbout.current.add(a.id));
    if (fresh.length) notify(ASSISTANT.name + " needs your approval. Open a chat with " + ASSISTANT.name + ".");
  }, [warden.approvals, approvalsHere]);
  // Backend connection state: demo until a base URL and model are set;
  // "connected" only after a successful test or chat against them.
  let demoMode = isDemoMode(config),
    backendVerified = !demoMode && isBackendVerified(config),
    backendStatus = demoMode
      ? "Not connected · Demo mode"
      : backendVerified
        ? "Connected · " + config.model
        : "Configured · Not tested yet";
  let threadPins = pins[activeId] || [],
    threadStars = stars[activeId] || [],
    pinnedMessages = threadPins
      .map((id) => messages.find((m) => m.id === id))
      .filter(Boolean),
    latestPin = pinnedMessages[pinnedMessages.length - 1] || null;
  let searchResults = messageQuery.trim()
    ? messages.filter((m) =>
        (m.text || m.caption || "")
          .toLowerCase()
          .includes(messageQuery.trim().toLowerCase()),
      )
    : [];
  activeRef.current = activeId;
  let pickerItems = picker
    ? picker.type === "mention"
      ? mentionRoster.filter((item) =>
          item.name.toLowerCase().includes(picker.query.toLowerCase()),
        )
      : picker.type === "demo"
        ? demoCommands.filter((item) =>
            item.name
              .slice(1)
              .toLowerCase()
              .includes(picker.query.toLowerCase()),
          )
        : slashCommands.filter((item) =>
            item.name
              .slice(1)
              .toLowerCase()
              .includes(picker.query.toLowerCase()),
          )
    : [];
  let updatePicker = (value, caret) => {
    let before = value.slice(0, caret),
      mention = before.match(/(?:^|\s)@([^@\n]*)$/),
      command = before.match(/^\/([^\s]*)$/),
      demo = before.match(/^#([^\s]*)$/);
    if (demo) {
      setPicker({ type: "demo", query: demo[1], start: 0, end: caret });
      setPickerIndex(0);
      return;
    }
    if (command) {
      let next = { type: "command", query: command[1], start: 0, end: caret };
      setPicker(next);
      setPickerIndex(0);
      return;
    }
    if (mention) {
      let start = before.lastIndexOf("@"),
        query = before.slice(start + 1);
      setPicker({ type: "mention", query, start, end: caret });
      setPickerIndex(0);
      return;
    }
    setPicker(null);
  };
  let renderTokens = (tokens) => {
    let out = [];
    tokens.forEach((token, tokenIndex) => {
      if (token.type === "mention")
        out.push(
          createElement(
            "span",
            { className: "mention-pill", children: token.value },
            "m" + tokenIndex,
          ),
        );
      else
        token.value.split("\n").forEach((part, lineIndex, all) => {
          if (part) out.push(part);
          if (lineIndex < all.length - 1)
            out.push(
              createElement("br", {}, "b" + tokenIndex + "-" + lineIndex),
            );
        });
    });
    return out;
  };
  let renderComposerTokens = (text) => {
    let out = tokenizeComposer(text).map((token, index) =>
      createElement(
        "span",
        {
          className: token.type === "text" ? "composer-text" : "composer-token",
          children: token.value,
        },
        "c" + index,
      ),
    );
    if (text.endsWith("\n"))
      out.push(
        createElement(
          "span",
          { className: "composer-tail", children: "\u200b" },
          "tail",
        ),
      );
    return out;
  };
  let syncComposerScroll = (target) => {
    let backdrop = backdropRef.current;
    if (backdrop) {
      backdrop.scrollTop = target.scrollTop;
      backdrop.scrollLeft = target.scrollLeft;
    }
  };
  let haptic = (kind, node) => {
    let pattern =
      { light: 10, medium: 20, heavy: [25, 40, 25], success: [10, 50, 15] }[
        kind
      ] || 10;
    if (haptics && navigator.vibrate)
      try {
        if (navigator.vibrate(pattern)) return;
      } catch (e) {}
    if (node) {
      node.classList.remove("visual-pulse");
      requestAnimationFrame(() => node.classList.add("visual-pulse"));
    }
  };
  let notify = (message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(
      () => mounted.current && setToast(""),
      1700,
    );
  };
  let updateThread = (id, fn) =>
    setThreads((list) =>
      list.map((t) => (t.id === id ? { ...t, messages: fn(t.messages) } : t)),
    );
  let updateActive = (fn) => updateThread(activeRef.current, fn);
  let createAudioUrl = (blob) => {
    let url = URL.createObjectURL(blob);
    audioUrls.current.add(url);
    return url;
  };
  let formatDuration = (seconds) => {
    let safe = Math.max(0, Math.floor(seconds || 0));
    return Math.floor(safe / 60) + ":" + String(safe % 60).padStart(2, "0");
  };
  let jumpToMessage = (id) => {
    let row = document.querySelector(
      '[data-message-id="' + CSS.escape(id) + '"]',
    );
    if (!row) return;
    row.scrollIntoView({
      behavior: reduceMotion() ? "auto" : "smooth",
      block: "center",
    });
    row.classList.remove("search-hit");
    requestAnimationFrame(() => {
      row.classList.add("search-hit");
      setTimeout(() => row.classList.remove("search-hit"), 900);
    });
    haptic("light");
  };
  let moveSearch = (delta) => {
    if (!searchResults.length) return;
    let next =
      (searchIndex + delta + searchResults.length) % searchResults.length;
    setSearchIndex(next);
    jumpToMessage(searchResults[next].id);
  };
  let toggleSearch = () => {
    setSearchOpen((open) => !open);
    setMessageQuery("");
    setSearchIndex(0);
    setTimeout(() => {
      let el = document.querySelector(".message-search input");
      if (el) el.focus();
    }, 50);
  };
  let highlightQuery = (text) => {
    let q = messageQuery.trim();
    if (!q) return text;
    let lower = text.toLowerCase(),
      at = lower.indexOf(q.toLowerCase());
    if (at < 0) return text;
    return createElement(Fragment, {
      children: [
        text.slice(0, at),
        createElement("mark", { children: text.slice(at, at + q.length) }),
        text.slice(at + q.length),
      ],
    });
  };
  let exportChat = (thread) => {
    let lines = [
      "# " + thread.title,
      "",
      "Exported " + new Date().toLocaleDateString(),
      "",
    ];
    thread.messages.forEach((m) => {
      let sender =
          m.role === "assistant" ? assistantName(thread.id) : m.role === "user" ? "You" : "System",
        stamp = new Date(m.at).toLocaleString();
      lines.push("## " + sender + " — " + stamp);
      if (m.reply) lines.push("> " + m.reply.replace(/\n/g, "\n> "), "");
      if (m.image) lines.push("[Image]" + (m.caption ? " " + m.caption : ""));
      else if (m.audioBlob || m.audioUrl)
        lines.push("[Voice message — " + formatDuration(m.duration) + "]");
      else lines.push(m.text || "");
      lines.push("");
    });
    let blob = new Blob([lines.join("\n")], {
        type: "text/markdown;charset=utf-8",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a"),
      slug =
        thread.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "conversation",
      date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = "sol-chat-" + slug + "-" + date + ".md";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    notify("Chat exported");
    haptic("success");
  };
  let cleanupRecording = () => {
    clearInterval(recordTimerRef.current);
    cancelAnimationFrame(recordFrameRef.current);
    if (recordStreamRef.current) {
      recordStreamRef.current.getTracks().forEach((track) => track.stop());
      recordStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  };
  let startRecording = async (node) => {
    try {
      if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error("unavailable");
      let stream = await navigator.mediaDevices.getUserMedia({ audio: true }),
        recorder = new MediaRecorder(stream),
        chunks = [];
      recordStreamRef.current = stream;
      recorderRef.current = recorder;
      recordModeRef.current = "discard";
      recordStartRef.current = performance.now();
      recordDurationRef.current = 0;
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size) chunks.push(e.data);
      };
      recorder.onstop = () => {
        let duration = recordDurationRef.current,
          mode = recordModeRef.current;
        cleanupRecording();
        setRecording(null);
        if (mode === "send" && chunks.length) {
          let blob = new Blob(chunks, {
              type: recorder.mimeType || "audio/webm",
            }),
            url = createAudioUrl(blob),
            id = "v" + Date.now(),
            threadId = activeRef.current;
          updateThread(threadId, (list) => [
            ...list,
            {
              id,
              role: "user",
              audioBlob: blob,
              audioUrl: url,
              duration,
              at: nowIso(),
              status: "sent",
              reply: replying && replying.text,
            },
          ]);
          setReplying(null);
          stickRef.current = true;
          requestAnimationFrame(() => scrollLatest(true));
          haptic("success");
        }
      };
      let context = new (window.AudioContext || window.webkitAudioContext)(),
        source = context.createMediaStreamSource(stream),
        analyser = context.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      audioContextRef.current = context;
      let data = new Uint8Array(analyser.frequencyBinCount),
        draw = () => {
          analyser.getByteFrequencyData(data);
          let bars = Array.from({ length: 18 }, (_, i) =>
            Math.max(4, Math.round(((data[i] || 0) / 255) * 28)),
          );
          setRecording((r) => (r ? { ...r, bars } : r));
          recordFrameRef.current = requestAnimationFrame(draw);
        };
      setRecording({ elapsed: 0, bars: Array(18).fill(5) });
      recordTimerRef.current = setInterval(() => {
        let elapsed = (performance.now() - recordStartRef.current) / 1000;
        recordDurationRef.current = elapsed;
        setRecording((r) => (r ? { ...r, elapsed } : r));
      }, 100);
      recorder.start(200);
      draw();
      haptic("medium", node);
    } catch (e) {
      cleanupRecording();
      setRecording(null);
      notify("Microphone unavailable in this prototype");
    }
  };
  let stopRecording = (mode) => {
    let recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      cleanupRecording();
      setRecording(null);
      return;
    }
    recordModeRef.current = mode;
    recordDurationRef.current = Math.max(
      recordDurationRef.current,
      (performance.now() - recordStartRef.current) / 1000,
    );
    recorder.stop();
    recorderRef.current = null;
  };
  let resetRubber = () => {
    cancelAnimationFrame(rubberFrame.current);
    if (contentRef.current) {
      contentRef.current.style.transition = reduceMotion()
        ? "none"
        : "transform 420ms cubic-bezier(.34,1.35,.64,1)";
      contentRef.current.style.transform = "translateY(0)";
    }
    rubber.current = null;
  };
  let isNearBottom = () => {
    let el = chatRef.current;
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };
  let scrollLatest = (smooth = true) => {
    resetRubber();
    let el = chatRef.current;
    if (el)
      el.scrollTo({
        top: el.scrollHeight,
        behavior: smooth && !reduceMotion() ? "smooth" : "auto",
      });
    stickRef.current = true;
    setAway(false);
    setNewCount(0);
  };
  let revokePreviews = () => {
    setPreviews((items) => {
      items.forEach((item) => {
        if (item.url && objectUrls.current.has(item.url)) {
          URL.revokeObjectURL(item.url);
          objectUrls.current.delete(item.url);
        }
      });
      return [];
    });
  };
  let cancelLongPress = () => {
    clearTimeout(longTimer.current);
    longTimer.current = null;
    if (gesture.current && gesture.current.target)
      gesture.current.target.style.transform = "";
    gesture.current = null;
  };
  let stopTyping = () => {
    clearTimeout(replyTimer.current);
    replyTimer.current = null;
    clearTimeout(typingTimer.current);
    typingTimer.current = null;
    setTyping(false);
  };
  let finalizeStream = (complete = true) => {
    let current = streamRef.current;
    if (!current) return;
    clearTimeout(current.timer);
    streamRef.current = null;
    setStreaming(false);
    updateThread(current.threadId, (list) =>
      list.map((m) =>
        m.id === current.id
          ? { ...m, text: complete ? current.full : m.text, streaming: false }
          : m,
      ),
    );
  };
  let closeOverlay = (restore = true) => {
    let finish = () => {
      setOverlay(null);
      setZoomed(false);
      if (restore) {
        clearTimeout(focusTimer.current);
        focusTimer.current = setTimeout(
          () =>
            overlayTrigger.current &&
            overlayTrigger.current.isConnected &&
            overlayTrigger.current.focus(),
          0,
        );
      }
    };
    if (overlay && overlay.type === "drawer" && !reduceMotion()) {
      let layer = document.querySelector(".drawer-layer");
      if (layer && !layer.classList.contains("closing")) {
        layer.classList.add("closing");
        setTimeout(finish, 260);
        return;
      }
    }
    finish();
  };
  let openOverlay = (next, trigger) => {
    cancelLongPress();
    if (
      document.activeElement &&
      /TEXTAREA|INPUT/.test(document.activeElement.tagName) &&
      next.type !== "dialog"
    )
      document.activeElement.blur();
    overlayTrigger.current = trigger || document.activeElement;
    setOverlay(next);
  };
  // Backend connection dialog helpers.
  let resetBackendDialog = () => {
    setDiscoveredModels([]);
    setDiscoverState({ phase: "idle" });
    setTestState({ phase: "idle" });
  };
  let openBackendConfig = (node) => {
    resetBackendDialog();
    openOverlay({ type: "config" }, node);
  };
  let fillRecommendedBackend = () => {
    let rec = recommendedBackend();
    setConfig((current) => ({
      ...current,
      baseUrl: rec.baseUrl,
      model: rec.model,
      // The gateway takes no key; a stale one broke every chat's CORS preflight (review)
      apiKey: rec.gateway ? "" : current.apiKey,
    }));
    resetBackendDialog();
    haptic("light");
  };
  let fillRecommendedComfy = () => {
    setComfyConfig((current) => ({
      ...current,
      baseUrl: RECOMMENDED_COMFYUI.baseUrl,
    }));
    setComfyTestState({ phase: "idle" });
    haptic("light");
  };
  let discoverBackendModels = async () => {
    setDiscoverState({ phase: "loading" });
    setTestState({ phase: "idle" });
    try {
      let models = await fetchModels({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
      });
      setDiscoveredModels(models.map((item) => item.id));
      setDiscoverState({ phase: "done", count: models.length });
      if (models.length && !String(config.model || "").trim()) {
        setConfig((current) => ({ ...current, model: models[0].id }));
      }
    } catch (error) {
      setDiscoverState({
        phase: "error",
        message: error && error.message ? error.message : "Discovery failed.",
      });
    }
  };
  let testBackendConnection = async () => {
    setTestState({ phase: "testing" });
    try {
      let result = await testConnection({
        baseUrl: config.baseUrl,
        model: config.model,
        apiKey: config.apiKey,
      });
      saveBackendVerified(config);
      setTestState({
        phase: "ok",
        message:
          "Connected · " +
          result.models.length +
          " model" +
          (result.models.length === 1 ? "" : "s") +
          " listed · " +
          result.latencyMs +
          " ms" +
          (String(config.model || "").trim() && !result.modelFound
            ? " · model name not in list"
            : ""),
      });
      haptic("success");
    } catch (error) {
      setTestState({
        phase: "error",
        message: error && error.message ? error.message : "Connection failed.",
      });
      haptic("heavy");
    }
  };
  let testComfyConnection = async () => {
    setComfyTestState({ phase: "testing" });
    try {
      let result = await testComfyApi({ baseUrl: comfyConfig.baseUrl });
      saveComfyVerified(comfyConfig);
      setComfyTestState({
        phase: "ok",
        message:
          "Connected · ComfyUI " +
          (result.version ? "v" + result.version : "reachable") +
          " · " +
          result.latencyMs +
          " ms",
      });
      haptic("success");
    } catch (error) {
      setComfyTestState({
        phase: "error",
        message: error && error.message ? error.message : "Connection failed.",
      });
      haptic("heavy");
    }
  };
  useEffect(() => {
    let root = document.documentElement,
      clean = () => {
        delete root.dataset.drawerDragging;
        delete root.dataset.drawerSettling;
        root.style.removeProperty("--drawer-progress");
        root.style.removeProperty("--drawer-translate");
        root.style.removeProperty("--drawer-shift");
        root.style.removeProperty("--drawer-scale");
      },
      paint = (progress) => {
        progress = Math.max(0, Math.min(1, progress));
        root.style.setProperty("--drawer-progress", progress);
        root.style.setProperty(
          "--drawer-translate",
          (progress - 1) * 100 + "%",
        );
        root.style.setProperty("--drawer-shift", 24 * progress + "px");
        root.style.setProperty("--drawer-scale", 1 - 0.02 * progress);
      },
      down = (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        let target = e.target,
          drawerOpen = overlay && overlay.type === "drawer";
        if (!drawerOpen) {
          if (
            tab !== "chat" ||
            e.clientX > 20 ||
            target.closest("button,input,textarea")
          )
            return;
          root.dataset.drawerDragging = "true";
          paint(0);
          drawerGesture.current = {
            mode: "open",
            startX: e.clientX,
            startY: e.clientY,
            lastX: e.clientX,
            lastAt: performance.now(),
            progress: 0,
            moved: false,
          };
          openOverlay({ type: "drawer" }, null);
        } else {
          if (!target.closest(".drawer") || target.closest("input")) return;
          drawerGesture.current = {
            mode: "close",
            startX: e.clientX,
            startY: e.clientY,
            lastX: e.clientX,
            lastAt: performance.now(),
            progress: 1,
            moved: false,
          };
        }
      },
      move = (e) => {
        let g = drawerGesture.current;
        if (!g) return;
        let dx = e.clientX - g.startX,
          dy = e.clientY - g.startY;
        if (!g.moved) {
          if (Math.abs(dy) > Math.abs(dx) + 5) {
            drawerGesture.current = null;
            if (g.mode === "open") clean();
            return;
          }
          if (Math.abs(dx) < 6) return;
          g.moved = true;
          root.dataset.drawerDragging = "true";
        }
        if (!g.moved) return;
        e.preventDefault();
        let drawer = document.querySelector(".drawer"),
          width = drawer
            ? drawer.offsetWidth
            : Math.min(innerWidth * 0.88, 380),
          progress = g.mode === "open" ? dx / width : 1 + dx / width;
        g.progress = Math.max(0, Math.min(1, progress));
        g.velocity =
          (e.clientX - g.lastX) / Math.max(1, performance.now() - g.lastAt);
        g.lastX = e.clientX;
        g.lastAt = performance.now();
        paint(g.progress);
      },
      up = (e) => {
        let g = drawerGesture.current;
        if (!g) return;
        drawerGesture.current = null;
        if (!g.moved) {
          if (g.mode === "open") {
            clean();
            setOverlay(null);
          }
          return;
        }
        e.preventDefault();
        let shouldOpen =
          g.mode === "open"
            ? g.velocity > 0.42 || g.progress > 0.46
            : !(g.velocity < -0.42 || g.progress < 0.64);
        delete root.dataset.drawerDragging;
        root.dataset.drawerSettling = "true";
        paint(shouldOpen ? 1 : 0);
        setTimeout(
          () => {
            if (!shouldOpen) setOverlay(null);
            clean();
          },
          shouldOpen ? 320 : 260,
        );
      };
    window.addEventListener("pointerdown", down, { passive: true });
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up, { passive: false });
    window.addEventListener("pointercancel", up, { passive: false });
    return () => {
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [overlay, tab]);
  let switchThread = (id) => {
    setThreadLoading(true);
    finalizeStream(true);
    stopTyping();
    if (recording) stopRecording("discard");
    let all = storage.get("drafts", {});
    all[activeRef.current] = {
      text: draft,
      previews: previews.map((p) => ({ ...p, url: p.dataUrl || p.url })),
      replying,
    };
    storage.set("drafts", all);
    audioUrls.current.forEach((url) => URL.revokeObjectURL(url));
    audioUrls.current.clear();
    setThreads((list) =>
      list.map((t) => ({
        ...t,
        messages: t.messages.map((m) =>
          m.audioBlob
            ? {
                ...m,
                audioUrl: t.id === id ? createAudioUrl(m.audioBlob) : null,
              }
            : m,
        ),
      })),
    );
    let saved = all[id] || { text: "", previews: [], replying: null };
    setDraft(saved.text || "");
    setPreviews(saved.previews || []);
    setReplying(saved.replying || null);
    setActiveId(id);
    activeRef.current = id;
    setMessageQuery("");
    setSearchOpen(false);
    setPicker(null);
    setTab("chat");
    closeOverlay(false);
    stickRef.current = true;
    setAway(false);
    setNewCount(0);
    haptic("light");
    setTimeout(() => setThreadLoading(false), 300);
    requestAnimationFrame(() => scrollLatest(false));
  };
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    // Edge-to-edge on Android: the status and gesture bars sit over Sol's own colours, so their
    // icons follow the theme (plugins/sol-edge). A no-op in a browser.
    if (window.Capacitor?.isNativePlatform?.()) {
      SolEdge.setBarStyle({ dark: theme === "dark" }).catch(() => {});
      SolEdge.getInsets().catch(() => {});
    }
    storage.set("theme", theme);
    let meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === "light" ? "#f1f1f4" : "#131315";
  }, [theme]);
  useEffect(() => {
    storage.set("streamReplies", streamingEnabled);
  }, [streamingEnabled]);
  useEffect(() => {
    storage.set("collapseLong", collapseLong);
  }, [collapseLong]);
  useEffect(() => {
    saveBackendConfig(config);
  }, [config]);
  useEffect(() => {
    saveComfyConfig(comfyConfig);
  }, [comfyConfig]);
  useEffect(() => {
    storage.set("haptics", haptics);
  }, [haptics]);
  useEffect(() => {
    storage.set("pins", pins);
  }, [pins]);
  useEffect(() => {
    storage.set("stars", stars);
  }, [stars]);
  useEffect(() => {
    clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      let all = storage.get("drafts", {});
      all[activeId] = {
        text: draft,
        previews: previews.map((p) => ({ ...p, url: p.dataUrl || p.url })),
        replying,
      };
      storage.set("drafts", all);
    }, 180);
    return () => clearTimeout(draftTimer.current);
  }, [activeId, draft, previews, replying]);
  useEffect(() => {
    setSearchIndex((i) => Math.max(0, Math.min(i, searchResults.length - 1)));
  }, [messageQuery, searchResults.length]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(toastTimer.current);
      clearTimeout(longTimer.current);
      clearTimeout(typingTimer.current);
      clearTimeout(replyTimer.current);
      clearTimeout(focusTimer.current);
      cancelAnimationFrame(rubberFrame.current);
      if (streamRef.current) clearTimeout(streamRef.current.timer);
      generationTimers.current.forEach(clearTimeout);
      objectUrls.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrls.current.clear();
      audioUrls.current.forEach((url) => URL.revokeObjectURL(url));
      audioUrls.current.clear();
      clearTimeout(draftTimer.current);
      clearInterval(recordTimerRef.current);
      cancelAnimationFrame(recordFrameRef.current);
      if (recordStreamRef.current)
        recordStreamRef.current.getTracks().forEach((track) => track.stop());
      if (audioContextRef.current)
        audioContextRef.current.close().catch(() => {});
    };
  }, []);
  useEffect(() => {
    let onKey = (e) => {
      if (!overlay) return;
      if (e.key === "Escape") {
        e.preventDefault();
        closeOverlay();
        return;
      }
      if (e.key === "Tab") {
        let layer = document.querySelector(
          '[data-overlay="' + overlay.type + '"]',
        );
        if (!layer) return;
        let focusable = Array.from(
          layer.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
          ),
        ).filter((node) => node.offsetParent !== null);
        if (!focusable.length) return;
        let first = focusable[0],
          last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [overlay]);
  useViewportHeight({ overlay, closeOverlay, resetRubber });
  useLayoutEffect(() => {
    if (stickRef.current) requestAnimationFrame(() => scrollLatest(false));
  }, [activeId]);
  useEffect(() => {
    let el = textareaRef.current,
      backdrop = backdropRef.current;
    if (el) {
      el.style.height = "0px";
      let height = Math.min(el.scrollHeight, 112) + "px";
      el.style.height = height;
      if (backdrop) {
        backdrop.style.height = height;
        backdrop.scrollTop = el.scrollTop;
        backdrop.scrollLeft = el.scrollLeft;
      }
    }
  }, [draft]);
  useEffect(() => {
    if (!picker) return;
    let dismiss = (e) => {
      if (
        !e.target.closest("[data-autocomplete]") &&
        e.target !== textareaRef.current
      )
        setPicker(null);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [picker]);
  useEffect(() => {
    if (picker && pickerIndex >= pickerItems.length)
      setPickerIndex(Math.max(0, pickerItems.length - 1));
  }, [picker && picker.query, pickerItems.length]);
  useEffect(() => {
    if (!overlay) return;
    let frame = requestAnimationFrame(() => {
      let layer = document.querySelector(
        '[data-overlay="' + overlay.type + '"]',
      );
      let target =
        layer &&
        layer.querySelector(
          'button:not([disabled]), input, textarea, [tabindex="0"]',
        );
      if (target) target.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [overlay && overlay.type]);
  useEffect(() => {
    if (!streamingEnabled && streamRef.current) finalizeStream(true);
    if (!streamingEnabled && backendAbort.current) {
      backendAbort.current.abort();
      backendAbort.current = null;
    }
  }, [streamingEnabled]);
  let handleScroll = () => {
    cancelLongPress();
    if (overlay && overlay.type === "menu") closeOverlay(false);
    resetRubber();
    let el = chatRef.current;
    if (!el) return;
    let distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    let isAway = distance > 600;
    stickRef.current = distance < 120;
    setAway(isAway);
    if (!isAway) setNewCount(0);
  };
  let markLatestDelivered = (threadId) =>
    updateThread(threadId, (list) => {
      let copy = list.slice();
      for (let i = copy.length - 1; i >= 0; i--)
        if (copy[i].role === "user") {
          copy[i] = { ...copy[i], status: "delivered" };
          break;
        }
      return copy;
    });
  let startReply = (text, threadId) => {
    stopTyping();
    markLatestDelivered(threadId);
    let id = "r" + Date.now() + Math.random().toString(36).slice(2, 6),
      at = nowIso();
    let append = () => {
      let wasNear = activeRef.current === threadId && isNearBottom();
      updateThread(threadId, (list) => [
        ...list,
        {
          id,
          role: "assistant",
          text: streamingEnabled && !reduceMotion() ? "" : text,
          at,
          streaming: streamingEnabled && !reduceMotion(),
        },
      ]);
      if (activeRef.current === threadId) {
        if (wasNear) {
          stickRef.current = true;
          requestAnimationFrame(() => scrollLatest(true));
        } else setNewCount((n) => n + 1);
      }
    };
    if (!streamingEnabled || reduceMotion()) {
      append();
      return;
    }
    setStreaming(true);
    append();
    let words = text.split(" "),
      index = 0,
      current = { id, threadId, full: text, timer: null };
    streamRef.current = current;
    let tick = () => {
      if (!mounted.current || streamRef.current !== current) return;
      if (index >= words.length) {
        streamRef.current = null;
        setStreaming(false);
        updateThread(threadId, (list) =>
          list.map((m) => (m.id === id ? { ...m, streaming: false } : m)),
        );
        return;
      }
      let count = 2 + Math.floor(Math.random() * 3),
        chunk = words.slice(index, index + count).join(" ");
      index += count;
      updateThread(threadId, (list) =>
        list.map((m) =>
          m.id === id
            ? { ...m, text: m.text + (m.text ? " " : "") + chunk }
            : m,
        ),
      );
      current.timer = setTimeout(tick, 36 + Math.random() * 45);
    };
    tick();
  };
  let scheduleReply = (text, threadId) => {
    stopTyping();
    setTyping(true);
    typingTimer.current = setTimeout(() => {
      if (!mounted.current || activeRef.current !== threadId) {
        setTyping(false);
        return;
      }
      setTyping(false);
      startReply(text, threadId);
    }, 700);
  };
  // Recent plain-text conversation turns for the backend API (cap ~20).
  let historyFor = (threadId, extra = []) => {
    let prior = (threads.find((t) => t.id === threadId) || {}).messages || [];
    return [...prior, ...extra]
      .filter(
        (m) =>
          (m.role === "user" || m.role === "assistant") &&
          m.text &&
          !m.image &&
          !m.streaming &&
          m.errorState !== "error",
      )
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.text }));
  };
  // Real backend round trip. Demo mode keeps the canned path in send().
  let backendSend = async ({ prompt, threadId, cfg, history, retryOf = null, noOverride = false }) => {
    // One request at a time: a second send while waiting used to stack requests (both replies
    // landed, and a third hit the gateway's 429 busy_caller). Stop the earlier one first.
    if (backendAbort.current) {
      backendAbort.current.abort();
      backendAbort.current = null;
    }
    // The thread's own model, if one was picked. `baseCfg` (the saved default) is what gets marked
    // verified: verifying the override made Settings show the default as untested (review).
    let baseCfg = cfg,
      // noOverride: the fallback below. threadModels is this render's copy, so after dropping the
      // override it would still name the removed model - re-sending without this flag looped
      // forever (review, PR #9).
      overridden = !noOverride && isGatewayUrl(cfg.baseUrl) && threadModels[threadId];
    if (overridden) cfg = { ...cfg, model: threadModels[threadId] };
    finalizeStream(true);
    stopTyping();
    let id = "r" + Date.now() + Math.random().toString(36).slice(2, 6),
      useStream = streamingEnabled && !reduceMotion(),
      controller = new AbortController();
    backendAbort.current = controller;
    markLatestDelivered(threadId);
    if (retryOf) {
      updateThread(threadId, (list) =>
        list.map((m) => (m.id === retryOf ? { ...m, errorState: "retrying" } : m)),
      );
    }
    let fail = (error) => {
      if (backendAbort.current === controller) backendAbort.current = null;
      setStreaming(false);
      setTyping(false);
      if (error && error.code === "aborted") return;
      // The model this chat was set to is gone from the gateway (removed from models.json): drop
      // the override and answer with the default instead of failing every message (review).
      if (overridden && error && error.apiCode === "unknown_model" && !retryOf) {
        dropThreadModel(threadId);
        notify("That model isn't available any more. Using the default.");
        if (useStream) updateThread(threadId, (list) => list.filter((m) => m.id !== id));   // no empty bubble
        backendSend({ prompt, threadId, cfg: baseCfg, history, retryOf, noOverride: true });
        return;
      }
      haptic("heavy");
      notify("Backend error");
      let detail =
        error && error.message ? error.message : "The backend request failed.";
      if (useStream) {
        updateThread(threadId, (list) =>
          list.filter((m) => m.id !== id),
        );
      }
      if (retryOf) {
        updateThread(threadId, (list) =>
          list.map((m) =>
            m.id === retryOf ? { ...m, errorState: "error", text: detail } : m,
          ),
        );
      } else {
        addAssistant(detail, threadId, {
          errorState: "error",
          backendRetry: { prompt, threadId },
        });
      }
    };
    try {
      if (useStream) {
        let at = nowIso(),
          current = { id, threadId, full: "", timer: null };
        setStreaming(true);
        updateThread(threadId, (list) => [
          ...list.filter((m) => m.id !== retryOf),
          { id, role: "assistant", text: "", at, streaming: true },
        ]);
        streamRef.current = current;
        let text = await sendChatCompletion({
          baseUrl: cfg.baseUrl,
          model: cfg.model,
          apiKey: cfg.apiKey,
          gateway: isGatewayUrl(cfg.baseUrl),
          // The gateway and nginx allow 10 minutes; a whole reply from the 35B can need more
          // than the 2-minute default before anything at all comes back
          timeoutMs: isGatewayUrl(cfg.baseUrl) ? 600000 : undefined,
          messages: history,
          stream: true,
          signal: controller.signal,
          onToken: (token) => {
            if (streamRef.current !== current) return;
            current.full += token;
            updateThread(threadId, (list) =>
              list.map((m) =>
                m.id === id ? { ...m, text: m.text + token } : m,
              ),
            );
          },
        });
        if (streamRef.current !== current) return;
        streamRef.current = null;
        if (backendAbort.current === controller) backendAbort.current = null;
        setStreaming(false);
        updateThread(threadId, (list) =>
          list.map((m) =>
            m.id === id
              ? { ...m, text: current.full || text, streaming: false }
              : m,
          ),
        );
        saveBackendVerified(baseCfg);
        haptic("success");
      } else {
        setTyping(true);
        let text = await sendChatCompletion({
          baseUrl: cfg.baseUrl,
          model: cfg.model,
          apiKey: cfg.apiKey,
          gateway: isGatewayUrl(cfg.baseUrl),
          // The gateway and nginx allow 10 minutes; a whole reply from the 35B can need more
          // than the 2-minute default before anything at all comes back
          timeoutMs: isGatewayUrl(cfg.baseUrl) ? 600000 : undefined,
          messages: history,
          stream: false,
          signal: controller.signal,
        });
        if (!mounted.current) return;
        if (backendAbort.current === controller) backendAbort.current = null;
        if (retryOf) {
          updateThread(threadId, (list) =>
            list.filter((m) => m.id !== retryOf),
          );
        }
        saveBackendVerified(baseCfg);
        haptic("success");
        startReply(text || "The backend returned an empty reply.", threadId);
      }
    } catch (error) {
      fail(error);
    }
  };
  // Retry router: backend failures re-send through the client, demo ones
  // keep the prototype retry behavior.
  let retryMessage = (message) => {
    if (message && message.backendRetry) {
      let { prompt, threadId } = message.backendRetry;
      backendSend({
        prompt,
        threadId,
        cfg: getBackendConfig(),
        history: historyFor(threadId),
        retryOf: message.id,
      });
      return;
    }
    retryDemo(message);
  };
  let send = () => {
    let stamp = Date.now();
    let text = draft.trim();
    if ((!text && !previews.length) || previews.some((p) => !p.dataUrl)) return;
    setPicker(null);
    if (
      !previews.length &&
      demoCommands.some(
        (item) => item.name === (text.match(/^#\S+/) || [""])[0].toLowerCase(),
      )
    ) {
      executeDemo(text);
      return;
    }
    if (text.startsWith("/") && !previews.length) {
      executeCommand(text);
      return;
    }
    finalizeStream(true);
    stopTyping();
    let threadId = activeRef.current,
      at = nowIso(),
      items = [];
    if (text)
      items.push({
        id: "m" + stamp,
        role: "user",
        text,
        tokens: tokenizeMentions(text),
        at,
        status: "sent",
        reply: replying && replying.text,
      });
    previews.forEach((p, i) =>
      items.push(
        p.kind && p.kind !== "image"
          ? {
              id: "i" + stamp + i,
              role: "user",
              text:
                "[" + (p.kind === "video" ? "Video" : "File") + "] " + p.name,
              at,
              status: "sent",
            }
          : {
              id: "i" + stamp + i,
              role: "user",
              image: p.dataUrl,
              name: p.name,
              at,
              status: "sent",
            },
      ),
    );
    updateThread(threadId, (list) => [...list, ...items]);
    revokePreviews();
    setDraft("");
    setReplying(null);
    stickRef.current = true;
    setAway(false);
    setNewCount(0);
    haptic("success");
    requestAnimationFrame(() => scrollLatest(true));
    if (text) {
      if (isDemoMode(config)) {
        let answer =
          cannedReplies[replyIndex.current++ % cannedReplies.length];
        replyTimer.current = setTimeout(
          () => scheduleReply(answer, threadId),
          180,
        );
      } else {
        backendSend({
          prompt: text,
          threadId,
          cfg: config,
          history: historyFor(threadId, items),
        });
      }
    }
  };
  let stopStream = (node) => {
    if (backendAbort.current) {
      backendAbort.current.abort();
      backendAbort.current = null;
    }
    finalizeStream(false);
    haptic("medium", node);
    notify("Response stopped");
  };
  let showMessageMenu = (message, node, x, y) => {
    let rect = node.getBoundingClientRect();
    suppressTap.current = Date.now() + 700;
    openOverlay(
      {
        type: "menu",
        messageId: message.id,
        pinned: (pins[activeId] || []).includes(message.id),
        starred: (stars[activeId] || []).includes(message.id),
        role: message.role,
        isImage: !!message.image,
        at: message.at,
        anchor: {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        },
        x,
        y,
      },
      node,
    );
  };
  let pointerDown = (e, message) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    cancelLongPress();
    let record = {
      id: message.id,
      sx: e.clientX,
      sy: e.clientY,
      target: e.currentTarget,
      long: false,
      threshold: false,
    };
    gesture.current = record;
    longTimer.current = setTimeout(() => {
      if (gesture.current !== record) return;
      record.long = true;
      record.target.style.transform = "";
      record.target.classList.remove("long-press-confirmed");
      void record.target.offsetWidth;
      record.target.classList.add("long-press-confirmed");
      setTimeout(
        () => record.target && record.target.classList.remove("long-press-confirmed"),
        reduceMotion() ? 0 : 360,
      );
      haptic("medium", record.target);
      showMessageMenu(message, record.target, e.clientX, e.clientY);
    }, 500);
  };
  let pointerMove = (e, message) => {
    let record = gesture.current;
    if (!record || record.id !== message.id) return;
    let dx = e.clientX - record.sx,
      dy = e.clientY - record.sy;
    if (Math.hypot(dx, dy) > 10) {
      clearTimeout(longTimer.current);
      longTimer.current = null;
    }
    if (Math.abs(dy) > 8) {
      record.target.style.transform = "";
      return;
    }
    let direction = message.role === "user" ? -dx : dx;
    if (direction > 0 && !record.long) {
      record.target.style.transform = `translateX(${Math.min(direction * 0.4, 36) * (message.role === "user" ? -1 : 1)}px)`;
      if (direction > 65 && !record.threshold) {
        record.threshold = true;
        haptic("heavy", record.target);
      }
    }
  };
  let pointerEnd = (e, message) => {
    clearTimeout(longTimer.current);
    longTimer.current = null;
    let record = gesture.current;
    if (!record) return;
    if (record.target) record.target.style.transform = "";
    if (record.threshold && !record.long) {
      setReplying(message);
      textareaRef.current && textareaRef.current.focus();
    }
    gesture.current = null;
  };
  let messageContext = (e, message) => {
    e.preventDefault();
    cancelLongPress();
    showMessageMenu(message, e.currentTarget, e.clientX, e.clientY);
  };
  let menuAction = (action, value) => {
    let menu = overlay;
    if (!menu || menu.type !== "menu") return;
    let message = messages.find((m) => m.id === menu.messageId);
    if (!message) return;
    let text = message.text || message.caption || "",
      download = (blob, name) => {
        let url = URL.createObjectURL(blob),
          a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
      };
    if (action === "reaction") {
      let removing = message.reaction === value;
      if (removing) {
        updateActive((list) =>
          list.map((m) =>
            m.id === message.id ? { ...m, reactionRemoving: true } : m,
          ),
        );
        setTimeout(
          () =>
            mounted.current &&
            updateActive((list) =>
              list.map((m) =>
                m.id === message.id
                  ? { ...m, reaction: null, reactionRemoving: false }
                  : m,
              ),
            ),
          reduceMotion() ? 0 : 150,
        );
      } else
        updateActive((list) =>
          list.map((m) =>
            m.id === message.id
              ? { ...m, reaction: value, reactionRemoving: false }
              : m,
          ),
        );
    }
    if (action === "reply") {
      setReplying(message);
      setTimeout(() => textareaRef.current && textareaRef.current.focus(), 0);
    }
    if (action === "copy" || action === "copy-text") {
      if (navigator.clipboard && text)
        navigator.clipboard
          .writeText(text)
          .then(() => notify("Copied"))
          .catch(() => notify("Copy unavailable"));
      else notify("Copy unavailable");
    }
    if (action === "star") {
      setStars((all) => {
        let ids = all[activeId] || [],
          next = ids.includes(message.id)
            ? ids.filter((id) => id !== message.id)
            : [...ids, message.id];
        return { ...all, [activeId]: next };
      });
    }
    if (action === "pin") {
      setPins((all) => {
        let ids = all[activeId] || [],
          next = ids.includes(message.id)
            ? ids.filter((id) => id !== message.id)
            : [...ids, message.id];
        return { ...all, [activeId]: next };
      });
    }
    if (action === "forward") {
      let sender = message.role === "assistant" ? assistantName(activeId) : "You",
        body = text || "[Image]";
      setDraft(
        "Forwarded from " + sender + ":\n> " + body.replace(/\n/g, "\n> "),
      );
      setTimeout(() => textareaRef.current && textareaRef.current.focus(), 0);
      notify("Ready to forward");
    }
    if (action === "export-markdown") {
      let sender = message.role === "assistant" ? assistantName(activeId) : "You",
        body =
          "# Message from " +
          sender +
          "\n\n" +
          new Date(message.at).toLocaleString() +
          "\n\n" +
          (message.image ? "[Image] " + (message.caption || "") : text);
      download(
        new Blob([body], { type: "text/markdown;charset=utf-8" }),
        "sol-message-" + message.id + ".md",
      );
      notify("Markdown exported");
    }
    if (action === "select") {
      let row = document.querySelector(
        '[data-message-id="' + CSS.escape(message.id) + '"]',
      );
      if (row) {
        row.classList.add("search-hit");
        setTimeout(() => row.classList.remove("search-hit"), 900);
      }
      notify("Message selected");
    }
    if (action === "save-image" && message.image) {
      if (value === "markdown") {
        download(
          new Blob(
            ["# Shared image\n\n" + (message.caption || "Image message")],
            { type: "text/markdown;charset=utf-8" },
          ),
          "sol-image-" + message.id + ".md",
        );
        notify("Markdown exported");
      } else
        downloadImageSource(message.image, value)
          .then(() => notify((value === "jpg" ? "JPG" : "PNG") + " saved"))
          .catch(() => notify("Image export unavailable"));
    }
    if (action === "delete") {
      if (message.audioUrl) {
        URL.revokeObjectURL(message.audioUrl);
        audioUrls.current.delete(message.audioUrl);
      }
      setPins((all) => ({
        ...all,
        [activeId]: (all[activeId] || []).filter((id) => id !== message.id),
      }));
      setStars((all) => ({
        ...all,
        [activeId]: (all[activeId] || []).filter((id) => id !== message.id),
      }));
      updateActive((list) =>
        list.map((m) => (m.id === message.id ? { ...m, deleting: true } : m)),
      );
      setTimeout(
        () =>
          mounted.current &&
          updateActive((list) => list.filter((m) => m.id !== message.id)),
        220,
      );
    }
    haptic(action === "delete" ? "heavy" : "light");
    closeOverlay();
  };
  let chooseFiles = (mode = "photos") => {
    let input = document.createElement("input"),
      camera = mode === "camera";
    input.type = "file";
    input.accept =
      camera || mode === "photos"
        ? "image/*"
        : mode === "videos"
          ? "video/*"
          : "*/*";
    input.multiple = !camera;
    if (camera) input.setAttribute("capture", "environment");
    input.onchange = () => {
      let files = Array.from(input.files || []);
      files.forEach((file) => {
        let url = URL.createObjectURL(file);
        objectUrls.current.add(url);
        let kind = file.type.startsWith("image/")
            ? "image"
            : file.type.startsWith("video/")
              ? "video"
              : "file",
          item = {
            id: "p" + Date.now() + Math.random(),
            name: file.name,
            url,
            dataUrl: null,
            kind,
          };
        setPreviews((list) => [...list, item]);
        let reader = new FileReader();
        reader.onload = () =>
          mounted.current &&
          setPreviews((list) =>
            list.map((p) =>
              p.id === item.id ? { ...p, dataUrl: reader.result } : p,
            ),
          );
        reader.onerror = () => {
          if (objectUrls.current.has(url)) {
            URL.revokeObjectURL(url);
            objectUrls.current.delete(url);
          }
          setPreviews((list) => list.filter((p) => p.id !== item.id));
          notify("That file could not be read");
        };
        reader.readAsDataURL(file);
      });
    };
    input.click();
    closeOverlay(false);
  };
  let attachCodexFile = (file) => {
    let dataUrl =
      "data:text/markdown;charset=utf-8," +
      encodeURIComponent("# " + file.name.replace(/\.md$/i, "") + "\n\nPrototype Codex attachment.");
    setPreviews((list) => [
      ...list,
      {
        id: "codex" + Date.now(),
        name: file.name,
        url: dataUrl,
        dataUrl,
        kind: "file",
        source: "codex",
      },
    ]);
    closeOverlay(false);
    notify(file.name + " attached");
    haptic("light");
  };
  let removePreview = (id) =>
    setPreviews((list) => {
      let item = list.find((p) => p.id === id);
      if (item && objectUrls.current.has(item.url)) {
        URL.revokeObjectURL(item.url);
        objectUrls.current.delete(item.url);
      }
      return list.filter((p) => p.id !== id);
    });
  // Real image generation through the configured ComfyUI server. Progress
  // labels mirror the simulated flow so the generation card UI is unchanged.
  let generateImageReal = async (prompt) => {
    let id = "g" + Date.now();
    generationTimers.current.forEach(clearTimeout);
    generationTimers.current = [];
    if (comfyAbort.current) {
      try {
        comfyAbort.current.abort();
      } catch (error) {}
    }
    let controller = new AbortController();
    comfyAbort.current = controller;
    let labels = ["Sending prompt", "Queued", "Sampling", "Decoding", "Loading image"],
      report = (label) => {
        if (mounted.current)
          setGeneration({ id, step: Math.max(0, labels.indexOf(label)), label });
      };
    report(labels[0]);
    setImagePrompt("");
    try {
      let { blob } = await generateComfyImage({
        baseUrl: comfyConfig.baseUrl,
        model: comfyConfig.model,
        prompt,
        width: comfyConfig.width,
        height: comfyConfig.height,
        steps: comfyConfig.steps,
        signal: controller.signal,
        onProgress: (step) =>
          report(
            {
              sending: labels[0],
              queued: labels[1],
              sampling: labels[2],
              decoding: labels[3],
              loading: labels[4],
            }[step] || labels[2],
          ),
      });
      if (!mounted.current) return;
      let url = URL.createObjectURL(blob);
      objectUrls.current.add(url);
      updateActive((list) => [
        ...list,
        {
          id,
          role: "assistant",
          image: url,
          caption: "Generated with " + comfyConfig.model,
          at: nowIso(),
        },
      ]);
      setGeneration(null);
      stickRef.current = true;
      requestAnimationFrame(() => scrollLatest(true));
      haptic("success");
    } catch (error) {
      if (!mounted.current) return;
      setGeneration(null);
      if (error && error.code === "aborted") return; // superseded; stay quiet
      addSystem(
        "Couldn't generate the image: " +
          (error && error.message ? error.message : "Unknown error."),
      );
      haptic("heavy");
    } finally {
      if (comfyAbort.current === controller) comfyAbort.current = null;
    }
  };
  // Simulated fallback used only while no ComfyUI server is configured.
  // It says what it is ("Prototype preview — not a real generation").
  let generateImageSimulated = (prompt) => {
    let id = "g" + Date.now(),
      timers = [];
    setGeneration({ id, step: 0, label: "Queued" });
    ["Queued", "Encoding prompt", "Sampling", "Decoding"].forEach(
      (label, index) => {
        timers.push(
          setTimeout(
            () => mounted.current && setGeneration({ id, step: index, label }),
            index * 900,
          ),
        );
      },
    );
    timers.push(
      setTimeout(() => {
        if (!mounted.current) return;
        let canvas = document.createElement("canvas");
        canvas.width = 900;
        canvas.height = 650;
        let ctx = canvas.getContext("2d"),
          hash = 0;
        for (let char of prompt) hash = (hash * 31 + char.charCodeAt(0)) | 0;
        let hue = Math.abs(hash) % 360,
          gradient = ctx.createLinearGradient(0, 0, 900, 650);
        gradient.addColorStop(0, `hsl(${hue} 70% 62%)`);
        gradient.addColorStop(0.5, `hsl(${(hue + 55) % 360} 62% 42%)`);
        gradient.addColorStop(1, `hsl(${(hue + 180) % 360} 65% 20%)`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 900, 650);
        for (let i = 0; i < 120; i++) {
          let x = (Math.sin(hash + i * 77) * 0.5 + 0.5) * 900,
            y = (Math.cos(hash + i * 39) * 0.5 + 0.5) * 650;
          ctx.fillStyle = `hsla(${(hue + i * 7) % 360} 80% 80% / .08)`;
          ctx.beginPath();
          ctx.arc(x, y, 10 + (i % 8) * 10, 0, Math.PI * 2);
          ctx.fill();
        }
        updateActive((list) => [
          ...list,
          {
            id,
            role: "assistant",
            image: canvas.toDataURL("image/jpeg", 0.88),
            caption: "Prototype preview — not a real generation",
            at: nowIso(),
          },
        ]);
        setGeneration(null);
        setImagePrompt("");
        stickRef.current = true;
        requestAnimationFrame(() => scrollLatest(true));
        haptic("success");
      }, 3900),
    );
    generationTimers.current = timers;
  };
  // Dispatcher: real ComfyUI generation when a server is configured, the
  // honest simulated preview otherwise.
  let generateImage = (promptOverride) => {
    let prompt = (
      typeof promptOverride === "string" ? promptOverride : imagePrompt
    ).trim();
    if (!prompt) return;
    closeOverlay(false);
    setTab("chat");
    if (isComfyUnconfigured(comfyConfig)) generateImageSimulated(prompt);
    else generateImageReal(prompt);
  };
  let createChat = (kind = "dm", confirmation) => {
    finalizeStream(true);
    stopTyping();
    revokePreviews();
    let id = "new" + Date.now(),
      participants =
        kind === "group"
          ? [
              ASSISTANT,
              { name: "Ava Chen", initials: "AC", color: "#9d8cff" },
              { name: "Marcus Webb", initials: "MW", color: "#63d6a2" },
            ]
          : kind === "a2a"
            ? [
                ASSISTANT,
                { name: "Ion", initials: "I", color: "#9d8cff" },
              ]
            : [ASSISTANT],
      title = kind === "group" ? "New group" : kind === "a2a" ? "New A2A chat" : "New conversation",
      starter =
        kind === "group"
          ? { role: "assistant", sender: "Ava Chen", text: "Group created. What should we work through together?" }
          : kind === "a2a"
            ? { role: "assistant", sender: "Qubit", text: "A2A channel ready. Share a task when you want the agents to coordinate." }
            : null,
      messages = [];
    if (typeof confirmation === "string")
      messages.push({ id: "s" + Date.now(), role: "system", text: confirmation, at: nowIso() });
    if (starter)
      messages.push({ id: "welcome" + Date.now(), at: nowIso(), ...starter });
    setThreads((list) => [
      {
        id,
        type: kind,
        title,
        preview: starter ? starter.text : "Start something new",
        time: "Now",
        group: "Today",
        participants,
        messages,
      },
      ...list,
    ]);
    activeRef.current = id;
    setActiveId(id);
    setDraft("");
    setPreviews([]);
    setReplying(null);
    setMessageQuery("");
    setSearchOpen(false);
    setPicker(null);
    setTab("chat");
    closeOverlay(false);
    setTimeout(() => textareaRef.current && textareaRef.current.focus(), 180);
  };
  let openNewChat = (node) => openOverlay({ type: "new-chat" }, node);
  let addSystem = (text, threadId = activeRef.current) => {
    updateThread(threadId, (list) => [
      ...list,
      {
        id: "s" + Date.now() + Math.random().toString(36).slice(2, 5),
        role: "system",
        text,
        at: nowIso(),
      },
    ]);
    stickRef.current = true;
    requestAnimationFrame(() => scrollLatest(true));
  };
  let addAssistant = (text, threadId = activeRef.current, extra = {}) => {
    updateThread(threadId, (list) => [
      ...list,
      {
        id: "r" + Date.now() + Math.random().toString(36).slice(2, 5),
        role: "assistant",
        text,
        at: nowIso(),
        ...extra,
      },
    ]);
    stickRef.current = true;
    requestAnimationFrame(() => scrollLatest(true));
  };
  let forceDemoStream = (text) => {
    finalizeStream(true);
    stopTyping();
    let threadId = activeRef.current,
      id = "d" + Date.now(),
      words = text.split(" "),
      index = 0,
      current = { id, threadId, full: text, timer: null };
    setStreaming(true);
    updateThread(threadId, (list) => [
      ...list,
      { id, role: "assistant", text: "", at: nowIso(), streaming: true },
    ]);
    streamRef.current = current;
    let tick = () => {
      if (!mounted.current || streamRef.current !== current) return;
      if (index >= words.length) {
        streamRef.current = null;
        setStreaming(false);
        updateThread(threadId, (list) =>
          list.map((m) => (m.id === id ? { ...m, streaming: false } : m)),
        );
        return;
      }
      let chunk = words.slice(index, index + 2).join(" ");
      index += 2;
      updateThread(threadId, (list) =>
        list.map((m) =>
          m.id === id
            ? { ...m, text: m.text + (m.text ? " " : "") + chunk }
            : m,
        ),
      );
      current.timer = setTimeout(tick, 55);
    };
    tick();
    requestAnimationFrame(() => scrollLatest(true));
  };
  let chooseChip = (message, label) => {
    if (message.chipsUsed) return;
    let threadId = activeRef.current,
      stamp = Date.now();
    updateThread(threadId, (list) => [
      ...list.map((m) => (m.id === message.id ? { ...m, chipsUsed: true } : m)),
      {
        id: "qc" + stamp,
        role: "user",
        text: label,
        at: nowIso(),
        status: "sent",
      },
    ]);
    haptic("light");
    requestAnimationFrame(() => scrollLatest(true));
    let timer = setTimeout(() => {
      markLatestDelivered(threadId);
      addAssistant(
        label === "Polish UI"
          ? "Perfect. I’ll focus on the interaction details, spacing, and visual hierarchy first."
          : label === "New feature"
            ? "Great. Tell me the outcome you want, and I’ll shape the feature around it."
            : "Got it. Show me what feels wrong and I’ll trace it from the interaction back to the cause.",
        threadId,
      );
    }, 650);
    generationTimers.current.push(timer);
  };
  let retryDemo = (message) => {
    updateActive((list) =>
      list.map((m) =>
        m.id === message.id
          ? {
              ...m,
              errorState: "retrying",
              text: "Retrying the prototype request…",
            }
          : m,
      ),
    );
    let timer = setTimeout(
      () =>
        updateActive((list) =>
          list.map((m) =>
            m.id === message.id
              ? {
                  ...m,
                  errorState: "success",
                  text: "Retry succeeded. The prototype response is ready.",
                }
              : m,
          ),
        ),
      900,
    );
    generationTimers.current.push(timer);
    haptic("light");
  };
  let demoHelp =
    "Prototype demos:\n#thinking — thinking phases\n#typing — typing indicator\n#stream — forced streaming\n#image — image generation flow\n#code — syntax-highlighted code block\n#input — quick replies\n#reactions — reaction stack\n#reply — quoted reply\n#voice — playable voice bubble\n#link — rich link preview\n#error — retryable error\n#system — system row\n#long — long message\n#help — this list";
  let executeDemo = (raw) => {
    let name = (raw.trim().match(/^#\S+/) || ["#help"])[0].toLowerCase();
    setDraft("");
    setReplying(null);
    setPicker(null);
    haptic("light");
    if (name === "#help") {
      addAssistant(demoHelp);
      return;
    }
    if (name === "#typing") {
      stopTyping();
      setTyping(true);
      let timer = setTimeout(() => {
        setTyping(false);
        addAssistant(
          "Typing demo complete — this message arrived through the normal conversation flow.",
        );
      }, 3000);
      typingTimer.current = timer;
      return;
    }
    if (name === "#thinking") {
      let threadId = activeRef.current,
        id = "think" + Date.now(),
        phases = ["Thinking…", "Searching memory…", "Weighing options…"];
      addAssistant(phases[0], threadId, { id, thinking: true });
      phases
        .slice(1)
        .forEach((phase, i) =>
          generationTimers.current.push(
            setTimeout(
              () =>
                updateThread(threadId, (list) =>
                  list.map((m) => (m.id === id ? { ...m, text: phase } : m)),
                ),
              (i + 1) * 1100,
            ),
          ),
        );
      generationTimers.current.push(
        setTimeout(() => {
          updateThread(threadId, (list) => list.filter((m) => m.id !== id));
          addAssistant(
            "The clearest next move is to choose one small, visible improvement and finish it before widening the scope.",
            threadId,
          );
        }, 3900),
      );
      return;
    }
    if (name === "#stream") {
      forceDemoStream(
        "Here’s a longer streaming response to show how Qubit can reveal an answer at a measured pace while keeping the conversation readable. The animation is intentionally calm, and it works even when the regular streaming preference is turned off.",
      );
      return;
    }
    if (name === "#image") {
      addSystem("Starting the prototype image workflow…");
      generateImage(
        "a calm mobile chat interface with warm light and clean blue accents",
      );
      return;
    }
    if (name === "#code") {
      addAssistant(
        "Here’s a compact JavaScript example:\n\n```javascript\nconst summarizeTask = (task) => {\n  if (!task.steps.length) return \"Ready to start\";\n  return `${task.steps.filter(step => step.done).length}/${task.steps.length} complete`;\n};\n```\n\nUse the copy button to grab the snippet.",
      );
      return;
    }
    if (name === "#input") {
      addAssistant("What should we work on?", activeRef.current, {
        chips: ["Polish UI", "New feature", "Fix a bug"],
      });
      return;
    }
    if (name === "#reactions") {
      addAssistant(
        "This message arrived with a little feedback already attached.",
        activeRef.current,
        { reactions: ["👍 3", "❤️ 2", "✨ 1"] },
      );
      return;
    }
    if (name === "#reply") {
      addAssistant(
        "Exactly — this keeps the context visible without interrupting the flow.",
        activeRef.current,
        { reply: "You: Could replies keep the original context nearby?" },
      );
      return;
    }
    if (name === "#voice") {
      addAssistant("", activeRef.current, { demoTone: true, duration: 8 });
      return;
    }
    if (name === "#link") {
      addAssistant(
        "This is how Qubit can keep a useful source close to the conversation: **clear context**, a short summary, and a direct path to the original.",
        activeRef.current,
        {
          linkPreview: {
            url: "https://example.com/",
            domain: "example.com",
            title: "A calmer way to structure chat",
            description: "Sample preview metadata for the prototype link card.",
            demo: true,
          },
        },
      );
      return;
    }
    if (name === "#error") {
      addAssistant(
        "The prototype request couldn’t complete.",
        activeRef.current,
        { errorState: "error" },
      );
      return;
    }
    if (name === "#system") {
      addSystem("Prototype mode · Conversation context refreshed");
      return;
    }
    if (name === "#long") {
      addAssistant(
        "A thoughtful response sometimes needs room to breathe. The first step is to name the outcome clearly, because a clear outcome makes every later choice easier to evaluate.\n\nNext, separate what must happen from what would merely be nice to have. That distinction keeps a promising idea from becoming an overloaded plan.\n\nThen choose the smallest useful version you can finish and test. A finished small version teaches more than a large unfinished one.\n\nFinally, leave yourself a short note about what changed, what still feels uncertain, and what the next decision should be. That makes it much easier to return without rebuilding the whole context in your head.",
      );
      return;
    }
    addAssistant("Unknown prototype demo. Try #help.");
  };
  let commandHelp =
    "Available commands:\n/imagine <prompt> — generate an image with ComfyUI\n/theme <dark|light> — switch theme\n/stream <on|off> — toggle streaming\n/haptics <on|off> — toggle haptics\n/new — start a new chat\n/clear — clear this thread\n/help — show this list";
  let executeCommand = (raw) => {
    let match = raw.trim().match(/^\/(\S+)(?:\s+([\s\S]*))?$/),
      name = match ? "/" + match[1].toLowerCase() : "/",
      arg = match && match[2] ? match[2].trim() : "";
    setDraft("");
    setReplying(null);
    setPicker(null);
    haptic("light");
    if (name === "/new") {
      createChat("dm", "Started a new chat");
      return;
    }
    if (name === "/clear") {
      let threadId = activeRef.current;
      updateThread(threadId, (list) =>
        list.map((message) => ({ ...message, deleting: true })),
      );
      setTimeout(
        () =>
          mounted.current &&
          updateThread(threadId, () => [
            {
              id: "s" + Date.now(),
              role: "system",
              text: "Conversation cleared",
              at: nowIso(),
            },
          ]),
        240,
      );
      return;
    }
    if (name === "/help") {
      addAssistant(commandHelp);
      return;
    }
    if (name === "/theme") {
      let value = arg.toLowerCase();
      if (value !== "dark" && value !== "light") {
        addAssistant("Use /theme dark or /theme light.");
        return;
      }
      setTheme(value);
      addSystem("Theme set to " + value);
      return;
    }
    if (name === "/stream") {
      let value = arg.toLowerCase();
      if (value !== "on" && value !== "off") {
        addAssistant("Use /stream on or /stream off.");
        return;
      }
      let enabled = value === "on";
      setStreamingEnabled(enabled);
      addSystem("Streaming turned " + value);
      return;
    }
    if (name === "/haptics") {
      let value = arg.toLowerCase();
      if (value !== "on" && value !== "off") {
        addAssistant("Use /haptics on or /haptics off.");
        return;
      }
      let enabled = value === "on";
      setHaptics(enabled);
      addSystem("Haptics turned " + value);
      if (enabled) setTimeout(() => haptic("medium"), 0);
      return;
    }
    if (name === "/imagine") {
      if (!arg) {
        setDraft("/imagine ");
        setTimeout(() => textareaRef.current && textareaRef.current.focus(), 0);
        addAssistant(
          "Add a prompt after /imagine and send it when you’re ready.",
        );
        return;
      }
      addSystem(
        isComfyUnconfigured(comfyConfig)
          ? "Creating a prototype image…"
          : "Generating an image with ComfyUI…",
      );
      generateImage(arg);
      return;
    }
    addAssistant("I don’t know " + name + " — try /help");
  };
  let selectPicker = (item) => {
    if (!picker) return;
    if (picker.type === "mention") {
      let inserted = "@" + item.name + " ",
        next =
          draft.slice(0, picker.start) + inserted + draft.slice(picker.end),
        caret = picker.start + inserted.length;
      setDraft(next);
      setPicker(null);
      haptic("light");
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(caret, caret);
        }
      });
      return;
    }
    setPicker(null);
    if (picker.type === "demo") {
      executeDemo(item.name);
      return;
    }
    if (item.args) {
      let next = item.name + " ";
      setDraft(next);
      haptic("light");
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(next.length, next.length);
        }
      });
    } else executeCommand(item.name);
  };
  let composerKeyDown = (e) => {
    if (picker && pickerItems.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setPickerIndex(
          (index) =>
            (index + (e.key === "ArrowDown" ? 1 : -1) + pickerItems.length) %
            pickerItems.length,
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectPicker(pickerItems[pickerIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setPicker(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      let touchComposer =
        navigator.maxTouchPoints > 0 ||
        matchMedia("(pointer: coarse)").matches ||
        matchMedia("(max-width: 700px)").matches;
      if (touchComposer) return;
      e.preventDefault();
      send();
    }
  };
  let tabTo = (next, node) => {
    if (next !== "chat") {
      finalizeStream(true);
      stopTyping();
      revokePreviews();
    }
    setTab(next);
    closeOverlay(false);
    haptic("light", node);
  };
  let rubberStart = (e) => {
    if (overlay) return;
    let el = chatRef.current;
    if (!el) return;
    rubber.current = {
      y: e.touches[0].clientY,
      edge:
        el.scrollTop <= 0
          ? "top"
          : el.scrollTop >= el.scrollHeight - el.clientHeight - 1
            ? "bottom"
            : null,
    };
  };
  let rubberMove = (e) => {
    let state = rubber.current;
    if (!state || !state.edge) return;
    let delta = e.touches[0].clientY - state.y;
    if (
      (state.edge === "top" && delta > 0) ||
      (state.edge === "bottom" && delta < 0)
    ) {
      let amount =
        Math.sign(delta) * Math.min(70, Math.pow(Math.abs(delta), 0.78) * 0.32);
      cancelAnimationFrame(rubberFrame.current);
      rubberFrame.current = requestAnimationFrame(() => {
        if (contentRef.current) {
          contentRef.current.style.transition = "none";
          contentRef.current.style.transform = `translateY(${amount}px)`;
        }
      });
    }
  };
  let openViewer = (src, node, message) => {
    if (Date.now() < suppressTap.current) return;
    if (document.activeElement) document.activeElement.blur();
    setZoomed(false);
    openOverlay(
      { type: "viewer", src, messageId: message && message.id },
      node,
    );
    haptic("light", node);
  };
  let viewerAction = async (action) => {
    let viewer = overlay;
    if (!viewer || viewer.type !== "viewer") return;
    if (action === "download") {
      try {
        await downloadImageSource(viewer.src, "png");
        notify("Image downloaded");
      } catch (error) {
        notify("Image download failed");
      }
      return;
    }
    if (action === "share") {
      try {
        let response = await fetch(viewer.src),
          blob = await response.blob(),
          file = new File([blob], "sol-image.png", {
            type: blob.type || "image/png",
          });
        if (
          navigator.share &&
          (!navigator.canShare || navigator.canShare({ files: [file] }))
        )
          await navigator.share({ files: [file], title: "Image from Sol" });
        else throw new Error("unavailable");
      } catch (e) {
        notify("Sharing unavailable here");
      }
      return;
    }
    if (action === "delete" && viewer.messageId) {
      let id = viewer.messageId;
      closeOverlay(false);
      setPins((all) => ({
        ...all,
        [activeId]: (all[activeId] || []).filter((item) => item !== id),
      }));
      setStars((all) => ({
        ...all,
        [activeId]: (all[activeId] || []).filter((item) => item !== id),
      }));
      updateActive((list) =>
        list.map((m) => (m.id === id ? { ...m, deleting: true } : m)),
      );
      setTimeout(
        () =>
          mounted.current &&
          updateActive((list) => list.filter((m) => m.id !== id)),
        220,
      );
      haptic("heavy");
    }
  };
  let addIdea = () => {
    let text = ideaDraft.trim();
    if (!text) return;
    setIdeas((list) => [{ id: Date.now(), text }, ...list]);
    setIdeaDraft("");
    notify("Idea added for this session");
    haptic("success");
  };
  let prepareChat = (text) => {
    setDraft(text);
    setTab("chat");
    setTimeout(() => textareaRef.current && textareaRef.current.focus(), 0);
  };
  let titleMap = {
    agents: ["Agents", "Your fleet and its shared desk"],
    library: ["Library", "Your conversations with Qubit"],
    ideas: ["Ideas", "Thoughts worth returning to"],
    goals: ["Goals", "What you’re moving toward"],
    more: ["More", "Settings and preferences"],
  };
  let title = titleMap[tab];
  return createElement("div", {
    className: "app-shell",
    children: [
      createElement("header", {
        inert: Boolean(agentOpen),
        className: "app-header",
        children: [
          tab === "chat"
            ? createElement(Fragment, {
                children: [
                  createElement(ButtonUtility, {
                    className: "round-button menu-button",
                    label: "Open conversations",
                    icon: "menu",
                    size: 20,
                    onClick: (e) =>
                      openOverlay({ type: "drawer" }, e.currentTarget),
                  }),
                  createElement("div", {
                    className: "identity",
                    children: [
                      activeThread && activeThread.type !== "dm" && activeThread.participants
                        ? createElement("div", {
                            className: "avatar-stack",
                            "aria-label": activeThread.participants.map((p) => p.name).join(", "),
                            children: activeThread.participants.slice(0, 3).map((participant, participantIndex) =>
                              createElement("span", {
                                className: "avatar stacked-avatar",
                                style: { background: participant.color, marginLeft: participantIndex ? -18 : 0, zIndex: 4 - participantIndex },
                                children: participant.initials,
                              }, participant.name),
                            ),
                          })
                        : createElement("div", {
                            className: "avatar",
                            children: assistantName(activeId).slice(0, 1).toUpperCase(),
                          }),
                      createElement("div", {
                        className: "identity-copy",
                        children: [
                          createElement("div", {
                            className: "title-line",
                            children: [
                              createElement("h1", {
                                children:
                                  activeThread && activeThread.type !== "dm"
                                    ? activeThread.title
                                    : assistantName(activeId),
                              }),
                            ],
                          }),
                          // On the gateway, a one-to-one chat shows WHICH local model is
                          // answering, and tapping it switches models for this chat
                          viaGateway && !typing && !streaming && (!activeThread || activeThread.type === "dm")
                            ? createElement("button", {
                                type: "button",
                                className: "status model-chip",
                                "aria-haspopup": "dialog",
                                // Label-in-name: the accessible name starts with the visible text
                                "aria-label": chipText(activeId) + ", change model",
                                onClick: (e) => openOverlay({ type: "model" }, e.currentTarget),
                                children: [
                                  createElement("span", {
                                    className: "status-dot",
                                  }),
                                  createElement("span", {
                                    className: "status-copy",
                                    children: chipText(activeId),
                                  }),
                                  createElement(Icon, { name: "chevron", size: 14 }),
                                ],
                              })
                            : createElement("div", {
                            className: "status",
                            children: [
                              createElement("span", {
                                className:
                                  "status-dot " + (typing ? "typing" : ""),
                              }),
                              createElement("span", {
                                className:
                                  "status-copy " + (typing ? "is-typing" : ""),
                                children: typing
                                  ? approvalsHere
                                    ? "Needs approval"
                                    : assistantName(activeId) + " is typing"
                                  : streaming
                                    ? "Responding"
                                    : activeThread && activeThread.type !== "dm"
                                      ? activeThread.type === "a2a"
                                        ? activeThread.participants.length + " agents"
                                        : activeThread.participants.length + " participants"
                                      : threadPins.length
                                        ? threadPins.length + " pinned"
                                        : "Online",
                              }),
                            ],
                          }),
                        ],
                      }),
                    ],
                  }),
                ],
              })
            : createElement("div", {
                className: "header-title",
                children: [
                  createElement("h1", { children: title[0] }),
                  createElement("p", { children: title[1] }),
                ],
              }),
          createElement("div", {
            className: "header-actions",
            children: [
              tab === "chat"
                ? createElement("button", {
                    className: "new-chat-pill",
                    "aria-label": "Start a new chat",
                    onClick: (e) => openNewChat(e.currentTarget),
                    children: [
                      createElement(Icon, { name: "newchat", size: 17 }),
                      createElement("span", { children: "New chat" }),
                    ],
                  })
                : createElement(Fragment, {
                    children: [
                      createElement(ButtonUtility, {
                        className: "round-button",
                        label:
                          "Switch to " +
                          (theme === "dark" ? "light" : "dark") +
                          " theme",
                        icon: theme === "dark" ? "moon" : "sun",
                        size: 19,
                        onClick: (e) => {
                          setTheme(theme === "dark" ? "light" : "dark");
                          haptic("medium", e.currentTarget);
                        },
                      }),
                    ],
                  }),
            ],
          }),
          tab === "chat" &&
            searchOpen &&
            createElement(Fragment, {
              children: [
                createElement("div", {
                  className: "message-search",
                  children: [
                    createElement(Icon, { name: "search", size: 17 }),
                    createElement("input", {
                      value: messageQuery,
                      onChange: (e) => {
                        setMessageQuery(e.target.value);
                        setSearchIndex(0);
                      },
                      onKeyDown: (e) => {
                        if (e.key === "Escape") toggleSearch();
                      },
                      placeholder: "Search this conversation",
                      "aria-label": "Search this conversation",
                    }),
                    messageQuery &&
                      createElement("button", {
                        className: "search-clear",
                        onClick: () => {
                          setMessageQuery("");
                          setSearchIndex(0);
                        },
                        "aria-label": "Clear search",
                        children: createElement(Icon, { name: "x", size: 15 }),
                      }),
                    createElement("span", {
                      className: "search-count",
                      children: searchResults.length
                        ? searchIndex + 1 + " of " + searchResults.length
                        : "0 of 0",
                    }),
                    createElement("button", {
                      onClick: () => moveSearch(-1),
                      disabled: !searchResults.length,
                      "aria-label": "Previous match",
                      children: "↑",
                    }),
                    createElement("button", {
                      onClick: () => moveSearch(1),
                      disabled: !searchResults.length,
                      "aria-label": "Next match",
                      children: "↓",
                    }),
                  ],
                }),
                messageQuery.trim() &&
                  createElement("div", {
                    className: "search-results",
                    children: searchResults.slice(0, 4).map((m, i) =>
                      createElement(
                        "button",
                        {
                          className:
                            "search-result " +
                            (i === searchIndex ? "active" : ""),
                          onClick: () => {
                            setSearchIndex(i);
                            jumpToMessage(m.id);
                          },
                          children: [
                            createElement("b", {
                              children:
                                m.role === "assistant"
                                  ? assistantName(activeId)
                                  : m.role === "user"
                                    ? "You"
                                    : "System",
                            }),
                            createElement("span", {
                              children: highlightQuery(
                                m.text || m.caption || "Voice message",
                              ),
                            }),
                            createElement("time", {
                              children: timeLabel(m.at),
                            }),
                          ],
                        },
                        m.id,
                      ),
                    ),
                  }),
              ],
            }),
          tab === "chat" &&
            latestPin &&
            createElement("button", {
              className: "pinned-bar",
              onClick: () => jumpToMessage(latestPin.id),
              children: [
                createElement(Icon, { name: "pin", size: 15 }),
                createElement("b", { children: "Pinned" }),
                createElement("span", {
                  children:
                    latestPin.text || latestPin.caption || "Voice message",
                }),
              ],
            }),
        ],
      }),
      createElement("main", {
        className: "screens",
        inert: Boolean(agentOpen),
        children: [
          createElement("section", {
            className: "screen chat-screen " + (tab === "chat" ? "active" : ""),
            ref: chatRef,
            onScroll: handleScroll,
            onTouchStart: rubberStart,
            onTouchMove: rubberMove,
            onTouchEnd: resetRubber,
            onTouchCancel: resetRubber,
            children: createElement("div", {
              className: "chat-content",
              ref: contentRef,
              children: [
                threadLoading &&
                  createElement("div", {
                    className: "thread-skeleton",
                    "aria-label": "Loading conversation",
                    children: [
                      createElement("div", { className: "skeleton-line" }),
                      createElement("div", { className: "skeleton-line" }),
                      createElement("div", { className: "skeleton-line" }),
                    ],
                  }),
                !messages.length &&
                  createElement("div", {
                    className: "new-chat",
                    children: [
                      createElement("div", {
                        className: "sun-mark",
                        children: ASSISTANT.initials,
                      }),
                      createElement("h2", { children: "What’s on your mind?" }),
                      createElement("p", {
                        children: "Start rough. I’ll help you find the shape.",
                      }),
                      createElement("div", {
                        className: "suggestions",
                        children: [
                          createElement("button", {
                            onClick: () =>
                              prepareChat("Help me decide what to focus on"),
                            children: "Choose a focus",
                          }),
                          createElement("button", {
                            onClick: () =>
                              prepareChat("I want to develop an idea"),
                            children: "Develop an idea",
                          }),
                          createElement("button", {
                            onClick: () => prepareChat("Help me plan my week"),
                            children: "Plan my week",
                          }),
                        ],
                      }),
                    ],
                  }),
                messages.map((message, index) => {
                  let prev = messages[index - 1],
                    next = messages[index + 1],
                    newDay = !prev || dayKey(prev.at) !== dayKey(message.at),
                    samePrev =
                      prev &&
                      !newDay &&
                      prev.role === message.role &&
                      (prev.sender || "") === (message.sender || ""),
                    sameNext =
                      next &&
                      dayKey(next.at) === dayKey(message.at) &&
                      next.role === message.role &&
                      (next.sender || "") === (message.sender || "");
                  return createElement(
                    Fragment,
                    {
                      children: [
                        newDay &&
                          createElement("div", {
                            className: "day-divider",
                            children: dayLabel(message.at),
                          }),
                        createElement(Message, {
                          message,
                          index,
                          groupedTop: !!samePrev,
                          groupedBottom: !!sameNext,
                          begin: pointerDown,
                          move: pointerMove,
                          end: pointerEnd,
                          context: messageContext,
                          openImage: openViewer,
                          renderTokens,
                          pinned: threadPins.includes(message.id),
                          starred: threadStars.includes(message.id),
                          chooseChip,
                          retryDemo: retryMessage,
                          showSender: !!(activeThread && activeThread.type !== "dm"),
                          collapseLong,
                        }),
                      ],
                    },
                    message.id,
                  );
                }),
                typing &&
                  createElement("div", {
                    className: "message-row assistant entering grouped-top",
                    "aria-label": assistantName(activeId) + " is typing",
                    children: createElement("div", {
                      className: "bubble typing-bubble",
                      children: [
                        createElement("span", {}),
                        createElement("span", {}),
                        createElement("span", {}),
                      ],
                    }),
                  }),
                approvalsHere &&
                  createElement(ApprovalStack, {
                    approvals: warden.approvals,
                    decide: warden.decide,
                    canDecide: warden.canDecide,
                  }),
                generation &&
                  createElement("div", {
                    className: "message-row assistant entering",
                    children: createElement("div", {
                      className: "generation-card",
                      children: [
                        createElement("div", { className: "shimmer" }),
                        createElement("strong", { children: generation.label }),
                        createElement("span", {
                          children: "Prototype image workflow",
                        }),
                        createElement("div", {
                          className: "progress",
                          children: createElement("i", {
                            style: { width: (generation.step + 1) * 25 + "%" },
                          }),
                        }),
                      ],
                    }),
                  }),
              ],
            }),
          }),
          createElement(ErrorBoundary, {
            label: "The Agents tab",
            // The screen element must stay in the tree even after a crash, or tab switching breaks
            quiet: tab !== "agents",
            children: createElement(AgentsScreen, {
              active: tab === "agents",
              fleetState,
              open: setAgentOpen,
            }),
          }),
          createElement(LibraryScreen, {
            active: tab === "library",
            threads,
            choose: switchThread,
          }),
          createElement(IdeasScreen, {
            active: tab === "ideas",
            ideas,
            draft: ideaDraft,
            setDraft: setIdeaDraft,
            add: addIdea,
            inputRef: ideaRef,
          }),
          createElement(GoalsScreen, {
            active: tab === "goals",
            start: () =>
              prepareChat("Help me choose the next step for my goals"),
          }),
          createElement(SettingsScreen, {
            active: tab === "more",
            streaming: streamingEnabled,
            setStreaming: (value, node) => {
              setStreamingEnabled(value);
              haptic("medium", node);
            },
            collapseLong,
            setCollapseLong: (value, node) => {
              setCollapseLong(value);
              haptic("medium", node);
            },
            haptics,
            setHaptics: (value, node) => {
              setHaptics(value);
              if (value) haptic("medium", node);
            },
            theme,
            setTheme: (value) => {
              setTheme(value);
              haptic("medium");
            },
            openConfig: openBackendConfig,
            openConnectors: (node) => openOverlay({ type: "mcp" }, node),
            openSkills: (node) => openOverlay({ type: "skills" }, node),
            backendStatus,
          }),
        ],
      }),
      tab === "chat" &&
        createElement("div", {
          className: "composer-zone",
          inert: Boolean(agentOpen),
          children: [
            createElement(Autocomplete, {
              picker,
              items: pickerItems,
              activeIndex: pickerIndex,
              select: selectPicker,
            }),
            replying &&
              createElement("div", {
                className: "reply-banner",
                children: [
                  createElement("span", {
                    children: [
                      createElement("b", {
                        children: [
                          "Replying to ",
                          replying.role === "assistant" ? assistantName(activeId) : "you",
                        ],
                      }),
                      replying.text && replying.text.slice(0, 90),
                    ],
                  }),
                  createElement("button", {
                    onClick: () => setReplying(null),
                    "aria-label": "Cancel reply",
                    children: createElement(Icon, { name: "x", size: 18 }),
                  }),
                ],
              }),
            previews.length > 0 &&
              createElement("div", {
                className: "preview-strip",
                children: previews.map((item) =>
                  createElement(
                    "div",
                    {
                      className: "preview",
                      children: [
                        item.kind && item.kind !== "image"
                          ? createElement("span", {
                              className: "file-preview",
                              children: [
                                createElement(Icon, {
                                  name:
                                    item.kind === "video" ? "video" : "file",
                                  size: 22,
                                }),
                                createElement("small", { children: item.name }),
                              ],
                            })
                          : createElement("img", {
                              src: item.url,
                              alt: item.name,
                            }),
                        !item.dataUrl &&
                          createElement("span", {
                            className: "preview-loading",
                            children: "…",
                          }),
                        createElement("button", {
                          onClick: () => removePreview(item.id),
                          "aria-label": "Remove " + item.name,
                          children: createElement(Icon, {
                            name: "x",
                            size: 14,
                          }),
                        }),
                      ],
                    },
                    item.id,
                  ),
                ),
              }),
            // Also while waiting on a whole (non-streamed) reply - the default since streaming went
            // off - or a long answer from the 35B could not be stopped at all (review, PR #12)
            (streaming || (typing && backendAbort.current)) &&
              createElement("button", {
                className: "stop-button",
                onClick: (e) => stopStream(e.currentTarget),
                children: [createElement("span", {}), " Stop generating"],
              }),
            recording
              ? createElement("div", {
                  className: "recording-composer",
                  "aria-label": "Recording voice message",
                  children: [
                    createElement(ButtonUtility, {
                      className: "round-button record-cancel",
                      label: "Discard recording",
                      icon: "trash",
                      color: "danger",
                      tooltipSide: "top",
                      onClick: () => stopRecording("discard"),
                    }),
                    createElement("span", { className: "record-dot" }),
                    createElement("div", {
                      className: "record-wave",
                      "aria-hidden": "true",
                      children: recording.bars.map((height, i) =>
                        createElement(
                          "i",
                          { style: { height: height + "px" } },
                          i,
                        ),
                      ),
                    }),
                    createElement("span", {
                      className: "record-time",
                      children: formatDuration(recording.elapsed),
                    }),
                    createElement(ButtonUtility, {
                      className: "round-button send-button",
                      label: "Send voice message",
                      icon: "send",
                      tooltipSide: "top",
                      onClick: () => stopRecording("send"),
                    }),
                  ],
                })
              : createElement("form", {
                  className: "composer",
                  onSubmit: (e) => {
                    e.preventDefault();
                    send();
                  },
                  children: [
                    createElement(ButtonUtility, {
                      className: "round-button",
                      label: "Add attachment",
                      icon: "plus",
                      tooltipSide: "top",
                      onClick: (e) =>
                        openOverlay({ type: "attach" }, e.currentTarget),
                    }),
                    createElement("div", {
                      className: "composer-input",
                      children: [
                        createElement("div", {
                          className: "composer-backdrop",
                          ref: backdropRef,
                          "aria-hidden": "true",
                          children: renderComposerTokens(draft),
                        }),
                        createElement("textarea", {
                          ref: textareaRef,
                          rows: 1,
                          value: draft,
                          placeholder: "Message — use @, /, or #",
                          "aria-label": "Message " + assistantName(activeId),
                          "aria-autocomplete": "list",
                          "aria-expanded": !!(picker && pickerItems.length),
                          "aria-controls":
                            picker && pickerItems.length
                              ? "composer-suggestions"
                              : undefined,
                          "aria-activedescendant":
                            picker && pickerItems.length
                              ? "suggestion-" + pickerIndex
                              : undefined,
                          onChange: (e) => {
                            setDraft(e.target.value);
                            updatePicker(
                              e.target.value,
                              e.target.selectionStart,
                            );
                          },
                          onClick: (e) =>
                            updatePicker(
                              e.currentTarget.value,
                              e.currentTarget.selectionStart,
                            ),
                          onScroll: (e) => syncComposerScroll(e.currentTarget),
                          onKeyDown: composerKeyDown,
                        }),
                      ],
                    }),
                    createElement(ComposerActionButton, {
                      sendMode: !!(draft.trim() || previews.length),
                      disabled: previews.some((p) => !p.dataUrl),
                      onRecord: (e) => startRecording(e.currentTarget),
                    }),
                  ],
                }),
          ],
        }),
      away &&
        tab === "chat" &&
        createElement("button", {
          className: "jump-latest",
          onClick: () => scrollLatest(true),
          "aria-label": newCount
            ? `Jump to latest, ${newCount} new message${newCount === 1 ? "" : "s"}`
            : "Jump to latest",
          children: [
            createElement("span", { children: "↓" }),
            newCount ? createElement("b", { children: newCount }) : "Latest",
          ],
        }),
      !agentOpen &&
        createElement(ErrorBoundary, {
          quiet: true,
          label: "The handoff banner",
          children: createElement(HandoffBanner, {
            data: fleetState.data,
            open: setAgentOpen,
          }),
        }),
      // Through the overlay system like every other dialog, so it gets initial focus, the Tab
      // trap, an inert background and focus back on the chip when it closes (review, PR #7)
      overlay &&
        overlay.type === "model" &&
        createElement(ModelSheet, {
          gatewayBase: gwBase,
          current: modelFor(activeId),
          choose: (id) => chooseModel(activeId, id),
          close: closeOverlay,
        }),
      agentOpen &&
        createElement(ErrorBoundary, {
          label: "This agent",
          overlay: true,
          close: () => setAgentOpen(null),
          children: createElement(AgentSheet, {
            agentId: agentOpen,
            fleetState,
            close: () => setAgentOpen(null),
          }),
        }),
      createElement("nav", {
        className: "tabbar",
        inert: Boolean(agentOpen),
        "aria-label": "Main navigation",
        children: [
          ["chat", "Chat"],
          ["agents", "Agents"],
          ["library", "Library"],
          ["ideas", "Ideas"],
          ["goals", "Goals"],
          ["more", "More"],
        ].map(([key, label]) =>
          createElement(
            "button",
            {
              className: "tab " + (tab === key ? "active" : ""),
              "aria-label": label,
              title: label,
              "aria-current": tab === key ? "page" : undefined,
              onClick: (e) => tabTo(key, e.currentTarget),
              children: createElement(Icon, {
                name: tab === key ? key + "Filled" : key,
              }),
            },
            key,
          ),
        ),
      }),
      overlay &&
        overlay.type === "drawer" &&
        createElement(Drawer, {
          threads,
          search: drawerSearch,
          setSearch: setDrawerSearch,
          close: closeOverlay,
          choose: switchThread,
          newChat: (e) => openNewChat(e.currentTarget),
          settings: () => {
            setTab("more");
            closeOverlay(false);
          },
          exportChat,
          activeId,
          draft,
        }),
      overlay &&
        overlay.type === "menu" &&
        createElement(ContextMenu, {
          menu: overlay,
          act: menuAction,
          dismiss: closeOverlay,
        }),
      overlay &&
        overlay.type === "attach" &&
        createElement(AttachSheet, {
          close: closeOverlay,
          photos: () => chooseFiles("photos"),
          camera: () => chooseFiles("camera"),
          videos: () => chooseFiles("videos"),
          files: () => chooseFiles("files"),
          codex: () => openOverlay({ type: "codex" }, null),
        }),
      overlay &&
        overlay.type === "new-chat" &&
        createElement(Dialog, {
          title: "Start a conversation",
          close: closeOverlay,
          type: "new-chat",
          children: [
            createElement("p", {
              className: "dialog-note",
              children: "Choose who will be part of this prototype conversation.",
            }),
            createElement("div", {
              className: "choice-list",
              children: [
                ["dm", "chat", "Direct message", "A one-to-one conversation with Qubit"],
                ["group", "users", "Group chat", "You, Qubit, and mock collaborators"],
                ["a2a", "agent", "A2A chat", "A shared channel for mock agents"],
              ].map(([kind, icon, label, note]) =>
                createElement("button", {
                  className: "choice-row",
                  onClick: () => createChat(kind),
                  children: [
                    createElement("span", { className: "choice-icon", children: createElement(Icon, { name: icon, size: 19 }) }),
                    createElement("span", { children: [createElement("b", { children: label }), createElement("small", { children: note })] }),
                    createElement("em", { "aria-hidden": "true", children: "›" }),
                  ],
                }, kind),
              ),
            }),
          ],
        }),
      overlay &&
        overlay.type === "codex" &&
        createElement(Dialog, {
          title: "Upload from Codex",
          close: closeOverlay,
          type: "codex",
          children: [
            createElement("p", {
              className: "dialog-note",
              children: "Prototype picker · Choose a mock file to attach.",
            }),
            createElement("div", {
              className: "file-picker-list",
              children: [
                { name: "Sol Product Notes.md", path: "Projects / Sol" },
                { name: "Weekly Priorities.md", path: "Planning" },
                { name: "Agent Handoff.md", path: "Team Quantum" },
              ].map((file) =>
                createElement("button", {
                  className: "file-picker-row",
                  onClick: () => attachCodexFile(file),
                  children: [
                    createElement("span", { className: "choice-icon", children: createElement(Icon, { name: "file", size: 18 }) }),
                    createElement("span", { children: [createElement("b", { children: file.name }), createElement("small", { children: file.path })] }),
                  ],
                }, file.name),
              ),
            }),
          ],
        }),
      overlay &&
        overlay.type === "mcp" &&
        createElement(Dialog, {
          title: "MCP connectors",
          close: closeOverlay,
          type: "mcp",
          children: [
            createElement("p", { className: "dialog-note", children: "Mock connector states for the prototype. No service is contacted." }),
            createElement("div", {
              className: "integration-list",
              children: mcpConnectors.map((connector) =>
                createElement("button", {
                  className: "integration-row",
                  role: "switch",
                  "aria-checked": connector.connected,
                  onClick: () => {
                    setMcpConnectors((items) => items.map((item) => item.id === connector.id ? { ...item, connected: !item.connected } : item));
                    haptic("light");
                  },
                  children: [
                    createElement("span", { className: "choice-icon", children: createElement(Icon, { name: "plug", size: 18 }) }),
                    createElement("span", { children: [createElement("b", { children: connector.name }), createElement("small", { children: (connector.connected ? "Connected · " : "Disconnected · ") + connector.note })] }),
                    createElement("i", { className: "switch " + (connector.connected ? "on" : ""), children: createElement("u", {}) }),
                  ],
                }, connector.id),
              ),
            }),
          ],
        }),
      overlay &&
        overlay.type === "skills" &&
        createElement(Dialog, {
          title: "Skills",
          close: closeOverlay,
          type: "skills",
          children: [
            createElement("p", { className: "dialog-note", children: "Mock availability controls for this prototype session." }),
            createElement("div", {
              className: "integration-list",
              children: skills.map((skill) =>
                createElement("button", {
                  className: "integration-row",
                  role: "switch",
                  "aria-checked": skill.enabled,
                  onClick: () => {
                    setSkills((items) => items.map((item) => item.id === skill.id ? { ...item, enabled: !item.enabled } : item));
                    haptic("light");
                  },
                  children: [
                    createElement("span", { className: "choice-icon", children: createElement(Icon, { name: "skill", size: 18 }) }),
                    createElement("span", { children: [createElement("b", { children: skill.name }), createElement("small", { children: (skill.enabled ? "Enabled · " : "Disabled · ") + skill.note })] }),
                    createElement("i", { className: "switch " + (skill.enabled ? "on" : ""), children: createElement("u", {}) }),
                  ],
                }, skill.id),
              ),
            }),
          ],
        }),
      overlay &&
        overlay.type === "generate" &&
        createElement(Dialog, {
          title: "Generate an image",
          close: closeOverlay,
          type: "generate",
          children: [
            createElement("p", {
              className: "dialog-note",
              children: isComfyUnconfigured(comfyConfig)
                ? "Prototype only. This creates a local visual preview; it does not contact ComfyUI. Configure a server for real generations."
                : "Real generation via ComfyUI (" +
                  comfyConfig.model +
                  ").",
            }),
            createElement("textarea", {
              className: "dialog-input",
              rows: 4,
              value: imagePrompt,
              onChange: (e) => setImagePrompt(e.target.value),
              placeholder: "Describe the image…",
              "aria-label": "Image description",
            }),
            createElement("button", {
              className: "primary-button",
              disabled: !imagePrompt.trim(),
              onClick: generateImage,
              children: isComfyUnconfigured(comfyConfig)
                ? "Generate preview"
                : "Generate with ComfyUI",
            }),
            createElement("button", {
              className: "secondary-button block",
              onClick: () => {
                setComfyTestState({ phase: "idle" });
                setOverlay({ type: "comfyui" });
              },
              children: "Image generation settings",
            }),
          ],
        }),
      overlay &&
        overlay.type === "comfyui" &&
        createElement(Dialog, {
          title: "Image generation",
          close: closeOverlay,
          type: "comfyui",
          children: [
            createElement("p", {
              className:
                "status-line " +
                (isComfyUnconfigured(comfyConfig)
                  ? "demo-status"
                  : isComfyVerified(comfyConfig)
                    ? "ok-status"
                    : ""),
              children: isComfyUnconfigured(comfyConfig)
                ? "Simulated previews. Add a ComfyUI server for real generations."
                : isComfyVerified(comfyConfig)
                  ? "Connected to ComfyUI."
                  : "ComfyUI configured — test the connection to verify.",
            }),
            createElement("label", {
              children: [
                "ComfyUI server URL",
                createElement("input", {
                  type: "text",
                  inputMode: "url",
                  value: comfyConfig.baseUrl,
                  onChange: (e) =>
                    setComfyConfig({ ...comfyConfig, baseUrl: e.target.value }),
                  placeholder: "https://host:8188",
                  autoComplete: "off",
                  autoCapitalize: "off",
                  autoCorrect: "off",
                  spellCheck: false,
                }),
              ],
            }),
            createElement("label", {
              children: [
                "Checkpoint model",
                createElement("input", {
                  type: "text",
                  value: comfyConfig.model,
                  onChange: (e) =>
                    setComfyConfig({ ...comfyConfig, model: e.target.value }),
                  placeholder: "DreamShaperXL_Lightning.safetensors",
                  autoComplete: "off",
                  autoCapitalize: "off",
                  autoCorrect: "off",
                  spellCheck: false,
                }),
              ],
            }),
            createElement("div", {
              className: "field-row",
              children: [
                createElement("label", {
                  children: [
                    "Width",
                    createElement("input", {
                      type: "number",
                      min: 64,
                      step: 64,
                      value: comfyConfig.width,
                      onChange: (e) =>
                        setComfyConfig({
                          ...comfyConfig,
                          width: e.target.value,
                        }),
                    }),
                  ],
                }),
                createElement("label", {
                  children: [
                    "Height",
                    createElement("input", {
                      type: "number",
                      min: 64,
                      step: 64,
                      value: comfyConfig.height,
                      onChange: (e) =>
                        setComfyConfig({
                          ...comfyConfig,
                          height: e.target.value,
                        }),
                    }),
                  ],
                }),
                createElement("label", {
                  children: [
                    "Steps",
                    createElement("input", {
                      type: "number",
                      min: 1,
                      max: 50,
                      value: comfyConfig.steps,
                      onChange: (e) =>
                        setComfyConfig({
                          ...comfyConfig,
                          steps: e.target.value,
                        }),
                    }),
                  ],
                }),
              ],
            }),
            createElement("button", {
              className: "secondary-button block",
              onClick: fillRecommendedComfy,
              children: "Use recommended Tritium settings",
            }),
            createElement("p", {
              className: "dialog-note",
              children:
                RECOMMENDED_COMFYUI.label +
                ": ComfyUI on Scotty's home server over Tailscale. The server needs --enable-cors-header so the app can reach it.",
            }),
            createElement("button", {
              className: "secondary-button block",
              disabled:
                comfyTestState.phase === "testing" ||
                !String(comfyConfig.baseUrl || "").trim(),
              onClick: testComfyConnection,
              children:
                comfyTestState.phase === "testing"
                  ? "Testing…"
                  : "Test connection",
            }),
            comfyTestState.phase === "error" &&
              createElement("p", {
                className: "inline-error",
                children: comfyTestState.message,
              }),
            comfyTestState.phase === "ok" &&
              createElement("p", {
                className: "inline-ok",
                children: comfyTestState.message,
              }),
            createElement("button", {
              className: "primary-button",
              onClick: () => {
                closeOverlay();
                notify("Image generation settings saved");
              },
              children: "Save",
            }),
          ],
        }),
      overlay &&
        overlay.type === "config" &&
        createElement(Dialog, {
          title: "Backend connection",
          close: closeOverlay,
          type: "config",
          children: [
            createElement("p", {
              className:
                "status-line " +
                (demoMode ? "demo-status" : backendVerified ? "ok-status" : ""),
              children: backendStatus,
            }),
            createElement("label", {
              children: [
                "Base URL",
                createElement("input", {
                  type: "text",
                  inputMode: "url",
                  value: config.baseUrl,
                  onChange: (e) =>
                    setConfig({ ...config, baseUrl: e.target.value }),
                  placeholder: "http://host:port or http://host:port/v1",
                  autoComplete: "off",
                  autoCapitalize: "off",
                  autoCorrect: "off",
                  spellCheck: false,
                }),
              ],
            }),
            createElement("label", {
              children: [
                "Model",
                createElement("div", {
                  className: "field-row",
                  children: [
                    createElement("input", {
                      type: "text",
                      value: config.model,
                      onChange: (e) =>
                        setConfig({ ...config, model: e.target.value }),
                      placeholder: "Model name",
                      autoComplete: "off",
                      autoCapitalize: "off",
                      autoCorrect: "off",
                      spellCheck: false,
                      "aria-label": "Model name",
                    }),
                    createElement("button", {
                      className: "secondary-button",
                      disabled:
                        discoverState.phase === "loading" ||
                        !String(config.baseUrl || "").trim(),
                      onClick: discoverBackendModels,
                      children:
                        discoverState.phase === "loading"
                          ? "Finding…"
                          : "Discover",
                    }),
                  ],
                }),
              ],
            }),
            discoveredModels.length > 0 &&
              createElement("label", {
                children: [
                  "Discovered models",
                  createElement("select", {
                    value: discoveredModels.includes(config.model)
                      ? config.model
                      : "",
                    onChange: (e) =>
                      e.target.value &&
                      setConfig({ ...config, model: e.target.value }),
                    children: [
                      createElement("option", {
                        value: "",
                        children: "Pick a model…",
                      }),
                      ...discoveredModels.map((id) =>
                        createElement("option", { value: id, children: id }, id),
                      ),
                    ],
                  }),
                ],
              }),
            discoverState.phase === "error" &&
              createElement("p", {
                className: "inline-error",
                children:
                  "Couldn't list models: " +
                  discoverState.message +
                  " Enter the name manually.",
              }),
            discoverState.phase === "done" &&
              createElement("p", {
                className: "inline-ok",
                children:
                  "Found " +
                  discoverState.count +
                  " model" +
                  (discoverState.count === 1 ? "" : "s") +
                  " on the backend.",
              }),
            createElement("label", {
              children: [
                "API key (optional)",
                createElement("input", {
                  type: "password",
                  value: config.apiKey,
                  onChange: (e) =>
                    setConfig({ ...config, apiKey: e.target.value }),
                  placeholder: "Leave empty if the backend needs no auth",
                  autoComplete: "off",
                }),
              ],
            }),
            createElement("button", {
              className: "secondary-button block",
              onClick: fillRecommendedBackend,
              children: "Use recommended Tritium settings",
            }),
            createElement("p", {
              className: "dialog-note",
              children:
                recommendedBackend().label +
                ": fast on-device models on Scotty's home server. No account or API key needed.",
            }),
            createElement("button", {
              className: "secondary-button block",
              disabled:
                testState.phase === "testing" ||
                !String(config.baseUrl || "").trim(),
              onClick: testBackendConnection,
              children:
                testState.phase === "testing"
                  ? "Testing…"
                  : "Test connection",
            }),
            testState.phase === "error" &&
              createElement("p", {
                className: "inline-error",
                children: testState.message,
              }),
            testState.phase === "ok" &&
              createElement("p", {
                className: "inline-ok",
                children: testState.message,
              }),
            createElement("button", {
              className: "primary-button",
              onClick: () => {
                closeOverlay();
                notify("Backend settings saved");
              },
              children: "Save",
            }),
          ],
        }),
      overlay &&
        overlay.type === "viewer" &&
        createElement("div", {
          className: "viewer",
          role: "dialog",
          "aria-modal": "true",
          "aria-label": "Image viewer",
          "data-overlay": "viewer",
          onPointerDown: (e) => {
            if (e.target === e.currentTarget) closeOverlay();
          },
          children: [
            createElement("div", {
              className: "viewer-toolbar",
              children: [
                createElement(ButtonUtility, {
                  label: "Download image",
                  icon: "download",
                  onClick: () => viewerAction("download"),
                }),
                createElement(ButtonUtility, {
                  label: "Share image",
                  icon: "share",
                  onClick: () => viewerAction("share"),
                }),
                overlay.messageId &&
                  createElement(ButtonUtility, {
                    label: "Delete image message",
                    icon: "trash",
                    color: "danger",
                    onClick: () => viewerAction("delete"),
                  }),
                createElement(ButtonUtility, {
                  label: "Close image",
                  icon: "x",
                  onClick: closeOverlay,
                }),
              ],
            }),
            createElement("img", {
              className: zoomed ? "zoomed" : "",
              src: overlay.src,
              alt: "Full-screen attachment",
              onDoubleClick: () => setZoomed(!zoomed),
            }),
            createElement("span", { children: "Double-click to zoom" }),
          ],
        }),
      createElement("div", {
        className: "toast " + (toast ? "show" : ""),
        role: "status",
        "aria-live": "polite",
        children: toast,
      }),
    ],
  });
}

export default SolApp;
