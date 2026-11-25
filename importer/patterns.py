"""Pattern detection and slugging rules for the Knowledge Kingdom manuscript.

Everything here is pattern-based, never a hard-coded chapter list, so new
chapters and Parts are picked up automatically.
"""
from __future__ import annotations

import re
import unicodedata

# --- Heading 1 ---------------------------------------------------------------
CHAPTER_H1 = re.compile(r"^\s*(\d{1,4})\s+(.+?)\s*$")
ABOUT_H1 = re.compile(r"note to the reader|^introduction$|^preface$", re.I)
ANSWER_KEY_H1 = re.compile(r"answer key", re.I)
FLASHCARD_BANK_H1 = re.compile(r"flashcard answer bank|flashcard bank", re.I)
ROADMAP_H1 = re.compile(r"where the book stands", re.I)

# --- Book Deck ---------------------------------------------------------------
PART_DECK = re.compile(r"^\s*PART\s+([IVXLCDM]+|\d+)\s*/\s*(.+?)\s*$", re.I)
EDITION_DECK = re.compile(r"^\s*(.+?)\s*/\s*WORKING EDITION\s+(\d+)\s*$", re.I)

# --- Heading 2 within a chapter ---------------------------------------------
NUMBERED_H2 = re.compile(r"^\s*(\d+)\.\s+(.+?)\s*$")
SUMMARY_H2 = re.compile(
    r"^(the chapter in .*principles|remember this chapter|key (ideas|points|takeaways|concepts)|chapter summary|summary|in brief)\b",
    re.I)
# "Practice laboratory — 30 exercises" (to Edition 25) or "Exercises — 30 questions" (Edition 39, ch. 032+)
PRACTICE_H2 = re.compile(r"^(practice (laboratory|lab|exercises|questions)|exercises)\b", re.I)
FLASHCARDS_H2 = re.compile(r"^flashcard", re.I)
SOURCES_H2 = re.compile(r"^(recommended )?(sources|further reading|references|bibliography)\b", re.I)
CONTENTS_H2 = re.compile(r"^contents\b", re.I)

# --- Answer key / flashcard bank H2 ------------------------------------------
ANSWER_CHAPTER_H2 = re.compile(r"chapter\s+(\d{1,4})\b", re.I)
FLASHCARD_CHAPTER_H2 = re.compile(r"^\s*(\d{1,4})\s*[·•\-–—:|]\s*(.+?)\s*$")

# --- Paragraph-level ---------------------------------------------------------
NUMBERED_ITEM = re.compile(r"^\s*(\d+)\.\s+")
FLASHCARD_PROMPT = re.compile(r"^\s*(?:\d+\.|F\d+\.|[•\-–·*])\s+")
SOURCE_ENTRY = re.compile(r"^\s*\[(\d+)\]\s*")
SOURCE_BULLET = re.compile(r"^\s*[•\-–·]\s+")
STATUS_NOTE = re.compile(r"^\s*status\s*:", re.I)
ROADMAP_LINE = re.compile(r"^\s*(\d{1,4})\s+(.+?)\s+·\s+(.+?)\s*$")
CONTENTS_LINE = re.compile(r"^\s*CHAPTER\s+(\d{1,4})\s+(.+?)\s*$")
FIGURE_CAPTION = re.compile(r"^\s*(?:Figure|Fig\.)\s+(\d+(?:[.\-]\d+)*)\.?\s*(.*)$", re.I)
EXCLUDED_BOX = re.compile(r"^\s*(EDITORIAL\b|CURRENT STATUS\b)", re.I)
# Body citation markers: [4], [1, 3], [2–4]
CITATION = re.compile(r"\[(\d+(?:\s*[,–\-]\s*\d+)*)\]")
URL = re.compile(r"https?://[^\s<>\"“”]+")
# Asterisk-delimited emphasis typed into the manuscript: *knowledge*
ASTERISK_EM = re.compile(r"(?<![\w*])\*(?=[^\s*])([^*\n]+?)(?<=[^\s*])\*(?![\w*])")

ROMAN = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}

SMALL_WORDS = {
    "a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into", "nor",
    "of", "on", "or", "over", "per", "the", "to", "upon", "via", "vs", "with",
}


def roman_to_int(s: str) -> int:
    s = s.upper()
    if s.isdigit():
        return int(s)
    total, prev = 0, 0
    for ch in reversed(s):
        v = ROMAN.get(ch, 0)
        total = total - v if v < prev else total + v
        prev = max(prev, v)
    return total


def title_case(text: str) -> str:
    """Title-case an ALL-CAPS heading, keeping short words lowercase."""
    tokens = re.sub(r"\s+", " ", text.strip().lower()).split(" ")
    out: list[str] = []
    for i, tok in enumerate(tokens):
        after_colon = bool(out) and out[-1].endswith(":")
        bare = tok.strip("(“\"'‘’,.;:")
        if i > 0 and not after_colon and bare in SMALL_WORDS:
            out.append(tok)
        else:
            out.append(re.sub(r"[a-z]", lambda m: m.group(0).upper(), tok, count=1))
    return " ".join(out)


def normalize_key(text: str) -> str:
    """Normalise a heading for use as a slug-registry key."""
    t = unicodedata.normalize("NFKC", text).lower()
    t = NUMBERED_H2.sub(lambda m: m.group(2), t) if NUMBERED_H2.match(t) else t
    t = re.sub(r"[“”\"'‘’]", "", t)
    t = re.sub(r"[^\w]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


# Words a shortened slug should never end on ("…-claim-and-a" reads as cut off).
SLUG_STOP_WORDS = frozenset(
    "a an the and or nor but of to in on at by for from with into onto as than that which who whom "
    "whose what when where why how is are was were be its their his her our your vs versus not no "
    "toward towards about between within without over under through across after before during "
    "against among upon beyond this these those it if so more much".split())


def _slug_base(text: str) -> str:
    t = unicodedata.normalize("NFKD", text)
    t = "".join(ch for ch in t if not unicodedata.combining(ch))
    t = t.lower().replace("&", " and ")
    t = re.sub(r"['’‘]", "", t)
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")


def slugify(text: str, max_len: int = 60) -> str:
    """URL slug, shortened at a word boundary without a dangling stop-word at the end."""
    t = _slug_base(text)
    if len(t) > max_len:
        words = t.split("-")
        kept: list[str] = []
        for w in words:
            if len("-".join(kept + [w])) > max_len:
                break
            kept.append(w)
        while len(kept) > 1 and kept[-1] in SLUG_STOP_WORDS:
            kept.pop()
        t = "-".join(kept) or words[0][:max_len]
    return t or "section"


def slugify_legacy(text: str, max_len: int = 60) -> str:
    """The pre-v2 rule (could end on "…-and-a"). Used only to migrate old registry entries."""
    t = _slug_base(text)
    if len(t) > max_len:
        cut = t[:max_len]
        if "-" in cut and t[max_len:max_len + 1] not in ("", "-"):
            cut = cut.rsplit("-", 1)[0]
        t = cut.strip("-")
    return t or "section"


# Redundant suffixes on special headings: "— Chapter 001", "— 30 exercises", "— 30 cards"
TITLE_SUFFIX = re.compile(r"\s*[—–-]\s*(?:chapter\s+\d+|\d+\s+(?:exercises|cards|prompts|questions))\s*$", re.I)


def strip_number(title: str) -> tuple[int | None, str]:
    m = NUMBERED_H2.match(title)
    number, bare = (int(m.group(1)), m.group(2).strip()) if m else (None, title.strip())
    return number, TITLE_SUFFIX.sub("", bare) or bare


def classify_h2(title: str, index: int) -> tuple[str, str | None]:
    """Return (type, warning) for a chapter's H2.

    Types: opening | section | summary | practice | flashcards | sources
    """
    _, bare = strip_number(title)
    if index == 0:
        return "opening", None
    if PRACTICE_H2.search(bare):
        return "practice", None
    if FLASHCARDS_H2.search(bare):
        return "flashcards", None
    if SOURCES_H2.search(bare):
        return "sources", None
    if SUMMARY_H2.search(bare):
        return "summary", None
    if NUMBERED_H2.match(title):
        return "section", None
    return "section", f"Unnumbered H2 “{title}” matched no special pattern; treated as a normal section."


def chapter_label(n: int) -> str:
    return f"{n:03d}"


def reading_time(words: int, wpm: int = 230) -> int:
    return max(1, -(-words // wpm))


def truncate(text: str, limit: int = 155) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].rstrip(",;:—–- ")
    return cut + "…"
