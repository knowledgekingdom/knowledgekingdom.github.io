"""Timeline: dated events taken from the book's own text, standard library only.

Sources, in order of preference:
  1. dated list items        "<strong>c. 1550–1070 BCE:</strong> New Kingdom, …"
  2. date-led sentences      "In 1415 Portuguese forces took Ceuta."
  3. section titles          "The siege of 1453: why the city fell, and what survived"

Years are integers, BCE negative (no year zero: 1 BCE = -1). Deep time ("300,000 years
ago") is stored as a year too (2000 - N). Hand corrections live in
content-meta/timeline.json (see CURATION_HELP).
"""
from __future__ import annotations

import hashlib
import re

CURATION_HELP = (
    "Hand corrections for the timeline (/timeline/). exclude: event ids or the first words of an event's "
    "text to leave out. add: extra events {chapter, url, start, end, approx, qual, text, textBg}. "
    "chapterSpans: {\"012\": [-3100, -30]} to set a chapter's bar on the overview (BCE negative). "
    "Event ids are listed in src/data/timeline.json."
)

MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December"
ORD_WORDS = {w: i for i, w in enumerate(
    "first second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth thirteenth fourteenth "
    "fifteenth sixteenth seventeenth eighteenth nineteenth twentieth twenty-first".split(), 1)}
NUM = r"\d{1,3}(?:,\d{3})+|\d+\.\d+(?=\s+million)|\d{1,4}"
ORD = r"(?:\d{1,2}(?:st|nd|rd|th)|" + "|".join(sorted(ORD_WORDS, key=len, reverse=True)) + r")"

# A date expression at the start of a string (sentence or list label).
DATE_LEAD = re.compile(
    rf"^(?P<prep>In|By|From|Between|On|After|Around|Before|During|Until|Since)?\s*(?:the\s+)?"
    rf"(?P<core>(?:(?:early|late|mid|middle)[-\s]+)?(?:c\.\s*|ca\.\s*|about\s+|around\s+|roughly\s+)?"
    rf"(?:(?:{MONTHS})\s+)?(?:{ORD}|(?:{NUM})s?)"
    rf"(?:\s*(?:–|-|/|\band\b|\bto\b|\bor\b(?:\s+(?:early|late))?)\s*(?:c\.\s*)?(?:(?:{MONTHS})\s+)?(?:{ORD}|(?:{NUM})s?))?"
    rf"(?:\s+(?:centur(?:y|ies)|millenni(?:um|a)))?"
    rf"(?:\s+(?:million\s+)?years\s+ago)?"
    rf"(?:\s*(?:BCE|CE|BC|AD))?)",
    re.I)


def _to_int(s: str) -> float:
    v = float(s.replace(",", ""))
    return int(v) if v.is_integer() else v


def parse_date(text: str) -> dict | None:
    """'c. 1550–1070 BCE' -> {start: -1550, end: -1070, approx: True, qual: None}. None if no date."""
    t = text.strip().rstrip(":,")
    m = DATE_LEAD.match(t)
    if not m or not re.search(r"\d|" + "|".join(ORD_WORDS), m.group("core"), re.I):
        return None
    core = m.group("core").strip()
    prep = (m.group("prep") or "").lower()
    approx = bool(re.search(r"\b(c\.|ca\.|about|around|roughly)", core, re.I)) or prep == "around"
    part = (re.match(r"(early|late|mid|middle)", core, re.I) or [None])[0]
    era = re.search(r"\b(BCE|BC|CE|AD)\b", core)
    bce = bool(era and era.group(1).upper() in ("BCE", "BC"))
    ago = re.search(r"(million\s+)?years\s+ago", core, re.I)
    unit = "century" if re.search(r"centur", core, re.I) else "millennium" if re.search(r"millenni", core, re.I) else None

    tokens = re.findall(rf"{ORD}|(?:{NUM})s?", core, re.I)
    if not tokens:
        return None

    def span(tok: str) -> tuple[int, int]:
        tok_l = tok.lower()
        if tok_l in ORD_WORDS or re.match(r"\d{1,2}(st|nd|rd|th)$", tok_l):
            n = ORD_WORDS.get(tok_l) or int(re.match(r"\d+", tok_l).group())
            size = 1000 if unit == "millennium" else 100
            lo, hi = (n - 1) * size + 1, n * size
            return (-hi, -lo) if bce else (lo, hi)
        decade = tok.endswith("s")
        n = _to_int(tok.rstrip("s"))
        if ago:
            years = int(round(n * (1_000_000 if ago.group(1) else 1)))
            return (2000 - years, 2000 - years)
        if decade:
            return (-(n + 9), -n) if bce else (n, n + 9)
        return (-n, -n) if bce else (n, n)

    first = span(tokens[0])
    last = span(tokens[-1]) if len(tokens) > 1 else first
    start, end = min(first[0], last[0]), max(first[1], last[1])
    if part and unit:  # "late 3rd millennium BCE": last third of the span
        third = (end - start) // 3
        start, end = {"early": (start, start + third), "late": (end - third, end)}.get(part.lower(), (start + third, end - third))
        approx = True
    if ago or unit:
        approx = True
    qual = {"before": "before", "after": "after", "by": "by", "since": "after", "until": "before"}.get(prep)
    if not era and not ago and not unit and start > 0 and len(str(abs(start))) < 3:
        return None  # "In 12 cases…": too short to be a year without an era
    return {"start": start, "end": end, "approx": approx, "qual": qual, "matched": m.group(0).strip(),
            "noEra": not era and not ago}


CITE = re.compile(r"\s*\\?\[[^\]]*\\?\]")


def _plain(md: str) -> str:
    s = re.sub(r"<[^>]+>", "", md)
    s = CITE.sub("", s)
    s = s.replace("\\", "")
    return re.sub(r"\s+", " ", s).strip()


ABBREV = re.compile(r"\b(?:St|Mt|Dr|Mr|Mrs|Ms|Jr|Sr|c|ca|e\.g|i\.e|vs|cf|No|vol|ed|eds)\.$", re.I)


def _sentences(par: str) -> list[str]:
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z“\"])", par)
    out: list[str] = []
    for p in parts:
        if out and ABBREV.search(out[-1]):  # "near the modern city of St. Louis": not a sentence end
            out[-1] += " " + p
        else:
            out.append(p)
    return [s for s in out if s]


def _id(chapter: int, text: str) -> str:
    return f"{chapter:03d}-" + hashlib.sha1(text.encode("utf-8")).hexdigest()[:8]


def extract(docs: list[tuple[str, int, str, str]]) -> list[dict]:
    """docs: (url, chapter, section title, section markdown). Returns events sorted by date."""
    events: list[dict] = []
    seen_text: set[str] = set()

    def add(chapter, url, date, text, source, bce_max=None):
        text = text.strip()
        # Sections about antiquity often write "Around 550 he…" with the BCE implied.
        if date["noEra"] and bce_max and 0 < date["start"] <= bce_max + 300:
            date = {**date, "start": -date["end"], "end": -date["start"], "noEra": False}
        if not text or text in seen_text or len(text) > 320:
            return
        seen_text.add(text)
        events.append({"id": _id(chapter, text), "chapter": f"{chapter:03d}", "url": url,
                       "start": date["start"], "end": date["end"], "approx": date["approx"], "qual": date["qual"],
                       "noEra": date["noEra"], "text": text, "source": source})

    for url, chapter, title, md in docs:
        body = md.split("\n\n")
        years_here: set[int] = set()
        plain_all = _plain(md)
        bce = [_to_int(x) for x in re.findall(rf"({NUM})\s*(?:BCE|BC)\b", plain_all)]
        bce_max = max(bce) if bce and not re.search(r"\b(?:CE|AD)\b", plain_all) else None
        for block in body:
            block = block.strip()
            # 1. dated list items: <strong>DATE:</strong> text
            m = re.match(r"^<strong>([^<]{2,70}?):</strong>\s*(.+)$", block, re.S)
            if m:
                d = parse_date(m.group(1))
                if d:
                    text = _plain(m.group(2))
                    add(chapter, url, d, text, "list", bce_max)
                    years_here.add(d["start"])
                    continue
            if block.startswith(("<", "!", "|", "#")):
                continue
            # 2. date-led sentences
            for s in _sentences(_plain(block)):
                d = parse_date(s)
                if d and re.match(r"^(In|By|From|Between|On|After|Around|Before|During|Until|Since)\b", s):
                    add(chapter, url, d, s, "sentence", bce_max)
                    years_here.add(d["start"])
        # 3. a year in the section title, if the section gave no event for it
        tm = re.search(r"\b(?:c\.\s*)?(\d{3,4})(?:\s*[–-]\s*(\d{2,4}))?(\s*BCE)?\b", title)
        if tm:
            d = parse_date(tm.group(0))
            if d and d["start"] not in years_here:
                add(chapter, url, d, title, "title", bce_max)
    events.sort(key=lambda e: (e["start"], e["end"], e["chapter"], e["text"]))
    return events


def apply_curation(events: list[dict], curation: dict, report_note,
                   docs: list[tuple[str, int, str, str]] | None = None) -> list[dict]:
    excl = curation.get("exclude", [])
    replace = curation.get("replace", {})
    out = []
    used = set()
    for e in events:
        if any(x == e["id"] or (len(x) > 8 and e["text"].startswith(x)) for x in excl):
            used.add(e["id"])
            continue
        if e["id"] in replace:  # reworded label, e.g. naming who "he" is
            r = replace[e["id"]]
            e = {**e, "text": r["text"], **({"textBg": r["textBg"]} if r.get("textBg") else {})}
            for k in ("start", "end", "approx", "qual"):
                if k in r:
                    e[k] = r[k]
            used.add(e["id"])
        out.append(e)
    for x in [*excl, *replace]:
        if len(x) == 12 and x[3] == "-" and x not in used:
            report_note("Timeline", f"Correction for event {x} no longer matches any event (text changed?).")
    plain_docs = [(url, ch, _plain(md)) for url, ch, _, md in (docs or [])]
    for a in curation.get("add", []):
        url, chapter = a.get("url"), a.get("chapter")
        if not url:  # find the section that contains this sentence
            hit = next(((u, c) for u, c, txt in plain_docs if a.get("find", a["text"]) in txt), None)
            if hit is None:
                report_note("Timeline", f"Added event not found in the book any more: “{a['text'][:70]}”")
                continue
            url, chapter = hit
        e = {"id": _id(int(chapter), a["text"]), "chapter": f"{int(chapter):03d}", "url": url,
             "start": a["start"], "end": a.get("end", a["start"]), "approx": bool(a.get("approx")),
             "qual": a.get("qual"), "noEra": False, "text": a.get("replaceText") or a["text"], "source": "added"}
        if a.get("textBg"):
            e["textBg"] = a["textBg"]
        out.append(e)
    out.sort(key=lambda e: (e["start"], e["end"], e["chapter"], e["text"]))
    return out


def chapter_spans(events: list[dict], curation: dict) -> dict[str, list[int]]:
    spans: dict[str, list[int]] = {}
    for e in events:
        s = spans.setdefault(e["chapter"], [e["start"], e["end"]])
        s[0], s[1] = min(s[0], e["start"]), max(s[1], e["end"])
    for ch, span in curation.get("chapterSpans", {}).items():
        spans[f"{int(ch):03d}"] = list(span)
    return dict(sorted(spans.items()))
