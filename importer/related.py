"""Related sections: offline text similarity (TF-IDF + cosine), standard library only.

For each section, find the sections elsewhere in the book that talk about the most
similar things. Deterministic: the same input always gives the same output.
"""
from __future__ import annotations

import math
import re
from collections import Counter, defaultdict

# Common English words that say nothing about a section's topic.
STOPWORDS = set("""
a about above after again against all almost along also although always am among an and another any are
around as at away back be became because become becomes been before began being below between both but by
came can cannot could did do does doing done down during each early either else enough even ever every
few first for from further get gets give given gives go goes going gone got had has have having he her here
hers herself him himself his how however i if in into is it its itself just keep kept know known large
last later least less let like likely long made make makes making many may me might more most much must my
myself near need needs never new next no nor not now of off often on once one only or other others our ours
ourselves out over own part per perhaps put rather really same say says see seen several shall she should
show shows since so some something sometimes still such take taken than that the their theirs them
themselves then there these they thing things this those though three through thus to together too
toward towards two under until up upon us use used uses using usually very was way ways we well were what
when where whether which while who whom whose why will with within without would yet you your yours
yourself yourselves also chapter section figure example case study question questions answer answers
claim claims different important particular whole people time times year years century centuries
""".split())

WORD = re.compile(r"[a-z][a-z'\-]+")


def tokens(text: str) -> list[str]:
    text = re.sub(r"<[^>]+>", " ", text)            # HTML tags
    text = re.sub(r"\]\([^)]*\)", "]", text)         # Markdown link targets
    out = []
    for w in WORD.findall(text.lower()):
        w = w.strip("'-").replace("'s", "")
        if len(w) < 3 or w in STOPWORDS:
            continue
        if len(w) > 4 and w.endswith("ies"):
            w = w[:-3] + "y"
        elif len(w) > 4 and w.endswith("s") and not w.endswith(("ss", "us", "is")):
            w = w[:-1]
        out.append(w)
    return out


def compute(docs: list[tuple[str, int, str, str]], k: int = 4, same_chapter_max: int = 1,
            min_score: float = 0.08) -> dict[str, list[str]]:
    """docs: (url, chapter number, title, text). Returns {url: [related url, ...]}."""
    n = len(docs)
    if n < 2:
        return {}
    # Title words count three times: they say most about the topic.
    bags = [Counter(tokens(text)) + Counter({t: 3 for t in tokens(title)}) for _, _, title, text in docs]
    df = Counter(t for bag in bags for t in bag)
    idf = {t: math.log(n / d) for t, d in df.items() if 2 <= d <= n * 0.4}
    vecs = []
    for bag in bags:
        v = {t: (1 + math.log(c)) * idf[t] for t, c in bag.items() if t in idf}
        norm = math.sqrt(sum(x * x for x in v.values())) or 1.0
        vecs.append({t: x / norm for t, x in v.items()})
    postings: dict[str, list[tuple[int, float]]] = defaultdict(list)
    for i, v in enumerate(vecs):
        for t, x in v.items():
            postings[t].append((i, x))

    out: dict[str, list[str]] = {}
    for i, v in enumerate(vecs):
        scores: dict[int, float] = defaultdict(float)
        for t, x in v.items():
            for j, y in postings[t]:
                if j != i:
                    scores[j] += x * y
        ranked = sorted(scores.items(), key=lambda kv: (-round(kv[1], 9), docs[kv[0]][0]))
        picked, same = [], 0
        for j, s in ranked:
            if s < min_score or len(picked) == k:
                break
            if docs[j][1] == docs[i][1]:
                if same >= same_chapter_max:
                    continue
                same += 1
            picked.append(docs[j][0])
        if picked:
            out[docs[i][0]] = picked
    return dict(sorted(out.items()))
