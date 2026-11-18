"""Minimal, dependency-free .docx reader.

Walks the document body in order and yields Paragraph and Table blocks. Each
paragraph keeps its named style and a list of formatted segments; images are
kept as separate segments so figures stay in reading order.
"""
from __future__ import annotations

import posixpath
import zipfile
from dataclasses import dataclass, field
from xml.etree import ElementTree as ET

NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "wp": "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
    "pic": "http://schemas.openxmlformats.org/drawingml/2006/picture",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}
W = "{%s}" % NS["w"]
R = "{%s}" % NS["r"]
A = "{%s}" % NS["a"]
WP = "{%s}" % NS["wp"]
PIC = "{%s}" % NS["pic"]


@dataclass
class Seg:
    """A run of text with formatting. `image` is set for picture segments."""
    text: str = ""
    bold: bool = False
    italic: bool = False
    href: str | None = None
    image: "Image | None" = None
    cls: str | None = None  # CSS class for generated links (e.g. "cite")

    def same_format(self, other: "Seg") -> bool:
        return (self.bold, self.italic, self.href, self.cls) == (other.bold, other.italic, other.href, other.cls) \
            and self.image is None and other.image is None


@dataclass
class Image:
    target: str          # path inside the zip, e.g. word/media/image3.png
    descr: str = ""      # alt text set in the docx, if any
    name: str = ""       # original picture name, e.g. fig_source_chain.png
    width_emu: int = 0
    height_emu: int = 0


@dataclass
class Paragraph:
    style: str
    segs: list[Seg] = field(default_factory=list)

    @property
    def text(self) -> str:
        return "".join(s.text for s in self.segs if s.image is None)

    @property
    def images(self) -> list[Image]:
        return [s.image for s in self.segs if s.image is not None]

    def is_empty(self) -> bool:
        return not self.text.strip() and not self.images


@dataclass
class Table:
    rows: list[list[list[Paragraph]]]  # rows -> cells -> paragraphs

    @property
    def n_rows(self) -> int:
        return len(self.rows)

    @property
    def n_cols(self) -> int:
        return max((len(r) for r in self.rows), default=0)

    def cell_text(self, r: int, c: int) -> str:
        try:
            return "\n".join(p.text for p in self.rows[r][c]).strip()
        except IndexError:
            return ""


def _on(el) -> bool:
    """Interpret a w:b / w:i toggle element."""
    if el is None:
        return False
    val = el.get(W + "val")
    return val is None or val.lower() not in ("0", "false", "off", "none")


class DocxReader:
    def __init__(self, path: str):
        self.path = path
        self.zip = zipfile.ZipFile(path)
        self.style_names = self._read_styles()
        self.rels = self._read_rels()

    # -- package parts -------------------------------------------------
    def _read_styles(self) -> dict[str, str]:
        names: dict[str, str] = {}
        try:
            root = ET.fromstring(self.zip.read("word/styles.xml"))
        except KeyError:
            return names
        for s in root.iter(W + "style"):
            sid = s.get(W + "styleId")
            n = s.find(W + "name")
            names[sid] = n.get(W + "val") if n is not None else sid
        return names

    def _read_rels(self) -> dict[str, tuple[str, str]]:
        rels: dict[str, tuple[str, str]] = {}
        try:
            root = ET.fromstring(self.zip.read("word/_rels/document.xml.rels"))
        except KeyError:
            return rels
        for rel in root:
            rid = rel.get("Id")
            target = rel.get("Target", "")
            mode = rel.get("TargetMode", "")
            if mode != "External":
                target = posixpath.normpath(posixpath.join("word", target))
            rels[rid] = (target, mode)
        return rels

    def read_bytes(self, target: str) -> bytes:
        return self.zip.read(target)

    # -- body ------------------------------------------------------------
    def blocks(self):
        root = ET.fromstring(self.zip.read("word/document.xml"))
        body = root.find(W + "body")
        for el in body:
            if el.tag == W + "p":
                yield self._paragraph(el)
            elif el.tag == W + "tbl":
                yield self._table(el)
            elif el.tag == W + "sdt":  # content controls: walk their content
                content = el.find(W + "sdtContent")
                if content is not None:
                    for sub in content:
                        if sub.tag == W + "p":
                            yield self._paragraph(sub)
                        elif sub.tag == W + "tbl":
                            yield self._table(sub)

    def _style(self, p) -> str:
        ps = p.find(W + "pPr/" + W + "pStyle")
        if ps is None:
            return "Normal"
        sid = ps.get(W + "val")
        name = self.style_names.get(sid, sid)
        # Normalise built-in heading names ("heading 1" -> "Heading 1").
        if name.lower().startswith("heading "):
            name = "Heading " + name.split(" ", 1)[1]
        if name.lower() == "title":
            name = "Title"
        return name

    def _paragraph(self, p) -> Paragraph:
        para = Paragraph(style=self._style(p))
        self._collect(p, para.segs, href=None)
        return para

    def _collect(self, parent, segs: list[Seg], href):
        for child in parent:
            tag = child.tag
            if tag == W + "r":
                self._run(child, segs, href)
            elif tag == W + "hyperlink":
                rid = child.get(R + "id")
                link = None
                if rid and rid in self.rels and self.rels[rid][1] == "External":
                    link = self.rels[rid][0]
                self._collect(child, segs, link or href)
            elif tag in (W + "ins", W + "smartTag", W + "customXml", W + "fldSimple", W + "sdtContent"):
                self._collect(child, segs, href)
            elif tag == W + "sdt":
                c = child.find(W + "sdtContent")
                if c is not None:
                    self._collect(c, segs, href)

    def _run(self, r, segs: list[Seg], href):
        rpr = r.find(W + "rPr")
        bold = _on(rpr.find(W + "b")) if rpr is not None else False
        italic = _on(rpr.find(W + "i")) if rpr is not None else False
        buf: list[str] = []

        def flush():
            if buf:
                segs.append(Seg("".join(buf), bold, italic, href))
                buf.clear()

        for child in r:
            tag = child.tag
            if tag == W + "t":
                buf.append(child.text or "")
            elif tag == W + "tab":
                buf.append(" ")
            elif tag in (W + "br", W + "cr"):
                buf.append("\n")
            elif tag == W + "noBreakHyphen":
                buf.append("‑")
            elif tag == W + "softHyphen":
                pass
            elif tag == W + "sym":
                ch = child.get(W + "char")
                if ch:
                    try:
                        buf.append(chr(int(ch, 16)))
                    except ValueError:
                        pass
            elif tag == W + "drawing":
                flush()
                for img in self._images(child):
                    segs.append(Seg(image=img))
        flush()

    def _images(self, drawing):
        for container in list(drawing):  # wp:inline or wp:anchor
            docpr = container.find(WP + "docPr")
            extent = container.find(WP + "extent")
            descr = (docpr.get("descr") or docpr.get("title") or "") if docpr is not None else ""
            for blip in container.iter(A + "blip"):
                rid = blip.get(R + "embed")
                if not rid or rid not in self.rels:
                    continue
                cnv = container.find(".//" + PIC + "cNvPr")
                yield Image(
                    target=self.rels[rid][0],
                    descr=descr.strip(),
                    name=(cnv.get("name") if cnv is not None else "") or "",
                    width_emu=int(extent.get("cx", 0)) if extent is not None else 0,
                    height_emu=int(extent.get("cy", 0)) if extent is not None else 0,
                )

    def _table(self, tbl) -> Table:
        rows = []
        for tr in tbl.findall(W + "tr"):
            cells = []
            for tc in tr.findall(W + "tc"):
                cells.append([self._paragraph(p) for p in tc.iter(W + "p")])
            rows.append(cells)
        return Table(rows=rows)
