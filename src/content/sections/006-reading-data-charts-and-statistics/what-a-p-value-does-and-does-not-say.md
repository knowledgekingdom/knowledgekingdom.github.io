---
title: "What a p-value does—and does not—say"
manuscriptTitle: "17. What a p-value does—and does not—say"
chapter: 6
chapterLabel: "006"
chapterSlug: "006-reading-data-charts-and-statistics"
chapterTitle: "Reading Data, Charts, and Statistics"
part: 1
order: 17
number: 17
type: "section"
slug: "what-a-p-value-does-and-does-not-say"
readingTime: 2
description: "In a formal hypothesis test, analysts specify a statistical model and a null hypothesis. A p-value measures how incompatible the observed data are with…"
---

In a formal hypothesis test, analysts specify a statistical model and a <strong>null hypothesis</strong>. A <strong>p-value</strong> measures how incompatible the observed data are with that specified model in the sense of how extreme the test result is, assuming the null model and test conditions. A common error is to translate p = 0.03 into “there is a three percent probability the null hypothesis is true.” That is generally <em>not</em> what a p-value means. Nor does p = 0.03 mean that only three percent of the observed effect was due to chance.

The historical convention p &lt; 0.05 is not a universal wall separating truth from falsehood. A study with p = 0.049 is not fundamentally different from a similar study with p = 0.051. Effect sizes, confidence intervals, study quality, prior evidence, transparency and practical consequences all matter. The American Statistical Association has explicitly warned against making scientific or policy decisions from a threshold alone. A tiny effect can be statistically detectable in a very large study while barely affecting anyone's life.

<strong>Multiple testing</strong> creates a special hazard. Imagine testing 20 unrelated null hypotheses, each at a five-percent false-positive rate, and suppose the tests are independent and all 20 null hypotheses are true. The probability of at least one result below the threshold is 1 − 0.95^20, about <strong>64.2 percent</strong>. This does not mean 64.2 percent of all published research is wrong; it demonstrates why exploring many comparisons and reporting only the impressive ones can produce misleading findings. Researchers address the problem using preregistration, correction methods, replication and transparent reporting.

<strong>Publication bias</strong> adds a selection effect: striking results may be more likely to appear publicly than ordinary null findings. Replication means examining whether results persist in new suitable data and conditions. A statistically literate reader should resist the temptation to crown a single paper definitive, especially when the claim is surprising or the study small. Consider the wider body of evidence and the mechanisms that could explain the finding.
