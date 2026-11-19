"""Tests for importer/translate.py that don't need the translation model."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import translate as T  # noqa: E402


def fake(cache: dict[str, str], overrides: dict[str, str] | None = None) -> T.Translator:
    tr = T.Translator(overrides or {}, dict(cache))
    tr.collecting = False
    return tr


class SentenceSplitTests(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(T.split_sentences("One thing. Two things! Three?"), ["One thing.", "Two things!", "Three?"])

    def test_abbreviations_and_initials(self):
        s = "See e.g. the U.S. data. Wineburg, S. and McGrew wrote it. About 3.6 million years ago."
        self.assertEqual(T.split_sentences(s), ["See e.g. the U.S. data.", "Wineburg, S. and McGrew wrote it.",
                                                "About 3.6 million years ago."])

    def test_quotes(self):
        self.assertEqual(T.split_sentences("He said “No.” Then he left."), ["He said “No.”", "Then he left."])


class TranslatorTests(unittest.TestCase):
    def test_cache_and_override(self):
        tr = fake({"A claim.": "Твърдение."}, {"Remember this chapter": "Запомнете тази глава"})
        self.assertEqual(tr.text("A claim."), "Твърдение.")
        self.assertEqual(tr.text("Remember this chapter"), "Запомнете тази глава")
        self.assertEqual(tr.text("1250 BCE"), "1250 BCE")  # no letters worth translating

    def test_collect_pass_records_pending(self):
        tr = T.Translator({}, {})
        self.assertEqual(tr.text("Hello world. Bye now."), "Hello world. Bye now.")
        self.assertEqual(tr.pending, {"Hello world.", "Bye now."})

    def test_list_prefix_kept(self):
        tr = fake({"Basics": "Основи"})
        self.assertEqual(tr.text("A. Basics"), "A. Основи")


class HtmlTests(unittest.TestCase):
    def test_citations_survive(self):
        tr = fake({"Evidence matters.": "Доказателствата са важни."})
        md = r'Evidence matters. \[<a href="/c/sources/#source-2" class="cite">2</a>\]'
        out = T.translate_html(md, tr, md=True)
        self.assertEqual(out, r'Доказателствата са важни. \[<a href="/c/sources/#source-2" class="cite">2</a>\]')

    def test_lead_in_bold_kept(self):
        tr = fake({"Essential terms.": "Основни термини.", "Claim, evidence.": "Твърдение, доказателство."})
        out = T.translate_html("<strong>Essential terms.</strong> Claim, evidence.", tr)
        self.assertEqual(out, "<strong>Основни термини.</strong> Твърдение, доказателство.")

    def test_mid_sentence_emphasis_dropped_sentence_whole(self):
        tr = fake({"It is called lateral reading.": "Нарича се странично четене."})
        self.assertEqual(T.translate_html("It is called <strong>lateral reading</strong>.", tr),
                         "Нарича се странично четене.")

    def test_markdown_escaping(self):
        tr = fake({"Cost: 5 * 3 & more.": "Цена: 5 * 3 и още."})
        self.assertEqual(T.translate_html(r"Cost: 5 \* 3 &amp; more.", tr, md=True), r"Цена: 5 \* 3 и още.")

    def test_figure_caption(self):
        tr = fake({"A tiny picture.": "Мъничка картина."})
        b = ('<figcaption><span class="figure-label">Figure 1.1.</span> A tiny picture. '
             '<a class="figure-anchor" href="#figure-1-1" aria-label="Link">#</a></figcaption>\n</figure>')
        out = T.translate_block(b, tr)
        self.assertIn('<span class="figure-label">Фигура 1.1.</span> Мъничка картина.', out)
        self.assertIn('href="#figure-1-1"', out)

    def test_image_path_one_level_deeper(self):
        tr = fake({"A tiny picture.": "Мъничка картина."})
        self.assertEqual(T.translate_block("![A tiny picture.](../../../assets/figures/f.png)", tr),
                         "![Мъничка картина.](../../../../assets/figures/f.png)")

    def test_heading_and_numbered_paragraph(self):
        tr = fake({"A ladder": "Стълба", "Not a list.": "Не е списък."})
        self.assertEqual(T.translate_block("## A ladder", tr), "## Стълба")
        self.assertEqual(T.translate_block(r"1\. Not a list.", tr), r"1\. Не е списък.")


class TimelineDataTests(unittest.TestCase):
    def test_timeline_uses_cache_and_hand_translation(self):
        tr = fake({"In 1415 Portuguese forces took Ceuta.": "През 1415 г. португалските сили превземат Сеута."})
        data = {"chapterSpans": {"027": [1415, 1571]}, "events": [
            {"id": "027-a", "text": "In 1415 Portuguese forces took Ceuta.", "start": 1415, "end": 1415},
            {"id": "015-b", "text": "Around 550 BCE Cyrus defeated Astyages.", "textBg": "Около 550 г. пр.н.е. Кир побеждава Астиаг.",
             "start": -550, "end": -550},
        ]}
        out = T.translate_data("timeline", data, tr)
        self.assertEqual(out["chapterSpans"], data["chapterSpans"])
        self.assertEqual([e["text"] for e in out["events"]],
                         ["През 1415 г. португалските сили превземат Сеута.", "Около 550 г. пр.н.е. Кир побеждава Астиаг."])
        self.assertNotIn("textBg", out["events"][1])


if __name__ == "__main__":
    unittest.main()
