# A.E.G.I.S. Phishing Language Classifier - Model Card

## Purpose

This model supplies one bounded linguistic-risk signal to the A.E.G.I.S. hybrid email-security pipeline. It estimates whether the visible subject/body language resembles labelled phishing email. It does not determine sender authenticity, inspect raw header chains, identify a human actor, or prove fraud.

## Model

- TF-IDF word unigrams and bigrams
- Logistic Regression binary classifier
- Positive class: phishing
- Maximum input: first 4,000 normalized characters
- Local browser inference; no email body is uploaded for classification

## Training data

- Dataset: `puyang2025/phish-email-datasets`, file `Phishing_Email.parquet`
- Original rows: 18,650
- Empty/invalid rows removed before training
- Normalized exact-text duplicates removed before splitting
- Stratified 80/20 train/test split with random seed 1344

## Evaluation rules

Metrics are computed only on the held-out test partition. The exported metrics include precision, recall, F1, ROC-AUC, confusion matrix and A.E.G.I.S. operating thresholds.

These results are dataset-specific. They are not a production-world accuracy guarantee.

## Known limitations

- The upstream corpus includes unwanted/spam-like messages inside its phishing class. The output is therefore a linguistic phishing-risk probability, not proof of malicious intent.
- Historical public corpora contain source-specific vocabulary and may overstate random hold-out performance.
- Exact duplicates are removed before splitting, but near-duplicate templates may remain.
- English dominates the corpus. Performance on other languages and code-mixed messages has not been established.
- Short messages, newsletters and legitimate high-urgency security notifications can be difficult cases.
- Attackers can deliberately manipulate wording to evade a text-only model.

## Intended integration

The model must not replace A.E.G.I.S.'s existing authentication, sender-identity, domain, link and attachment evidence. Probability bands contribute capped evidence:

- Below 0.50: no score change
- 0.50-0.74: informational language-risk signal with no automatic deduction
- 0.75-0.94: small capped penalty only when the message is not recognized as an OTP
- 0.95 and above: moderate capped penalty only when the message is not recognized as an OTP

These deliberately conservative integration thresholds were selected after modern sanity cases exposed high probabilities for legitimate newsletters and security notifications. The model remains supporting evidence; it cannot quarantine a message by itself.

An AI result must remain visibly separate from provider-reported SPF/DKIM/DMARC evidence.
