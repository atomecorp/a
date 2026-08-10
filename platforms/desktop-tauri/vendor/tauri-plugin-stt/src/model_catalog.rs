pub(crate) const DEFAULT_MODEL_NAME: &str = "vosk-model-en-us-0.42-gigaspeech";
pub(crate) const DEFAULT_MODEL_URL: &str =
    "https://alphacephei.com/vosk/models/vosk-model-en-us-0.42-gigaspeech.zip";

const FR_FULL_MODEL_NAME: &str = "vosk-model-fr-0.22";
const FR_FULL_MODEL_URL: &str = "https://alphacephei.com/vosk/models/vosk-model-fr-0.22.zip";
const FR_SMALL_MODEL_NAME: &str = "vosk-model-small-fr-0.22";
const FR_SMALL_MODEL_URL: &str = "https://alphacephei.com/vosk/models/vosk-model-small-fr-0.22.zip";

pub(crate) const AVAILABLE_MODELS: &[(&str, &str, &str)] = &[
    ("en-US", DEFAULT_MODEL_NAME, DEFAULT_MODEL_URL),
    (
        "pt-BR",
        "vosk-model-pt-fb-v0.1.1-20220516_2113",
        "https://alphacephei.com/vosk/models/vosk-model-pt-fb-v0.1.1-20220516_2113.zip",
    ),
    (
        "es-ES",
        "vosk-model-es-0.42",
        "https://alphacephei.com/vosk/models/vosk-model-es-0.42.zip",
    ),
    ("fr-FR", FR_FULL_MODEL_NAME, FR_FULL_MODEL_URL),
    (
        "de-DE",
        "vosk-model-de-0.21",
        "https://alphacephei.com/vosk/models/vosk-model-de-0.21.zip",
    ),
    (
        "ru-RU",
        "vosk-model-ru-0.42",
        "https://alphacephei.com/vosk/models/vosk-model-ru-0.42.zip",
    ),
    (
        "zh-CN",
        "vosk-model-cn-0.22",
        "https://alphacephei.com/vosk/models/vosk-model-cn-0.22.zip",
    ),
    (
        "ja-JP",
        "vosk-model-ja-0.22",
        "https://alphacephei.com/vosk/models/vosk-model-ja-0.22.zip",
    ),
    (
        "it-IT",
        "vosk-model-it-0.22",
        "https://alphacephei.com/vosk/models/vosk-model-it-0.22.zip",
    ),
];

fn french_model() -> (&'static str, &'static str) {
    let profile = std::env::var("SQUIRREL_STT_FR_MODEL")
        .ok()
        .or_else(|| std::env::var("SQUIRREL_STT_MODEL_PROFILE").ok())
        .unwrap_or_default()
        .to_lowercase();
    if profile == "small" {
        (FR_SMALL_MODEL_NAME, FR_SMALL_MODEL_URL)
    } else {
        (FR_FULL_MODEL_NAME, FR_FULL_MODEL_URL)
    }
}

pub(crate) fn model_for_language(language: &str) -> Option<(&'static str, &'static str)> {
    if language == "fr-FR" || language.split('-').next() == Some("fr") {
        return Some(french_model());
    }
    AVAILABLE_MODELS
        .iter()
        .find(|(code, _, _)| *code == language)
        .or_else(|| {
            let prefix = language.split('-').next()?;
            AVAILABLE_MODELS
                .iter()
                .find(|(code, _, _)| code.split('-').next() == Some(prefix))
        })
        .map(|(_, name, url)| (*name, *url))
}

pub(crate) fn language_display_name(code: &str) -> String {
    match code {
        "en-US" => "English (United States)",
        "pt-BR" => "Portuguese (Brazil)",
        "es-ES" => "Spanish (Spain)",
        "fr-FR" => "French (France)",
        "de-DE" => "German (Germany)",
        "ru-RU" => "Russian (Russia)",
        "zh-CN" => "Chinese (Simplified)",
        "ja-JP" => "Japanese (Japan)",
        "it-IT" => "Italian (Italy)",
        _ => code,
    }
    .to_string()
}
