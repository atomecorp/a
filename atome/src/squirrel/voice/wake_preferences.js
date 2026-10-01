// Profile preference only; device microphone consent is owned by wake_runtime.
export const normalizeAssistantPreferences = value => ({ voiceActivation: value?.voiceActivation === true, locale: 'fr-FR' });
