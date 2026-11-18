"""Build a tiny manuscript .docx with the same named styles as the real one."""
from __future__ import annotations

import base64
import zipfile
from xml.sax.saxutils import escape

# 1x1 transparent PNG
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")

STYLES = {
    "Title": "Title", "BookDeck": "Book Deck", "Heading1": "heading 1", "Heading2": "heading 2",
    "Heading3": "heading 3", "ChapterStandfirst": "Chapter Standfirst", "FigureCaption": "Figure Caption",
    "SourceNote": "Source Note", "BookSmall": "Book Small",
}


def p(style: str | None, text: str = "", bold: str = "", italic: str = "") -> str:
    ppr = f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else "<w:pPr/>"
    runs = f'<w:r><w:t xml:space="preserve">{escape(text)}</w:t></w:r>' if text else ""
    if bold:
        runs += f'<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">{escape(bold)}</w:t></w:r>'
    if italic:
        runs += f'<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">{escape(italic)}</w:t></w:r>'
    return f"<w:p>{ppr}{runs}</w:p>"


def image_p(rid: str = "rIdImg1") -> str:
    return (
        '<w:p><w:r><w:drawing><wp:inline><wp:extent cx="100" cy="100"/><wp:docPr id="1" name="Picture 1"/>'
        '<a:graphic><a:graphicData><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="fig.png"/></pic:nvPicPr>'
        f'<pic:blipFill><a:blip r:embed="{rid}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic>'
        "</wp:inline></w:drawing></w:r></w:p>"
    )


def table(rows: list[list[str]]) -> str:
    trs = "".join("<w:tr>" + "".join(f"<w:tc>{p(None, c)}</w:tc>" for c in row) + "</w:tr>" for row in rows)
    return f"<w:tbl>{trs}</w:tbl>"


def body(variant: int = 1) -> str:
    """variant 2 renames one section and edits another (for change detection tests)."""
    s2_title = "2. Why evidence matters" if variant == 1 else "2. Why evidence really matters"
    parts = [
        p("BookDeck", "AN ILLUSTRATED GUIDE TO TESTING"),
        p("Title", "TEST KINGDOM"),
        table([["EDITORIAL VISION Internal only."]]),
        p("BookDeck", f"JANUARY 2027  /  WORKING EDITION {1 if variant == 1 else 2}"),
        p("SourceNote", "Status: long-form chapter drafts."),
        p("Heading1", "A note to the reader"),
        p(None, "Welcome to the book."),
        p("Heading2", "Contents of this working edition"),
        p(None, "CHAPTER 001   How to Test Things"),
        p("BookDeck", "PART I   /   THE TOOLS OF TESTING"),
        p("Heading1", "001  HOW TO TEST THINGS"),
        p("ChapterStandfirst", "Testing is how we know."),
        p("Heading2", "The bug that hid"),
        p(None, "Once upon a time a bug hid. [1]"),
        p("Heading2", "1. What is a test?"),
        p(None, "A test checks a *claim* about code. ", bold="Bold idea."),
        p("Heading3", "A ladder of tests"),
        p(None, "1. Not a list item."),
        image_p(),
        p("FigureCaption", "Figure 1.1. A tiny picture."),
        p("Heading2", s2_title),
        p(None, "Evidence [2] matters" + (" a lot." if variant == 1 else " enormously.")),
        p("Heading2", "Remember this chapter"),
        p(None, "Tests are good."),
        p("Heading2", "Practice laboratory — Chapter 001"),
        p("Heading3", "A. Basics"),
        p(None, "1. Write a test."),
        p(None, "2. Explain a failing test."),
        p("Heading2", "Flashcard prompts — Chapter 001"),
        p(None, "1. What is a test?"),
        p("Heading2", "Recommended sources — Chapter 001"),
        p("SourceNote", "[1] Beck, K. Test Driven Development. https://example.org/tdd"),
        p("SourceNote", "• [2] Fowler, M. Refactoring. https://example.org/refactoring."),
        p("BookDeck", "WORKBOOK  /  ANSWERS AND DISCUSSION"),
        p("Heading1", "Answer key and model reasoning"),
        p(None, "These answers model reasoning."),
        p("Heading2", "Chapter 001"),
        p(None, "1. A test. Assert something."),
        p(None, "2. Failing. Read the message."),
        p("Heading1", "Flashcard answer bank"),
        p("Heading2", "001 · Testing"),
        table([["FRONT", "BACK"], ["What is a test?", "A check of a claim."]]),
        p("BookDeck", "EDITORIAL REGISTER  /  CONTINUITY"),
        p("Heading1", "Where the book stands"),
        table([["CURRENT STATUS Internal."]]),
        p("Heading2", "Chapters 001–002"),
        p("BookSmall", "001   How to Test Things   ·   REVISED DRAFT"),
        p("BookSmall", "002   Testing at Scale   ·   PLANNED"),
    ]
    return "".join(parts)


def build(path: str, variant: int = 1):
    ns = ('xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
          'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
          'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
          'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
          'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"')
    document = f'<?xml version="1.0" encoding="UTF-8"?><w:document {ns}><w:body>{body(variant)}</w:body></w:document>'
    styles = ('<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="http://schemas.openxmlformats.org/'
              'wordprocessingml/2006/main">' + "".join(
                  f'<w:style w:type="paragraph" w:styleId="{sid}"><w:name w:val="{name}"/></w:style>'
                  for sid, name in STYLES.items()) + "</w:styles>")
    rels = ('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/'
            'package/2006/relationships"><Relationship Id="rIdImg1" Type="image" Target="media/image1.png"/>'
            "</Relationships>")
    with zipfile.ZipFile(path, "w") as z:
        z.writestr("word/document.xml", document)
        z.writestr("word/styles.xml", styles)
        z.writestr("word/_rels/document.xml.rels", rels)
        z.writestr("word/media/image1.png", PNG)
