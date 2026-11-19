"""Translate the generated English site content into Bulgarian — free and offline.

Uses the open OPUS-MT English→Bulgarian model (CC-BY 4.0, packaged by Argos
Translate) through CTranslate2 on your own computer. No account, no API key,
no cost, and nothing leaves your machine.

    npm run translate              (runs this with .venv-translate's Python)

Inputs : src/content/{chapters,sections,pages}, src/data/*.json   (from the importer)
Outputs: src/content/bg/...,  src/data/bg/*.json                  (GENERATED)
State  : content-meta/translations/bg.json            sentence cache (committed)
         content-meta/translations/bg-overrides.json  your corrections (hand-edited, always win)

Only sentences that are new or changed since the last run go through the model,
so re-running after an edition update takes seconds. Re-running with no changes
produces no diff.
"""
from __future__ import annotations

import argparse
import html
import json
import os
import re
import shutil
import sys
import time
import urllib.request
import zipfile
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from render import escape_md  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
MODEL_URL = "https://argos-net.com/v1/translate-en_bg-1_9.argosmodel"
MODEL_DIR = ROOT / ".cache" / "models" / "translate-en_bg-1_9"
META = ROOT / "content-meta" / "translations"
CACHE_FILE = META / "bg.json"
OVERRIDES_FILE = META / "bg-overrides.json"
OUT_CONTENT = ROOT / "src" / "content" / "bg"
OUT_DATA = ROOT / "src" / "data" / "bg"

MONTHS = {"January": "януари", "February": "февруари", "March": "март", "April": "април", "May": "май",
          "June": "юни", "July": "юли", "August": "август", "September": "септември", "October": "октомври",
          "November": "ноември", "December": "декември"}

# Names the model must not translate: swapped for an opaque token around the model call.
PROTECTED = {"Knowledge Kingdom": "KKBOOK"}

# Abbreviations that end with a period but do not end a sentence.
ABBREV = {"e.g", "i.e", "etc", "vs", "mr", "mrs", "ms", "dr", "st", "c", "ca", "approx", "fig", "u.s",
          "u.k", "b.c", "a.d", "cf", "al", "ed", "eds", "vol", "pp", "p", "jr", "sr", "mt", "ft", "km", "lit"}
SENT_END = re.compile(r"(?<=[.!?…])([”’\"')\]]*)\s+(?=[\"“‘'(\[]?[A-Z0-9])")


# =============================================================================
# Sentence-level translator with cache, overrides and a collect pass
# =============================================================================
class Translator:
    def __init__(self, overrides: dict[str, str], cache: dict[str, str]):
        self.overrides = overrides
        self.cache = cache
        self.used: set[str] = set()
        self.pending: set[str] = set()
        self.collecting = True
        self.fallbacks: list[str] = []
        self.mt_count = 0

    # -- public ------------------------------------------------------------------
    def text(self, s: str) -> str:
        """Translate plain text (any number of sentences), keeping outer whitespace."""
        if not s or not s.strip():
            return s
        lead = s[: len(s) - len(s.lstrip())]
        trail = s[len(s.rstrip()):]
        core = re.sub(r"\s+", " ", s.strip())
        if core in self.overrides:
            return lead + self.overrides[core] + trail
        if not re.search(r"[A-Za-z]{2}", core):  # numbers, dates, symbols
            return s
        # Keep list-style prefixes ("A. ", "12. ") outside the model.
        m = re.match(r"^((?:[A-Z]|\d{1,3})[.)]\s+)(.+)$", core)
        if m and len(m.group(2)) > 3:
            return lead + m.group(1) + self.text(m.group(2)) + trail
        return lead + " ".join(self._sentence(x) for x in split_sentences(core)) + trail

    def override_only(self, s: str) -> str:
        return self.overrides.get(re.sub(r"\s+", " ", s.strip()), s)

    # -- internals ---------------------------------------------------------------
    def _sentence(self, s: str) -> str:
        if s in self.overrides:
            return self.overrides[s]
        if not re.search(r"[A-Za-z]{2}", s):
            return s
        self.used.add(s)
        cached = self.cache.get(s)
        if cached is not None and all(term in cached for term in PROTECTED if term in s):
            return cached
        if self.collecting:
            self.pending.add(s)
            return s
        return s  # model failed for this one; English kept

    def run_model(self, model_dir: Path, batch: int = 48):
        todo = sorted(self.pending, key=len)
        if not todo:
            return
        import ctranslate2  # noqa: PLC0415  (only needed when there is work to do)
        import sentencepiece as spm  # noqa: PLC0415
        sp = spm.SentencePieceProcessor(model_file=str(model_dir / "sentencepiece.model"))
        tr = ctranslate2.Translator(str(model_dir / "model"), device="cpu", compute_type="int8")
        t0 = time.time()
        print(f"Translating {len(todo)} new sentences…", flush=True)
        for i in range(0, len(todo), batch):
            chunk = todo[i:i + batch]
            toks = [sp.encode(protect(s), out_type=str) for s in chunk]
            res = tr.translate_batch(toks, beam_size=4, max_batch_size=batch,
                                     max_decoding_length=512, repetition_penalty=1.1)
            for src, r in zip(chunk, res):
                out = "".join(r.hypotheses[0]).replace("▁", " ").strip()
                if looks_degenerate(src, out):
                    self.fallbacks.append(src)
                    continue
                self.cache[src] = tidy_bg(unprotect(out))
                self.mt_count += 1
            done = min(i + batch, len(todo))
            if done == len(todo) or (i // batch) % 20 == 0:
                rate = done / max(time.time() - t0, 0.01)
                print(f"  {done}/{len(todo)}  ({rate:.0f}/s)", flush=True)


def protect(s: str) -> str:
    for term, token in PROTECTED.items():
        s = s.replace(term, token)
    return s


def unprotect(s: str) -> str:
    for term, token in PROTECTED.items():
        s = s.replace(token, term)
    return s


def split_sentences(text: str) -> list[str]:
    parts: list[str] = []
    start = 0
    for m in SENT_END.finditer(text):
        end = m.start() + len(m.group(1))
        before = text[start:end].rstrip()
        last = re.findall(r"([A-Za-z][A-Za-z.]*)\.[”’\"')\]]*$", before)
        word = last[0].lower() if last else ""
        if word in ABBREV or (len(word) == 1 and word.isalpha()):  # abbreviation / initial
            continue
        parts.append(before)
        start = m.end()
    parts.append(text[start:].strip())
    return [p for p in parts if p]


def looks_degenerate(src: str, out: str) -> bool:
    if not out:
        return True
    if len(out) > 3 * len(src) + 40:
        return True
    words = out.split()
    if len(words) >= 8 and len(set(words)) / len(words) < 0.35:  # "and and and and"
        return True
    return False


def tidy_bg(s: str) -> str:
    s = re.sub(r"\s+([,.;:!?])", r"\1", s)
    s = re.sub(r"\s{2,}", " ", s)
    return s


# =============================================================================
# Inline HTML: translate text runs, keep markup, citations and links
# =============================================================================
TOKEN = re.compile(r"(<[^>]+>)")
CITE_GROUP = re.compile(r"\[(?:<a [^>]*class=\"cite\"[^>]*>\d+</a>|[\s,–\-]|\d+)+\]")
EMPH = re.compile(r"^</?(strong|em|b|i)\b", re.I)


def translate_html(fragment: str, tr: Translator, md: bool = False) -> str:
    """Translate an inline HTML (or Markdown-with-inline-HTML) fragment."""
    if md:
        fragment = re.sub(r"\\(.)", r"\1", fragment)  # undo Markdown escapes
    # Protect citation groups ("[<a class=cite>4</a>]") as opaque units.
    protected: list[str] = []

    def keep(m):
        protected.append(m.group(0))
        return f"\x00{len(protected) - 1}\x00"
    fragment = CITE_GROUP.sub(keep, fragment)

    # A leading bold/italic run ("<strong>Essential terms.</strong> …") is its own phrase.
    lead_html = ""
    lm = re.match(r"^\s*<(strong|em)>(.*?)</\1>", fragment, re.S)
    if lm and not TOKEN.search(lm.group(2)):
        lead_html = f"<{lm.group(1)}>{_tr_run(lm.group(2), tr, md)}</{lm.group(1)}>"
        fragment = fragment[lm.end():]

    out: list[str] = []
    buf: list[str] = []

    def flush():
        if buf:
            out.append(_tr_run("".join(buf), tr, md))
            buf.clear()
    for tok in TOKEN.split(fragment):
        if not tok:
            continue
        if tok.startswith("<"):
            if EMPH.match(tok):
                continue  # mid-sentence emphasis can't survive translation; drop it, keep the sentence whole
            flush()
            out.append(tok)
        else:
            parts = re.split(r"(\x00\d+\x00)", tok)
            for p in parts:
                if re.fullmatch(r"\x00\d+\x00", p):
                    flush()
                    out.append(p)
                else:
                    buf.append(p)
    flush()
    result = lead_html + "".join(out)

    def restore(m):
        p = protected[int(m.group(1))]
        return "\\[" + p[1:-1] + "\\]" if md else p  # keep Markdown brackets escaped
    return re.sub(r"\x00(\d+)\x00", restore, result)


def _tr_run(text: str, tr: Translator, md: bool) -> str:
    plain = html.unescape(text)
    translated = tr.text(plain)
    return escape_md(translated) if md else html.escape(translated, quote=False)


# =============================================================================
# Markdown files
# =============================================================================
FM_TEXT = {"title", "chapterTitle", "openingTitle", "description", "partTitle", "standfirst"}
FM_HTML = {"standfirstHtml"}


def translate_md_file(src: Path, tr: Translator) -> str:
    raw = src.read_text(encoding="utf-8")
    _, fm, body = raw.split("---\n", 2)
    lines = []
    for line in fm.strip("\n").split("\n"):
        key, _, val = line.partition(": ")
        v = json.loads(val)
        if isinstance(v, str) and key in FM_TEXT:
            v = tr.text(v)
        elif isinstance(v, str) and key in FM_HTML:
            v = translate_html(v, tr)
        lines.append(f"{key}: {json.dumps(v, ensure_ascii=False)}")
    blocks = body.strip("\n").split("\n\n") if body.strip() else []
    out_blocks = [translate_block(b, tr) for b in blocks]
    return "---\n" + "\n".join(lines) + "\n---\n\n" + ("\n\n".join(out_blocks) + "\n" if out_blocks else "")


def translate_block(b: str, tr: Translator) -> str:
    hm = re.match(r"^(#{2,4}) (.*)$", b, re.S)
    if hm:
        return hm.group(1) + " " + escape_md(tr.text(re.sub(r"\\(.)", r"\1", hm.group(2))))
    if b.startswith("<figure") or b.strip() == "</figure>":
        return b
    m = re.match(r"^!\[(.*)\]\((.+)\)$", b)
    if m:
        # bg files live one folder deeper (src/content/bg/...), so relative paths gain one "../"
        path = "../" + m.group(2) if m.group(2).startswith("../") else m.group(2)
        return f"![{tr.text(m.group(1)).replace('[', '(').replace(']', ')')}]({path})"
    if b.startswith("<figcaption>"):
        inner, rest = b[len("<figcaption>"):].split("</figcaption>", 1)
        inner = re.sub(r'<span class="figure-label">Figure ([\d.\-]+\.?)</span>',
                       r'<span class="figure-label">Фигура \1</span>', inner)
        anchor = re.search(r'\s*<a class="figure-anchor".*$', inner, re.S)
        core = inner[:anchor.start()] if anchor else inner
        label = re.match(r'^(<span class="figure-label">.*?</span>\s*)', core)
        text = core[label.end():] if label else core
        return ("<figcaption>" + (label.group(1) if label else "") + translate_html(text, tr, md=True)
                + (anchor.group(0) if anchor else "") + "</figcaption>" + rest)
    if b.startswith("<"):  # HTML block: <p class=…>, <aside>, tables
        return translate_html(b, tr)
    out = translate_html(b, tr, md=True)
    out = re.sub(r"^(\d+)\.(\s)", r"\1\\.\2", out)
    out = re.sub(r"^([-+])(\s)", r"\\\1\2", out)
    return out


# =============================================================================
# Data files
# =============================================================================
def translate_data(name: str, data, tr: Translator):
    T, H = tr.text, (lambda h: translate_html(h, tr))
    if name == "book":
        d = dict(data)
        d["title"] = tr.override_only(data["title"])
        d["titleDisplay"] = tr.override_only(data["titleDisplay"])
        d["subtitle"] = T(data["subtitle"])
        d["editionDate"] = " ".join(MONTHS.get(w, w) for w in data["editionDate"].split())
        d["statusNote"] = T(data["statusNote"])
        d["parts"] = [{**p, "title": T(p["title"])} for p in data["parts"]]
        d["readingOrder"] = [{**e, "title": T(e["title"])} for e in data["readingOrder"]]
        return d
    if name == "roadmap":
        return {
            "groups": [{**g, "title": re.sub(r"^Chapters\b", "Глави", g["title"])} for g in data["groups"]],
            "chapters": [{**c, "title": T(c["title"])} for c in data["chapters"]],
        }
    if name == "flashcards":
        return {"intro": H(data["intro"]), "chapters": {
            k: {"deck": T(v["deck"]), "cards": [{**c, "front": H(c["front"]), "back": H(c["back"])} for c in v["cards"]]}
            for k, v in data["chapters"].items()}}
    if name == "practice":
        return {k: {
            "title": T(v["title"]), "answerIntro": H(v["answerIntro"]),
            "groups": [{"title": T(g["title"]) if g["title"] else None, "intro": [H(x) for x in g["intro"]],
                        "exercises": [{**e, "html": [H(x) for x in e["html"]],
                                       "answer": H(e["answer"]) if e["answer"] else None}
                                      for e in g["exercises"]]} for g in v["groups"]],
        } for k, v in data.items()}
    if name == "timeline":  # event sentences come from the book, so they are usually already in the cache
        return {**data, "events": [{**{k: v for k, v in e.items() if k != "textBg"},
                                    "text": e.get("textBg") or T(e["text"])} for e in data["events"]]}
    if name == "sources":  # bibliographic entries stay in the original language
        return {k: {**v, "title": T(v["title"]), "intro": [H(x) for x in v["intro"]],
                    "notes": [H(x) for x in v["notes"]]} for k, v in data.items()}
    raise ValueError(name)


DATA_FILES = ["book", "roadmap", "flashcards", "practice", "sources", "timeline"]


# =============================================================================
def ensure_model(model_dir: Path):
    if (model_dir / "model" / "model.bin").exists():
        return
    model_dir.parent.mkdir(parents=True, exist_ok=True)
    archive = model_dir.parent / (model_dir.name + ".argosmodel")
    if not archive.exists():
        print(f"Downloading the English→Bulgarian model (~70 MB, one time)…", flush=True)
        urllib.request.urlretrieve(MODEL_URL, archive)
    with zipfile.ZipFile(archive) as z:
        z.extractall(model_dir.parent)


def build_all(tr: Translator) -> dict[str, str]:
    """Translate everything into an in-memory {relative path: text} map."""
    files: dict[str, str] = {}
    content = ROOT / "src" / "content"
    for sub in ("chapters", "sections", "pages"):
        for src in sorted((content / sub).rglob("*.md")):
            rel = src.relative_to(content).as_posix()
            files[f"src/content/bg/{rel}"] = translate_md_file(src, tr)
    for name in DATA_FILES:
        path = ROOT / "src" / "data" / f"{name}.json"
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        files[f"src/data/bg/{name}.json"] = json.dumps(translate_data(name, data, tr), ensure_ascii=False, indent=2) + "\n"
    return files


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", default=str(MODEL_DIR))
    ap.add_argument("--no-model", action="store_true", help="only use the cache and overrides (no translation)")
    args = ap.parse_args(argv)

    META.mkdir(parents=True, exist_ok=True)
    overrides = _load(OVERRIDES_FILE, {})
    overrides = {re.sub(r"\s+", " ", k.strip()): v for k, v in overrides.items() if not k.startswith("_")}
    cache = _load(CACHE_FILE, {})
    tr = Translator(overrides, cache)

    build_all(tr)                       # pass 1: find sentences that need translating
    if tr.pending and not args.no_model:
        ensure_model(Path(args.model))
        tr.run_model(Path(args.model))
    tr.collecting = False
    tr.used.clear()
    files = build_all(tr)               # pass 2: assemble the translated site

    for d in (OUT_CONTENT, OUT_DATA):
        if d.exists():
            shutil.rmtree(d)
    for rel, text in files.items():
        p = ROOT / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")
    # Keep only sentences still in use so the cache doesn't grow forever.
    pruned = {k: v for k, v in sorted(tr.cache.items()) if k in tr.used}
    CACHE_FILE.write_text(json.dumps(pruned, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
    if not OVERRIDES_FILE.exists():
        OVERRIDES_FILE.write_text(json.dumps({
            "_help": "Better translations that always win over the machine. Key = exact English sentence or "
                     "title, value = Bulgarian. Re-run `npm run translate` after editing."}, ensure_ascii=False,
            indent=2) + "\n", encoding="utf-8")
    missing = sorted(set(tr.fallbacks))
    report = ["# Translation report (Bulgarian)", "", "*GENERATED by `npm run translate`.*", "",
              f"- Sentences in use: {len(pruned)}",
              f"- Human overrides available: {len(overrides)}",
              f"- Kept in English (model output looked wrong): {len(missing)}", ""]
    if missing:
        report += ["Add these to `content-meta/translations/bg-overrides.json` to translate them:", ""]
        report += [f"- {s}" for s in missing[:200]]
    (META / "REPORT.md").write_text("\n".join(report) + "\n", encoding="utf-8")
    print(f"Done: {len(files)} files, {len(pruned)} sentences, {tr.mt_count} newly translated, "
          f"{len(missing)} kept in English. See content-meta/translations/REPORT.md")


def _load(path: Path, default):
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return default


if __name__ == "__main__":
    main()
