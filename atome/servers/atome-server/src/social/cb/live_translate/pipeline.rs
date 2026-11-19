// One piece of voice through the live translation (lot TR): who hears it in another language, who pays, then one
// transcription, one translation per target language and, for the Voice mode, one reading by the assistant's voice;
// the frames to each listener; nothing kept afterwards. Every await is followed by a look at who still listens: a
// listener gone (unsubscribed, left, disconnected) is never computed for again.
use super::{
    Audio, FRAME, LiveTranslate, Member, Mode, Payment, Subscription, TAKE_PREFIX, segments, token,
};
use base64::Engine;
use futures_util::future::join_all;
use serde_json::{Value as JsonValue, json};

/// What became of one piece (the tests' and the probe's view).
#[derive(Debug, Default)]
pub struct Outcome {
    pub take: String,
    pub refused: bool,
    pub transcribed: bool,
    pub languages: Vec<String>,
    pub delivered: usize,
}

// The provider's and the money guard's refusals a listener reads as « Traduction épuisée ».
const EXHAUSTED: [&str; 6] = [
    "provider_shared_quota_exceeded",
    "insufficient_quota",
    "billing_hard_limit_reached",
    "billing_not_active",
    "provider_http_402",
    "rate_limit_exceeded",
];

fn state_of(code: &str) -> &'static str {
    if code.starts_with("money_") || EXHAUSTED.contains(&code) {
        "exhausted"
    } else if code == "no_ai_key_configured" {
        "unavailable"
    } else {
        "failed"
    }
}

// The speaker of `handle` in `room`, and the listeners who asked for a translation of them: never the speaker, never
// someone already in the speaker's language.
fn audience(live: &LiveTranslate, room: &str, handle: &str) -> Option<(Member, Vec<Subscription>)> {
    let state = live.state();
    let speaker = state
        .rooms
        .get(room)?
        .members
        .iter()
        .find(|member| member.handle == handle)?
        .clone();
    let listeners = state
        .subscriptions
        .iter()
        .filter(|sub| {
            sub.room == room && sub.principal != speaker.principal && sub.lang != speaker.lang
        })
        .cloned()
        .collect();
    Some((speaker, listeners))
}

// Those of `subs` still subscribed.
fn still(live: &LiveTranslate, subs: &[Subscription]) -> Vec<Subscription> {
    let state = live.state();
    subs.iter()
        .filter(|sub| state.subscriptions.iter().any(|open| open.id == sub.id))
        .cloned()
        .collect()
}

struct Frame<'a> {
    take: &'a str,
    handle: &'a str,
    seconds: f64,
}

impl Frame<'_> {
    // A listener's frame: pseudonyms and words only.
    fn to(&self, sub: &Subscription, state: &str, fields: JsonValue) -> JsonValue {
        let mut frame = json!({ "type": FRAME, "subscription": sub.id, "take": self.take, "handle": self.handle,
            "state": state, "seconds": self.seconds });
        if let (Some(frame), JsonValue::Object(fields)) = (frame.as_object_mut(), fields) {
            frame.extend(fields);
        }
        frame
    }
}

async fn tell(live: &LiveTranslate, subs: &[Subscription], frames: Vec<JsonValue>) -> usize {
    let sink = live.sink();
    let mut delivered = 0;
    for (sub, frame) in subs.iter().zip(frames) {
        if sink.send(sub.live, frame).await {
            delivered += 1;
        }
    }
    delivered
}

// The first of `subs` able to pay for `action`, or the last refusal's code.
async fn payer(
    backend: &dyn super::Backend,
    subs: &[Subscription],
    action: &str,
) -> Result<Payment, String> {
    let mut refusal = String::from("no_ai_key_configured");
    for sub in subs {
        match backend.pay(&sub.principal, action).await {
            Ok(payment) => return Ok(payment),
            Err(code) => refusal = code,
        }
    }
    Err(refusal)
}

pub(super) async fn process(
    live: &LiveTranslate,
    room: &str,
    handle: &str,
    audio: Audio,
) -> Outcome {
    let take = token(TAKE_PREFIX);
    let mut outcome = Outcome {
        take: take.clone(),
        ..Outcome::default()
    };
    let Some((speaker, listeners)) = audience(live, room, handle) else {
        return outcome;
    };
    if listeners.is_empty() {
        return outcome;
    }
    let ms = audio.duration_ms();
    let frame = Frame {
        take: &take,
        handle: &speaker.handle,
        seconds: ms as f64 / 1000.0,
    };
    // The speaker refused every translation: their voice is never transcribed.
    if speaker.no_translate {
        outcome.refused = true;
        let frames = listeners
            .iter()
            .map(|sub| frame.to(sub, "refused", json!({})))
            .collect();
        outcome.delivered = tell(live, &listeners, frames).await;
        return outcome;
    }
    let Some(backend) = live.backend() else {
        return outcome;
    };
    // The listeners by language, in the order they subscribed; each language's payer is its first listener able to pay.
    let mut groups: Vec<(String, Vec<Subscription>)> = Vec::new();
    for sub in listeners {
        match groups.iter_mut().find(|(lang, _)| *lang == sub.lang) {
            Some((_, subs)) => subs.push(sub),
            None => groups.push((sub.lang.clone(), vec![sub])),
        }
    }
    let mut paid = Vec::new();
    for (lang, subs) in groups {
        match payer(backend.as_ref(), &subs, "translate").await {
            Ok(payment) => {
                // Served only to those entitled to it themselves (Q1): the others of the language read their own refusal.
                let mut served = Vec::new();
                for sub in subs {
                    if sub.principal == payment.principal {
                        served.push(sub);
                        continue;
                    }
                    match backend.entitled(&sub.principal).await {
                        Ok(()) => served.push(sub),
                        Err(code) => {
                            let refusal = frame.to(&sub, state_of(&code), json!({ "error": code }));
                            outcome.delivered +=
                                tell(live, std::slice::from_ref(&sub), vec![refusal]).await;
                        }
                    }
                }
                paid.push((lang, served, payment));
            }
            Err(code) => {
                let state = state_of(&code);
                let frames = subs
                    .iter()
                    .map(|sub| frame.to(sub, state, json!({ "error": code })))
                    .collect();
                outcome.delivered += tell(live, &subs, frames).await;
            }
        }
    }
    let Some((_, _, first)) = paid.first() else {
        return outcome;
    };
    if paid.iter().all(|(_, subs, _)| still(live, subs).is_empty()) {
        return outcome;
    }
    // One transcription for every language.
    let words = match backend.transcribe(first, &audio, &speaker.lang).await {
        Ok(words) => words.trim().to_string(),
        Err(code) => {
            for (_, subs, _) in &paid {
                let subs = still(live, subs);
                let frames = subs
                    .iter()
                    .map(|sub| frame.to(sub, state_of(&code), json!({ "error": code })))
                    .collect();
                outcome.delivered += tell(live, &subs, frames).await;
            }
            return outcome;
        }
    };
    if words.is_empty() {
        return outcome;
    }
    outcome.transcribed = true;
    // One translation per language, side by side.
    let backend = backend.as_ref();
    let frame = &frame;
    let words = words.as_str();
    let done = join_all(paid.iter().map(|(lang, subs, payment)| async move {
        let subs = still(live, subs);
        if subs.is_empty() {
            return (None, 0);
        }
        let (text, usage) = match backend.translate(payment, words, lang).await {
            Ok(answer) => answer,
            Err(code) => {
                let frames = subs
                    .iter()
                    .map(|sub| frame.to(sub, state_of(&code), json!({ "error": code })))
                    .collect();
                return (None, tell(live, &subs, frames).await);
            }
        };
        if let Err(error) = backend.settle(payment, &usage).await {
            eprintln!("[cb live translation] not settled: {error}");
        }
        *live
            .state()
            .metered_ms
            .entry(payment.principal.clone())
            .or_default() += ms;
        let subs = still(live, &subs);
        // The Voice mode: one reading for every listener of this language who chose it, paid by the first able to.
        let voiced: Vec<Subscription> = subs
            .iter()
            .filter(|sub| sub.mode == Mode::Voice)
            .cloned()
            .collect();
        let mut audio = JsonValue::Null;
        let mut voice_error = JsonValue::Null;
        if !voiced.is_empty() {
            let spoken = match payer(backend, &voiced, "speech").await {
                Ok(speaker) => backend.speak(&speaker, &text).await,
                Err(code) => Err(code),
            };
            match spoken {
                Ok(pcm) => {
                    audio = json!({ "base64": base64::engine::general_purpose::STANDARD.encode(pcm),
                        "mime": "audio/pcm", "rate": segments::SAMPLE_RATE })
                }
                Err(code) => voice_error = json!(code),
            }
        }
        let subs = still(live, &subs);
        let frames = subs
            .iter()
            .map(|sub| {
                let mut fields = json!({ "text": text, "lang": lang });
                if sub.mode == Mode::Voice {
                    if !audio.is_null() {
                        fields["audio"] = audio.clone();
                    } else if !voice_error.is_null() {
                        fields["voice"] = json!(state_of(voice_error.as_str().unwrap_or("")));
                    }
                }
                frame.to(sub, "ok", fields)
            })
            .collect();
        (Some(lang.clone()), tell(live, &subs, frames).await)
    }))
    .await;
    for (lang, delivered) in done {
        outcome.delivered += delivered;
        outcome.languages.extend(lang);
    }
    outcome
}
