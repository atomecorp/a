use super::*;

#[test]
fn development_authority_is_an_exact_loopback_origin() {
    for origin in ["http://127.0.0.1:3001", "http://localhost:3001/"] {
        assert!(
            development_auth_authority(origin)
                .unwrap()
                .ends_with(":3001/ws/api")
        );
    }
    for origin in [
        "https://atome.one",
        "http://127.0.0.1.example.com",
        "http://localhost@example.com",
        "http://user@localhost:3001",
        "http://localhost:3001/api",
        "http://localhost:3001?redirect=1",
    ] {
        assert_eq!(
            development_auth_authority(origin).unwrap_err(),
            "auth_development_server_forbidden"
        );
    }
}

#[tokio::test]
async fn development_transport_covers_payment_cancel_and_session_lifecycle() {
    use futures_util::{SinkExt, StreamExt};
    use tokio_tungstenite::{accept_async, tungstenite::Message};
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let actions = [
        "phone-link-start",
        "phone-link-challenge",
        "phone-link-payment",
        "phone-link-resend",
        "phone-link-consume",
        "phone-link-confirm",
        "phone-link-resume",
        "phone-link-cancel",
        "session-challenge",
        "session-renew",
        "session-logout",
    ];
    let server = tokio::spawn(async move {
        for _ in actions {
            let (socket, _) = listener.accept().await.unwrap();
            let mut socket = accept_async(socket).await.unwrap();
            let frame = socket.next().await.unwrap().unwrap();
            let message: Value = serde_json::from_str(frame.to_text().unwrap()).unwrap();
            socket
                .send(Message::Text(
                    json!({"requestId":message["requestId"],
                "ok":true,"action":message["action"]})
                    .to_string()
                    .into(),
                ))
                .await
                .unwrap();
        }
    });
    let disabled = development_request(json!({"action":"phone-link-start"}), false, None).await;
    let missing = development_request(json!({"action":"phone-link-start"}), true, None).await;
    let forbidden = development_request(
        json!({"action":"session-delete-account"}),
        true,
        Some(base.clone()),
    )
    .await;
    let mut responses = Vec::new();
    for action in actions {
        responses.push((
            action,
            development_request(json!({"action":action}), true, Some(base.clone())).await,
        ));
    }
    server.abort();
    assert_eq!(disabled.unwrap_err(), "auth_development_mode_disabled");
    assert_eq!(missing.unwrap_err(), "auth_development_server_missing");
    assert_eq!(forbidden.unwrap_err(), "auth_development_action_forbidden");
    for (action, response) in responses {
        assert_eq!(response.unwrap()["action"], action);
    }
}
