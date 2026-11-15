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
 * ---------------------------------------------------------------------------
 * Positioning (read this before changing anything)
 * ---------------------------------------------------------------------------
 * The mirror is a CHILD of the textarea's offsetParent — in ComfyUI that is
 * `div.dom-widget`, which is `position: fixed` and carries the node's
 * transform, i.e. it *is* the widget's own coordinate space:
 *
 *   TEXTAREA.comfy-multiline-input   position:static  overflow:hidden auto  z:1
 *   DIV.dom-widget.size-full         position:FIXED   transform:YES         z:0
 *   DIV.graph-canvas-container       position:relative overflow:clip
 *
 * Being a sibling of the textarea inside that box gives three properties for
 * free, and none of them need any measuring or hit-testing:
 *
 *   1. ZOOM / DRAG: the widget's own transform scales the mirror together with
 *      the text, so no `scale()` bookkeeping and no per-frame getBoundingClient
 *      Rect() chasing is required for correct geometry.
 *   2. CLIPPING: `graph-canvas-container` has overflow:clip, so the mirror can
 *      never paint outside the canvas.
 *   3. STACKING: the mirror sits inside the node layer, so the sidebar, menus,
 *      modals and the queue/history backdrop cover it exactly like they cover
 *      the textarea. Text can never be painted on top of a panel.
 *
 * Earlier versions (1.1.x) kept the mirror on <body> with z-index 2147483000
 * and tried to *predict* occlusion with elementsFromPoint probes + clip-path.
 * Every prediction error showed up as "the prompt text vanished", because the
 * native text is transparent whenever the mirror is shown. That whole
 * subsystem is gone: the layout engine now does the clipping.
 *
 * Invariant enforced below: the native text is made transparent ONLY while the
 * mirror is really rendered (in the document, laid out, non-zero size). Any
 * condition that hides the mirror restores the native text in the same call.
 */

const VERSION = "1.2.2";

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

/**
 * Nodes whose text we must NEVER highlight. They are documentation / note
 * widgets (MarkdownNote, Note, ShowText, ...), not prompts.
 */
const SKIP_TYPES = new Set([
  "markdownnote", "note", "noteplus", "label", "showtext", "previewtext",
  "primitivenode", "primitivestring", "primitivestringmultiline", "reroute",
  "markdown", "notetext",
]);

/** Walk up from a textarea to the owning node and return its type, if found.
 *
 *  2026-11-15: the frontend stopped putting `.comfy-node` on node roots somewhere
 *  before 1.57.4 — the string only survives there as a drag MIME type and an API
 *  path, so `closest(".comfy-node")` always returned null. That quietly disabled
 *  SKIP_TYPES, and Note / MarkdownNote widgets got a plain-text mirror laid over
 *  their rendered markdown (double text). Current builds mark the node root with
 *  `data-node-id`; keep both selectors so old and new frontends work.
 */
function ownerNodeType(ta) {
  try {
    const el = ta.closest && (ta.closest("[data-node-id]") || ta.closest(".comfy-node"));
    if (!el) return "";
    const id =
      el.dataset.nodeId != null ? el.dataset.nodeId
      : el.dataset.node_id != null ? el.dataset.node_id
      : null;
    const g = app.rootGraph || app.graph;
    if (id != null && g && g.getNodeById) {
      // ids come through as strings in some builds and numbers in others
      const node = g.getNodeById(String(id)) || g.getNodeById(id);
      if (node && node.type) return String(node.type);
      const all = g._nodes || g.nodes || [];
      for (let i = 0; i < all.length; i++) {
        const n2 = all[i];
        if (n2 && n2.type && String(n2.id) === String(id)) return String(n2.type);
      }
    }
    return (el.dataset.type || "") + "";
  } catch (e) {
    return "";
  }
}

const CSS = `
.phl-mirror {
  position: absolute;
  margin: 0;
  border: 0;
  background: transparent;
  overflow: hidden;
  pointer-events: none;
  user-select: none;
  box-sizing: border-box;
  /* Sits above the textarea (z-index:1) but inside the node's own stacking
     context, so every UI panel still covers it. */
  z-index: 2;
}
.phl-inner {
  display: block;
  width: 100%;
  margin: 0;
  border: 0;
  box-sizing: border-box;
  white-space: pre-wrap;
  overflow-wrap: break-word;
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

/* ---------------------------------------------------------------------------
 * Low-traffic self-report (counters only, never prompt text)
 * ------------------------------------------------------------------------- */
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

let lastBlank = 0;
/** Breadcrumb for the case that used to blank the text (no prompt content). */
function noteBlank(why) {
  const now = performance.now();
  if (now - lastBlank < 5000) return;
  lastBlank = now;
  report("blank:" + why);
}

/**
 * Restore the native text. Always safe to call, on any code path.
 * The `phl-src` class may only ever be present while the mirror is rendered.
 */
function showNative(ta) {
  if (ta.classList.contains("phl-src")) ta.classList.remove("phl-src");
}

/**
 * Cheap check (no forced layout): the mirror has been switched on, is still in
 * the document, and still lives in the host we positioned it against. Its size
 * is written explicitly every frame, so a rendered mirror always has area; and
 * if an ancestor hid the host, the offsetParent guard above already fired.
 */
function mirrorRendered(st) {
  return st.shown === true && st.mirror.isConnected && st.mirror.parentNode === st.host;
}

function hideMirror(ta, st) {
  if (st.shown) {
    st.shown = false;
    st.mirror.style.display = "none";
  }
  showNative(ta);
}

/** The box the mirror lives in: the textarea's offsetParent (.dom-widget). */
function hostOf(ta) {
  const op = ta.offsetParent;
  if (op && op.nodeType === 1) return op;
  return ta.parentNode && ta.parentNode.nodeType === 1 ? ta.parentNode : null;
}

function attach(ta) {
  if (ta.closest(NOTE_SEL)) return;
  const host = hostOf(ta);
  if (!host) return;

  const mirror = document.createElement("pre");
  mirror.className = "phl-mirror";
  mirror.style.display = "none";
  const inner = document.createElement("div");
  inner.className = "phl-inner";
  mirror.appendChild(inner);
  host.appendChild(mirror);

  const st = {
    mirror,
    inner,
    host,
    text: null,
    cssKey: "",
    painted: false,
    composing: false,
    cssTick: 0,
  };

  // While an IME is composing, show the native text again and hide the mirror.
  const onStart = () => {
    st.composing = true;
    hideMirror(ta, st);
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
  showNative(ta);
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
    showNative(ta);
  }
}

function syncBox(ta, st, full) {
  // The widget was detached from the DOM, or the node got collapsed.
  const host = hostOf(ta);
  if (!host || ta.offsetParent === null || ta.offsetWidth < 4 || ta.offsetHeight < 4) {
    hideMirror(ta, st);
    return;
  }
  // offsetParent changed (node re-parented): move the mirror with it.
  if (host !== st.host || st.mirror.parentNode !== host) {
    st.host = host;
    host.appendChild(st.mirror);
  }

  // clientWidth/Height exclude the border and the scrollbar: exactly the area
  // the text can paint into.
  const cw = ta.clientWidth || 0;
  const ch = ta.clientHeight || 0;
  if (cw < 4 || ch < 4) {
    hideMirror(ta, st);
    return;
  }

  // offsetLeft/offsetTop are already expressed in the host's own (untransformed)
  // padding box, which is exactly the coordinate space an absolutely positioned
  // child uses. No zoom division, no rect chasing: the node's transform scales
  // both boxes identically. clientLeft/clientTop are the textarea's own border
  // widths, so the mirror covers the client box and nothing else.
  const left = ta.offsetLeft + ta.clientLeft;
  const top = ta.offsetTop + ta.clientTop;

  const m = st.mirror.style;
  if (!st.shown) {
    st.shown = true;
    m.display = "block";
  }
  if (st.placed !== left + "," + top + "," + cw + "," + ch) {
    st.placed = left + "," + top + "," + cw + "," + ch;
    m.left = left + "px";
    m.top = top + "px";
    m.width = cw + "px";
    m.height = ch + "px";
  }

  // getComputedStyle is expensive: sample it every 15 frames instead of every frame.
  if (full || tick - st.cssTick > 15) {
    st.cssTick = tick;
    const cs = getComputedStyle(ta);
    const key = [
      cs.fontFamily, cs.fontSize, cs.fontWeight, cs.fontStyle, cs.lineHeight,
      cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft,
      cs.letterSpacing, cs.wordSpacing, cs.wordBreak, cs.overflowWrap, cs.tabSize, cs.textAlign,
      // 这几个也影响字形/换行：不跟着同步，中文行宽、连字都会被镜像层算歪
      cs.whiteSpace, cs.textRendering, cs.fontKerning, cs.fontVariantNumeric,
    ].join("|");

    if (key !== st.cssKey) {
      st.cssKey = key;
      const s = st.inner.style;
      s.fontFamily = cs.fontFamily;
      s.fontSize = cs.fontSize;
      s.fontWeight = cs.fontWeight;
      s.fontStyle = cs.fontStyle;
      // line-height: normal 时，textarea 和 <div> 各按**自己的字体**算 leading，
      // 两边字体只要不完全一致（含中文 fallback），行高就差一点 —— 逐行累积成错位。
      // 取不到数值就按字号 ×1.5 钉成 px，两边用同一个数。
      const lh = cs.lineHeight;
      s.lineHeight = (lh && lh !== "normal" && parseFloat(lh) > 0)
        ? lh
        : (parseFloat(cs.fontSize) * 1.5).toFixed(2) + "px";
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
      s.whiteSpace = cs.whiteSpace || "pre-wrap";
      s.textRendering = cs.textRendering;
      s.fontKerning = cs.fontKerning;
      s.fontVariantNumeric = cs.fontVariantNumeric;
    }
  }

  const scrolled = ta.scrollLeft + "," + ta.scrollTop;
  if (st.scrolled !== scrolled) {
    st.scrolled = scrolled;
    st.inner.style.transform =
      "translate(" + -ta.scrollLeft + "px," + -ta.scrollTop + "px)";
  }

  // The one and only place the native text goes transparent — and only after
  // re-checking that the mirror is really on screen. If it is not, put the
  // native text back instead of leaving an empty box.
  if (st.painted && st.inner.childNodes.length && mirrorRendered(st)) {
    ta.classList.add("phl-src");
  } else {
    if (ta.classList.contains("phl-src")) noteBlank("mirror-not-rendered");
    showNative(ta);
  }
}

function frame() {
  rafId = 0;
  tick++;
  for (const [ta, st] of tracked) {
    if (!ta.isConnected) {
      // A removed textarea must not leave its mirror behind, nor stay blank.
      hideMirror(ta, st);
      continue;
    }
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
const NOTE_SEL = ".comfy-markdown, .widget-markdown, .tiptap, .ProseMirror";

function usable(ta) {
  if (!ta || !ta.isConnected) return false;
  if (ta.disabled) return false;
  // 1.58 renders Note / MarkdownNote as a tiptap rich-text editor:
  //     .comfy-markdown > ( .tiptap.ProseMirror + a shadow <textarea> )
  // ComfyUI keeps that textarea at opacity 0 — it only stores the raw value.
  // Mirroring it paints the *source* markdown straight over the rendered
  // document, which is exactly the "wall of overlapping text" symptom.
  if (ta.closest(NOTE_SEL)) return false;
  // Not in the render tree (collapsed node, v-show hidden editor): leave it be.
  // This used to slip through the "unknown size, take it anyway" branch below.
  if (!ta.getClientRects().length) return false;
  // Never hijack documentation / note widgets — their textareas are not prompts.
  const nt = ownerNodeType(ta);
  if (nt && SKIP_TYPES.has(nt.toLowerCase())) return false;
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

  // Drop mirrors that no longer belong to a tracked textarea. Note widgets were
  // taken over before the .comfy-markdown guard existed; the leftover <pre>
  // (position:absolute, z-index:2) kept floating above the rendered note.
  for (const m of document.querySelectorAll(".phl-mirror")) {
    let owned = false;
    for (const st of tracked.values()) {
      if (st.mirror === m) { owned = true; break; }
    }
    if (!owned) m.remove();
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

/**
 * Console helper. If a box ever looks wrong, open devtools and run
 *   __phl.dump()
 * and every tracked textarea reports its geometry, mirror state and whether the
 * native text is currently transparent. No prompt content is included.
 */
function debugDump() {
  const rows = [];
  for (const [ta, st] of tracked) {
    const r = ta.getBoundingClientRect();
    const mr = st.mirror.getBoundingClientRect();
    rows.push({
      node: ownerNodeType(ta) || "-",
      host: String((st.host && st.host.className) || "-").split(" ")[0],
      taRect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      taBox: [ta.clientWidth, ta.clientHeight, ta.offsetWidth, ta.offsetHeight],
      mirrorRect: [Math.round(mr.left), Math.round(mr.top), Math.round(mr.width), Math.round(mr.height)],
      display: st.mirror.style.display,
      nativeHidden: ta.classList.contains("phl-src"),
      spans: st.inner.childNodes.length,
      painted: st.painted,
      composing: st.composing,
      textLen: ta.value.length,
    });
  }
  return rows;
}

app.registerExtension({
  name: "matrixnio.PromptSyntaxHighlight",
  async setup() {
    injectCSS();
    registerSettings();
    scanTargets();
    // Nodes rebuild their textareas all the time; re-scan for new ones.
    setInterval(scanTargets, 400);

    // webfont 是异步加载的：加载完成后**实际字形变了，但 fontFamily 字符串没变**，
    // 上面那个 cssKey 比较不会失效 → 镜像层继续用旧字体的度量，原生文本却换了新字形，
    // 一行差零点几像素，几十行就是整段错位。字体就绪时把缓存全部作废，下一帧重采。
    if (document.fonts) {
      const bust = () => { for (const st of tracked.values()) st.cssKey = ""; };
      try {
        document.fonts.addEventListener("loadingdone", bust);
        document.fonts.addEventListener("loadingerror", bust);
      } catch (e) { /* ignore */ }
      if (document.fonts.ready && document.fonts.ready.then) {
        document.fonts.ready.then(bust).catch(() => { });
      }
    }
    // Repaint immediately on input / scroll instead of waiting a frame.
    document.addEventListener("input", (e) => {
      const st = tracked.get(e.target);
      if (st) { st.text = null; paint(e.target, st); }
    }, true);
    document.addEventListener("scroll", (e) => {
      const st = tracked.get(e.target);
      if (st) syncBox(e.target, st, false);
    }, true);
    console.log("[PromptSyntaxHighlight] v" + VERSION + " loaded");
    try {
      window.__phl = {
        version: VERSION,
        targets: () => tracked.size,
        dump: debugDump,
      };
    } catch (e) { /* ignore */ }
    report();
    try { fetch("/prompt_syntax_highlight/ping", { method: "POST" }).catch(() => { }); } catch (e) { /* ignore */ }
  },
});
