// Bluesky's sign-in (R-190): atproto OAuth, as atproto.com/specs/oauth defines it. The person's
// handle names their server (handle → DID → PDS → its authorization server); atome is a public
// web client whose metadata this server publishes (`METADATA_PATH`); the request is pushed (PAR)
// with PKCE, and every token is bound to a P-256 key of the account's own (DPoP, ES256), the
// server's nonce replayed when it asks for one. A fake base (`SOCIAL_API_BASE_BLUESKY`) stands for
// the handle resolver and the PDS alike.
use super::Config;
use super::net::{self, Sd, Se};
use crate::providers::http::{self, form};
use crate::vault_router::js;
use axum::http::{HeaderValue, header};
use axum::response::{IntoResponse, Response};
use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use ring::rand::SystemRandom;
use ring::signature::{ECDSA_P256_SHA256_FIXED_SIGNING, EcdsaKeyPair, KeyPair};
use serde_json::{Value as JsonValue, json};
use std::sync::Arc;

pub const METADATA_PATH: &str = "/api/social/oauth/client-metadata/bluesky.json";
const SCOPE: &str = "atproto transition:generic transition:chat.bsky";

fn public_base(config: &Config) -> String {
    config
        .get("SOCIAL_PUBLIC_BASE_URL")
        .trim_end_matches('/')
        .to_string()
}

/// atome's client id: the URL of its metadata.
pub fn client_id(config: &Config) -> String {
    format!("{}{METADATA_PATH}", public_base(config))
}

pub fn metadata_json(config: &Config) -> JsonValue {
    let redirect = format!("{}/api/social/oauth/callback/bluesky", public_base(config));
    json!({ "client_id": client_id(config), "client_name": "atome", "client_uri": public_base(config),
        "application_type": "web", "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"], "redirect_uris": [redirect], "scope": SCOPE,
        "token_endpoint_auth_method": "none", "dpop_bound_access_tokens": true })
}

/// `GET METADATA_PATH`.
pub fn metadata(config: &Config) -> Response {
    let mut response = axum::Json(metadata_json(config)).into_response();
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("max-age=300"),
    );
    response
}

/// An account's DPoP key.
pub struct Dpop {
    pkcs8: Vec<u8>,
}

impl Dpop {
    pub fn generate() -> Sd<Self> {
        let document =
            EcdsaKeyPair::generate_pkcs8(&ECDSA_P256_SHA256_FIXED_SIGNING, &SystemRandom::new())
                .map_err(|_| Se::from("social_dpop_key_unavailable".to_string()))?;
        Ok(Self {
            pkcs8: document.as_ref().to_vec(),
        })
    }

    pub fn of(account: &JsonValue) -> Sd<Self> {
        let key = URL_SAFE_NO_PAD
            .decode(net::text(account.get("dpop_key")))
            .map_err(|_| Se::new("social_session_expired"))?;
        Ok(Self { pkcs8: key })
    }

    pub fn encoded(&self) -> String {
        URL_SAFE_NO_PAD.encode(&self.pkcs8)
    }

    fn pair(&self) -> Sd<EcdsaKeyPair> {
        EcdsaKeyPair::from_pkcs8(
            &ECDSA_P256_SHA256_FIXED_SIGNING,
            &self.pkcs8,
            &SystemRandom::new(),
        )
        .map_err(|_| Se::new("social_session_expired"))
    }

    pub fn jwk(&self) -> Sd<JsonValue> {
        let pair = self.pair()?;
        let point = pair.public_key().as_ref();
        // An uncompressed P-256 point: 0x04, then x and y.
        Ok(json!({ "kty": "EC", "crv": "P-256",
            "x": URL_SAFE_NO_PAD.encode(&point[1..33]), "y": URL_SAFE_NO_PAD.encode(&point[33..65]) }))
    }

    /// A proof for one request (RFC 9449): its method and URL, the server's nonce, and the
    /// access token's hash when one is sent.
    pub fn proof(&self, htm: &str, htu: &str, nonce: &str, token: Option<&str>) -> Sd<String> {
        let header = json!({ "typ": "dpop+jwt", "alg": "ES256", "jwk": self.jwk()? });
        let mut claims = json!({ "jti": crate::providers::oauth::hex(16), "htm": htm,
            "htu": htu.split(['?', '#']).next().unwrap_or(htu), "iat": atome_js_values::dates::Instant::now().seconds });
        if !nonce.is_empty() {
            claims["nonce"] = json!(nonce);
        }
        if let Some(token) = token {
            let digest = ring::digest::digest(&ring::digest::SHA256, token.as_bytes());
            claims["ath"] = json!(URL_SAFE_NO_PAD.encode(digest.as_ref()));
        }
        let signing = format!(
            "{}.{}",
            URL_SAFE_NO_PAD.encode(header.to_string()),
            URL_SAFE_NO_PAD.encode(claims.to_string())
        );
        let signature = self
            .pair()?
            .sign(&SystemRandom::new(), signing.as_bytes())
            .map_err(|_| Se::from("social_dpop_sign_failed".to_string()))?;
        Ok(format!(
            "{signing}.{}",
            URL_SAFE_NO_PAD.encode(signature.as_ref())
        ))
    }
}

/// A request sent with its proof, sent again once with the nonce the server asks for.
pub async fn call(
    dpop: &Dpop,
    htm: &str,
    htu: &str,
    nonce: &str,
    token: Option<&str>,
    reaches: bool,
    build: impl Fn() -> reqwest::RequestBuilder,
) -> Sd<(net::Answer, String)> {
    let mut nonce = nonce.to_string();
    for _ in 0..2 {
        let mut request = build().header("DPoP", dpop.proof(htm, htu, &nonce, token)?);
        if let Some(token) = token {
            request = request.header("Authorization", format!("DPoP {token}"));
        }
        let answer = net::answer(request, reaches).await?;
        let fresh = answer.header("dpop-nonce");
        let asked = answer.body["error"] == "use_dpop_nonce"
            || answer.header("www-authenticate").contains("use_dpop_nonce");
        if !answer.ok() && asked && !fresh.is_empty() && fresh != nonce {
            nonce = fresh;
            continue;
        }
        if !answer.ok() {
            return Err(answer.failure(reaches));
        }
        let kept = if fresh.is_empty() { nonce } else { fresh };
        return Ok((answer, kept));
    }
    Err(Se::new("social_provider_rejected"))
}

/// Where a person's account lives and how its server signs in.
#[derive(Clone, Debug)]
pub struct Server {
    pub did: String,
    pub handle: String,
    pub pds: String,
    pub issuer: String,
    pub par: String,
    pub authorize: String,
    pub token: String,
}

fn handle_of(handle: &str) -> Option<String> {
    let handle = handle.trim().trim_start_matches('@').to_ascii_lowercase();
    let shaped = (3..=253).contains(&handle.len())
        && handle.contains('.')
        && handle
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || b".-".contains(&c));
    shaped.then_some(handle)
}

async fn get(url: &str) -> Sd<JsonValue> {
    net::fetch(http::client().get(url), false).await
}

/// The PDS a DID document names.
pub fn pds_of(document: &JsonValue) -> Option<String> {
    document["service"]
        .as_array()?
        .iter()
        .find(|service| net::text(service.get("id")).ends_with("#atproto_pds"))
        .map(|service| {
            net::text(service.get("serviceEndpoint"))
                .trim_end_matches('/')
                .to_string()
        })
        .filter(|endpoint| !endpoint.is_empty())
}

/// handle → DID → PDS → authorization server.
pub async fn discover(config: &Config, handle: &str) -> Sd<Server> {
    let handle = handle_of(handle).ok_or_else(|| Se::new("social_request_invalid"))?;
    let resolver = config.api("bluesky", "https://public.api.bsky.app");
    let url = format!(
        "{resolver}/xrpc/com.atproto.identity.resolveHandle?{}",
        form(&[("handle", handle.as_str())])
    );
    let did = net::text(get(&url).await?.get("did"));
    let pds = if config.get("SOCIAL_API_BASE_BLUESKY").is_empty() {
        let document_url = match did.strip_prefix("did:web:") {
            Some(host) => format!("https://{host}/.well-known/did.json"),
            None if did.starts_with("did:plc:") => format!("https://plc.directory/{did}"),
            None => return Err(Se::new("social_account_incompatible")),
        };
        pds_of(&get(&document_url).await?).ok_or_else(|| Se::new("social_account_incompatible"))?
    } else {
        resolver.clone()
    };
    let resource = get(&format!("{pds}/.well-known/oauth-protected-resource")).await?;
    let issuer = net::text(resource.pointer("/authorization_servers/0"));
    if issuer.is_empty() {
        return Err(Se::new("social_account_incompatible"));
    }
    let meta = get(&format!(
        "{}/.well-known/oauth-authorization-server",
        issuer.trim_end_matches('/')
    ))
    .await?;
    let endpoint = |key: &str| net::text(meta.get(key));
    let server = Server {
        did,
        handle,
        pds,
        issuer: endpoint("issuer"),
        par: endpoint("pushed_authorization_request_endpoint"),
        authorize: endpoint("authorization_endpoint"),
        token: endpoint("token_endpoint"),
    };
    if server.par.is_empty() || server.authorize.is_empty() || server.token.is_empty() {
        return Err(Se::new("social_account_incompatible"));
    }
    Ok(server)
}

/// One sign-in under way: the server, the account's new key, the PKCE verifier, the nonce.
#[derive(Clone)]
pub struct Flow {
    server: Server,
    dpop: Arc<Dpop>,
    verifier: String,
    nonce: Arc<std::sync::Mutex<String>>,
}

impl Flow {
    pub fn new(_config: &Config, server: Server) -> Sd<Self> {
        Ok(Self {
            server,
            dpop: Arc::new(Dpop::generate()?),
            verifier: crate::providers::oauth::hex(32),
            nonce: Arc::default(),
        })
    }

    fn nonce(&self) -> String {
        self.nonce.lock().expect("dpop nonce").clone()
    }

    fn keep(&self, nonce: String) {
        *self.nonce.lock().expect("dpop nonce") = nonce;
    }

    async fn post(&self, url: &str, fields: Vec<(&'static str, JsonValue)>) -> Sd<JsonValue> {
        let build = || net::form_post(url, &fields);
        let (answer, nonce) =
            call(&self.dpop, "POST", url, &self.nonce(), None, false, build).await?;
        self.keep(nonce);
        Ok(answer.body)
    }

    /// The pushed request; the official page's address.
    pub async fn authorize(&self, config: &Config, state: &str, redirect: &str) -> Sd<String> {
        let digest = ring::digest::digest(&ring::digest::SHA256, self.verifier.as_bytes());
        let fields = vec![
            ("client_id", json!(client_id(config))),
            ("response_type", json!("code")),
            (
                "code_challenge",
                json!(URL_SAFE_NO_PAD.encode(digest.as_ref())),
            ),
            ("code_challenge_method", json!("S256")),
            ("state", json!(state)),
            ("redirect_uri", json!(redirect)),
            ("scope", json!(SCOPE)),
            ("login_hint", json!(self.server.handle)),
        ];
        let pushed = self.post(&self.server.par, fields).await?;
        let uri = net::text(pushed.get("request_uri"));
        if uri.is_empty() {
            return Err(Se::new("social_provider_rejected"));
        }
        let pairs = [("client_id", client_id(config)), ("request_uri", uri)];
        Ok(format!("{}?{}", self.server.authorize, form(&pairs)))
    }

    /// The code exchanged: the account, its tokens bound to its key.
    pub async fn exchange(
        &self,
        config: &Config,
        code: &str,
        redirect: &str,
        now: i64,
    ) -> Sd<JsonValue> {
        let fields = vec![
            ("grant_type", json!("authorization_code")),
            ("code", json!(code)),
            ("redirect_uri", json!(redirect)),
            ("code_verifier", json!(self.verifier)),
            ("client_id", json!(client_id(config))),
        ];
        let token = self.post(&self.server.token, fields).await?;
        if net::text(token.get("sub")) != self.server.did || !js::truthy(token.get("access_token"))
        {
            return Err(Se::new("social_provider_rejected"));
        }
        let mut account = json!({ "network": "bluesky", "did": self.server.did, "pds": self.server.pds,
            "issuer": self.server.issuer, "token_endpoint": self.server.token, "dpop_key": self.dpop.encoded(),
            "dpop_nonce": self.nonce(), "connected_at": now,
            "identity": { "id": self.server.did, "username": self.server.handle } });
        apply_token(&mut account, &token, now);
        let profile = super::bluesky::profile(config, &account, &self.server.did).await?;
        account["identity"]["display_name"] = json!(net::text(profile.get("displayName")));
        account["identity"]["avatar_url"] = json!(net::text(profile.get("avatar")));
        Ok(account)
    }
}

fn apply_token(account: &mut JsonValue, token: &JsonValue, now: i64) {
    account["access_token"] = token["access_token"].clone();
    account["refresh_token"] = token["refresh_token"].clone();
    account["expires_at"] =
        js::number_json(now as f64 + js::number_or(token.get("expires_in"), 0.0) * 1000.0);
    account["scopes"] = json!(
        net::text(token.get("scope"))
            .split(' ')
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
    );
}

/// A new access token from the refresh token (which the server rotates).
pub async fn refresh(config: &Config, account: &JsonValue, now: i64) -> Sd<JsonValue> {
    let dpop = Dpop::of(account)?;
    let url = net::text(account.get("token_endpoint"));
    let fields = [
        ("grant_type", json!("refresh_token")),
        ("refresh_token", account["refresh_token"].clone()),
        ("client_id", json!(client_id(config))),
    ];
    let nonce = net::text(account.get("dpop_nonce"));
    let build = || net::form_post(&url, &fields);
    let (answer, nonce) = call(&dpop, "POST", &url, &nonce, None, false, build)
        .await
        .map_err(|failure| match failure.http_status {
            Some(400 | 401) => Se::new("social_session_expired"),
            _ => failure,
        })?;
    let mut fresh = json!({ "dpop_nonce": nonce });
    apply_token(&mut fresh, &answer.body, now);
    Ok(fresh)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_dpop_proof_is_an_es256_jwt_bound_to_its_key_and_token() {
        let dpop = Dpop::generate().unwrap();
        let again = Dpop::of(&json!({ "dpop_key": dpop.encoded() })).unwrap();
        assert_eq!(dpop.jwk().unwrap(), again.jwk().unwrap());
        let proof = dpop
            .proof("POST", "https://pds.example/xrpc/x?y=1", "n1", Some("tok"))
            .unwrap();
        let parts: Vec<&str> = proof.split('.').collect();
        assert_eq!(parts.len(), 3);
        let header: JsonValue =
            serde_json::from_slice(&URL_SAFE_NO_PAD.decode(parts[0]).unwrap()).unwrap();
        let claims: JsonValue =
            serde_json::from_slice(&URL_SAFE_NO_PAD.decode(parts[1]).unwrap()).unwrap();
        assert_eq!(
            (header["typ"].as_str(), header["alg"].as_str()),
            (Some("dpop+jwt"), Some("ES256"))
        );
        assert_eq!(claims["htu"], "https://pds.example/xrpc/x");
        assert_eq!(claims["nonce"], "n1");
        assert!(claims["ath"].is_string());
        let point = [
            &[4u8][..],
            &URL_SAFE_NO_PAD
                .decode(header["jwk"]["x"].as_str().unwrap())
                .unwrap()[..],
            &URL_SAFE_NO_PAD
                .decode(header["jwk"]["y"].as_str().unwrap())
                .unwrap()[..],
        ]
        .concat();
        let key = ring::signature::UnparsedPublicKey::new(
            &ring::signature::ECDSA_P256_SHA256_FIXED,
            point,
        );
        let signed = format!("{}.{}", parts[0], parts[1]);
        assert!(
            key.verify(
                signed.as_bytes(),
                &URL_SAFE_NO_PAD.decode(parts[2]).unwrap()
            )
            .is_ok()
        );
    }

    #[test]
    fn the_client_metadata_names_the_callback() {
        let config = Config::of(&[("SOCIAL_PUBLIC_BASE_URL", "https://atome.one/")]);
        let meta = metadata_json(&config);
        assert_eq!(
            meta["client_id"],
            "https://atome.one/api/social/oauth/client-metadata/bluesky.json"
        );
        assert_eq!(
            meta["redirect_uris"][0],
            "https://atome.one/api/social/oauth/callback/bluesky"
        );
        assert_eq!(meta["dpop_bound_access_tokens"], true);
    }

    #[test]
    fn a_did_document_names_its_pds() {
        let doc = json!({ "service": [{ "id": "#atproto_pds", "type": "AtprotoPersonalDataServer", "serviceEndpoint": "https://pds.example/" }] });
        assert_eq!(pds_of(&doc), Some("https://pds.example".into()));
        assert_eq!(
            handle_of("@Ann.bsky.social"),
            Some("ann.bsky.social".into())
        );
        assert_eq!(handle_of("ann"), None);
    }
}
