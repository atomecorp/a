// The `chat` operation (R-120): always on the platform's keys, never a person's own, so every
// answer is reserved before the call and paid on the ledger (billing/, R-193) at its real cost,
// the router's part included, plus atome's 3 %, owed to the provider that answered. A failure
// before an answer gives the hold back whole.
use super::Providers;
use super::http::Done;
use serde_json::{Value as JsonValue, json};

pub async fn chat(providers: &Providers, principal: &str, payload: &JsonValue) -> Done<JsonValue> {
    let asked = super::chat::asked(payload)?;
    let Some((openai_key, hold)) = providers.shared.claim(principal, "chat").await? else {
        return Err("no_ai_key_configured".into());
    };
    let router = &providers.model_router;
    let answered = async {
        let choice = router
            .pick(&openai_key, &asked.messages(), asked.tradeoff)
            .await?;
        let (text, usage) = super::chat::complete(router, &choice, &asked).await?;
        Ok::<_, super::http::Failure>((choice, text, usage))
    }
    .await;
    let (choice, text, usage) = match answered {
        Ok(answer) => answer,
        Err(failure) => {
            providers.shared.release(hold.as_deref()).await?;
            return Err(failure);
        }
    };
    // The router reads the same messages the provider did: its tokens are the provider's input.
    let routed = if choice.routed {
        let priced = json!({ "model": "notdiamond-router", "input_tokens": usage["input_tokens"] });
        crate::billing::pricing::ai_cost_micro_cents("chat", &priced)?
    } else {
        0
    };
    providers
        .shared
        .record_tokens(
            principal,
            &usage,
            hold.as_deref(),
            (choice.provider, choice.model, routed),
            "chat",
        )
        .await?;
    Ok(json!({
        "data": {
            "text": text,
            "provider": choice.provider,
            "model": choice.model,
            "usage": usage,
        }
    }))
}
