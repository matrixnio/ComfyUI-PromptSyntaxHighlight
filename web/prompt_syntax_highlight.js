import { app } from "../../../scripts/app.js";

/**
 * ComfyUI Prompt Syntax Highlight
 * -------------------------------
 * Paints structural markers inside ComfyUI prompt text boxes in colour:
 *   [Shot 1]  /  <d>...</d>  /  (s1) (s2)
 *
 * Works on both editable multi-line STRING widgets and read-only Show Text
 * boxes. Nothing is patched: the original textarea keeps every native
 * behaviour, and a transparent <pre> mirror is laid on top of it.
 *
 * To change what gets highlighted, edit the RULES array below. Nothing else
 * needs to be touched.
 *
 * Design notes (read before editing):
 * - The mirror follows the textarea with getBoundingClientRect() every frame,
 *   so node dragging, canvas zoom (transform: scale) and scrolling stay aligned.
 * - The zoom ratio is read live as rect.width / offsetWidth.
 * - Font metrics are copied from the textarea's computed style, but only once
 *   every 15 frames because getComputedStyle is expensive.
 * - During IME composition (compositionstart ~ compositionend) the mirror is
 *   hidden and the native text becomes visible again, otherwise the candidate
 *   window would be unreadable.
 * - Three safety valves: the native text only goes transparent after the mirror
 *   has actually painted and been positioned; it is restored instantly when the
 *   box is covered or scrolled out of view; and any parse error falls back to
 *   plain text. The textarea can never end up blank.
 */

const VERSION = "1.0.0";

/** Order is priority: later rules overwrite overlapping earlier ones. */
const RULES = [
  // Content wrapped by a paired tag: <d>...</d> — dark green, reads as a block
  { id: 1, re: /<([A-Za-z][A-Za-z0-9_.:-]*)\b[^>]*>([\s\S]*?)<\/\1\s*>/g, group: 2 },
  // The tags themselves: <d> </d> <subject1> <picture 1a>
  { id: 2, re: /<\/?[A-Za-z][A-Za-z0-9_.:-]*(?:\s[^<>\n]{0,120})?\/?>/g },
  // Square-bracket markers: [Shot 1] [Shot 2]
  { id: 3, re: /\[[^\[\]\n]{1,80}\]/g },
  // Parenthesised shot indices: (s1) (s2) (shot 3)
  { id: 4, re: /\((?:[sS]hot\s?|[sS])\d{1,3}\)/g },
];

const CLS_NAME = { 1: "phl-body", 2: "phl-tag", 3: "phl-bracket", 4: "phl-paren" };

const CSS = `
.phl-mirror {
  position: fixed;
  margin: 0;
  border: 0;
  background: transparent;
  overflow: hidden;
  pointer-events: none;
  user-select: none;
  z-index: 2147483000;
  box-sizing: border-box;
}
.phl-inner {
  display: block;
  width: 100%;
  margin: 0;
  border: 0;
  box-sizing: border-box;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  will-change: transform;
}
/* Native text goes transparent; the caret needs its own colour to stay visible. */
.phl-src {
  color: transparent !important;
  -webkit-text-fill-color: transparent !important;
  caret-color: #f0f0f0 !important;
}
.phl-src::selection {
  color: #ffffff;
  -webkit-text-fill-color: #ffffff;
  background: rgba(74, 222, 128, 0.30);
}
.phl-body { color: #2e9e68; }
.phl-tag { color: #4ade80; font-weight: 700; }
.phl-bracket { color: #34d399; font-weight: 700; }
.phl-paren { color: #86efac; font-weight: 700; }
`;

const SETTINGS = {
  enabled: true,
  editable: true, // take over editable prompt boxes
  readonly: true, // take over read-only display boxes (Show Text)
};

function injectCSS() {
  if (document.getElementById("phl-style")) return;
  const s = document.createElement("style");
  s.id = "phl-style";
  s.textContent = CSS;
  document.head.appendChild(s);
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Split the text into non-overlapping runs and wrap each run in a span. */
function buildHTML(text) {
  const n = text.length;
  if (!n) return "";
  const cls = new Uint8Array(n);

  for (const rule of RULES) {
    rule.re.lastIndex = 0;
    let m;
    let guard = 0;
    while ((m = rule.re.exec(text)) !== null) {
      if (++guard > 20000) break;
      let s;
      let e;
      if (rule.group != null) {
        const g = m[rule.group];
        if (!g) {
          if (m[0].length === 0) rule.re.lastIndex++;
          continue;
        }
        s = m.index + m[0].indexOf(g);
        e = s + g.length;
      } else {
        s = m.index;
        e = m.index + m[0].length;
      }
      for (let i = s; i < e; i++) cls[i] = rule.id;
      if (m[0].length === 0) rule.re.lastIndex++;
    }
  }

  let out = "";
  let cur = 0;
  for (let i = 1; i <= n; i++) {
    if (i === n || cls[i] !== cls[cur]) {
      const seg = esc(text.slice(cur, i));
      const id = cls[cur];
      out += id ? '<span class="' + CLS_NAME[id] + '">' + seg + "</span>" : seg;
      cur = i;
    }
  }
  return out;
}

const tracked = new Map();
let rafId = 0;
let tick = 0;
let lastReport = 0;
let lastState = "";
let lastDiag = 0;

/** Low-traffic self-report: only on state change, on error, or every 30s. */
function report(errMsg) {
  const now = performance.now();
  let painted = 0;
  for (const st of tracked.values()) if (st.painted) painted++;
  const state = tracked.size + "/" + painted + "/" + (errMsg || "");
  const changed = state !== lastState;
  if (!changed && now - lastReport < 30000) return;
  lastState = state;
  lastReport = now;
  const payload = { targets: tracked.size, painted, editable: SETTINGS.editable };
  if (errMsg) payload.error = String(errMsg).slice(0, 280);
  try {
    fetch("/prompt_syntax_highlight/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => { });
  } catch (e) { /* ignore */ }
}

function attach(ta) {
  const mirror = document.createElement("pre");
  mirror.className = "phl-mirror";
  mirror.style.display = "none";
  const inner = document.createElement("div");
  inner.className = "phl-inner";
  mirror.appendChild(inner);
  document.body.appendChild(mirror);

  const st = {
    mirror,
    inner,
    text: null,
    cssKey: "",
    painted: false,
    composing: false,
    cssTick: 0,
  };

  // While an IME is composing, show the native text again and hide the mirror.
  const onStart = () => {
    st.composing = true;
    ta.classList.remove("phl-src");
    mirror.style.display = "none";
  };
  const onEnd = () => {
    st.composing = false;
    st.text = null;
  };
  ta.addEventListener("compositionstart", onStart, true);
  ta.addEventListener("compositionend", onEnd, true);
  st.onStart = onStart;
  st.onEnd = onEnd;

  tracked.set(ta, st);
  paint(ta, st);
}

function detach(ta, st) {
  if (st.onStart) ta.removeEventListener("compositionstart", st.onStart, true);
  if (st.onEnd) ta.removeEventListener("compositionend", st.onEnd, true);
  st.mirror.remove();
  ta.classList.remove("phl-src");
  tracked.delete(ta);
}

function paint(ta, st) {
  if (st.text === ta.value) return;
  st.text = ta.value;
  try {
    st.inner.innerHTML = buildHTML(ta.value);
    st.painted = true;
  } catch (e) {
    console.warn("[PromptSyntaxHighlight] build failed, falling back to plain text", e);
    st.inner.textContent = ta.value;
    st.painted = false;
    ta.classList.remove("phl-src");
  }
}

function syncBox(ta, st, full) {
  const r = ta.getBoundingClientRect();
  const hidden =
    r.width < 8 ||
    r.height < 8 ||
    r.bottom < -40 ||
    r.top > window.innerHeight + 40 ||
    r.right < -40 ||
    r.left > window.innerWidth + 40;

  if (hidden) {
    st.mirror.style.display = "none";
    ta.classList.remove("phl-src");
    return;
  }

  // Hide while covered by a modal, otherwise the overlay floats above it.
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const topEl = cx >= 0 && cy >= 0 && cx <= window.innerWidth && cy <= window.innerHeight
    ? document.elementFromPoint(cx, cy)
    : null;
  if (topEl && topEl !== ta && !ta.contains(topEl)) {
    st.mirror.style.display = "none";
    ta.classList.remove("phl-src");
    return;
  }

  const ow = ta.offsetWidth || r.width;
  const z = ow > 0 ? r.width / ow : 1;
  const cw = ta.clientWidth || r.width;
  const ch = ta.clientHeight || r.height;

  const m = st.mirror.style;
  m.display = "block";
  m.left = r.left.toFixed(2) + "px";
  m.top = r.top.toFixed(2) + "px";
  m.width = cw + "px";
  m.height = ch + "px";
  m.transformOrigin = "top left";
  m.transform = Math.abs(z - 1) > 0.005 ? "scale(" + z + ")" : "none";

  // getComputedStyle is expensive: sample it every 15 frames instead of every frame.
  if (full || tick - st.cssTick > 15) {
    st.cssTick = tick;
    const cs = getComputedStyle(ta);
    const key = [
      cs.fontFamily, cs.fontSize, cs.fontWeight, cs.fontStyle, cs.lineHeight,
      cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft,
      cs.letterSpacing, cs.wordSpacing, cs.wordBreak, cs.overflowWrap, cs.tabSize, cs.textAlign,
    ].join("|");

    if (key !== st.cssKey) {
      st.cssKey = key;
      const s = st.inner.style;
      s.fontFamily = cs.fontFamily;
      s.fontSize = cs.fontSize;
      s.fontWeight = cs.fontWeight;
      s.fontStyle = cs.fontStyle;
      s.lineHeight = cs.lineHeight;
      s.paddingTop = cs.paddingTop;
      s.paddingRight = cs.paddingRight;
      s.paddingBottom = cs.paddingBottom;
      s.paddingLeft = cs.paddingLeft;
      s.letterSpacing = cs.letterSpacing;
      s.wordSpacing = cs.wordSpacing;
      s.wordBreak = cs.wordBreak;
      s.overflowWrap = cs.overflowWrap || "break-word";
      s.tabSize = cs.tabSize;
      s.textAlign = cs.textAlign;
    }
  }

  st.inner.style.transform =
    "translate(" + -ta.scrollLeft + "px," + -ta.scrollTop + "px)";

  // Only fade the native text once the mirror is really positioned.
  if (st.painted && st.inner.childNodes.length) ta.classList.add("phl-src");
  else ta.classList.remove("phl-src");
}

function frame() {
  rafId = 0;
  tick++;
  for (const [ta, st] of tracked) {
    if (!ta.isConnected) continue;
    if (st.composing) continue;
    paint(ta, st);
    syncBox(ta, st, tick % 15 === 0);
  }
  if (tracked.size) rafId = requestAnimationFrame(frame);
}

function startLoop() {
  if (!rafId && tracked.size) rafId = requestAnimationFrame(frame);
}

/** Skip textareas that clearly are not prompts (search boxes, disabled, single line). */
function usable(ta) {
  if (!ta || !ta.isConnected) return false;
  if (ta.disabled) return false;
  const ph = (ta.getAttribute("placeholder") || "").toLowerCase();
  if (/search|filter|查找|搜索/.test(ph)) return false;
  const h = ta.clientHeight || 0;
  if (h > 0 && h < 32) return false;
  return true;
}

function shouldTake(ta) {
  if (!usable(ta)) return false;
  return ta.readOnly === true ? SETTINGS.readonly : SETTINGS.editable;
}

/**
 * Fallback scan: some front-end versions do not expose widget elements through
 * node.widgets, so also walk the DOM for multi-line textareas.
 */
function scanDOM(alive) {
  for (const ta of document.querySelectorAll("textarea")) {
    if (!shouldTake(ta)) continue;
    alive.add(ta);
    if (!tracked.has(ta)) attach(ta);
  }
}

function scanTargets() {
  if (!SETTINGS.enabled) {
    for (const [ta, st] of Array.from(tracked)) detach(ta, st);
    return;
  }

  const nodes = app?.graph?._nodes || app?.graph?.nodes || [];
  const alive = new Set();

  for (const node of nodes) {
    for (const w of node.widgets || []) {
      // Legacy DOM widgets expose inputEl, newer addDOMWidget() uses element.
      const el = (w && (w.inputEl || w.element)) || null;
      if (el && el.tagName === "TEXTAREA" && shouldTake(el)) {
        alive.add(el);
        if (!tracked.has(el)) attach(el);
      }
    }
  }

  scanDOM(alive);

  for (const [ta, st] of Array.from(tracked)) {
    if (!ta.isConnected) detach(ta, st);
  }
  if (tracked.size) report();
  startLoop();

  // Diagnostics: report the DOM shape when nothing could be taken over.
  if (!tracked.size && performance.now() - lastDiag > 12000) {
    lastDiag = performance.now();
    const all = document.querySelectorAll("textarea");
    let d = "ta=" + all.length;
    const first = all[0];
    if (first) {
      const r = first.getBoundingClientRect();
      d += " ro=" + first.readOnly + " h=" + Math.round(r.height) +
        " cls=" + String(first.className || "-").slice(0, 30);
    }
    report(d);
  }
}

function registerSettings() {
  try {
    const s = app?.ui?.settings;
    if (!s || !s.addSetting) return;
    s.addSetting({
      id: "PHL.Enabled",
      name: "提示词高亮：总开关 / Prompt highlight: master switch",
      type: "boolean",
      defaultValue: true,
      onChange(v) {
        SETTINGS.enabled = !!v;
        scanTargets();
      },
    });
    s.addSetting({
      id: "PHL.Editable",
      name: "提示词高亮：作用于可编辑输入框 / apply to editable boxes",
      type: "boolean",
      defaultValue: true,
      onChange(v) {
        SETTINGS.editable = !!v;
        for (const [ta, st] of Array.from(tracked)) detach(ta, st);
        scanTargets();
      },
    });
    s.addSetting({
      id: "PHL.Readonly",
      name: "提示词高亮：作用于只读显示框 / apply to read-only boxes",
      type: "boolean",
      defaultValue: true,
      onChange(v) {
        SETTINGS.readonly = !!v;
        for (const [ta, st] of Array.from(tracked)) detach(ta, st);
        scanTargets();
      },
    });
  } catch (e) {
    console.warn("[PromptSyntaxHighlight] settings registration failed", e);
  }
}

app.registerExtension({
  name: "matrixnio.PromptSyntaxHighlight",
  async setup() {
    injectCSS();
    registerSettings();
    scanTargets();
    // Nodes rebuild their textareas all the time; re-scan for new ones.
    setInterval(scanTargets, 400);
    // Repaint immediately on input / scroll instead of waiting a frame.
    document.addEventListener("input", (e) => {
      const st = tracked.get(e.target);
      if (st) { st.text = null; paint(e.target, st); }
    }, true);
    document.addEventListener("scroll", (e) => {
      const st = tracked.get(e.target);
      if (st) syncBox(e.target, st, true);
    }, true);
    console.log("[PromptSyntaxHighlight] v" + VERSION + " loaded");
    report();
    try { fetch("/prompt_syntax_highlight/ping", { method: "POST" }).catch(() => { }); } catch (e) { /* ignore */ }
  },
});
