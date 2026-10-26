import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ASSISTANT,
  storage,
  tokenizeMentions,
  tokenizeComposer,
  dayKey,
  dayLabel,
  timeLabel,
  atOffset,
  nowIso,
  reduceMotion,
  mentionRoster,
  slashCommands,
  demoCommands,
} from "./prototypeData.js";

// storage is a module-level singleton shared across the app (and across test
// files that import it), so these tests use their own "test.*" keys and
// remove them before each case.
const TEST_KEYS = [
  "test.value",
  "test.overwrite",
  "test.remove",
  "test.zero",
  "test.false",
  "test.missing",
];

beforeEach(() => {
  for (const key of TEST_KEYS) storage.remove(key);
});

describe("storage", () => {
  it("set returns the value that was stored", () => {
    expect(storage.set("test.value", "hello")).toBe("hello");
  });

  it("get returns the stored value", () => {
    storage.set("test.value", { count: 3 });
    expect(storage.get("test.value")).toEqual({ count: 3 });
  });

  it("get returns the fallback for a missing key", () => {
    expect(storage.get("test.missing", "fallback")).toBe("fallback");
    expect(storage.get("test.missing")).toBeUndefined();
  });

  it("overwrite replaces the previous value", () => {
    storage.set("test.overwrite", "first");
    storage.set("test.overwrite", "second");
    expect(storage.get("test.overwrite")).toBe("second");
  });

  it("remove deletes the value, so get falls back again", () => {
    storage.set("test.remove", "here");
    expect(storage.get("test.remove", "gone")).toBe("here");
    storage.remove("test.remove");
    expect(storage.get("test.remove", "gone")).toBe("gone");
  });

  it("round-trips the falsy value 0", () => {
    storage.set("test.zero", 0);
    expect(storage.get("test.zero", 99)).toBe(0);
  });

  it("round-trips the falsy value false", () => {
    storage.set("test.false", false);
    expect(storage.get("test.false", true)).toBe(false);
  });
});

describe("tokenizeMentions", () => {
  it("returns a single empty text token for an empty string", () => {
    expect(tokenizeMentions("")).toEqual([{ type: "text", value: "" }]);
  });

  it("returns a single text token when there is no mention", () => {
    expect(tokenizeMentions("hello")).toEqual([{ type: "text", value: "hello" }]);
  });

  it("returns a single mention token for a bare roster mention", () => {
    expect(tokenizeMentions("@Qubit")).toEqual([{ type: "mention", value: "@Qubit" }]);
  });

  it("canonicalizes the mention casing to the roster name", () => {
    expect(tokenizeMentions("@qubit")).toEqual([{ type: "mention", value: "@Qubit" }]);
  });

  it("matches a multi-word roster name case-insensitively and canonicalizes it", () => {
    expect(tokenizeMentions("ask @AVA CHEN please")).toEqual([
      { type: "text", value: "ask " },
      { type: "mention", value: "@Ava Chen" },
      { type: "text", value: " please" },
    ]);
  });

  it("splits text around multiple mentions, keeping punctuation as text", () => {
    expect(tokenizeMentions("hi @Ion, and @Marcus Webb!")).toEqual([
      { type: "text", value: "hi " },
      { type: "mention", value: "@Ion" },
      { type: "text", value: ", and " },
      { type: "mention", value: "@Marcus Webb" },
      { type: "text", value: "!" },
    ]);
  });

  it("leaves an unknown @name as plain text", () => {
    expect(tokenizeMentions("@Nobody")).toEqual([{ type: "text", value: "@Nobody" }]);
  });

  it("matches a mention with no trailing-boundary requirement", () => {
    // Contrast with tokenizeComposer below: "@Qubitfoo" still yields a
    // "@Qubit" mention here, with "foo" left over as text.
    expect(tokenizeMentions("@Qubitfoo")).toEqual([
      { type: "mention", value: "@Qubit" },
      { type: "text", value: "foo" },
    ]);
  });

  it("returns two adjacent mention tokens for back-to-back mentions", () => {
    expect(tokenizeMentions("@Qubit@Ion")).toEqual([
      { type: "mention", value: "@Qubit" },
      { type: "mention", value: "@Ion" },
    ]);
  });
});

describe("tokenizeComposer", () => {
  it("returns no tokens for an empty string", () => {
    expect(tokenizeComposer("")).toEqual([]);
  });

  it("returns no tokens for null", () => {
    expect(tokenizeComposer(null)).toEqual([]);
  });

  it("returns a single text token for plain text", () => {
    expect(tokenizeComposer("hello")).toEqual([{ type: "text", value: "hello" }]);
  });

  it("tokenizes a leading slash command, keeping the rest as text", () => {
    expect(tokenizeComposer("/imagine a cat")).toEqual([
      { type: "command", value: "/imagine" },
      { type: "text", value: " a cat" },
    ]);
  });

  it("tokenizes a leading # demo command as a single command token", () => {
    expect(tokenizeComposer("#thinking")).toEqual([
      { type: "command", value: "#thinking" },
    ]);
  });

  it("treats a command away from position 0 as plain text", () => {
    expect(tokenizeComposer("hey /imagine")).toEqual([
      { type: "text", value: "hey /imagine" },
    ]);
  });

  it("splits text around a mention", () => {
    expect(tokenizeComposer("ask @Qubit please")).toEqual([
      { type: "text", value: "ask " },
      { type: "mention", value: "@Qubit" },
      { type: "text", value: " please" },
    ]);
  });

  it("matches a mention at the end of the string", () => {
    expect(tokenizeComposer("hello @Qubit")).toEqual([
      { type: "text", value: "hello " },
      { type: "mention", value: "@Qubit" },
    ]);
  });

  it("keeps trailing punctuation after a mention as text", () => {
    expect(tokenizeComposer("@Qubit,")).toEqual([
      { type: "mention", value: "@Qubit" },
      { type: "text", value: "," },
    ]);
  });

  it("requires a trailing boundary after a mention, unlike tokenizeMentions", () => {
    // Contrast with tokenizeMentions above: tokenizeComposer requires the
    // mention to be followed by end-of-string or a boundary character, so
    // "@Qubitfoo" is all plain text here.
    expect(tokenizeComposer("@Qubitfoo")).toEqual([
      { type: "text", value: "@Qubitfoo" },
    ]);
  });

  it("preserves the original mention casing, unlike tokenizeMentions", () => {
    // Contrast with tokenizeMentions above: no canonicalization here — the
    // token value is sliced from the input as typed.
    expect(tokenizeComposer("@qubit")).toEqual([
      { type: "mention", value: "@qubit" },
    ]);
  });

  it("combines a leading command with a later mention", () => {
    expect(tokenizeComposer("/help @Qubit")).toEqual([
      { type: "command", value: "/help" },
      { type: "text", value: " " },
      { type: "mention", value: "@Qubit" },
    ]);
  });
});

describe("dayKey", () => {
  it("uses local date components with no zero-padding", () => {
    expect(dayKey("2026-01-05T12:00:00")).toBe("2026-1-5");
  });
});

describe("dayLabel", () => {
  it("labels the current instant as Today", () => {
    expect(dayLabel(new Date().toISOString())).toBe("Today");
  });

  it("labels an instant one day ago as Yesterday", () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    expect(dayLabel(d.toISOString())).toBe("Yesterday");
  });

  it("formats a same-year date far from today without the year", () => {
    const today = new Date();
    // Pick a date in the same year but months away from today, so the test
    // passes whatever date it runs on: mid-December early in the year,
    // mid-January later in the year.
    const d = new Date(
      today.getFullYear(),
      today.getMonth() < 6 ? 11 : 0,
      15,
      12,
    );
    const expected = new Intl.DateTimeFormat([], {
      month: "short",
      day: "numeric",
    }).format(d);
    const label = dayLabel(d.toISOString());
    expect(label).toBe(expected);
    expect(label).not.toContain(String(today.getFullYear()));
  });

  it("formats a previous-year date with the year", () => {
    const today = new Date();
    const d = new Date(today.getFullYear() - 1, 5, 15, 12);
    const expected = new Intl.DateTimeFormat([], {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(d);
    expect(dayLabel(d.toISOString())).toBe(expected);
  });
});

describe("timeLabel", () => {
  it("formats with the locale hour/minute formatter", () => {
    const iso = "2026-01-05T14:30:00";
    const expected = new Intl.DateTimeFormat([], {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
    expect(timeLabel(iso)).toBe(expected);
  });
});

describe("nowIso / atOffset", () => {
  it("nowIso parses to within a few seconds of Date.now()", () => {
    const parsed = Date.parse(nowIso());
    expect(Number.isNaN(parsed)).toBe(false);
    expect(Math.abs(parsed - Date.now())).toBeLessThan(5000);
  });

  it("atOffset(+60) and atOffset(-60) are about 120 minutes apart", () => {
    const diff = Date.parse(atOffset(60)) - Date.parse(atOffset(-60));
    expect(Math.abs(diff - 7200000)).toBeLessThan(5000);
  });
});

describe("reduceMotion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is true when the reduced-motion media query matches", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    expect(reduceMotion()).toBe(true);
  });

  it("is false when the reduced-motion media query does not match", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    expect(reduceMotion()).toBe(false);
  });
});

describe("prototype data shapes", () => {
  it("the assistant is Qubit", () => {
    expect(ASSISTANT.name).toBe("Qubit");
  });

  it("the assistant object is frozen", () => {
    expect(Object.isFrozen(ASSISTANT)).toBe(true);
  });

  it("mention roster names are unique", () => {
    const names = mentionRoster.map((item) => item.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every slash command name starts with /", () => {
    expect(slashCommands.length).toBeGreaterThan(0);
    for (const command of slashCommands) {
      expect(command.name.startsWith("/")).toBe(true);
    }
  });

  it("every demo command name starts with #", () => {
    expect(demoCommands.length).toBeGreaterThan(0);
    for (const command of demoCommands) {
      expect(command.name.startsWith("#")).toBe(true);
    }
  });
});
