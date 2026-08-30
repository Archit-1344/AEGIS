/**
 * A.E.G.I.S. local phishing-language classifier runtime.
 * Executes exported TF-IDF + Logistic Regression weights without a network call.
 */

function normalizeAegisAiText(value, maxCharacters = 4000) {
  return String(value || "")
    .slice(0, maxCharacters)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function tokenizeAegisAiText(value, maxCharacters = 4000) {
  return normalizeAegisAiText(value, maxCharacters).match(/[a-zA-Z0-9_]{2,}/g) || [];
}

function sigmoidAegisAi(value) {
  if (value >= 0) {
    const exp = Math.exp(-value);
    return 1 / (1 + exp);
  }
  const exp = Math.exp(value);
  return exp / (1 + exp);
}

function createAegisAiClassifier(model) {
  if (!model || model.modelType !== "tfidf-logistic-regression" || !Array.isArray(model.features)) {
    throw new Error("Unsupported or malformed A.E.G.I.S. AI model.");
  }
  const featureMap = new Map(model.features.map(feature => [feature.term, feature]));
  const maxCharacters = Number(model.tokenizer?.maxTextCharacters) || 4000;
  const explanationStopwords = new Set(["the", "and", "you", "your", "our", "this", "that", "with", "from", "for", "are", "was", "will", "have", "has", "not", "email", "here"]);

  function classify(text) {
    const tokens = tokenizeAegisAiText(text, maxCharacters);
    const counts = new Map();
    const addTerm = term => {
      if (featureMap.has(term)) counts.set(term, (counts.get(term) || 0) + 1);
    };
    for (let index = 0; index < tokens.length; index++) {
      addTerm(tokens[index]);
      if (index + 1 < tokens.length) addTerm(`${tokens[index]} ${tokens[index + 1]}`);
    }

    const vectors = [];
    let normSquared = 0;
    for (const [term, count] of counts) {
      const feature = featureMap.get(term);
      const tfidf = (1 + Math.log(count)) * Number(feature.idf);
      vectors.push({ term, tfidf, weight: Number(feature.weight) });
      normSquared += tfidf * tfidf;
    }
    const norm = Math.sqrt(normSquared) || 1;
    let logit = Number(model.intercept) || 0;
    const contributions = [];
    for (const vector of vectors) {
      const contribution = (vector.tfidf / norm) * vector.weight;
      logit += contribution;
      contributions.push({ term: vector.term, contribution });
    }
    const probability = sigmoidAegisAi(logit);
    const thresholds = model.thresholds || { low: 0.50, suspicious: 0.75, high: 0.95 };
    const band = probability >= thresholds.high ? "high" : probability >= thresholds.suspicious ? "suspicious" : probability >= thresholds.low ? "low" : "minimal";
    const explainable = item => item.term.includes(" ") || !explanationStopwords.has(item.term);
    const strongestPhishingTerms = contributions.filter(item => item.contribution > 0 && explainable(item))
      .sort((a, b) => b.contribution - a.contribution).slice(0, 5);
    const strongestSafeTerms = contributions.filter(item => item.contribution < 0 && explainable(item))
      .sort((a, b) => a.contribution - b.contribution).slice(0, 3);
    return {
      available: tokens.length > 0,
      modelName: model.modelName,
      modelType: model.modelType,
      probability,
      probabilityPercent: Math.round(probability * 1000) / 10,
      band,
      tokensAnalyzed: tokens.length,
      matchedFeatures: vectors.length,
      strongestPhishingTerms,
      strongestSafeTerms,
      localOnly: true,
      limitation: "Linguistic-risk estimate only; combine with sender, authentication, link and infrastructure evidence."
    };
  }
  return { classify, model };
}

if (typeof module !== "undefined") {
  module.exports = { normalizeAegisAiText, tokenizeAegisAiText, sigmoidAegisAi, createAegisAiClassifier };
}
