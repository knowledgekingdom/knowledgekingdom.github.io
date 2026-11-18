---
title: "Spread, outliers, and why the middle is never the whole story"
manuscriptTitle: "6. Spread, outliers, and why the middle is never the whole story"
chapter: 6
chapterLabel: "006"
chapterSlug: "006-reading-data-charts-and-statistics"
chapterTitle: "Reading Data, Charts, and Statistics"
part: 1
order: 6
number: 6
type: "section"
slug: "spread-outliers-and-why-the-middle-is-never-the-whole-story"
readingTime: 2
description: "Imagine two delivery companies that both promise an average delivery time of 30 minutes. Company One delivers almost everything between 27 and 33 minutes.…"
---

Imagine two delivery companies that both promise an average delivery time of 30 minutes. Company One delivers almost everything between 27 and 33 minutes. Company Two delivers most orders in 10 minutes but regularly leaves some customers waiting 90 minutes. Average time alone conceals reliability. The <strong>range</strong> is the maximum minus the minimum, a simple measure of spread that can be distorted by a single extreme case. <strong>Quartiles</strong> divide ordered data into four broad parts; the <strong>interquartile range</strong>, or IQR, runs from the first to the third quartile and covers the middle half of observations.

<strong>Standard deviation</strong> is a measure of how widely numbers tend to vary around their mean. For a population of four observations 2, 4, 6, and 8, the mean is 5. Squared deviations are 9, 1, 1, and 9. Their average is 5, so the population standard deviation is the square root of 5, approximately 2.24. If these four values are treated as a sample and we seek the conventional <em>sample</em> standard deviation, we divide the total squared deviation by n − 1 = 3 rather than n = 4; the result is about 2.58. The divisor differs because of the statistical task, not because one formula is universally right.

An <strong>outlier</strong> is an observation unusually far from the rest. It may be a data-entry mistake, an extraordinary but genuine event, or evidence that you have mixed different kinds of observations. Do not delete outliers merely because they make the average inconvenient. A sale of €50,000 in a shop that usually sells €50 baskets might be a typo, a commercial bulk order, or a different business channel. You need context before deciding whether to include it in an analysis.

A <strong>histogram</strong> groups numerical observations into intervals; it helps reveal clusters, tails, gaps and multiple peaks. A <strong>box plot</strong> summarizes median, quartiles and potential outliers. Each is useful but compresses information differently. The stronger habit is to ask for the distribution before forming a confident story about the mean.
