// The provider side of the CB's and the Appel's live translation (R-173 lot TR; social/cb/live_translate/): who pays, and
// the three provider calls a piece of voice may need, the same routes as the bottles' translation (translate.rs):
//   - the transcription (`/audio/transcriptions`, its model `modality_models.transcription`), the piece sent as WAV
//     (or as the encoded take the recording made), nothing else: no pseudonym, no room, no account;
//   - the translation (`/responses`, translate.rs `body`: told to translate and nothing else);
//   - for the Voice mode, the assistant's voice (speech.rs, 24 kHz PCM, the voice `marin` of the assistant's own reading).
// The listener pays: their own key, or their seat on the platform's key (shared_grant.rs `claim`, which asks R-193's money
// guard first and refuses with its code; `record_tokens` settles the real cost). The test stand-in (`ATOME_AI_LIVE_MOCK=1`,
// temporary servers only) answers every call here, with deterministic words and a short tone, without any network; the
// payment is the real one, so the money guard is exercised as it is.
use super::http::Failure;
use super::{Link, Providers, Relay, catalog, hosted, openai, speech, translate};
use crate::settings::Settings;
use crate::social::cb::live_translate::{Audio, Backend, LiveTranslate, Payment};
use base64::Engine;
use futures_util::future::BoxFuture;
use serde_json::{Value as JsonValue, json};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

// The assistant's voice (atome/src/squirrel/voice/service.js reads with the same one).
const VOICE: &str = "marin";

/// The live translation's providers, one per server.
pub struct Bridge {
    providers: Arc<Providers>,
    mock: bool,
    // Remote tools are never used here; the calls' signature asks for their approvals.
    hosted: hosted::Sessions,
    mock_calls: AtomicU64,
}

// A call made for nobody's connection: no frame goes back through it, the result returns to the pipeline.
struct Detached;

impl Link for Detached {
    async fn check(&self, _principal: &str) -> super::Done<()> {
        Ok(())
    }
    async fn send(&self, _frame: JsonValue) {}
    fn relay(&self) -> Relay {
        Relay {
            principal: Box::new(|| Box::pin(async { None })),
            send: Box::new(|_| Box::pin(async {})),
        }
    }
    async fn atome(&self, _frame: JsonValue) -> JsonValue {
        JsonValue::Null
    }
    fn files(&self) -> super::Files {
        Arc::new(|_, _| Box::pin(async { None }))
    }
}

fn code(failure: Failure) -> String {
    if failure.provider_code.is_empty() {
        failure.message
    } else {
        failure.provider_code
    }
}

impl Bridge {
    /// The bridge attached to `live` (main.rs), with the test door when the settings open it (`ATOME_CB_TR_PROBE=1`).
    pub fn install(
        live: &LiveTranslate,
        providers: Arc<Providers>,
        settings: &Settings,
    ) -> Arc<Self> {
        let bridge = Arc::new(Self::new(providers, settings));
        live.attach(bridge.clone());
        live.enable_probe(settings.get("ATOME_CB_TR_PROBE").as_deref() == Some("1"));
        bridge
    }

    pub fn new(providers: Arc<Providers>, settings: &Settings) -> Self {
        Self {
            providers,
            mock: settings.get("ATOME_AI_LIVE_MOCK").as_deref() == Some("1"),
            hosted: hosted::Sessions::default(),
            mock_calls: AtomicU64::new(0),
        }
    }

    /// How many provider calls the stand-in answered (none ever reach a network in this mode).
    pub fn mock_calls(&self) -> u64 {
        self.mock_calls.load(Ordering::Relaxed)
    }

    fn mocked(&self) -> bool {
        if self.mock {
            self.mock_calls.fetch_add(1, Ordering::Relaxed);
        }
        self.mock
    }
}

/// The stand-in's words for a piece: its language and its length, nothing it could have heard.
pub fn mock_transcript(lang: &str, ms: u64) -> String {
    format!("cb-tr mock {lang} {ms} ms")
}

/// The stand-in's translation: the target's code before the words.
pub fn mock_translation(text: &str, target: &str) -> String {
    format!("[{target}] {text}")
}

// A quarter of a second of 440 Hz at 24 kHz, 16-bit little-endian.
fn mock_voice() -> Vec<u8> {
    (0..6000)
        .flat_map(|i| {
            let x = (f64::from(i) * 440.0 * std::f64::consts::TAU / 24_000.0).sin() * 6000.0;
            (x as i16).to_le_bytes()
        })
        .collect()
}

impl Backend for Bridge {
    fn pay<'a>(
        &'a self,
        principal: &'a str,
        action: &'a str,
    ) -> BoxFuture<'a, Result<Payment, String>> {
        Box::pin(async move {
            // Always the platform key, paid on the ledger (R-120): a person's own key is no longer used.
            let providers = &self.providers;
            match providers.shared.claim(principal, action).await? {
                Some((key, hold)) => Ok(Payment {
                    principal: principal.to_string(),
                    key,
                    hold,
                    shared: true,
                }),
                None => Err("no_ai_key_configured".into()),
            }
        })
    }

    fn transcribe<'a>(
        &'a self,
        payment: &'a Payment,
        audio: &'a Audio,
        lang: &'a str,
    ) -> BoxFuture<'a, Result<String, String>> {
        Box::pin(async move {
            if self.mocked() {
                return Ok(mock_transcript(lang, audio.duration_ms()));
            }
            let (bytes, mime, name) = match audio {
                Audio::Pcm(pcm) => {
                    let raw: Vec<u8> = pcm.iter().flat_map(|s| s.to_le_bytes()).collect();
                    (speech::wav(&raw), "audio/wav".to_string(), "piece.wav")
                }
                Audio::Encoded { mime, bytes, .. } => (bytes.clone(), mime.clone(), "piece.ogg"),
            };
            let message = json!({ "payload": { "model": catalog::modality("transcription"),
                "files": [{ "field": "file", "name": name, "mime": mime,
                    "base64": base64::engine::general_purpose::STANDARD.encode(bytes) }] } });
            let (heard, _) = openai::call(
                &Detached,
                &payment.principal,
                "transcription",
                &message,
                &payment.key,
                "",
                &self.hosted,
            )
            .await
            .map_err(code)?;
            Ok(crate::vault_router::js::text(heard.get("text")))
        })
    }

    fn translate<'a>(
        &'a self,
        payment: &'a Payment,
        text: &'a str,
        target: &'a str,
    ) -> BoxFuture<'a, Result<(String, JsonValue), String>> {
        Box::pin(async move {
            if self.mocked() {
                return Ok((
                    mock_translation(text, target),
                    json!({ "input_tokens": 40, "output_tokens": 20, "total_tokens": 60 }),
                ));
            }
            let message = json!({ "payload": translate::body(text, target) });
            let (data, usage) = openai::call(
                &Detached,
                &payment.principal,
                "responses",
                &message,
                &payment.key,
                "",
                &self.hosted,
            )
            .await
            .map_err(code)?;
            let words = translate::output_text(&data).ok_or("provider_response_invalid")?;
            Ok((words, usage.unwrap_or(JsonValue::Null)))
        })
    }

    fn speak<'a>(
        &'a self,
        payment: &'a Payment,
        text: &'a str,
    ) -> BoxFuture<'a, Result<Vec<u8>, String>> {
        Box::pin(async move {
            if self.mocked() {
                return Ok(mock_voice());
            }
            let payload = json!({ "model": catalog::modality("tts"), "voice": VOICE, "input": text,
                "response_format": "pcm" });
            let data = speech::synthesize(&payload, &payment.key)
                .await
                .map_err(code)?;
            let bytes =
                super::http::node_base64(&crate::vault_router::js::text(data.get("base64")));
            if bytes.is_empty() {
                return Err("provider_response_invalid".into());
            }
            Ok(bytes)
        })
    }

    // A seat's payment made only to know a listener is entitled (Q1): its money hold goes back at once.
    fn release<'a>(&'a self, payment: &'a Payment) -> BoxFuture<'a, ()> {
        Box::pin(async move {
            let Some(hold) = payment.hold.clone() else {
                return;
            };
            let released = self
                .providers
                .central
                .transaction(move |db| {
                    crate::billing::guard::release(db, &hold, atome_js_values::dates::now_ms())
                })
                .await;
            if let Err(error) = released {
                eprintln!("[cb live translation] hold not released: {error}");
            }
        })
    }

    fn settle<'a>(
        &'a self,
        payment: &'a Payment,
        usage: &'a JsonValue,
    ) -> BoxFuture<'a, Result<(), String>> {
        Box::pin(async move {
            if !payment.shared || usage.is_null() {
                return Ok(());
            }
            self.providers
                .shared
                .record_tokens(
                    &payment.principal,
                    usage,
                    payment.hold.as_deref(),
                    ("openai", catalog::first_model(), 0),
                    "translate",
                )
                .await
        })
    }
}
