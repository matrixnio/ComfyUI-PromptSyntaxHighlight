# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
