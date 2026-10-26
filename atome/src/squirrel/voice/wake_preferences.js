// The assistant's profile preferences (`preferences.assistant`): voice activation is
// on unless the user turned it off; the daily AI budget is one of the Home choices
// (0 = none), kept with the account like every other setting.
export const AI_BUDGET_TOKENS_PER_DAY = Object.freeze([0, 10000, 100000, 1000000]);
export const normalizeAssistantPreferences = value => ({ voiceActivation: value?.voiceActivation !== false, locale: 'fr-FR',
    ai_budget_tokens_per_day: AI_BUDGET_TOKENS_PER_DAY.includes(Number(value?.ai_budget_tokens_per_day)) ? Number(value.ai_budget_tokens_per_day) : 0 });
