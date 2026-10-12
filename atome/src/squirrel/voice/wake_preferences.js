// Profile preference only; voice activation is on unless the user turned it off.
export const normalizeAssistantPreferences = value => ({ voiceActivation: value?.voiceActivation !== false, locale: 'fr-FR' });
