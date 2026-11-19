// The assistant's profile preferences (`preferences.assistant`): voice activation is
// on unless the user turned it off; the AI engine (`engine`) is off unless the user turned
// it on (D18 item 7, #ai/assistant_engine.js); the daily AI budget is one of the Home choices
// (0 = none), kept with the account like every other setting.
export const AI_BUDGET_TOKENS_PER_DAY = Object.freeze([0, 10000, 100000, 1000000]);
// The translation of what strangers write (CB sociale, R-173 lot L2b): how a message in another language reaches this
// reader — `text` (the default), `voice` (read aloud by the assistant's voice) or `none` —, whether the band's Traduire
// tool is lit (`on`, by default) and whether this person refuses that their own messages be translated (`no_translate`).
// No country is ever shown to anyone (lot L2c, user 16 Nov. 2026): the former `share_country` is dropped when read.
export const TRANSLATION_MODES = Object.freeze(['text', 'voice', 'none']);
export const normalizeTranslationPreferences = value => ({ mode: TRANSLATION_MODES.includes(value?.mode) ? value.mode : 'text',
    on: value?.on !== false, no_translate: value?.no_translate === true });
// The « Économie ↔ Qualité » setting of the answers' model (R-120): 0 the cheapest, 10 the best, 5 by default; the server
// routes each `chat` request with it (atome-server providers/model_router.rs).
export const AI_TRADEOFF_LEVELS = Object.freeze({ min: 0, max: 10, initial: 5 });
const tradeoffOf = value => (Number.isInteger(value) && value >= AI_TRADEOFF_LEVELS.min && value <= AI_TRADEOFF_LEVELS.max
    ? value : AI_TRADEOFF_LEVELS.initial);
export const normalizeAssistantPreferences = value => ({ voiceActivation: value?.voiceActivation !== false, engine: value?.engine === true,
    tradeoff: tradeoffOf(value?.tradeoff), locale: 'fr-FR',
    ai_budget_tokens_per_day: AI_BUDGET_TOKENS_PER_DAY.includes(Number(value?.ai_budget_tokens_per_day)) ? Number(value.ai_budget_tokens_per_day) : 0,
    translation: normalizeTranslationPreferences(value?.translation) });
