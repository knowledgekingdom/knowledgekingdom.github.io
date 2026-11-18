---
title: "Conditional probability: the question after “given that”"
manuscriptTitle: "4. Conditional probability: the question after “given that”"
chapter: 3
chapterLabel: "003"
chapterSlug: "003-probability-risk-and-everyday-numbers"
chapterTitle: "Probability, Risk, and Everyday Numbers"
part: 1
order: 4
number: 4
type: "section"
slug: "conditional-probability-the-question-after-given-that"
readingTime: 2
description: "Imagine that you draw a card from an ordinary shuffled 52-card deck. The probability of drawing a queen is 4/52. But suppose someone tells you the drawn…"
---

Imagine that you draw a card from an ordinary shuffled 52-card deck. The probability of drawing a queen is 4/52. But suppose someone tells you the drawn card is a face card—jack, queen, or king. Now there are twelve possibilities in the relevant group, four of which are queens. The probability of a queen <strong>given that the card is a face card</strong> is 4/12 = 1/3. The information changes the denominator.

We write the idea as <strong>P(A \| B)</strong>, read “the probability of A given B.” The formal relationship is P(A \| B) = P(A and B) / P(B), provided P(B) is greater than zero. It is simply the share of B-cases that are also A-cases. The vertical bar does not mean division; it tells us what evidence or condition we are assuming.

Now turn the condition around. The probability that a randomly drawn queen is a face card is 1, or 100 percent. So P(queen \| face card) = 1/3, while P(face card \| queen) = 1. Both describe the same cards, but they are different questions. In daily life the reversal is often harder to notice. “Most people who have condition X show symptom Y” is not equivalent to “most people who show symptom Y have condition X.”

The easiest way to reason about a conditional probability is often a <strong>natural-frequency table</strong>. Instead of immediately writing a formula, imagine 1,000 or 10,000 comparable cases. Divide them into the base categories, calculate how many land in each cell, and then inspect only the group named after “given that.” This procedure is less intimidating than algebra, and it often reveals an error before it can hide behind a percentage.
