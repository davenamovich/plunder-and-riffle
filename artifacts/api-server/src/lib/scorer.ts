export interface ExperimentMetrics {
  impressions: number;
  clicks: number;
  replies: number;
  dms: number;
  leads: number;
  qualifiedLeads: number;
}

export type Decision = "SCALE" | "ITERATE" | "TEST" | "KILL";

export interface ScoredExperiment extends ExperimentMetrics {
  score: number;
  decision: Decision;
  breakdown: {
    attention: number;
    engagement: number;
    intent: number;
    conversion: number;
    quality: number;
  };
}

export function scoreExperiment(exp: ExperimentMetrics): ScoredExperiment {
  let attention = 0;
  let engagement = 0;
  let intent = 0;
  let conversion = 0;
  let quality = 0;

  if (exp.impressions > 0) {
    const ctr = exp.clicks / exp.impressions;
    attention = Math.round(ctr * 20 * 100) / 100;
  }

  if (exp.clicks > 0) {
    const replyRate = exp.replies / exp.clicks;
    engagement = Math.round(replyRate * 25 * 100) / 100;
  }

  if (exp.replies > 0) {
    const dmRate = exp.dms / exp.replies;
    intent = Math.round(dmRate * 25 * 100) / 100;
  }

  if (exp.dms > 0) {
    const leadRate = exp.leads / exp.dms;
    conversion = Math.round(leadRate * 20 * 100) / 100;
  }

  if (exp.leads > 0) {
    const qualityRate = exp.qualifiedLeads / exp.leads;
    quality = Math.round(qualityRate * 30 * 100) / 100;
  }

  const score = Math.round((attention + engagement + intent + conversion + quality) * 100) / 100;

  return {
    ...exp,
    score,
    decision: classify(score),
    breakdown: { attention, engagement, intent, conversion, quality },
  };
}

export function classify(score: number): Decision {
  if (score >= 70) return "SCALE";
  if (score >= 40) return "ITERATE";
  if (score >= 20) return "TEST";
  return "KILL";
}

export function funnelRates(exp: ExperimentMetrics) {
  return {
    ctr:       exp.impressions > 0 ? ((exp.clicks / exp.impressions) * 100).toFixed(2) + "%" : "—",
    replyRate: exp.clicks > 0      ? ((exp.replies / exp.clicks) * 100).toFixed(2) + "%" : "—",
    dmRate:    exp.replies > 0     ? ((exp.dms / exp.replies) * 100).toFixed(2) + "%" : "—",
    leadRate:  exp.dms > 0        ? ((exp.leads / exp.dms) * 100).toFixed(2) + "%" : "—",
    quality:   exp.leads > 0      ? ((exp.qualifiedLeads / exp.leads) * 100).toFixed(2) + "%" : "—",
  };
}
