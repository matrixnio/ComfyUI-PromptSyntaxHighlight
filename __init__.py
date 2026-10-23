"""ComfyUI Prompt Syntax Highlight.

A pure front-end extension that highlights structural markers inside ComfyUI
prompt text boxes:  [Shot 1] / <d>...</d> / (s1) (s2)  and anything else you
define in ``web/prompt_syntax_highlight.js`` (the ``RULES`` array).

It registers no nodes and patches no other extension's files. Everything is
drawn on a transparent overlay, so the original textarea keeps all of its
native behaviour (typing, caret, selection, undo, copy, scroll).
Deleting this folder is a complete rollback.

Optional self-check endpoints (they only keep counters, no prompt text is
ever transmitted or stored):

    GET  /prompt_syntax_highlight/status
         -> {"hits": 3, "targets": 4, "painted": 4, "last_error": ""}

``hits`` counts page loads that executed this extension. If it stays at 0 the
front-end never ran (usually ComfyUI was not restarted, or the browser served
a cached copy of the JS - do a hard refresh).
"""

from aiohttp import web

try:  # ComfyUI >= 0.2
    from server import PromptServer
except Exception:  # pragma: no cover - not running inside ComfyUI
    PromptServer = None

__version__ = "1.0.0"

WEB_DIRECTORY = "./web"

# No Python nodes: this extension is JavaScript only.
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

__all__ = [
    "WEB_DIRECTORY",
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
    "__version__",
]

_state = {
    "hits": 0,
    "last_hit": 0.0,
    "targets": 0,
    "painted": 0,
    "last_error": "",
}


def _register_routes():
    """Attach the diagnostic routes, but never let a failure break ComfyUI startup."""
    if PromptServer is None or getattr(PromptServer, "instance", None) is None:
        return

    routes = PromptServer.instance.routes

    @routes.get("/prompt_syntax_highlight/status")
    async def _status(request):
        return web.json_response({"version": __version__, **_state})

    @routes.post("/prompt_syntax_highlight/ping")
    async def _ping(request):
        import time

        _state["hits"] += 1
        _state["last_hit"] = time.time()
        return web.json_response({"ok": True, "hits": _state["hits"]})

    @routes.post("/prompt_syntax_highlight/report")
    async def _report(request):
        try:
            body = await request.json()
        except Exception:
            body = {}
        try:
            if "targets" in body:
                _state["targets"] = int(body.get("targets") or 0)
            if "painted" in body:
                _state["painted"] = int(body.get("painted") or 0)
            if body.get("error"):
                _state["last_error"] = str(body["error"])[:300]
        except Exception:
            pass
        return web.json_response({"ok": True})


try:
    _register_routes()
except Exception as exc:  # pragma: no cover
    print(f"[PromptSyntaxHighlight] route registration skipped: {exc}")
