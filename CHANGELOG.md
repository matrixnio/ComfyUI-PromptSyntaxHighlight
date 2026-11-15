# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.3] - 2026-11-16

Selection no longer doubles up.

### Fixed

- **Ctrl+A ghosted the text.** The mirror paints the highlighted copy above the
  textarea; on a non-empty selection the textarea's own `::selection` colours that
  same text white, so two layers ended up at the same coordinates. `frame()` now
  records `selecting` per textarea and `syncBox()` bails out to `hideMirror()`
  before anything else, so only the native selection is drawn. Collapse the
  selection and the highlight comes back on the next frame — no listeners, no
  state to clean up.
- The `paint()`-gated variant of this fix never fired: `paint()` returns early
  while `st.text === ta.value`, which is exactly the case when you press Ctrl+A.

## [1.2.2] - 2026-11-15

Notes stopped being prompts.

### Fixed

- **MarkdownNote / Note were taken over.** ComfyUI 1.58 renders them as a tiptap rich-text
  editor: `.comfy-markdown > ( .tiptap.ProseMirror + a shadow <textarea> )`, and the textarea
  only stores the raw value at `opacity: 0`. The extension mirrored that textarea, so the
  *source* markdown (`# Heading`, `- [link](url)`, ...) was painted at `z-index: 2` straight
  over the rendered document — one wall of overlapping text. Anything inside
  `.comfy-markdown` / `.widget-markdown` / `.tiptap` / `.ProseMirror` is now skipped, both in
  `usable()` and in `attach()`.
- Hidden textareas are no longer claimed. `clientHeight === 0` used to fall through the
  "unknown size, take it anyway" branch; `getClientRects().length === 0` now rejects
  anything that is not in the render tree (collapsed nodes, `v-show`-hidden editors).
- Leftover mirrors are reaped. Every `scanTargets()` pass removes any `.phl-mirror` that no
  longer belongs to a tracked textarea, so a `<pre>` can never stay floating above a node
  after its source is gone.

### Note

`user/default/user.css` is no longer loaded by the 1.58 frontend — any earlier styling fix
placed there is dead code. This extension injects its own `<style>` block instead.

## [1.2.1] - 2026-11-15

Font-metric alignment, plus the node-type skip list accumulated since 1.0.0
(1.1.x / 1.2.x were never published separately, so they ship here).

### Added

- `SKIP_TYPES` and `ownerNodeType()`: Note / MarkdownNote / ShowText / label-style widgets are
  never taken over. They already carry their own rendered overlay, and a second mirror on top
  produced doubled text. The node type is resolved through `[data-node-id]` **and** the legacy
  `.comfy-node` root, so both old and new frontends work.

### Fixed

- `line-height: normal` made the mirror and the textarea disagree line by line: each resolves
  `normal` against its own font, and a CJK fallback is enough to shift the baselines. Now falls
  back to `font-size × 1.5` in px whenever no numeric value is available.
- Font metrics were cached by comparing `fontFamily` strings only, so a late-loading webfont
  never invalidated the cache — the textarea re-rendered, the mirror did not. `document.fonts`
  `loadingdone` / `loadingerror` / `ready` now clear the cache.
- `white-space`, `text-rendering`, `font-kerning` and `font-variant-numeric` are synchronised
  too: without them CJK line breaking and ligatures can wrap differently from the textarea.

## [1.0.0] - 2026-10-23

First public release.

### Added

- Overlay syntax highlighting for multi-line prompt text boxes in ComfyUI, covering both editable
  STRING widgets and read-only *Show Text* boxes.
- Default rules: paired `<tag>...</tag>` blocks, the tags themselves, `[Square Brackets]`, and
  `(s1)` / `(shot 3)` indices, with a documented priority order.
- Three settings: master switch, apply-to-editable, apply-to-read-only.
- IME-safe painting: the native text is restored during Chinese/Japanese composition.
- Frame-accurate tracking of node dragging, canvas zoom (`transform: scale`) and scrolling.
- Diagnostic endpoints: `GET /prompt_syntax_highlight/status`,
  `POST /prompt_syntax_highlight/ping`, `POST /prompt_syntax_highlight/report`.
- English and Simplified Chinese documentation, with a rendered rules illustration.

### Safety

- The native text only becomes transparent after the overlay has painted and been positioned.
- The overlay is hidden while a modal covers the box, when it leaves the viewport, or while the
  element is being composition-edited.
- Any parse failure falls back to plain text, so a text box can never end up blank.
