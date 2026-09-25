var nowIso = () => new Date().toISOString();
var storage = (() => {
  let memory = new Map();
  return {
    get: (key, fallback) => (memory.has(key) ? memory.get(key) : fallback),
    set: (key, value) => {
      memory.set(key, value);
      return value;
    },
    remove: (key) => memory.delete(key),
  };
})();
var atOffset = (minutes) =>
  new Date(Date.now() + minutes * 60000).toISOString();
var initialMessages = [
  {
    id: "a1",
    role: "assistant",
    text: "Hey, Scotty. What are we thinking through tonight?",
    at: atOffset(-4),
  },
  {
    id: "a2",
    role: "user",
    text: "I’ve got several projects moving at once. Can you help me decide what deserves my attention first?",
    at: atOffset(-3),
    status: "delivered",
  },
  {
    id: "a3",
    role: "assistant",
    text: "Absolutely. I’d sort them by what unlocks the most progress:\n\n• Handle anything time-sensitive.\n• Choose one meaningful win for tonight.\n• Capture the rest so none of it has to live in your head.\n\nTell me the projects, and I’ll structure the decision with you.",
    at: atOffset(-2),
  },
  {
    id: "a4",
    role: "user",
    text: "That’s exactly the kind of help I want from Sol.",
    at: atOffset(-1),
    status: "delivered",
  },
];
var initialThreads = [
  {
    id: "focus",
    type: "dm",
    title: "Choosing what comes first",
    preview: "Tell me the projects, and I’ll structure…",
    time: "Today",
    group: "Today",
    participants: [{ name: "Sol", initials: "S", color: "#f5b34f" }],
    messages: initialMessages,
  },
  {
    id: "team-room",
    type: "group",
    title: "Prototype crew",
    preview: "Ava: I’ll check the mobile states",
    time: "Today",
    group: "Today",
    participants: [
      { name: "Sol", initials: "S", color: "#f5b34f" },
      { name: "Ava Chen", initials: "AC", color: "#68b7ff" },
      { name: "Marcus Webb", initials: "MW", color: "#63d6a2" },
    ],
    messages: [
      {
        id: "grp1",
        role: "assistant",
        sender: "Ava Chen",
        text: "I’ll check the mobile states and the handoff between menus.",
        at: atOffset(-36),
      },
      {
        id: "grp2",
        role: "assistant",
        sender: "Marcus Webb",
        text: "I’ll take the code rendering pass.",
        at: atOffset(-35),
      },
      {
        id: "grp3",
        role: "user",
        text: "Great — keep it quick and cohesive.",
        at: atOffset(-34),
        status: "delivered",
      },
    ],
  },
  {
    id: "agent-room",
    type: "a2a",
    title: "Agent handoff",
    preview: "Qubit: Context package is ready",
    time: "Today",
    group: "Today",
    participants: [
      { name: "Qubit", initials: "Q", color: "#68b7ff" },
      { name: "Ion", initials: "I", color: "#9d8cff" },
      { name: "Sol", initials: "S", color: "#f5b34f" },
    ],
    messages: [
      {
        id: "a2a1",
        role: "assistant",
        sender: "Qubit",
        text: "Context package is ready for review.",
        at: atOffset(-28),
      },
      {
        id: "a2a2",
        role: "assistant",
        sender: "Ion",
        text: "I checked the dependencies. No blockers found.",
        at: atOffset(-27),
      },
    ],
  },
  {
    id: "week",
    title: "Building a calmer week",
    preview: "A simple plan with room to adjust",
    time: "Tue",
    group: "Previous 7 days",
    messages: [
      {
        id: "b1",
        role: "user",
        text: "I need a calmer shape for this week.",
        at: atOffset(-1440 * 2),
        status: "delivered",
      },
      {
        id: "b2",
        role: "assistant",
        text: "Let’s give the week three anchors, then leave deliberate room around them. What absolutely cannot move?",
        at: atOffset(-1440 * 2 + 1),
      },
    ],
  },
  {
    id: "creative",
    title: "Creative project notes",
    preview: "Three directions worth developing",
    time: "Sep 18",
    group: "Previous 7 days",
    messages: [
      {
        id: "c1",
        role: "assistant",
        text: "I kept the three strongest creative directions together. We can deepen one without losing the other two.",
        at: atOffset(-1440 * 7),
      },
      {
        id: "c2",
        role: "user",
        text: "Start with the one that has the clearest emotional center.",
        at: atOffset(-1440 * 7 + 1),
        status: "delivered",
      },
    ],
  },
];
var cannedReplies = [
  "I’m with you. Give me the rough version first — we can shape it together from there.",
  "That makes sense. Want me to turn it into a clear plan, pressure-test the idea, or just think it through with you?",
  "Got it. I’ll keep the structure on my side so you can stay focused on the idea itself.",
];
var mentionRoster = [
  { name: "Qubit", kind: "Agent" },
  { name: "Ion", kind: "Agent" },
  { name: "Quark", kind: "Agent" },
  { name: "Axiom", kind: "Agent" },
  { name: "Pulsar", kind: "Agent" },
  { name: "Zipper", kind: "Agent" },
  { name: "Neutrino", kind: "Agent" },
  { name: "Ava Chen", kind: "Contact" },
  { name: "Marcus Webb", kind: "Contact" },
];
var slashCommands = [
  {
    name: "/imagine",
    icon: "spark",
    description: "Create a prototype image from a prompt",
    args: true,
  },
  {
    name: "/theme",
    icon: "sun",
    description: "Switch between dark and light",
    args: true,
  },
  {
    name: "/stream",
    icon: "send",
    description: "Turn streaming responses on or off",
    args: true,
  },
  {
    name: "/haptics",
    icon: "settings",
    description: "Turn haptic feedback on or off",
    args: true,
  },
  {
    name: "/new",
    icon: "plus",
    description: "Start a new conversation",
    args: false,
  },
  {
    name: "/clear",
    icon: "trash",
    description: "Clear the current conversation",
    args: false,
  },
  {
    name: "/help",
    icon: "chat",
    description: "Show every available command",
    args: false,
  },
];
var demoCommands = [
  {
    name: "#thinking",
    icon: "spark",
    description: "Thinking phases, then a conclusion",
  },
  {
    name: "#typing",
    icon: "chat",
    description: "Typing indicator, then a reply",
  },
  {
    name: "#stream",
    icon: "send",
    description: "Force a long streaming response",
  },
  {
    name: "#image",
    icon: "photo",
    description: "Run the prototype image flow",
  },
  {
    name: "#code",
    icon: "file",
    description: "Syntax-highlighted code with copy",
  },
  { name: "#input", icon: "idea", description: "Ask with quick-reply choices" },
  {
    name: "#reactions",
    icon: "star",
    description: "Deliver a message with reactions",
  },
  { name: "#reply", icon: "reply", description: "Show a quoted reply" },
  {
    name: "#voice",
    icon: "mic",
    description: "Playable voice bubble with waveform",
  },
  { name: "#link", icon: "link", description: "Preview a rich embedded link" },
  { name: "#error", icon: "x", description: "Show a retryable error" },
  {
    name: "#system",
    icon: "settings",
    description: "Add a centered system update",
  },
  {
    name: "#long",
    icon: "library",
    description: "Preview collapsible long content",
  },
  { name: "#help", icon: "chat", description: "List all prototype demos" },
];
var tokenizeMentions = (text) => {
  let names = mentionRoster
      .map((item) => item.name)
      .sort((a, b) => b.length - a.length),
    pattern = new RegExp(
      "@(" +
        names
          .map((name) => name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&"))
          .join("|") +
        ")",
      "gi",
    ),
    tokens = [],
    last = 0,
    match;
  while ((match = pattern.exec(text))) {
    if (match.index > last)
      tokens.push({ type: "text", value: text.slice(last, match.index) });
    let canonical = mentionRoster.find(
      (item) => item.name.toLowerCase() === match[1].toLowerCase(),
    );
    tokens.push({
      type: "mention",
      value: "@" + (canonical ? canonical.name : match[1]),
    });
    last = match.index + match[0].length;
  }
  if (last < text.length)
    tokens.push({ type: "text", value: text.slice(last) });
  return tokens.length ? tokens : [{ type: "text", value: text }];
};
var escapeTokenPattern = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
var tokenizeComposer = (text) => {
  if (!text) return [];
  let ranges = [],
    command = text.match(/^[\/#][a-z]+/i);
  if (command)
    ranges.push({ start: 0, end: command[0].length, type: "command" });
  let names = mentionRoster
      .map((item) => item.name)
      .sort((a, b) => b.length - a.length)
      .map(escapeTokenPattern)
      .join("|"),
    pattern = new RegExp("@(?:" + names + ")(?=$|[\\s.,!?;:()\\[\\]{}])", "gi"),
    match;
  while ((match = pattern.exec(text)))
    ranges.push({
      start: match.index,
      end: match.index + match[0].length,
      type: "mention",
    });
  ranges.sort((a, b) => a.start - b.start);
  let tokens = [],
    last = 0;
  ranges.forEach((range) => {
    if (range.start < last) return;
    if (range.start > last)
      tokens.push({ type: "text", value: text.slice(last, range.start) });
    tokens.push({
      type: range.type,
      value: text.slice(range.start, range.end),
    });
    last = range.end;
  });
  if (last < text.length)
    tokens.push({ type: "text", value: text.slice(last) });
  return tokens;
};
var reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
var timeLabel = (iso) =>
  new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(
    new Date(iso),
  );
var dayKey = (iso) => {
  let d = new Date(iso);
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
};
var dayLabel = (iso) => {
  let d = new Date(iso),
    today = new Date(),
    yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(iso) === dayKey(today.toISOString())) return "Today";
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return "Yesterday";
  return new Intl.DateTimeFormat([], {
    month: "short",
    day: "numeric",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  }).format(d);
};
function rasterizeImage(source, mime = "image/png", quality = 0.92) {
  return new Promise((resolve, reject) => {
    let image = new Image();
    image.onload = () => {
      try {
        let canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        let context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas unavailable");
        context.drawImage(image, 0, 0);
        canvas.toBlob(
          (blob) =>
            blob ? resolve(blob) : reject(new Error("Image encoding failed")),
          mime,
          quality,
        );
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error("Image could not be loaded"));
    image.src = source;
  });
}
async function downloadImageSource(source, format = "png") {
  let normalized = format === "jpg" || format === "jpeg" ? "jpg" : "png",
    mime = normalized === "jpg" ? "image/jpeg" : "image/png",
    blob = await rasterizeImage(source, mime, 0.92),
    url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = "sol-image-" + Date.now() + "." + normalized;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}

export {
  nowIso,
  storage,
  atOffset,
  initialMessages,
  initialThreads,
  cannedReplies,
  mentionRoster,
  slashCommands,
  demoCommands,
  tokenizeMentions,
  tokenizeComposer,
  reduceMotion,
  timeLabel,
  dayKey,
  dayLabel,
  rasterizeImage,
  downloadImageSource,
};
