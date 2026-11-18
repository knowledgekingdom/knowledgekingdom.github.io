"""Turn formatted segments into Markdown (for content pages) or HTML (for data JSON).

Inline formatting is emitted as inline HTML (<strong>, <em>, <a>) inside the
Markdown so emphasis never depends on Markdown's delimiter-flanking rules.
"""
from __future__ import annotations

import html
import re
from dataclasses import replace
from typing import Callable

from docx_reader import Seg
from patterns import ASTERISK_EM, CITATION, URL


def merge(segs: list[Seg]) -> list[Seg]:
    out: list[Seg] = []
    for s in segs:
        if s.image is None and not s.text:
            continue
        if out and s.image is None and out[-1].image is None and out[-1].same_format(s):
            out[-1] = replace(out[-1], text=out[-1].text + s.text)
        else:
            out.append(replace(s))
    return out


def text_only(segs: list[Seg]) -> list[Seg]:
    return [s for s in segs if s.image is None]


def apply_asterisk_emphasis(segs: list[Seg]) -> list[Seg]:
    """`*word*` typed in the manuscript becomes real italics."""
    out: list[Seg] = []
    for s in segs:
        if s.image is not None or "*" not in s.text or s.href:
            out.append(s)
            continue
        pos = 0
        for m in ASTERISK_EM.finditer(s.text):
            if m.start() > pos:
                out.append(replace(s, text=s.text[pos:m.start()]))
            out.append(replace(s, text=m.group(1), italic=True))
            pos = m.end()
        if pos < len(s.text):
            out.append(replace(s, text=s.text[pos:]))
    return merge(out)


def strip_prefix(segs: list[Seg], pattern: re.Pattern) -> tuple[list[Seg], re.Match | None]:
    """Remove a regex-matched prefix (e.g. "12. ") from the start of the segments."""
    full = "".join(s.text for s in segs if s.image is None)
    m = pattern.match(full)
    if not m:
        return segs, None
    remaining = m.end()
    out: list[Seg] = []
    for s in segs:
        if remaining > 0 and s.image is None:
            if len(s.text) <= remaining:
                remaining -= len(s.text)
                continue
            out.append(replace(s, text=s.text[remaining:]))
            remaining = 0
        else:
            out.append(s)
    return out, m


def linkify(segs: list[Seg], cite: Callable[[int], str | None] | None = None,
            urls: bool = True, on_unmatched: Callable[[str], None] | None = None) -> list[Seg]:
    """Turn citation markers and bare URLs into link segments."""
    out: list[Seg] = []
    for s in segs:
        if s.image is not None or s.href:
            out.append(s)
            continue
        out.extend(_linkify_text(s, cite, urls, on_unmatched))
    return merge(out)


def _linkify_text(s: Seg, cite, urls, on_unmatched) -> list[Seg]:
    patterns = []
    if cite:
        patterns.append(("cite", CITATION))
    if urls:
        patterns.append(("url", URL))
    if not patterns:
        return [s]
    combined = re.compile("|".join(f"(?P<{name}>{p.pattern})" for name, p in patterns))
    out: list[Seg] = []
    pos = 0
    for m in combined.finditer(s.text):
        if m.start() > pos:
            out.append(replace(s, text=s.text[pos:m.start()]))
        token = m.group(0)
        if "url" in combined.groupindex and m.group("url") is not None:
            url = token.rstrip(".,;:)]’”'\"")
            tail = token[len(url):]
            out.append(replace(s, text=url, href=url))
            if tail:
                out.append(replace(s, text=tail))
        else:
            out.extend(_cite_segments(s, token, cite, on_unmatched))
        pos = m.end()
    if pos < len(s.text):
        out.append(replace(s, text=s.text[pos:]))
    return out


def _cite_segments(s: Seg, token: str, cite, on_unmatched) -> list[Seg]:
    """Link each number inside a marker like [1, 3] to its source entry."""
    inner = token[1:-1]
    parts = re.split(r"(\s*[,–\-]\s*)", inner)
    out = [replace(s, text="[")]
    any_linked = False
    for part in parts:
        if part.strip().isdigit():
            href = cite(int(part))
            if href:
                out.append(replace(s, text=part, href=href, cls="cite"))
                any_linked = True
                continue
            if on_unmatched:
                on_unmatched(token)
        out.append(replace(s, text=part))
    out.append(replace(s, text="]"))
    if not any_linked:
        return [replace(s, text=token)]
    return out


# --- Markdown ----------------------------------------------------------------
_MD_SPECIAL = re.compile(r"([\\`*_\[\]~|#])")


def escape_md(text: str) -> str:
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return _MD_SPECIAL.sub(r"\\\1", text)


def _wrap(inner: str, s: Seg) -> str:
    if s.italic:
        inner = f"<em>{inner}</em>"
    if s.bold:
        inner = f"<strong>{inner}</strong>"
    if s.href:
        cls = f' class="{s.cls}"' if s.cls else ""
        ext = "" if s.href.startswith(("/", "#")) else ' rel="noopener"'
        inner = f'<a href="{html.escape(s.href, quote=True)}"{cls}{ext}>{inner}</a>'
    return inner


def _render(segs: list[Seg], esc: Callable[[str], str]) -> str:
    parts: list[str] = []
    for s in merge(segs):
        if s.image is not None:
            continue
        text = s.text
        if not (s.bold or s.italic or s.href):
            parts.append(esc(text))
            continue
        lead = text[: len(text) - len(text.lstrip())]
        trail = text[len(text.rstrip()):]
        core = text.strip()
        if not core:
            parts.append(esc(text))
            continue
        parts.append(esc(lead) + _wrap(esc(core), s) + esc(trail))
    return "".join(parts)


def to_md(segs: list[Seg]) -> str:
    out = _render(segs, escape_md).strip()
    out = re.sub(r"[ \t]*\n[ \t]*", "<br>\n", out)
    # Stop a leading "1. " / "- " / "+ " from becoming a list.
    out = re.sub(r"^(\d+)\.(\s)", r"\1\\.\2", out)
    out = re.sub(r"^([-+])(\s)", r"\\\1\2", out)
    return out


def to_html(segs: list[Seg]) -> str:
    out = _render(segs, lambda t: html.escape(t, quote=False)).strip()
    return re.sub(r"\s*\n\s*", "<br>", out)


def plain(segs: list[Seg]) -> str:
    return re.sub(r"\s+", " ", "".join(s.text for s in segs if s.image is None)).strip()
