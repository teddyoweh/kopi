/**
 * Every keyboard shortcut, in one table: the global handler (components/command) fires the ones
 * with an `href` or a `command`, and the `?` sheet lists all of them. The rest are handled by
 * their own page and are here so the sheet can show them.
 */
export type ShortcutGroup = "General" | "Go to" | "Search results" | "Inbox";

export type Shortcut = {
  group: ShortcutGroup;
  label: string;
  /** The key caps, in order. "mod" is ⌘ on a Mac and Ctrl elsewhere. */
  keys: string[];
  /** Pressed one after the other ("G then B") rather than together. */
  chord?: boolean;
  href?: string;
  command?: "palette" | "shortcuts";
};

export const SHORTCUTS: Shortcut[] = [
  { group: "General", label: "Command palette", keys: ["mod", "K"], command: "palette" },
  { group: "General", label: "Search", keys: ["/"], command: "palette" },
  { group: "General", label: "Keyboard shortcuts", keys: ["?"], command: "shortcuts" },
  { group: "General", label: "New chat with Kopi", keys: ["C"], href: "/copilot/?new=1" },
  { group: "Go to", label: "Home", keys: ["G", "H"], chord: true, href: "/" },
  { group: "Go to", label: "Inbox", keys: ["G", "I"], chord: true, href: "/inbox/" },
  { group: "Go to", label: "Copilot", keys: ["G", "C"], chord: true, href: "/copilot/" },
  { group: "Go to", label: "Bids", keys: ["G", "B"], chord: true, href: "/bids/" },
  { group: "Go to", label: "Search", keys: ["G", "S"], chord: true, href: "/search/" },
  { group: "Go to", label: "Licences", keys: ["G", "L"], chord: true, href: "/licences/" },
  { group: "Go to", label: "Profile", keys: ["G", "P"], chord: true, href: "/profile/" },
  { group: "Search results", label: "Move through results", keys: ["J", "K"] },
  { group: "Search results", label: "Open the selected tender", keys: ["↵"] },
  { group: "Search results", label: "Start a bid on it", keys: ["B"] },
  { group: "Inbox", label: "Move through the Inbox", keys: ["J", "K"] },
  { group: "Inbox", label: "Open the selected item", keys: ["↵"] },
  { group: "Inbox", label: "Mark it done", keys: ["E"] },
];

/** How long the second key of a chord may wait after the first. */
export const CHORD_MS = 1200;

export function isMac(): boolean {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}

export function keyLabel(key: string): string {
  return key === "mod" ? (isMac() ? "⌘" : "Ctrl") : key;
}

const bound = SHORTCUTS.filter((s) => s.href || s.command);

/** Whether this key starts a chord ("g"). */
export function startsChord(event: KeyboardEvent): boolean {
  return bound.some((s) => s.chord && s.keys[0]!.toLowerCase() === event.key);
}

/**
 * The shortcut a keydown fires, if any. `chordKey` is the chord's first key while it waits for
 * its second. Shift is allowed ("?" needs it) but keys match exactly, so Shift+C is not C.
 */
export function shortcutFor(event: KeyboardEvent, chordKey: string | null): Shortcut | null {
  const keys = (s: Shortcut) => s.keys.map((k) => k.toLowerCase());
  if (event.metaKey || event.ctrlKey) {
    if (event.altKey || event.shiftKey) return null;
    return bound.find((s) => keys(s)[0] === "mod" && keys(s)[1] === event.key.toLowerCase()) ?? null;
  }
  if (event.altKey) return null;
  const chord = chordKey ? bound.find((s) => s.chord && keys(s)[0] === chordKey && keys(s)[1] === event.key) : undefined;
  return chord ?? bound.find((s) => !s.chord && keys(s)[0] === event.key) ?? null;
}
