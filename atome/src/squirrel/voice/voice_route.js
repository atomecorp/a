// Where the assistant hears and speaks: this device's own microphone and speaker, or a companion's for the conversation it
// opened (the watch, eVe/domains/watch/watch_voice.js). `input()` gives the microphone's MediaStream; `output`, when present,
// says the voice in place of this device's speaker ({ playStream, stopStream, muteStream }, as audio_playback_api.js does).
// Null: this device's own.
let route = null;

export const setVoiceRoute = next => { route = next; };
export const voiceRoute = () => route;
