/**
 * Runway API pricing — versioned data, never business code.
 * Source: docs.dev.runwayml.com/guides/pricing (checked 2026-09-21).
 * Update by adding a new version; jobs record the version they were estimated with.
 */
export const RUNWAY_PRICING = Object.freeze({
    version: '2026-09-21',
    usdPerCredit: 0.01,
    unit: 'credits_per_second',
    creditsPerSecond: Object.freeze({
        gen4_turbo: 5,
        'gen4.5': 12,
        'veo3.1': Object.freeze({ audio: 40, silent: 20 }),
        'veo3.1_fast': Object.freeze({ audio: 15, silent: 10 })
    })
});

export const estimateRunwayCost = ({ model, duration, audio = false }, pricing = RUNWAY_PRICING) => {
    const rate = pricing.creditsPerSecond[model];
    const perSecond = typeof rate === 'number' ? rate : rate ? (audio ? rate.audio : rate.silent) : null;
    if (perSecond == null) return { model, credits: null, costUsd: null, unit: pricing.unit, pricingVersion: pricing.version };
    const credits = perSecond * duration;
    return { model, credits, costUsd: Math.round(credits * pricing.usdPerCredit * 100) / 100, unit: pricing.unit, pricingVersion: pricing.version };
};
