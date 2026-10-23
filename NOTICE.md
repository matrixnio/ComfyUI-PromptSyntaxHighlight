# NOTICE

## Third-party code

This project contains **no third-party source code**. It is an original implementation and has no
runtime dependencies: no Python packages, no JavaScript libraries, no bundled fonts, icons or other
assets.

The mirror-overlay technique used here (a transparent `<pre>` layer stacked above a real
`<textarea>`) is a common, long-standing pattern in web development; no code was copied from any
specific project.

## Interaction with other extensions

The extension observes multi-line `textarea` elements through public DOM and `app.js` APIs only.
It does not read, modify, bundle or redistribute files belonging to other custom nodes.

## Trademarks

- **ComfyUI** is a project of Comfy Org. The name appears in this repository's title, package name
  and README only to describe compatibility, following the naming convention used by the ComfyUI
  custom-node ecosystem. No affiliation, endorsement or sponsorship is claimed or implied.
- No ComfyUI logo or other trademark artwork is redistributed in this repository.
- All other product names are the property of their respective owners.

## Colour values

The default palette (`#2e9e68`, `#4ade80`, `#34d399`, `#86efac`) consists of generic green tints
chosen for readability on a dark background. They are not derived from any product's brand palette.

## Reporting a problem

If you believe this repository infringes a right you hold, please open an issue at
<https://github.com/matrixnio/ComfyUI-PromptSyntaxHighlight/issues> with the specific file and claim,
and it will be addressed promptly.
