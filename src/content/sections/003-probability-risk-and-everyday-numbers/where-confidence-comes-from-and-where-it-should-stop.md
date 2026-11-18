---
title: "Where confidence comes from—and where it should stop"
manuscriptTitle: "11. Where confidence comes from—and where it should stop"
chapter: 3
chapterLabel: "003"
chapterSlug: "003-probability-risk-and-everyday-numbers"
chapterTitle: "Probability, Risk, and Everyday Numbers"
part: 1
order: 11
number: 11
type: "section"
slug: "where-confidence-comes-from-and-where-it-should-stop"
readingTime: 2
description: "You will encounter a phrase such as “the estimate is 45 percent, plus or minus 4 percentage points.” It describes uncertainty in the estimate, not a…"
---

You will encounter a phrase such as “the estimate is 45 percent, plus or minus 4 percentage points.” It describes uncertainty in the estimate, not a physical fluctuation of the thing being measured. Many estimates depend on a sample rather than a complete population count. A sample gives information about the population, but different random samples would typically produce somewhat different results.

Here is an approximate intuition. If 400 independently selected people in a well-designed simple random sample answer a yes-or-no question, and about half say “yes,” the estimated sampling standard error is roughly √\[0.5 × 0.5 / 400\] = 0.025, or 2.5 percentage points. Under suitable statistical assumptions, a rough 95 percent confidence interval would use about two standard errors: 50 percent ± 5 percentage points. This <strong>illustration</strong> is not a universal formula for survey accuracy. Real surveys may need to account for weighting, nonresponse, clustering, question wording, coverage gaps, and other sources of error.

One subtle point matters: in the classical frequentist interpretation, a 95 percent confidence interval procedure is designed so that about 95 percent of intervals from repeated sampling would contain the fixed true population quantity, assuming the method and conditions are valid. After calculating one interval, the unknown true value is not randomly moving in and out of it. In everyday conversation, people often say “we are 95 percent confident,” which is acceptable shorthand if we remember how that confidence is earned.

<strong>Precision is not accuracy.</strong> A huge biased survey can report a wonderfully narrow estimate and still miss the truth. A thermometer that consistently reads three degrees too high may be extremely repeatable and still be wrong. Statistical sampling uncertainty is one part of total uncertainty, not a guarantee that everything else has been controlled. Never interpret tiny error bars as proof of an unbiased measurement.

A related idea is <strong>statistical significance</strong>. A very small p-value, under a specified hypothesis-testing procedure, indicates that the observed data would be relatively unusual under the model and null hypothesis being tested. It does not say the hypothesis is true with a certain probability, prove causation, or establish that an effect is large enough to matter. We will examine inferential statistics in greater detail in Chapter 6. For now, remember that numerical certainty can be manufactured by choosing the wrong question or ignoring the assumptions.
