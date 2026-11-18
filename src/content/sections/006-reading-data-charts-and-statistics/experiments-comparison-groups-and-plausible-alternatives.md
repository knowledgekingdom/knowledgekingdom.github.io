---
title: "Experiments, comparison groups, and plausible alternatives"
manuscriptTitle: "15. Experiments, comparison groups, and plausible alternatives"
chapter: 6
chapterLabel: "006"
chapterSlug: "006-reading-data-charts-and-statistics"
chapterTitle: "Reading Data, Charts, and Statistics"
part: 1
order: 15
number: 15
type: "section"
slug: "experiments-comparison-groups-and-plausible-alternatives"
readingTime: 2
description: "The strongest simple way to estimate many causal effects is a well-designed randomized experiment. Imagine a company has two versions of a checkout page.…"
---

The strongest simple way to estimate many causal effects is a well-designed <strong>randomized experiment</strong>. Imagine a company has two versions of a checkout page. Eligible visitors are randomly assigned to Version A or Version B. If the groups are large enough, the random assignment is executed properly, and other conditions are comparable, differences in outcomes can more credibly be attributed to the assigned version rather than to preexisting differences. Randomization does not fix poor measurement, attrition, noncompliance or an experiment that does not represent future users.

Consider 1,000 randomly assigned visitors per version. Version A yields 100 purchases (10 percent); Version B yields 120 (12 percent). The observed difference is <strong>two percentage points</strong>, or a 20 percent relative increase from A's rate. Is B <em>truly</em> better? The observed result is evidence, not absolute certainty; sampling variation means a repeat could produce a different gap. We would want an uncertainty estimate, a predefined decision rule where appropriate, and knowledge of the practical costs and consequences. A two-point gain may be valuable for a large store and irrelevant for a tiny pilot.

Without random assignment, analysts sometimes use <strong>natural experiments</strong>, interrupted time series, matching, or <strong>difference-in-differences</strong> comparisons. These methods can be powerful when assumptions are justified, but cannot be treated as magical switches converting association into causation. In difference-in-differences, for example, a key concern is whether the treated and comparison groups would have followed sufficiently similar trends without the intervention. Historical policy questions often require such tools precisely because we cannot randomly assign entire countries to different wars, constitutions, or recessions.

A good experiment also asks about <strong>external validity</strong>: will the result generalize? A marketing test among frequent buyers may not predict new customers' behavior. A medical study with selected participants may not apply equally to everyone. Causal confidence about one population and setting does not automatically extend to all populations and settings.
