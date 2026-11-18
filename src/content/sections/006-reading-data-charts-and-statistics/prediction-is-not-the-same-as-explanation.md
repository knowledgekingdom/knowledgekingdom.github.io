---
title: "Prediction is not the same as explanation"
manuscriptTitle: "14. Prediction is not the same as explanation"
chapter: 6
chapterLabel: "006"
chapterSlug: "006-reading-data-charts-and-statistics"
chapterTitle: "Reading Data, Charts, and Statistics"
part: 1
order: 14
number: 14
type: "section"
slug: "prediction-is-not-the-same-as-explanation"
readingTime: 2
description: "Imagine a retailer notices that umbrella sales help predict sales of hot drinks. A forecasting system may use that relationship successfully because rainy…"
---

Imagine a retailer notices that umbrella sales help predict sales of hot drinks. A forecasting system may use that relationship successfully because rainy days influence both purchases. But giving every customer a free umbrella will not necessarily raise hot-drink sales. A variable can be useful for prediction without being a lever you can pull to change an outcome.

<strong>Regression</strong> fits a mathematical relationship between a response and one or more predictors. A simple line might summarize how average delivery time changes with distance. The coefficient of distance indicates the fitted change in predicted delivery time for a one-unit increase in distance under the model. It is not automatically a physical law. If distant deliveries also use different vehicles or roads, the fitted relationship may mix several mechanisms. Models must be judged on their assumptions, measurement, and performance on data not used to fit them.

A classic overfitting story is a complex curve that snakes through every observed point but predicts new cases badly. <strong>Overfitting</strong> occurs when a model captures sample-specific noise instead of useful general patterns. Researchers use validation samples, cross-validation and careful design to estimate how well a model will perform beyond the original data. A forecast that looks perfect on its training data may fail when conditions shift.

Prediction and explanation answer different questions. “Which households are most likely to move?” is a prediction task. “Would building new housing cause more households to move?” is a causal question. “Should the municipality encourage that movement?” is a value and policy question. Statistical thinking improves when you label the question before choosing a method.
