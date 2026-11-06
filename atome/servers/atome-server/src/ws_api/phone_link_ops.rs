// The phone-link `auth` requests of `/ws/api` (server/wsPhoneLinkAuth.js): each runs in a
// `committed` unit, `phone-link-payment` in its own (auth/phone_link/finish.rs#pay); one
// that sends an SMS reserves the day's budget in a second unit, sends, then records
// the delivery in a third. A resuming connection is marked first (`link_attempt`),
// so the link opened elsewhere reaches it (auth_effects.rs `link-ready`).
use super::Connection;
use crate::auth::now_ms;
use crate::auth::outcome::Outcome;
use crate::auth::phone_link::{self, Delivery, Step};
use serde_json::Value as JsonValue;

pub(super) const ACTIONS: [&str; 9] = [
    "phone-link-start",
    "phone-link-payment",
    "phone-change-start",
    "phone-link-resend",
    "phone-link-challenge",
    "phone-link-consume",
    "phone-link-resume",
    "phone-link-confirm",
    "phone-link-cancel",
];

pub(super) async fn outcome(
    connection: &Connection,
    message: &JsonValue,
    action: &str,
) -> Result<Outcome, String> {
    let sessions = connection.ws_api.sessions.clone();
    let (Some(proof), Some(_)) = (sessions.proof(), sessions.secret()) else {
        return Err("auth_secret_required".into());
    };
    if action == "phone-link-payment" {
        let billing = &connection.ws_api.billing;
        return phone_link::pay(sessions.clone(), billing, message.clone()).await;
    }
    if action == "phone-link-resume" {
        // This connection waits on the attempt (`_authLinkAttemptId`).
        *connection.link_attempt.lock().expect("link attempt") = message.get("attemptId").cloned();
    }
    let network = connection.network.clone();
    let input = message.clone();
    let act = action.to_string();
    let worker = sessions.clone();
    let step = sessions
        .central()
        .committed(move |db| {
            let proof = worker.proof().expect("proof keys");
            let secret = worker.secret().expect("secret");
            let now = now_ms() as i64;
            match act.as_str() {
                "phone-link-start" => {
                    phone_link::start(db, proof, &input, input.get("phone"), &network, None, now)
                }
                "phone-change-start" => phone_link::start_change(db, proof, &input, &network, now),
                "phone-link-resend" => phone_link::resend(db, proof, &input, now),
                "phone-link-challenge" => {
                    phone_link::challenge(db, proof, &input, &network, now).map(Step::Done)
                }
                "phone-link-consume" => {
                    phone_link::complete(db, proof, secret, &input, false, now).map(Step::Done)
                }
                "phone-link-resume" => {
                    phone_link::complete(db, proof, secret, &input, true, now).map(Step::Done)
                }
                "phone-link-confirm" => phone_link::confirm(db, proof, &input, now).map(Step::Done),
                _ => phone_link::cancel(db, &input, now).map(Step::Done),
            }
        })
        .await??;
    let delivery = match step {
        Step::Done(outcome) => return Ok(outcome),
        Step::Send(delivery) => delivery,
    };
    let daily_limit = connection.ws_api.sms.daily_limit;
    let delivery: Delivery = sessions
        .central()
        .committed(move |db| {
            phone_link::reserve(db, &delivery, daily_limit, now_ms() as i64).map(|()| delivery)
        })
        .await??;
    let sent = match proof.open_phone(
        delivery.attempt["phone_sealed"]
            .as_str()
            .unwrap_or_default(),
    ) {
        Ok(phone) => {
            connection
                .ws_api
                .sms
                .send(&phone, &phone_link::link(&delivery))
                .await
        }
        Err(error) => Err(error),
    };
    let worker = sessions.clone();
    sessions
        .central()
        .committed(move |db| {
            let proof = worker.proof().expect("proof keys");
            phone_link::delivered(db, proof, &delivery, sent, now_ms() as i64)
        })
        .await?
}
