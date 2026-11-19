// A `chat` answer (R-120): text in, text out, on the model the router chose, through that
// provider's own API on the platform key: OpenAI's Responses, Anthropic's Messages, DeepSeek's
// Chat Completions. The usage comes back as `{input_tokens, output_tokens}` for every provider,
// so billing/pricing.rs prices it the same way. Tools stay on `responses` (OpenAI's hosted tools).
use super::http::{self, Done, Failure};
use super::model_router::{Choice, ModelRouter};
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};

// The longest answer asked of a provider: its worst case stays within the call's hold.
const MAX_OUTPUT_TOKENS: u64 = 2048;
const MAX_TURNS: usize = 64;

/// What the person's client asked: the instructions, the turns, the setting.
pub struct Asked {
    pub instructions: String,
    pub turns: Vec<JsonValue>,
    pub tradeoff: u8,
}

/// `{instructions?, input, tradeoff?}`: `input` a text (one user turn) or turns `{role, content}`
/// with `role` `user` or `assistant`; `tradeoff` 0–10, 5 when absent.
pub fn asked(payload: &JsonValue) -> Done<Asked> {
    let turns = match &payload["input"] {
        JsonValue::String(text) => vec![json!({ "role": "user", "content": text })],
        JsonValue::Array(items) => items
            .iter()
            .map(|item| {
                let role = item["role"].as_str().unwrap_or_default();
                let content = item["content"].as_str();
                match (role, content) {
                    ("user" | "assistant", Some(text)) => {
                        Ok(json!({ "role": role, "content": text }))
                    }
                    _ => Err(Failure::from("provider_chat_input_invalid")),
                }
            })
            .collect::<Done<Vec<_>>>()?,
        _ => return Err("provider_chat_input_invalid".into()),
    };
    if turns.is_empty()
        || turns.len() > MAX_TURNS
        || turns.last().map(|t| &t["role"]) != Some(&json!("user"))
    {
        return Err("provider_chat_input_invalid".into());
    }
    let tradeoff = match &payload["tradeoff"] {
        JsonValue::Null => 5,
        value => match value.as_u64() {
            Some(level) if level <= 10 => level as u8,
            _ => return Err("provider_chat_tradeoff_invalid".into()),
        },
    };
    let instructions = payload
        .get("instructions")
        .map(js::string)
        .unwrap_or_default();
    Ok(Asked {
        instructions,
        turns,
        tradeoff,
    })
}

impl Asked {
    /// The router's view: the instructions as a system turn, then the turns.
    pub fn messages(&self) -> Vec<JsonValue> {
        let system = (!self.instructions.is_empty())
            .then(|| json!({ "role": "system", "content": self.instructions }));
        system
            .into_iter()
            .chain(self.turns.iter().cloned())
            .collect()
    }
}

fn tokens(value: &JsonValue) -> i64 {
    value.as_i64().unwrap_or(0)
}

/// The answer's text and its usage `{input_tokens, output_tokens}`.
pub async fn complete(
    router: &ModelRouter,
    choice: &Choice,
    asked: &Asked,
) -> Done<(String, JsonValue)> {
    let root = router.root(choice.provider);
    let request = match choice.provider {
        "openai" => http::client()
            .post(format!("{root}/responses"))
            .bearer_auth(&choice.key)
            .json(&json!({
                "model": choice.model,
                "instructions": asked.instructions,
                "input": asked.turns,
                "max_output_tokens": MAX_OUTPUT_TOKENS,
                "store": false,
            })),
        "anthropic" => http::client()
            .post(format!("{root}/v1/messages"))
            .header("x-api-key", &choice.key)
            .header("anthropic-version", "2023-06-01")
            .json(&json!({
                "model": choice.model,
                "system": asked.instructions,
                "messages": asked.turns,
                "max_tokens": MAX_OUTPUT_TOKENS,
            })),
        "deepseek" => http::client()
            .post(format!("{root}/chat/completions"))
            .bearer_auth(&choice.key)
            .json(&json!({
                "model": choice.model,
                "messages": asked.messages(),
                "max_tokens": MAX_OUTPUT_TOKENS,
            })),
        _ => return Err("provider_not_supported".into()),
    };
    let response = http::send(request).await?;
    if !response.status().is_success() {
        return Err(http::failure(response).await);
    }
    let body: JsonValue = serde_json::from_slice(&http::bytes(response, 20_000_000).await?)
        .map_err(|_| Failure::from("provider_invalid_response"))?;
    let (text, input, output) = match choice.provider {
        "openai" => {
            let text: String = body["output"]
                .as_array()
                .into_iter()
                .flatten()
                .flat_map(|item| item["content"].as_array().into_iter().flatten())
                .filter(|part| part["type"] == "output_text")
                .filter_map(|part| part["text"].as_str())
                .collect();
            let usage = &body["usage"];
            (
                text,
                tokens(&usage["input_tokens"]),
                tokens(&usage["output_tokens"]),
            )
        }
        "anthropic" => {
            let text: String = body["content"]
                .as_array()
                .into_iter()
                .flatten()
                .filter(|part| part["type"] == "text")
                .filter_map(|part| part["text"].as_str())
                .collect();
            let usage = &body["usage"];
            (
                text,
                tokens(&usage["input_tokens"]),
                tokens(&usage["output_tokens"]),
            )
        }
        _ => {
            let text = body["choices"][0]["message"]["content"]
                .as_str()
                .unwrap_or_default()
                .to_string();
            let usage = &body["usage"];
            (
                text,
                tokens(&usage["prompt_tokens"]),
                tokens(&usage["completion_tokens"]),
            )
        }
    };
    if input == 0 && output == 0 {
        return Err("provider_invalid_response".into());
    }
    let usage = json!({
        "input_tokens": input,
        "output_tokens": output,
        "total_tokens": input + output,
    });
    Ok((text, usage))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_text_is_one_user_turn_and_the_setting_defaults_to_five() {
        let asked = asked(&json!({ "input": "Bonjour", "instructions": "Sois bref." })).unwrap();
        assert_eq!(asked.tradeoff, 5);
        assert_eq!(
            asked.turns,
            vec![json!({ "role": "user", "content": "Bonjour" })]
        );
        assert_eq!(
            asked.messages()[0],
            json!({ "role": "system", "content": "Sois bref." })
        );
    }

    #[test]
    fn a_malformed_request_is_refused() {
        for payload in [
            json!({}),
            json!({ "input": [] }),
            json!({ "input": [{ "role": "system", "content": "x" }] }),
            json!({ "input": [{ "role": "user", "content": "a" }, { "role": "assistant", "content": "b" }] }),
            json!({ "input": "a", "tradeoff": 11 }),
            json!({ "input": "a", "tradeoff": "5" }),
        ] {
            assert!(asked(&payload).is_err(), "{payload}");
        }
    }
}
