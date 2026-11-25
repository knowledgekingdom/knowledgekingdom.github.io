"""Run with:  python -m unittest discover -s importer/tests -v"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

import fixture_docx  # noqa: E402
import import_manuscript as IM  # noqa: E402
import patterns as P  # noqa: E402
import render as R  # noqa: E402
from docx_reader import Seg  # noqa: E402

REPO = HERE.parent.parent


def tree_hash(root: Path) -> str:
    h = hashlib.sha256()
    for d in ["src", "content-meta", "public", "IMPORT_REPORT.md"]:
        base = root / d
        files = [base] if base.is_file() else sorted(base.rglob("*")) if base.exists() else []
        for f in files:
            if f.is_file():
                h.update(str(f.relative_to(root)).encode())
                h.update(f.read_bytes())
    return h.hexdigest()


class PatternTests(unittest.TestCase):
    def test_slugify(self):
        self.assertEqual(P.slugify("1. What does it mean to know something?"), "1-what-does-it-mean-to-know-something")
        self.assertEqual(P.slugify("Seeing, measuring, remembering: why observation is not simple"),
                         "seeing-measuring-remembering-why-observation-is-not-simple")
        self.assertLessEqual(len(P.slugify("word " * 40)), 60)
        self.assertEqual(P.slugify("Meroë & Aksum’s trade"), "meroe-and-aksums-trade")

    def test_slugify_never_ends_on_a_stop_word(self):
        t = "Three investigations: a photograph, a historical claim, and a policy promise"
        self.assertEqual(P.slugify_legacy(t), "three-investigations-a-photograph-a-historical-claim-and-a")
        self.assertEqual(P.slugify(t), "three-investigations-a-photograph-a-historical-claim")
        self.assertEqual(P.slugify("The chapter's central argument: conquest was a process, not a single event"),
                         "the-chapters-central-argument-conquest-was-a-process")
        self.assertEqual(P.slugify("Short and sweet"), "short-and-sweet")  # untouched when not shortened
        self.assertEqual(P.slugify("x" * 80), "x" * 60)

    def test_title_case(self):
        self.assertEqual(P.title_case("HOW TO KNOW WHAT IS TRUE"), "How to Know What Is True")
        self.assertEqual(P.title_case("ANCIENT CHINA: DYNASTIES AND STATECRAFT"), "Ancient China: Dynasties and Statecraft")
        self.assertEqual(P.title_case("THE TOOLS OF UNDERSTANDING"), "The Tools of Understanding")

    def test_classify(self):
        self.assertEqual(P.classify_h2("The bridge that collapsed three times", 0)[0], "opening")
        self.assertEqual(P.classify_h2("1. The opening scene", 0)[0], "opening")
        self.assertEqual(P.classify_h2("3. Following a claim upstream", 4)[0], "section")
        self.assertEqual(P.classify_h2("The chapter in ten principles", 9)[0], "summary")
        self.assertEqual(P.classify_h2("Remember this chapter", 9)[0], "summary")
        self.assertEqual(P.classify_h2("Practice laboratory: explain, calculate, debate, investigate", 9)[0], "practice")
        self.assertEqual(P.classify_h2("Practice laboratory — 30 exercises", 9)[0], "practice")
        self.assertEqual(P.classify_h2("Exercises — 30 questions", 9)[0], "practice")
        self.assertEqual(P.classify_h2("Key concepts to retain", 9)[0], "summary")
        self.assertEqual(P.classify_h2("Flashcards: 28 prompts for spaced recall", 9)[0], "flashcards")
        self.assertEqual(P.classify_h2("Flashcard prompts — Chapter 001", 9)[0], "flashcards")
        self.assertEqual(P.classify_h2("Recommended sources and directions for further reading", 9)[0], "sources")
        self.assertEqual(P.classify_h2("Sources and further reading", 9)[0], "sources")
        t, warn = P.classify_h2("Essential timeline — Chapter 012", 9)
        self.assertEqual(t, "section")
        self.assertIsNotNone(warn)

    def test_decks(self):
        m = P.PART_DECK.match("PART II   /   THE HUMAN STORY")
        self.assertEqual(P.roman_to_int(m.group(1)), 2)
        m = P.EDITION_DECK.match("NOVEMBER 2026  /  WORKING EDITION 25")
        self.assertEqual(m.group(2), "25")


class RenderTests(unittest.TestCase):
    def test_asterisk_emphasis(self):
        segs = R.apply_asterisk_emphasis([Seg("what *knowledge* is, 2 * 3")])
        self.assertEqual(R.to_html(segs), "what <em>knowledge</em> is, 2 * 3")

    def test_citations(self):
        segs = R.linkify([Seg("Shown before. [4] And [1, 9].")], cite=lambda n: f"/c/sources/#source-{n}" if n < 5 else None)
        html = R.to_html(segs)
        self.assertIn('<a href="/c/sources/#source-4" class="cite">4</a>', html)
        self.assertIn('<a href="/c/sources/#source-1" class="cite">1</a>', html)
        self.assertNotIn("source-9", html)

    def test_urls(self):
        html = R.to_html(R.linkify([Seg("See https://example.org/x. Done")]))
        self.assertIn('<a href="https://example.org/x" rel="noopener">https://example.org/x</a>. Done', html)

    def test_markdown_escaping(self):
        self.assertEqual(R.to_md([Seg("1. Not a list <b> [x] *y*")]), r"1\. Not a list &lt;b&gt; \[x\] \*y\*")
        self.assertEqual(R.to_md([Seg("A "), Seg("bold ", bold=True), Seg("word")]), "A <strong>bold</strong> word")


class FixtureImportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.docx = self.root / "manuscript.docx"
        fixture_docx.build(str(self.docx))

    def tearDown(self):
        self.tmp.cleanup()

    def load(self, rel):
        return json.loads((self.root / rel).read_text(encoding="utf-8"))

    def test_structure(self):
        b = IM.run(self.docx, self.root, quiet=True)
        self.assertEqual(b.report.warnings, [])
        book = self.load("src/data/book.json")
        self.assertEqual(book["edition"], 1)
        self.assertEqual(book["parts"][0]["slug"], "part-1-the-tools-of-testing")
        ch_md = (self.root / "src/content/chapters/001-how-to-test-things.md").read_text(encoding="utf-8")
        self.assertIn('title: "How to Test Things"', ch_md)
        self.assertIn('status: "REVISED DRAFT"', ch_md)
        self.assertIn("Once upon a time", ch_md)
        sec_dir = self.root / "src/content/sections/001-how-to-test-things"
        self.assertEqual(sorted(f.name for f in sec_dir.iterdir()),
                         ["flashcards.md", "practice.md", "sources.md", "summary.md",
                          "what-is-a-test.md", "why-evidence-matters.md"])
        sec = (sec_dir / "what-is-a-test.md").read_text(encoding="utf-8")
        self.assertIn("<em>claim</em>", sec)
        self.assertIn("<strong>Bold idea.</strong>", sec)
        self.assertIn("## A ladder of tests", sec)
        self.assertIn(r"1\. Not a list item.", sec)
        self.assertIn('id="figure-1-1"', sec)
        self.assertIn("../../../assets/figures/figure-1-1.png", sec)
        self.assertTrue((self.root / "src/assets/figures/figure-1-1.png").exists())
        ev = (sec_dir / "why-evidence-matters.md").read_text(encoding="utf-8")
        self.assertIn('/001-how-to-test-things/sources/#source-2', ev)

        practice = self.load("src/data/practice.json")["001"]
        self.assertEqual(practice["groups"][0]["title"], "A. Basics")
        self.assertIn("Assert something", practice["groups"][0]["exercises"][0]["answer"])
        cards = self.load("src/data/flashcards.json")["chapters"]["001"]["cards"]
        self.assertEqual(cards, [{"id": 1, "front": "What is a test?", "back": "A check of a claim."}])
        sources = self.load("src/data/sources.json")["001"]
        self.assertEqual([e["n"] for e in sources["entries"]], [1, 2])
        roadmap = self.load("src/data/roadmap.json")
        self.assertEqual([c["status"] for c in roadmap["chapters"]], ["REVISED DRAFT", "PLANNED"])
        about = (self.root / "src/content/pages/about.md").read_text(encoding="utf-8")
        self.assertIn("Welcome", about)
        self.assertNotIn("CHAPTER 001", about)
        # Editorial boxes never leak into output
        for f in (self.root / "src").rglob("*"):
            if f.is_file() and f.suffix in (".md", ".json"):
                txt = f.read_text(encoding="utf-8")
                self.assertNotIn("EDITORIAL VISION", txt, f)
                self.assertNotIn("CURRENT STATUS", txt, f)

    def test_idempotent(self):
        IM.run(self.docx, self.root, quiet=True)
        first = tree_hash(self.root)
        IM.run(self.docx, self.root, quiet=True)
        self.assertEqual(first, tree_hash(self.root))

    def test_slugs_stable_and_changes_tracked(self):
        IM.run(self.docx, self.root, quiet=True)
        fixture_docx.build(str(self.docx), variant=2)
        b = IM.run(self.docx, self.root, quiet=True)
        sec_dir = self.root / "src/content/sections/001-how-to-test-things"
        self.assertTrue((sec_dir / "what-is-a-test.md").exists())   # unchanged slug kept
        self.assertTrue((sec_dir / "why-evidence-really-matters.md").exists())  # renamed section
        self.assertEqual([e["url"] for e in b.changes["new"]],
                         ["/001-how-to-test-things/why-evidence-really-matters/"])
        self.assertEqual([e["url"] for e in b.changes["removed"]],
                         ["/001-how-to-test-things/why-evidence-matters/"])
        self.assertIn("Edition 1", (self.root / "IMPORT_REPORT.md").read_text(encoding="utf-8"))

    def test_chapter_time_is_sum_of_listed_times(self):
        IM.run(self.docx, self.root, quiet=True)
        def fm(path):
            txt = path.read_text(encoding="utf-8")
            return {m.group(1): json.loads(m.group(2)) for m in re.finditer(r"^(\w+): (.*)$", txt, re.M)}
        ch = fm(self.root / "src/content/chapters/001-how-to-test-things.md")
        secs = [fm(f) for f in (self.root / "src/content/sections/001-how-to-test-things").iterdir()]
        listed = sum(s["readingTime"] for s in secs if s["type"] == "section")
        self.assertEqual(ch["readingTime"], ch["openingReadingTime"] + listed)

    def test_old_cut_off_slugs_move_and_redirect(self):
        IM.run(self.docx, self.root, quiet=True)
        # Pretend an earlier version had cut a slug off with a dangling stop-word.
        slugs_path = self.root / "content-meta/slugs.json"
        slugs = json.loads(slugs_path.read_text(encoding="utf-8"))
        key = next(k for k, v in slugs["sections"].items() if v == "what-is-a-test")
        slugs["sections"][key] = "what-is-a"
        slugs_path.write_text(json.dumps(slugs), encoding="utf-8")
        orig = P.slugify_legacy
        P.slugify_legacy = lambda text, max_len=60: "what-is-a" if text == "What is a test?" else orig(text, max_len)
        try:
            IM.run(self.docx, self.root, quiet=True)
        finally:
            P.slugify_legacy = orig
        self.assertTrue((self.root / "src/content/sections/001-how-to-test-things/what-is-a-test.md").exists())
        self.assertEqual(self.load("src/data/redirects.json"),
                         [{"from": "/001-how-to-test-things/what-is-a/", "to": "/001-how-to-test-things/what-is-a-test/"}])
        # The redirect is remembered on later runs.
        IM.run(self.docx, self.root, quiet=True)
        self.assertEqual(len(self.load("src/data/redirects.json")), 1)


class RelatedAndHistoryTests(unittest.TestCase):
    def test_related_prefers_shared_topic_and_limits_same_chapter(self):
        import related
        docs = [
            ("/a/1/", 1, "Roman roads", "roads aqueducts empire legions roads engineering"),
            ("/a/2/", 1, "Roman law", "law courts empire jurists law"),
            ("/b/1/", 2, "Inca roads", "roads mountains empire relay runners roads engineering"),
            ("/b/2/", 2, "Inca farming", "terraces potatoes mountains farming"),
            ("/c/1/", 3, "Modern highways", "highways roads engineering asphalt"),
            ("/c/2/", 3, "Bread", "flour yeast ovens bakers"),
        ]
        # Filler pages on other topics, so shared words are rare, as in a real book.
        docs += [(f"/z/{i}/", 10 + i, f"Topic {w}", f"{w} {w}2 {w}3 bakers") for i, w in
                 enumerate(["tides", "comets", "violins", "glaciers", "orchids", "volcanoes", "ledgers"])]
        r = related.compute(docs, k=3)
        self.assertIn("/b/1/", r["/a/1/"])                            # shared topic across chapters
        self.assertLessEqual(sum(u.startswith("/a/") for u in r["/a/1/"]), 1)  # at most one from its chapter
        self.assertNotIn("/c/2/", r.get("/a/1/", []))                # unrelated page never suggested
        self.assertEqual(r, related.compute(list(docs), k=3))       # deterministic

    def test_edition_history(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            docx = root / "m.docx"
            fixture_docx.build(str(docx))
            IM.run(docx, root, quiet=True)
            fixture_docx.build(str(docx), variant=2)
            IM.run(docx, root, quiet=True)
            eds = json.loads((root / "src/data/updates.json").read_text(encoding="utf-8"))["editions"]
            self.assertEqual([e["edition"] for e in eds], [2, 1])
            self.assertTrue(eds[1]["baseline"])
            self.assertEqual([s["url"] for s in eds[0]["newSections"]],
                             ["/001-how-to-test-things/why-evidence-really-matters/"])
            self.assertEqual(eds[0]["newChapters"], [])
            self.assertRegex(eds[0]["firstImported"], r"^\d{4}-\d{2}-\d{2}$")
            first_date = eds[1]["firstImported"]
            IM.run(docx, root, quiet=True)  # re-running never moves an edition's date
            again = json.loads((root / "src/data/updates.json").read_text(encoding="utf-8"))["editions"]
            self.assertEqual(again[1]["firstImported"], first_date)
            self.assertEqual(again, eds)


class TimelineTests(unittest.TestCase):
    def test_parse_date(self):
        import timeline as TL
        cases = {
            "c. 1550–1070 BCE": (-1550, -1070, True, None),
            "Before c. 3100 BCE": (-3100, -3100, True, "before"),
            "c. 27th–22nd centuries BCE": (-2700, -2101, True, None),
            "Late 3rd millennium BCE": (-2334, -2001, True, None),
            "In 1415 Portuguese forces took Ceuta.": (1415, 1415, False, None),
            "From 1405 to 1433 Zheng He's voyages": (1405, 1433, False, None),
            "Around 508/507 BCE, Cleisthenes": (-508, -507, True, None),
            "In the 1820s, reformers": (1820, 1829, False, None),
            "In the fifteenth century, Portuguese": (1401, 1500, True, None),
            "About 300,000 years ago, our species": (-298000, -298000, True, None),
            "Around 3.3 million years ago": (-3298000, -3298000, True, None),
            "By 1914 most of Africa": (1914, 1914, False, "by"),
        }
        for text, (s, e, approx, qual) in cases.items():
            d = TL.parse_date(text)
            self.assertEqual((d["start"], d["end"], d["approx"], d["qual"]), (s, e, approx, qual), text)
        self.assertIsNone(TL.parse_date("In 12 cases the court ruled"))
        self.assertIsNone(TL.parse_date("In many places farming spread"))

    def test_extract_and_curate(self):
        import timeline as TL
        docs = [
            ("/012-egypt/essential-timeline/", 12, "Essential timeline",
             "<strong>c. 1550–1070 BCE:</strong> New Kingdom, including Hatshepsut.\n\n"
             "<strong>332 BCE:</strong> Alexander takes control of Egypt."),
            ("/015-persia/cyrus/", 15, "Cyrus and the making of an empire",
             "Cyrus rose in 559 BCE. Around 550 he defeated Astyages of Media. In the twentieth century excavators dug."),
            ("/023-byz/siege/", 23, "The siege of 1453: why the city fell", "The walls were old \\[3\\]. Near St. Romanus the guns fired."),
        ]
        ev = TL.extract(docs)
        by_text = {e["text"]: e for e in ev}
        self.assertEqual(by_text["New Kingdom, including Hatshepsut."]["start"], -1550)
        self.assertEqual(by_text["Around 550 he defeated Astyages of Media."]["start"], -550)  # BCE implied by the section
        self.assertEqual(by_text["In the twentieth century excavators dug."]["start"], 1901)    # but not for modern dates
        self.assertEqual(by_text["The siege of 1453: why the city fell"]["source"], "title")
        self.assertEqual([e["start"] for e in ev], sorted(e["start"] for e in ev))
        notes = []
        cur = {"exclude": [by_text["In the twentieth century excavators dug."]["id"]],
               "replace": {by_text["Around 550 he defeated Astyages of Media."]["id"]:
                           {"text": "Around 550 BCE Cyrus defeated Astyages.", "textBg": "Около 550 г. пр.н.е. Кир побеждава Астиаг."}},
               "add": [{"text": "Cyrus rose in 559 BCE.", "start": -559}, {"text": "Not in the book.", "start": 1}]}
        out = TL.apply_curation(ev, cur, lambda w, m: notes.append(m), docs)
        texts = [e["text"] for e in out]
        self.assertNotIn("In the twentieth century excavators dug.", texts)
        self.assertIn("Around 550 BCE Cyrus defeated Astyages.", texts)
        added = next(e for e in out if e["text"] == "Cyrus rose in 559 BCE.")
        self.assertEqual((added["url"], added["chapter"]), ("/015-persia/cyrus/", "015"))
        self.assertTrue(any("not found" in n for n in notes))
        spans = TL.chapter_spans(out, {"chapterSpans": {"12": [-3100, -30]}})
        self.assertEqual(spans["012"], [-3100, -30])


class MultiFileTests(unittest.TestCase):
    """A master file plus separate chapter files, as in manuscript/ since Edition 41."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "manuscript").mkdir()
        self.master = self.root / "manuscript" / "Master.docx"
        self.ch2 = self.root / "manuscript" / "Chapter_2.docx"
        fixture_docx.build(str(self.master))
        fixture_docx.build(str(self.ch2), body_xml=fixture_docx.chapter_body(2))
        (self.root / "content-meta").mkdir()
        (self.root / "content-meta" / "book-settings.json").write_text(json.dumps({
            "edition": 7, "parts": [{"number": 2, "title": "Testing in Practice", "chapters": [2, 5]}]}))

    def tearDown(self):
        self.tmp.cleanup()

    def load(self, rel):
        return json.loads((self.root / rel).read_text(encoding="utf-8"))

    def test_master_plus_chapter_file(self):
        files = IM.find_manuscripts(self.root)
        self.assertEqual([f.name for f in files], ["Master.docx", "Chapter_2.docx"])  # title page first
        b = IM.run(files, self.root, quiet=True)
        book = self.load("src/data/book.json")
        self.assertEqual(book["edition"], 7)
        self.assertEqual([(p["roman"], p["title"], p["chapters"]) for p in book["parts"]],
                         [("I", "The Tools of Testing", [1]), ("II", "Testing in Practice", [2])])
        # Each file's answer key and flashcards land on the right chapter, intros don't leak.
        answers = self.load("src/data/answers.json")
        self.assertEqual(sorted(answers["chapters"]), ["001", "002"])
        self.assertNotIn("Test your answers", answers["chapters"]["001"]["2"])
        self.assertIn("These answers model reasoning", answers["intro"])
        cards = self.load("src/data/flashcards.json")["chapters"]["002"]["cards"]
        self.assertEqual([c["front"] for c in cards], ["What is a flaky test?"])  # FRONT | ANSWER header skipped
        practice = self.load("src/data/practice.json")["002"]
        self.assertEqual(sum(len(g["exercises"]) for g in practice["groups"]), 2)
        # Both files have an image1.png; each figure gets its own file and the wrong number is fixed.
        self.assertTrue((self.root / "src/assets/figures/figure-1-1.png").exists())
        self.assertTrue((self.root / "src/assets/figures/figure-2-1.png").exists())
        self.assertEqual([w for w in b.report.warnings if "Figure 1.1" in w[1]][0][1][:44],
                         "Caption says Figure 1.1 but it is in chapter")
        self.assertEqual(len(b.report.warnings), 1)
        # Written chapter marked PLANNED in the roadmap is shown as a draft.
        roadmap = self.load("src/data/roadmap.json")
        self.assertEqual([c["status"] for c in roadmap["chapters"]], ["REVISED DRAFT", "DRAFT"])

    def test_newest_file_wins_for_duplicate_chapter(self):
        newer = self.root / "manuscript" / "Chapter_1_revised.docx"
        fixture_docx.build(str(newer), body_xml=fixture_docx.chapter_body(1))
        os.utime(self.master, (1_000_000, 1_000_000))
        b = IM.run(IM.find_manuscripts(self.root), self.root, quiet=True)
        self.assertEqual([c.number for c in b.book.chapters], [1, 2])
        self.assertEqual(b.book.chapters[0].title, "Testing at Scale")
        self.assertTrue(any("Chapter_1_revised.docx" in m for _, m in b.report.info))
        answers = self.load("src/data/answers.json")["chapters"]["001"]
        self.assertIn("shared state", answers["2"])  # the revised file's answers, not the master's

    def test_idempotent(self):
        files = IM.find_manuscripts(self.root)
        IM.run(files, self.root, quiet=True)
        first = tree_hash(self.root)
        IM.run(files, self.root, quiet=True)
        self.assertEqual(first, tree_hash(self.root))


@unittest.skipUnless(list((REPO / "manuscript").glob("*.docx")), "real manuscript not present")
class RealManuscriptTests(unittest.TestCase):
    """Sanity-check counts against the real manuscript (spec values for Edition 25)."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.tmp.name)
        # Start from the committed slug registry so slugs match the repo.
        meta = REPO / "content-meta"
        if meta.exists():
            (cls.root / "content-meta").mkdir()
            for name in ("slugs.json", "slug-overrides.json", "book-settings.json"):
                if (meta / name).exists():
                    (cls.root / "content-meta" / name).write_bytes((meta / name).read_bytes())
        cls.docx = IM.find_manuscripts(REPO)
        cls.b = IM.run(cls.docx, cls.root, quiet=True)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_counts(self):
        c = self.b.counts
        if self.b.book.edition == 25:
            for k, v in IM.EXPECTED_ED25.items():
                self.assertEqual(c[k], v, k)
        self.assertEqual(c["Exercises"], c["Model answers"])
        self.assertEqual(c["Chapters"], c["Flashcard tables"])

    def test_no_warnings(self):
        # Chapter 25's captions say "Figure 24.x" (manuscript issue, corrected on the site).
        known = [w for w in self.b.report.warnings if w[1].startswith("Caption says Figure 24.")]
        self.assertEqual([w for w in self.b.report.warnings if w not in known], [])


if __name__ == "__main__":
    unittest.main()
