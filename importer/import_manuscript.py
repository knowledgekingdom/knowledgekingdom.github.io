"""Knowledge Kingdom importer: manuscript .docx files -> Astro content + data JSON.

Usage:
    python importer/import_manuscript.py [file.docx ...] [--out ROOT]

With no paths, every .docx in manuscript/ is read as one book: the file with the
title page first, then the rest in chapter order. The book can be one big file,
one file per chapter, or a mix. If the same chapter is in more than one file, the
most recently saved file wins (noted in the report). Everything written under
src/content/, src/data/ and src/assets/figures/ is regenerated on every run.
content-meta/ holds persisted state (slug registry, manifest) and hand edits
(slug overrides). Running twice on the same file produces no diff.
"""
from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import os
import posixpath
import re
import shutil
import sys
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import patterns as P  # noqa: E402
import related as RELATED  # noqa: E402
import timeline as TIMELINE  # noqa: E402
import render as R  # noqa: E402
from docx_reader import DocxReader, Paragraph, Seg, Table  # noqa: E402

GENERATED_DIRS = ["src/content/chapters", "src/content/sections", "src/content/pages",
                  "src/data", "src/assets/figures"]
SPECIAL_SLUGS = {"practice": "practice", "flashcards": "flashcards", "sources": "sources", "summary": "summary"}
DROP_STYLES = {"Book Small"}
KNOWN_STYLES = {"Title", "Book Deck", "Heading 1", "Heading 2", "Heading 3", "Normal",
                "Chapter Standfirst", "Figure Caption", "Source Note", "Book Small"}


# =============================================================================
# Reading several .docx files as one book
# =============================================================================
@dataclass
class FileStart:
    """Marker block emitted before each file's content."""
    index: int
    name: str


class ManuscriptReader:
    """Walks several .docx files in order, as if they were one document.

    Image targets are prefixed with the file index ("3|word/media/image1.png")
    so read_bytes() can find the right file.
    """

    def __init__(self, paths: list[Path]):
        self.paths = list(paths)
        self.readers = [DocxReader(str(p)) for p in self.paths]

    def blocks(self):
        for i, reader in enumerate(self.readers):
            yield FileStart(i, self.paths[i].name)
            for block in reader.blocks():
                if isinstance(block, Paragraph):
                    for s in block.segs:
                        if s.image is not None:
                            s.image.target = f"{i}|{s.image.target}"
                yield block

    def read_bytes(self, target: str) -> bytes:
        i, _, inner = target.partition("|")
        return self.readers[int(i)].read_bytes(inner)

    def mtime(self, index: int) -> float:
        return self.paths[index].stat().st_mtime


def order_manuscripts(paths: list[Path]) -> list[Path]:
    """Title-page file first, then by the first chapter number each file contains."""
    def key(p: Path):
        has_title, first = False, 10 ** 6
        for b in DocxReader(str(p)).blocks():
            if isinstance(b, Paragraph):
                if b.style == "Title":
                    has_title = True
                elif b.style == "Heading 1":
                    m = P.CHAPTER_H1.match(b.text.strip())
                    if m:
                        first = int(m.group(1))
                        break
        return (not has_title, first, p.name)
    return sorted(paths, key=key)


# =============================================================================
# Data model
# =============================================================================
@dataclass
class Section:
    title: str                      # as written in the manuscript
    blocks: list = field(default_factory=list)
    type: str = "section"
    number: int | None = None       # "3. Foo" -> 3
    display_title: str = ""         # number stripped
    slug: str = ""
    key: str = ""


@dataclass
class Chapter:
    number: int
    heading: str                    # H1 text after the number (usually ALL CAPS)
    part: dict | None
    title: str = ""
    standfirst: list = field(default_factory=list)
    pre_blocks: list = field(default_factory=list)  # before first H2
    sections: list[Section] = field(default_factory=list)
    slug: str = ""
    source: int = 0                 # index of the manuscript file it came from

    @property
    def label(self) -> str:
        return P.chapter_label(self.number)


@dataclass
class Book:
    title: str = ""
    subtitle: str = ""
    edition: int | None = None
    edition_date: str = ""
    status_note: str = ""
    parts: list[dict] = field(default_factory=list)
    chapters: list[Chapter] = field(default_factory=list)
    about: list = field(default_factory=list)          # blocks
    about_title: str = ""
    answer_key: list = field(default_factory=list)     # (h2, blocks)
    answer_intro: list = field(default_factory=list)
    flashcard_bank: list = field(default_factory=list)  # (h2, blocks)
    flashcard_intro: list = field(default_factory=list)
    roadmap: list = field(default_factory=list)         # (h2, blocks)
    extra_pages: list = field(default_factory=list)     # (title, blocks) unknown H1s
    contents_titles: dict = field(default_factory=dict)  # number -> title case
    excluded_tables: int = 0
    bucket_src: dict = field(default_factory=dict)      # id(blocks) -> manuscript file index


class Report:
    def __init__(self):
        self.warnings: list[tuple[str, str]] = []
        self.info: list[tuple[str, str]] = []

    def warn(self, where: str, msg: str):
        self.warnings.append((where, msg))

    def note(self, where: str, msg: str):
        self.info.append((where, msg))


# =============================================================================
# Pass 1: walk the document into a Book
# =============================================================================
def parse(reader: DocxReader, report: Report) -> Book:
    book = Book()
    mode = "front"            # front | about | chapter | answers | flashcards | roadmap | extra
    current_part: dict | None = None
    chapter: Chapter | None = None
    section: Section | None = None
    bucket: list | None = None   # (h2, blocks) list for back matter
    extra_blocks: list | None = None
    styles_seen: dict[str, int] = {}
    file_idx = 0
    bucket_h2_seen = False            # an H2 has started inside the current back-matter H1
    intro_src: dict[str, int] = {}    # "answers"/"flashcards" -> file whose intro is used

    def start_bucket_h2(title):
        blocks: list = []
        bucket.append((title, blocks))
        book.bucket_src[id(blocks)] = file_idx

    def add_back(block):
        if bucket is None:
            return
        if not bucket:
            bucket.append(("", []))
        bucket[-1][1].append(block)

    for block in reader.blocks():
        if isinstance(block, FileStart):
            # Each file starts fresh: no inherited Part, chapter or back-matter section.
            file_idx = block.index
            mode, current_part, chapter, section, bucket = "front", None, None, None, None
            continue
        if isinstance(block, Table):
            if mode in ("front", "roadmap") or _is_excluded_box(block):
                book.excluded_tables += 1
                continue
            if mode == "chapter":
                (section.blocks if section else chapter.pre_blocks).append(block)
            elif mode == "flashcards":
                add_back(block)
            elif mode == "about":
                book.about.append(block)
            elif mode == "answers":
                add_back(block)
            elif mode == "extra":
                extra_blocks.append(block)
            continue

        p: Paragraph = block
        style = p.style
        styles_seen[style] = styles_seen.get(style, 0) + 1
        text = p.text.strip()

        if style == "Title":
            book.title = re.sub(r"\s+", " ", p.text).strip()
            continue

        if style == "Book Deck":
            m = P.PART_DECK.match(text)
            if m:
                num = P.roman_to_int(m.group(1))
                if not current_part or current_part["number"] != num:
                    existing = next((x for x in book.parts if x["number"] == num), None)
                    if existing is None:
                        title = P.title_case(m.group(2))
                        existing = {"number": num, "roman": m.group(1).upper(), "title": title,
                                    "slug": f"part-{num}-{P.slugify(title)}"}
                        book.parts.append(existing)
                    current_part = existing
                continue
            m = P.EDITION_DECK.match(text)
            if m:
                book.edition_date = P.title_case(m.group(1))
                book.edition = int(m.group(2))
                continue
            if mode == "front" and not book.title and not book.subtitle:
                book.subtitle = text
            continue  # other decks are decorative

        if style == "Heading 1":
            section = None
            m = P.CHAPTER_H1.match(text)
            if m:
                mode = "chapter"
                # No PART line in this file: the Part comes from book-settings.json (assign_parts).
                chapter = Chapter(number=int(m.group(1)), heading=m.group(2), part=current_part,
                                  source=file_idx)
                book.chapters.append(chapter)
            elif P.ANSWER_KEY_H1.search(text):
                mode, bucket, bucket_h2_seen = "answers", book.answer_key, False
            elif P.FLASHCARD_BANK_H1.search(text):
                mode, bucket, bucket_h2_seen = "flashcards", book.flashcard_bank, False
            elif P.ROADMAP_H1.search(text):
                mode, bucket, bucket_h2_seen = "roadmap", book.roadmap, False
            elif P.ABOUT_H1.search(text) or (not book.chapters and not book.about_title):
                mode = "about"
                book.about_title = text
            else:
                mode = "extra"
                extra_blocks = []
                book.extra_pages.append((text, extra_blocks))
                report.warn(text, "Unrecognised Heading 1; published as a standalone page under /pages/.")
            continue

        if mode == "front":
            if style == "Source Note" and P.STATUS_NOTE.match(text):
                book.status_note = P.STATUS_NOTE.sub("", text).strip()
            continue

        if mode == "about":
            book.about.append(p)
            if style == "Book Small":
                m = P.CONTENTS_LINE.match(text)
            elif style == "Normal":
                m = P.CONTENTS_LINE.match(text)
                if m:
                    book.contents_titles[int(m.group(1))] = m.group(2).strip()
            continue

        if mode == "chapter":
            if style == "Heading 2":
                section = Section(title=text)
                chapter.sections.append(section)
            elif style == "Chapter Standfirst" and section is None:
                chapter.standfirst.append(p)
            elif section is None:
                chapter.pre_blocks.append(p)
            else:
                section.blocks.append(p)
            continue

        if mode in ("answers", "flashcards", "roadmap"):
            if style == "Heading 2":
                start_bucket_h2(text)
                bucket_h2_seen = True
            elif not bucket_h2_seen:
                # Intro paragraph before the first H2. Each chapter file repeats one; keep the first file's.
                if mode in ("answers", "flashcards") and not p.is_empty() \
                        and intro_src.setdefault(mode, file_idx) == file_idx:
                    (book.answer_intro if mode == "answers" else book.flashcard_intro).append(p)
            else:
                add_back(p)
            continue

        if mode == "extra":
            extra_blocks.append(p)

    for style, n in sorted(styles_seen.items()):
        if style not in KNOWN_STYLES:
            report.warn("styles", f"Unrecognised paragraph style “{style}” ({n}×); rendered as body text.")
    book._styles = styles_seen  # type: ignore[attr-defined]
    return book


def _int_to_roman(n: int) -> str:
    out = ""
    for value, sym in ((1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"),
                       (50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")):
        while n >= value:
            out, n = out + sym, n - value
    return out


def _bucket_chapter(h2: str) -> int | None:
    m = P.ANSWER_CHAPTER_H2.search(h2) or P.FLASHCARD_CHAPTER_H2.match(h2)
    return int(m.group(1)) if m else None


def resolve_book(book: Book, reader: ManuscriptReader, report: Report, settings: dict) -> None:
    """Merge what came from several files: duplicate chapters, Parts and edition."""
    # 1. The same chapter in several files: the most recently saved file wins.
    groups: dict[int, list[Chapter]] = {}
    for ch in book.chapters:
        groups.setdefault(ch.number, []).append(ch)
    losers: dict[int, set[int]] = {}
    for num, chs in groups.items():
        if len({c.source for c in chs}) < 2:
            continue
        winner = max(chs, key=lambda c: (reader.mtime(c.source), c.source))
        losers[num] = {c.source for c in chs if c.source != winner.source}
        report.note(P.chapter_label(num),
                    f"Chapter is in {len({c.source for c in chs})} files; using the most recently saved, "
                    f"“{reader.paths[winner.source].name}”, and ignoring "
                    + ", ".join(f"“{reader.paths[i].name}”" for i in sorted(losers[num])) + ".")
    if losers:
        book.chapters = [c for c in book.chapters if c.source not in losers.get(c.number, set())]
        for name in ("answer_key", "flashcard_bank"):
            setattr(book, name, [(h2, blocks) for h2, blocks in getattr(book, name)
                                 if book.bucket_src.get(id(blocks)) not in losers.get(_bucket_chapter(h2), set())])
    book.chapters.sort(key=lambda c: c.number)

    # 2. Parts. A PART line in the manuscript wins; otherwise book-settings.json decides.
    configured = settings.get("parts", [])
    for ch in book.chapters:
        if ch.part is not None:
            continue
        cfg = next((p for p in configured if p["chapters"][0] <= ch.number <= p["chapters"][1]), None)
        if cfg is None:
            prev = next((c.part for c in reversed(book.chapters) if c.number < ch.number and c.part), None)
            report.warn(ch.label, "No Part for this chapter: add its range to “parts” in "
                                  "content-meta/book-settings.json." + (f" Using Part {prev['roman']} for now."
                                                                        if prev else ""))
            ch.part = prev
            continue
        part = next((x for x in book.parts if x["number"] == cfg["number"]), None)
        if part is None:
            part = {"number": cfg["number"], "roman": _int_to_roman(cfg["number"]), "title": cfg["title"],
                    "slug": f"part-{cfg['number']}-{P.slugify(cfg['title'])}"}
            book.parts.append(part)
        ch.part = part
    book.parts.sort(key=lambda p: p["number"])

    # 3. Edition: chapter files carry no edition line, so book-settings.json can set it.
    if settings.get("edition"):
        book.edition = int(settings["edition"])
    if settings.get("editionDate"):
        book.edition_date = settings["editionDate"]


def _is_excluded_box(t: Table) -> bool:
    return t.n_rows == 1 and t.n_cols == 1 and bool(P.EXCLUDED_BOX.match(t.cell_text(0, 0)))


# =============================================================================
# Pass 2: build output
# =============================================================================
class Builder:
    def __init__(self, root: Path, docx_path: Path, reader: DocxReader, book: Book, report: Report):
        self.root = root
        self.docx_path = docx_path
        self.reader = reader
        self.book = book
        self.report = report
        self.meta_dir = root / "content-meta"
        self.slugs = _read_json(self.meta_dir / "slugs.json", {"chapters": {}, "sections": {}})
        self.overrides = _read_json(self.meta_dir / "slug-overrides.json",
                                    {"chapters": {}, "sections": {}, "redirects": []})
        self.manifest = _read_json(self.meta_dir / "manifest.json", {"editions": {}, "sections": {}})
        self.used_slug_keys: set[str] = set()
        self.files: dict[str, bytes] = {}           # relative path -> content
        self.figures: list[dict] = []
        self.figure_ids: set[str] = set()
        self.image_counter = 0
        self.counts: dict[str, int] = {}
        self.roadmap_status: dict[int, dict] = {}
        self.section_hashes: dict[str, dict] = {}
        self.reading_order: list[dict] = []
        self.related_docs: list[tuple[str, int, str, str]] = []  # (url, chapter, title, markdown)
        self.timeline_docs: list[tuple[str, int, str, str]] = []  # same, history Parts only

    # -- slugs ---------------------------------------------------------------
    def chapter_slug(self, ch: Chapter) -> str:
        key = ch.label
        if key in self.overrides.get("chapters", {}):
            slug = self.overrides["chapters"][key]
        elif key in self.slugs["chapters"]:
            slug = self.slugs["chapters"][key]
        else:
            slug = f"{ch.label}-{P.slugify(ch.title)}"
        self.slugs["chapters"][key] = slug
        return slug

    def section_slug(self, ch: Chapter, sec: Section, taken: set[str]) -> str:
        if sec.type in SPECIAL_SLUGS:
            key = f"{ch.label}|@{sec.type}"
            default = SPECIAL_SLUGS[sec.type]
        else:
            key = f"{ch.label}|{P.normalize_key(sec.title)}"
            default = P.slugify(sec.display_title)
        sec.key = key
        if key in self.overrides.get("sections", {}):
            slug = self.overrides["sections"][key]
        elif key in self.slugs["sections"]:
            slug = self.slugs["sections"][key]
        else:
            slug = default
            n = 2
            while slug in taken:
                slug = f"{default}-{n}"
                n += 1
            if slug != default:
                self.report.warn(f"{ch.label} {sec.title}", f"Duplicate slug “{default}”; using “{slug}”.")
        if slug in taken:
            self.report.warn(f"{ch.label} {sec.title}", f"Slug “{slug}” is used twice in this chapter.")
        taken.add(slug)
        self.slugs["sections"][key] = slug
        self.used_slug_keys.add(key)
        return slug

    # -- figures ---------------------------------------------------------------
    def figure_markdown(self, img, caption: Paragraph | None, ch: Chapter | None, md_path: str,
                        page_url: str) -> str:
        ext = posixpath.splitext(img.target)[1].lower() or ".png"
        number = None
        caption_text = ""
        caption_md = ""
        if caption is not None:
            caption_text = R.plain(caption.segs)
            m = P.FIGURE_CAPTION.match(caption_text)
            if m:
                number = m.group(1)
            else:
                self.report.warn(page_url, f"Figure caption doesn’t start with “Figure N.N”: “{caption_text[:60]}”")
            caption_md = R.to_md(R.apply_asterisk_emphasis(R.merge(caption.segs)))
        if number and ch is not None:
            first = re.split(r"[.\-]", number)[0]
            if first.isdigit() and int(first) != ch.number:
                # e.g. chapter 25's figures captioned "Figure 24.x": keep ids and labels unique.
                fixed = str(ch.number) + number[len(first):]
                self.report.warn(page_url, f"Caption says Figure {number} but it is in chapter {ch.number}; "
                                           f"shown as Figure {fixed}. Fix the caption in the manuscript.")
                caption_md = caption_md.replace(f"Figure {number}", f"Figure {fixed}", 1)
                caption_text = caption_text.replace(f"Figure {number}", f"Figure {fixed}", 1)
                number = fixed
        if number:
            fid = "figure-" + re.sub(r"[^0-9]+", "-", number).strip("-")
        else:
            self.image_counter += 1
            fid = f"image-{ch.label if ch else 'front'}-{self.image_counter}"
            if caption is None:
                self.report.warn(page_url, f"Image without a Figure Caption ({img.name or img.target}); "
                                           f"saved as {fid}. Check its licence/source.")
        base = fid
        n = 2
        while fid in self.figure_ids:
            fid = f"{base}-{n}"
            n += 1
        if fid != base:
            self.report.warn(page_url, f"Duplicate figure number {base}; using {fid}.")
        self.figure_ids.add(fid)
        filename = fid + ext
        self.files[f"src/assets/figures/{filename}"] = self.reader.read_bytes(img.target)

        alt = img.descr or (P.FIGURE_CAPTION.match(caption_text).group(2) if number else caption_text) or ""
        alt = alt.strip() or "Figure"
        rel = posixpath.relpath(f"src/assets/figures/{filename}", posixpath.dirname(md_path))
        alt_md = alt.replace("[", "(").replace("]", ")").replace("\n", " ")
        self.figures.append({
            "id": fid, "number": number, "chapter": ch.number if ch else None,
            "caption": caption_text, "alt": alt, "file": filename, "page": page_url,
        })
        parts = [f'<figure class="figure" id="{fid}">', "", f"![{alt_md}]({rel})", ""]
        if caption_md:
            label_m = re.match(r"^((?:Figure|Fig\.)\s+[\d.\-]+\.?)\s*(.*)$", caption_md, re.S)
            if label_m:
                caption_md = f'<span class="figure-label">{label_m.group(1)}</span> {label_m.group(2)}'
            parts.append(f'<figcaption>{caption_md} <a class="figure-anchor" href="#{fid}" '
                         f'aria-label="Link to this figure">#</a></figcaption>')
        parts.append("</figure>")
        return "\n".join(parts)

    # -- blocks -> markdown ----------------------------------------------------
    def blocks_to_md(self, blocks: list, ch: Chapter | None, md_path: str, page_url: str,
                     cite=None) -> tuple[str, int, str]:
        """Return (markdown, word_count, first_paragraph_text)."""
        out: list[str] = []
        words = 0
        first_text = ""
        i = 0
        n = len(blocks)
        while i < n:
            b = blocks[i]
            if isinstance(b, Table):
                md = self.table_md(b, ch, page_url)
                if md:
                    out.append(md)
                i += 1
                continue
            p: Paragraph = b
            if p.style in DROP_STYLES:
                i += 1
                continue
            if p.is_empty():
                i += 1
                continue
            if p.images:
                # Look ahead for a caption (skipping empty paragraphs).
                j = i + 1
                while j < n and isinstance(blocks[j], Paragraph) and blocks[j].is_empty():
                    j += 1
                caption = None
                if j < n and isinstance(blocks[j], Paragraph) and blocks[j].style == "Figure Caption":
                    caption = blocks[j]
                imgs = p.images
                for k, img in enumerate(imgs):
                    out.append(self.figure_markdown(img, caption if k == len(imgs) - 1 else None,
                                                    ch, md_path, page_url))
                if p.text.strip():
                    out.append(self.para_md(p, cite))
                i = j + 1 if caption is not None else i + 1
                continue
            if p.style == "Figure Caption":
                self.report.warn(page_url, f"Figure Caption without an image: “{p.text.strip()[:60]}”")
                out.append(f'<p class="caption-orphan">{self.para_html(p, cite)}</p>')
                i += 1
                continue
            if p.style == "Heading 3":
                # Each section is its own page (H1 = section title), so subsections are H2.
                out.append("## " + R.escape_md(re.sub(r"\s+", " ", p.text).strip()))
            elif p.style == "Source Note":
                if P.STATUS_NOTE.match(p.text):
                    i += 1
                    continue
                out.append(f'<p class="source-note">{self.para_html(p, cite)}</p>')
            elif p.style == "Chapter Standfirst":
                out.append(f'<p class="standfirst">{self.para_html(p, cite)}</p>')
            else:
                out.append(self.para_md(p, cite))
            text = R.plain(p.segs)
            words += len(text.split())
            if not first_text and p.style in ("Normal", "Chapter Standfirst"):
                first_text = text
            i += 1
        return "\n\n".join(out) + ("\n" if out else ""), words, first_text

    def prep(self, segs: list[Seg], cite=None, urls=True) -> list[Seg]:
        segs = R.apply_asterisk_emphasis(R.merge(R.text_only(segs)))
        return R.linkify(segs, cite=cite, urls=urls, on_unmatched=self._unmatched_cite)

    def para_md(self, p: Paragraph, cite=None) -> str:
        return R.to_md(self.prep(p.segs, cite))

    def para_html(self, p: Paragraph, cite=None) -> str:
        return R.to_html(self.prep(p.segs, cite))

    def _unmatched_cite(self, token: str):
        self._current_unmatched.add(token)

    def table_md(self, t: Table, ch: Chapter | None, where: str) -> str:
        if t.n_rows == 1 and t.n_cols == 1:
            inner = "<br>".join(self.para_html(p) for p in t.rows[0][0] if not p.is_empty())
            return f'<aside class="callout">{inner}</aside>'
        rows_html = []
        for r, row in enumerate(t.rows):
            tag = "th" if r == 0 else "td"
            cells = "".join(f"<{tag}>" + "<br>".join(self.para_html(p) for p in cell if not p.is_empty())
                            + f"</{tag}>" for cell in row)
            rows_html.append(f"<tr>{cells}</tr>")
        self.report.note(where, f"Table ({t.n_rows}×{t.n_cols}) rendered as HTML table.")
        return '<div class="table-wrap"><table>' + "".join(rows_html) + "</table></div>"

    # -- build -------------------------------------------------------------------
    def build(self):
        book = self.book
        self._current_unmatched: set[str] = set()
        self.build_roadmap()
        self.prepare_chapters()
        answers = self.build_answers()
        flashcards = self.build_flashcards()
        sources = self.build_sources()
        practice = self.build_practice(answers)
        self.build_about()
        self.build_extra_pages()
        self.build_chapters(sources)
        self.check_flashcard_prompts(flashcards)

        parts_out = []
        for part in book.parts:
            chs = [c for c in book.chapters if c.part is part]
            parts_out.append({**part, "chapters": [c.number for c in chs]})
        self.write_json("src/data/book.json", {
            "title": P.title_case(book.title) if book.title.isupper() else book.title,
            "titleDisplay": book.title,
            "subtitle": P.title_case(book.subtitle) if book.subtitle.isupper() else book.subtitle,
            "edition": book.edition,
            "editionDate": book.edition_date,
            "statusNote": book.status_note,
            "parts": parts_out,
            "readingOrder": self.reading_order,
        })
        self.write_json("src/data/flashcards.json", flashcards)
        self.write_json("src/data/answers.json", answers)
        self.write_json("src/data/practice.json", practice)
        self.write_json("src/data/sources.json", sources)
        self.write_json("src/data/figures.json", self.figures)
        self.write_json("src/data/roadmap.json", self.roadmap_out)
        self.write_json("src/data/related.json", RELATED.compute(self.related_docs))
        self.build_timeline()
        self.write_redirects()

        self.counts.update({
            "Parts": len(book.parts),
            "Chapters": len(book.chapters),
            "Section pages (incl. special pages)": sum(
                1 for c in book.chapters for s in c.sections if s.type != "opening"),
            "Heading 1": book._styles.get("Heading 1", 0),
            "Heading 2": book._styles.get("Heading 2", 0),
            "Heading 3": book._styles.get("Heading 3", 0),
            "Figures": len(self.figures),
            "Tables (total in docx)": self.table_total,
            "Flashcard tables": sum(1 for c in flashcards["chapters"].values() if c["cards"]),
            "Flashcards": sum(len(c["cards"]) for c in flashcards["chapters"].values()),
            "Source Note paragraphs": book._styles.get("Source Note", 0),
            "Numbered sources": sum(len(c["entries"]) for c in sources.values()),
            "Exercises": sum(len(g["exercises"]) for c in practice.values() for g in c["groups"]),
            "Model answers": sum(len(c) for c in answers["chapters"].values()),
            "Roadmap chapters": len(self.roadmap_out["chapters"]),
            "Timeline events": len(self.timeline_out["events"]),
        })

    # -- timeline ------------------------------------------------------------
    def build_timeline(self):
        path = self.meta_dir / "timeline.json"
        curation = _read_json(path, {})
        events = TIMELINE.extract(self.timeline_docs)
        events = TIMELINE.apply_curation(events, curation, self.report.note, self.timeline_docs)
        keep = ("id", "chapter", "url", "start", "end", "approx", "qual", "text", "textBg", "source")
        events = [{k: e[k] for k in keep if k in e and e[k] is not None} for e in events]
        self.timeline_out = {"chapterSpans": TIMELINE.chapter_spans(events, curation), "events": events}
        self.write_json("src/data/timeline.json", self.timeline_out)

    # -- roadmap -------------------------------------------------------------
    def build_roadmap(self):
        groups = []
        for h2, blocks in self.book.roadmap:
            items = []
            for b in blocks:
                if isinstance(b, Paragraph) and b.style == "Book Small":
                    m = P.ROADMAP_LINE.match(b.text.strip())
                    if m:
                        entry = {"number": int(m.group(1)), "title": m.group(2).strip(),
                                 "status": m.group(3).strip().upper()}
                        items.append(entry)
                        self.roadmap_status[entry["number"]] = entry
            if items:
                groups.append({"title": h2, "chapters": [i["number"] for i in items]})
        self.roadmap_out = {
            "groups": groups,
            "chapters": sorted(self.roadmap_status.values(), key=lambda e: e["number"]),
        }

    # -- chapters ----------------------------------------------------------------
    def prepare_chapters(self):
        seen = set()
        for ch in self.book.chapters:
            if ch.number in seen:
                self.report.warn(ch.label, "Duplicate chapter number.")
            seen.add(ch.number)
            # Prefer the manuscript's own title casing (roadmap / contents list).
            candidates = [self.roadmap_status.get(ch.number, {}).get("title"),
                          self.book.contents_titles.get(ch.number)]
            title = next((c for c in candidates if c and c.casefold() == ch.heading.casefold()), None)
            if title is None:
                title = P.title_case(ch.heading) if ch.heading.isupper() else ch.heading
                if any(candidates):
                    self.report.warn(ch.label, f"Chapter heading “{ch.heading}” differs from the contents/"
                                               f"roadmap title; casing guessed as “{title}”.")
            ch.title = title
            ch.slug = self.chapter_slug(ch)
            taken: set[str] = set()
            for idx, sec in enumerate(ch.sections):
                sec.type, warning = P.classify_h2(sec.title, idx)
                if warning:
                    self.report.note(f"{ch.label}", warning)
                sec.number, sec.display_title = P.strip_number(sec.title)
                if sec.type == "opening":
                    sec.slug = ""
                    if sec.number is not None:
                        self.report.note(ch.label, f"Opening section is numbered (“{sec.title}”); shown on the "
                                                   f"chapter landing page.")
                    continue
                sec.slug = self.section_slug(ch, sec, taken)
            types = [s.type for s in ch.sections]
            for t in ("summary", "practice", "flashcards", "sources"):
                if t not in types:
                    (self.report.note if t == "summary" else self.report.warn)(
                        ch.label, f"No {t} section detected.")

    def cite_resolver(self, ch: Chapter, sources: dict):
        nums = {e["n"] for e in sources.get(ch.label, {}).get("entries", [])}
        base = f"/{ch.slug}/sources/"

        def resolve(n: int):
            return f"{base}#source-{n}" if n in nums else None
        return resolve

    def build_chapters(self, sources: dict):
        book = self.book
        about_entry = {"url": "/about/", "title": book.about_title or "About", "kind": "about"} \
            if book.about else None
        if about_entry:
            self.reading_order.append(about_entry)
        for ch in book.chapters:
            cite = self.cite_resolver(ch, sources)
            chapter_url = f"/{ch.slug}/"
            opening = next((s for s in ch.sections if s.type == "opening"), None)
            chapter_md_path = f"src/content/chapters/{ch.slug}.md"
            self._current_unmatched = set()
            pre_md, pre_words, _ = self.blocks_to_md(ch.pre_blocks, ch, chapter_md_path, chapter_url, cite)
            open_md, open_words, open_first = ("", 0, "")
            if opening:
                open_md, open_words, open_first = self.blocks_to_md(opening.blocks, ch, chapter_md_path,
                                                                    chapter_url, cite)
            standfirst_text = " ".join(R.plain(p.segs) for p in ch.standfirst)
            standfirst_html = " ".join(self.para_html(p) for p in ch.standfirst)
            body = (pre_md + "\n" if pre_md else "") + open_md
            self.hash_section(f"{ch.label}|@opening", (opening.title if opening else "") + standfirst_text + body,
                              ch.title, chapter_url)
            self.reading_order.append({"url": chapter_url, "title": ch.title, "kind": "chapter",
                                       "chapter": ch.number})

            status = self.roadmap_status.get(ch.number, {}).get("status", "")
            if status in ("", "PLANNED"):
                # Written, but the roadmap list hasn't caught up yet.
                status = "DRAFT"
                if ch.number in self.roadmap_status:
                    self.roadmap_status[ch.number]["status"] = status
            section_entries = []
            total_words = open_words + pre_words
            for sec in ch.sections:
                if sec.type == "opening":
                    continue
                url = f"/{ch.slug}/{sec.slug}/"
                md_path = f"src/content/sections/{ch.slug}/{sec.slug}.md"
                if sec.type in ("practice", "flashcards", "sources"):
                    md, words, first = "", self.special_words.get((ch.label, sec.type), 0), ""
                else:
                    md, words, first = self.blocks_to_md(sec.blocks, ch, md_path, url, cite)
                    if not md.strip():
                        self.report.warn(url, "Empty section.")
                total_words += words
                desc = {
                    "practice": f"Practice exercises and model reasoning for Chapter {ch.label}: {ch.title}.",
                    "flashcards": f"Interactive flashcards for Chapter {ch.label}: {ch.title}.",
                    "sources": f"Sources and further reading for Chapter {ch.label}: {ch.title}.",
                }.get(sec.type) or P.truncate(first or sec.display_title)
                fm = {
                    "title": sec.display_title,
                    "manuscriptTitle": sec.title,
                    "chapter": ch.number,
                    "chapterLabel": ch.label,
                    "chapterSlug": ch.slug,
                    "chapterTitle": ch.title,
                    "part": ch.part["number"] if ch.part else None,
                    "order": len(section_entries) + 1,
                    "number": sec.number,
                    "type": sec.type,
                    "slug": sec.slug,
                    "readingTime": P.reading_time(words),
                    "description": desc,
                }
                self.write_md(md_path, fm, md)
                self.hash_section(sec.key, sec.title + md + json.dumps(
                    self.special_payload.get((ch.label, sec.type), ""), sort_keys=True, ensure_ascii=False),
                    f"{ch.label} · {sec.display_title}", url)
                section_entries.append(sec)
                if sec.type == "section":
                    self.related_docs.append((url, ch.number, sec.display_title, md))
                    if ch.part and ch.part["number"] >= 2:  # Part I is the reasoning toolkit, not history
                        self.timeline_docs.append((url, ch.number, sec.display_title, md))
                self.reading_order.append({"url": url, "title": sec.display_title, "kind": sec.type,
                                           "chapter": ch.number})
            for token in sorted(self._current_unmatched):
                self.report.warn(ch.label, f"Citation marker {token} has no matching numbered source.")

            fm = {
                "number": ch.number,
                "label": ch.label,
                "title": ch.title,
                "manuscriptHeading": f"{ch.label}  {ch.heading}",
                "slug": ch.slug,
                "part": ch.part["number"] if ch.part else None,
                "partTitle": ch.part["title"] if ch.part else None,
                "partSlug": ch.part["slug"] if ch.part else None,
                "standfirst": standfirst_text,
                "standfirstHtml": standfirst_html,
                "openingTitle": opening.display_title if opening else None,
                "description": P.truncate(standfirst_text or open_first or ch.title),
                "status": status,
                "edition": book.edition,
                "sectionCount": sum(1 for s in section_entries if s.type in ("section", "summary")),
                "readingTime": P.reading_time(total_words),
                "openingReadingTime": P.reading_time(open_words + pre_words),
            }
            self.write_md(chapter_md_path, fm, body)

    # -- answers -------------------------------------------------------------------
    def build_answers(self) -> dict:
        chapters: dict[str, dict[str, str]] = {}
        for h2, blocks in self.book.answer_key:
            m = P.ANSWER_CHAPTER_H2.search(h2)
            if not m:
                if h2:
                    self.report.warn("Answer key", f"H2 “{h2}” has no chapter number; skipped.")
                continue
            label = P.chapter_label(int(m.group(1)))
            entries: dict[str, list[str]] = chapters.setdefault(label, {})
            current = None
            for b in blocks:
                if not isinstance(b, Paragraph) or b.is_empty() or b.style in DROP_STYLES:
                    continue
                segs, mm = R.strip_prefix(b.segs, P.NUMBERED_ITEM)
                if mm:
                    current = mm.group(1)
                    if current in entries:
                        self.report.warn(f"Answer key {label}", f"Duplicate answer number {current}.")
                    entries[current] = [R.to_html(self.prep(segs))]
                elif current:
                    entries[current].append(R.to_html(self.prep(b.segs)))
                else:
                    self.report.note(f"Answer key {label}", f"Unnumbered paragraph before first answer: "
                                                            f"“{b.text.strip()[:60]}”")
        out = {lab: {n: "".join(f"<p>{h}</p>" for h in paras) for n, paras in sorted(
            v.items(), key=lambda kv: int(kv[0]))} for lab, v in sorted(chapters.items())}
        return {"intro": " ".join(self.para_html(p) for p in self.book.answer_intro), "chapters": out}

    # -- flashcards ----------------------------------------------------------------
    def build_flashcards(self) -> dict:
        chapters = {}
        for h2, blocks in self.book.flashcard_bank:
            m = P.FLASHCARD_CHAPTER_H2.match(h2)
            if not m:
                if h2:
                    self.report.warn("Flashcard bank", f"H2 “{h2}” has no chapter number; skipped.")
                continue
            label = P.chapter_label(int(m.group(1)))
            cards = []
            for b in blocks:
                if not isinstance(b, Table):
                    continue
                for r, row in enumerate(b.rows):
                    if len(row) < 2:
                        continue
                    front = [p for p in row[0] if not p.is_empty()]
                    back = [p for p in row[1] if not p.is_empty()]
                    ftxt = " ".join(p.text for p in front).strip()
                    btxt = " ".join(p.text for p in back).strip()
                    if r == 0 and ftxt.upper() == "FRONT" and btxt.upper() in ("BACK", "ANSWER"):
                        continue
                    if not ftxt and not btxt:
                        continue
                    cards.append({
                        "id": len(cards) + 1,
                        "front": "<br>".join(self.para_html(p) for p in front),
                        "back": "<br>".join(self.para_html(p) for p in back),
                    })
            if label in chapters:
                chapters[label]["cards"].extend(cards)
            else:
                chapters[label] = {"deck": m.group(2).strip(), "cards": cards}
            if not cards:
                self.report.warn(f"Flashcards {label}", "Answer-bank entry has no FRONT | BACK table.")
        self.flashcards_out = {"intro": " ".join(self.para_html(p) for p in self.book.flashcard_intro),
                               "chapters": dict(sorted(chapters.items()))}
        return self.flashcards_out

    def check_flashcard_prompts(self, flashcards: dict):
        for ch in self.book.chapters:
            sec = next((s for s in ch.sections if s.type == "flashcards"), None)
            deck = flashcards["chapters"].get(ch.label)
            if sec is None:
                continue
            prompts = [b for b in sec.blocks if isinstance(b, Paragraph) and P.FLASHCARD_PROMPT.match(b.text)]
            n_cards = len(deck["cards"]) if deck else 0
            if not deck:
                self.report.warn(ch.label, "Flashcard prompts section exists but the answer bank has no "
                                           "table for this chapter; the page will list prompts only.")
            elif prompts and len(prompts) != n_cards:
                self.report.note(ch.label, f"Chapter lists {len(prompts)} flashcard prompts; answer bank has "
                                           f"{n_cards} cards. The site uses the answer bank.")

    # -- sources -------------------------------------------------------------------
    def build_sources(self) -> dict:
        out = {}
        self.special_words: dict[tuple[str, str], int] = {}
        self.special_payload: dict[tuple[str, str], object] = {}
        for ch in self.book.chapters:
            sec = next((s for s in ch.sections if s.type == "sources"), None)
            if sec is None:
                continue
            entries, notes, intro, bullets = [], [], [], []
            for b in sec.blocks:
                if isinstance(b, Table):
                    self.report.warn(ch.label, "Table inside Sources section ignored.")
                    continue
                if b.is_empty() or b.style in DROP_STYLES:
                    continue
                text = b.text.strip()
                if P.STATUS_NOTE.match(text):
                    continue
                segs, bullet = R.strip_prefix(b.segs, P.SOURCE_BULLET)  # "• [1] …" is still numbered
                segs, m = R.strip_prefix(segs, P.SOURCE_ENTRY)
                if m:
                    entries.append({"n": int(m.group(1)), "id": f"source-{m.group(1)}",
                                    "html": R.to_html(self.prep(segs))})
                    continue
                if bullet:
                    bullets.append(R.to_html(self.prep(segs)))
                elif b.style == "Source Note" and re.match(r"^[A-Z][A-Z ]+[.:]", text):
                    # "EDITORIAL NOTE. …" — the label becomes the box heading on the site
                    segs, _ = R.strip_prefix(b.segs, re.compile(r"^\s*EDITORIAL NOTES?[.:]\s*", re.I))
                    notes.append(R.to_html(self.prep(segs)))
                elif entries or bullets:
                    notes.append(self.para_html(b))
                else:
                    intro.append(self.para_html(b))
            payload = {"title": sec.display_title, "intro": intro, "entries": entries,
                       "further": bullets, "notes": notes}
            out[ch.label] = payload
            self.special_payload[(ch.label, "sources")] = payload
            self.special_words[(ch.label, "sources")] = sum(len(re.sub("<[^>]+>", " ", h).split())
                                                            for h in [e["html"] for e in entries] + bullets)
        return out

    # -- practice ------------------------------------------------------------------
    def build_practice(self, answers: dict) -> dict:
        out = {}
        for ch in self.book.chapters:
            sec = next((s for s in ch.sections if s.type == "practice"), None)
            if sec is None:
                continue
            key = answers["chapters"].get(ch.label, {})
            groups = [{"title": None, "intro": [], "exercises": []}]
            words = 0
            used = set()
            for b in sec.blocks:
                if isinstance(b, Table):
                    groups[-1]["intro"].append(self.table_md(b, ch, f"{ch.label} practice"))
                    continue
                if b.is_empty() or b.style in DROP_STYLES:
                    continue
                if b.images:
                    self.report.warn(ch.label, "Image inside Practice laboratory is not shown on the site.")
                if b.style == "Heading 3":
                    if not groups[-1]["exercises"] and not groups[-1]["intro"] and groups[-1]["title"] is None:
                        groups[-1]["title"] = b.text.strip()
                    else:
                        groups.append({"title": b.text.strip(), "intro": [], "exercises": []})
                    continue
                words += len(b.text.split())
                segs, m = R.strip_prefix(b.segs, P.NUMBERED_ITEM)
                if m:
                    n = m.group(1)
                    ans = key.get(n)
                    if ans is None:
                        self.report.warn(ch.label, f"Exercise {n} has no model answer.")
                    else:
                        used.add(n)
                    groups[-1]["exercises"].append({"n": int(n), "html": [R.to_html(self.prep(segs))],
                                                    "answer": ans})
                elif groups[-1]["exercises"]:
                    groups[-1]["exercises"][-1]["html"].append(self.para_html(b))
                else:
                    groups[-1]["intro"].append(self.para_html(b))
            for n in sorted(set(key) - used, key=int):
                self.report.warn(ch.label, f"Model answer {n} has no matching exercise.")
            groups = [g for g in groups if g["exercises"] or g["intro"] or g["title"]]
            payload = {"title": sec.display_title, "answerIntro": answers.get("intro", ""), "groups": groups}
            out[ch.label] = payload
            self.special_payload[(ch.label, "practice")] = payload
            self.special_words[(ch.label, "practice")] = words
        for label in answers["chapters"]:
            if label not in out:
                self.report.warn(f"Answer key {label}", "Answers exist but the chapter has no Practice section.")
        for ch in self.book.chapters:
            deck = self.flashcards_out["chapters"].get(ch.label)
            if deck:
                self.special_payload[(ch.label, "flashcards")] = deck
                self.special_words[(ch.label, "flashcards")] = 0
        return out

    # -- about / extra pages -------------------------------------------------------
    def build_about(self):
        if not self.book.about:
            return
        blocks, skipping = [], False
        for b in self.book.about:
            if isinstance(b, Paragraph) and b.style == "Heading 2":
                skipping = bool(P.CONTENTS_H2.search(b.text.strip()))
                if not skipping:
                    blocks.append(Paragraph("Heading 3", b.segs))  # shown as subheadings
                continue
            if not skipping:
                blocks.append(b)
        path = "src/content/pages/about.md"
        md, words, first = self.blocks_to_md(blocks, None, path, "/about/")
        self.write_md(path, {"title": self.book.about_title, "slug": "about",
                             "description": P.truncate(first), "readingTime": P.reading_time(words)}, md)
        self.hash_section("@about", md, self.book.about_title, "/about/")

    def build_extra_pages(self):
        for title, blocks in self.book.extra_pages:
            slug = P.slugify(title)
            path = f"src/content/pages/{slug}.md"
            md, words, first = self.blocks_to_md(blocks, None, path, f"/pages/{slug}/")
            self.write_md(path, {"title": title, "slug": slug, "description": P.truncate(first or title),
                                 "readingTime": P.reading_time(words)}, md)

    # -- manifest / hashes ---------------------------------------------------------
    def hash_section(self, key: str, content: str, title: str, url: str):
        h = hashlib.sha256(content.encode("utf-8")).hexdigest()[:16]
        self.section_hashes[key] = {"hash": h, "title": title, "url": url}

    def update_manifest(self) -> dict:
        ed = self.book.edition
        ed_key = str(ed) if ed is not None else "unknown"
        sections = self.manifest.setdefault("sections", {})
        editions = self.manifest.setdefault("editions", {})
        prev_ed_key = max((k for k in editions if k != ed_key and k.isdigit() and (not ed_key.isdigit()
                           or int(k) < int(ed_key))), key=int, default=None)
        changes = {"new": [], "changed": [], "removed": []}
        new_keys, changed_keys = [], []
        for key, info in sorted(self.section_hashes.items()):
            entry = sections.get(key)
            if entry is None or entry.get("removedIn"):
                sections[key] = {"hash": info["hash"], "title": info["title"], "url": info["url"],
                                 "firstSeen": ed, "lastChanged": ed}
            else:
                if entry["hash"] != info["hash"]:
                    entry["hash"] = info["hash"]
                    entry["lastChanged"] = ed
                entry["title"], entry["url"] = info["title"], info["url"]
            e = sections[key]
            if e["firstSeen"] == ed and prev_ed_key is not None:
                changes["new"].append(e)
                new_keys.append(key)
            elif e["lastChanged"] == ed and e["firstSeen"] != ed:
                changes["changed"].append(e)
                changed_keys.append(key)
        for key, entry in sorted(sections.items()):
            if key not in self.section_hashes:
                if not entry.get("removedIn"):
                    entry["removedIn"] = ed
                if entry["removedIn"] == ed:
                    changes["removed"].append(entry)
        # Edition history for /updates/ and the RSS feed. The import date is set once, when
        # the edition is first imported, so re-running the importer never changes it.
        editions[ed_key] = {
            "date": self.book.edition_date,
            "firstImported": editions.get(ed_key, {}).get("firstImported") or datetime.date.today().isoformat(),
            "baseline": prev_ed_key is None,
            "counts": self.counts,
            "new": new_keys,
            "changed": changed_keys,
        }
        self.manifest["editions"] = dict(sorted(editions.items(), key=lambda kv: int(kv[0]) if kv[0].isdigit() else 0))
        self.manifest["sections"] = dict(sorted(sections.items()))
        self.prev_counts = editions.get(prev_ed_key, {}).get("counts") if prev_ed_key else None
        self.prev_ed_key = prev_ed_key
        self.changes = changes
        # Recently updated list for the site (v2 "What's new")
        recent = sorted((dict(url=e["url"], title=e["title"], edition=e["lastChanged"])
                         for k, e in sections.items() if not e.get("removedIn")),
                        key=lambda e: (-(e["edition"] or 0), e["url"]))
        self.write_json("src/data/updates.json", {
            "edition": ed, "editionDate": self.book.edition_date,
            "previousEdition": int(prev_ed_key) if prev_ed_key else None,
            "new": [dict(url=e["url"], title=e["title"]) for e in changes["new"]],
            "changed": [dict(url=e["url"], title=e["title"]) for e in changes["changed"]],
            "recent": recent[:50] if prev_ed_key else [],
            "editions": self.edition_history(editions, sections),
        })
        return changes

    def edition_history(self, editions: dict, sections: dict) -> list[dict]:
        """Newest first. New chapters are listed once, not page by page."""
        def link(key):
            e = sections.get(key)
            if not e or e.get("removedIn"):
                return None
            label = key.split("|", 1)[0]
            title = re.sub(r"^\d{3}\s*·\s*", "", e["title"])
            return {"url": e["url"], "title": title, "chapter": label}
        out = []
        for ed_key, info in sorted(editions.items(), key=lambda kv: -int(kv[0]) if kv[0].isdigit() else 0):
            if not ed_key.isdigit():
                continue
            new = [k for k in info.get("new", [])]
            new_chapters = sorted({k.split("|", 1)[0] for k in new if k.endswith("|@opening")})
            out.append({
                "edition": int(ed_key),
                "date": info.get("date", ""),
                "firstImported": info.get("firstImported", ""),
                "baseline": bool(info.get("baseline")),
                "chapters": (info.get("counts") or {}).get("Chapters"),
                "newChapters": [x for x in (link(f"{c}|@opening") for c in new_chapters) if x],
                "newSections": [x for x in (link(k) for k in new
                                            if k.split("|", 1)[0] not in new_chapters) if x],
                "changed": [x for x in (link(k) for k in info.get("changed", [])) if x],
            })
        return out

    # -- redirects -----------------------------------------------------------------
    def write_redirects(self):
        # astro.config.mjs turns these into forwarding pages (GitHub Pages has no _redirects).
        self.write_json("src/data/redirects.json", [{"from": r.get("from"), "to": r.get("to")}
                                                    for r in self.overrides.get("redirects", [])
                                                    if r.get("from") and r.get("to")])

    # -- writing ---------------------------------------------------------------------
    def write_json(self, rel: str, data):
        self.files[rel] = (json.dumps(data, ensure_ascii=False, indent=2) + "\n").encode("utf-8")

    def write_md(self, rel: str, frontmatter: dict, body: str):
        lines = ["---"]
        for k, v in frontmatter.items():
            lines.append(f"{k}: {json.dumps(v, ensure_ascii=False)}")
        lines.append("---")
        content = "\n".join(lines) + "\n\n" + (body.rstrip() + "\n" if body.strip() else "")
        self.files[rel] = content.encode("utf-8")

    def flush(self):
        for d in GENERATED_DIRS:
            full = self.root / d
            if d == "src/data" and full.exists():
                # src/data/bg/ belongs to the translator; only clear the importer's own files.
                for f in full.glob("*.json"):
                    f.unlink()
            elif full.exists():
                shutil.rmtree(full)
        for rel, data in sorted(self.files.items()):
            path = self.root / rel
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        self.meta_dir.mkdir(exist_ok=True)
        slugs = {"chapters": dict(sorted(self.slugs["chapters"].items())),
                 "sections": dict(sorted(self.slugs["sections"].items()))}
        _write_json(self.meta_dir / "slugs.json", slugs)
        _write_json(self.meta_dir / "manifest.json", self.manifest)
        ov = self.meta_dir / "slug-overrides.json"
        if not ov.exists():
            _write_json(ov, {"_help": "Manual slug overrides. chapters: {\"001\": \"slug\"}; sections: "
                                      "{\"001|normalized title\": \"slug\"} (keys as in slugs.json); "
                                      "redirects: [{\"from\": \"/old/\", \"to\": \"/new/\"}].",
                             "chapters": {}, "sections": {}, "redirects": []})


def _read_json(path: Path, default):
    if path.exists():
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        for k, v in default.items():
            data.setdefault(k, v)
        return data
    return json.loads(json.dumps(default))


def _write_json(path: Path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


# =============================================================================
# Report
# =============================================================================
EXPECTED_ED25 = {"Heading 1": 26, "Heading 2": 656, "Heading 3": 28, "Figures": 210,
                 "Tables (total in docx)": 24, "Flashcard tables": 22, "Source Note paragraphs": 420}


def write_report(b: Builder, docx_names: list[str]) -> str:
    book, rep = b.book, b.report
    if len(docx_names) == 1:
        files = [f"- **Manuscript:** `{docx_names[0]}`"]
    else:
        files = [f"- **Manuscript:** {len(docx_names)} files, read in this order:"] + \
                [f"  {i}. `{n}`" for i, n in enumerate(docx_names, 1)]
    L = [f"# Import report — Edition {book.edition}", "",
         f"*GENERATED by `npm run import` — do not edit.*", "", *files,
         f"- **Edition:** {book.edition} ({book.edition_date})",
         f"- **Compared with:** " + (f"Edition {b.prev_ed_key}" if b.prev_ed_key else "nothing (first import of a "
                                                                                   "new edition history)"), ""]
    L += ["## Counts", "", "| Item | This edition | Previous edition |" +
          (" Edition 25 spec |" if book.edition == 25 else ""),
          "|---|---:|---:|" + ("---:|" if book.edition == 25 else "")]
    for k, v in b.counts.items():
        prev = b.prev_counts.get(k, "—") if b.prev_counts else "—"
        row = f"| {k} | {v} | {prev} |"
        if book.edition == 25:
            exp = EXPECTED_ED25.get(k)
            row += (f" {exp} {'✅' if exp == v else '❌'} |" if exp is not None else " |")
        L.append(row)
    L += ["", f"Excluded editorial boxes (1×1 tables): {book.excluded_tables}. "
              f"“Where the book stands” is excluded; its chapter list feeds the public roadmap.", ""]

    ch = b.changes
    L += ["## Changes since previous edition", ""]
    if b.prev_ed_key is None:
        L += [f"First import — {len(b.section_hashes)} pages recorded as the baseline.", ""]
    else:
        for name in ("new", "changed", "removed"):
            items = ch[name]
            L.append(f"### {name.capitalize()} ({len(items)})")
            L += [f"- [{e['title']}]({e['url']})" for e in items] or ["- none"]
            L.append("")

    L += [f"## Warnings ({len(rep.warnings)})", "",
          "These need a look before publishing.", ""]
    L += [f"- **{w}** — {m}" for w, m in rep.warnings] or ["- none 🎉"]
    L += ["", f"## Notes ({len(rep.info)})", "", "Informational: expected variations in the manuscript.", ""]
    L += [f"- **{w}** — {m}" for w, m in rep.info] or ["- none"]
    L.append("")
    return "\n".join(L)


# =============================================================================
def find_manuscripts(root: Path) -> list[Path]:
    files = [f for f in (root / "manuscript").glob("*.docx") if not f.name.startswith("~$")]
    if not files:
        sys.exit("No .docx found in manuscript/. Download the chapter files as .docx and put them there.")
    return order_manuscripts(files)


def find_manuscript(root: Path) -> list[Path]:  # kept for older callers
    return find_manuscripts(root)


def run(docx: Path | list[Path], root: Path, quiet: bool = False) -> Builder:
    paths = order_manuscripts(list(docx)) if isinstance(docx, (list, tuple)) else [Path(docx)]
    reader = ManuscriptReader(paths)
    report = Report()
    settings = _read_json(root / "content-meta" / "book-settings.json", {})
    book = parse(reader, report)
    resolve_book(book, reader, report, settings)
    b = Builder(root, paths[0], reader, book, report)
    b.table_total = sum(1 for blk in reader.blocks() if isinstance(blk, Table))
    b.build()
    b.update_manifest()
    b.flush()
    (root / "IMPORT_REPORT.md").write_text(write_report(b, [p.name for p in paths]), encoding="utf-8")
    if not quiet:
        print(f"Imported Edition {book.edition}: {len(book.chapters)} chapters, "
              f"{b.counts['Section pages (incl. special pages)']} section pages, {len(b.figures)} figures.")
        print(f"{len(report.warnings)} warnings, {len(report.info)} notes. See IMPORT_REPORT.md.")
    return b


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("docx", nargs="*", help="manuscript .docx files (default: all in manuscript/)")
    ap.add_argument("--out", default=None, help="project root to write into (default: repo root)")
    args = ap.parse_args(argv)
    root = Path(args.out) if args.out else Path(__file__).resolve().parent.parent
    docx = [Path(d) for d in args.docx] if args.docx else find_manuscripts(Path(__file__).resolve().parent.parent)
    run(docx, root)


if __name__ == "__main__":
    main()
