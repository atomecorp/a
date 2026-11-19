// `atome-server`: started from the project root, it brings the central database to its
// schema, opens the vault supervisor and serves the public port alone. It stops every vault
// on SIGINT or SIGTERM. For the A/B probes only, `ATOME_REFERENCE_CONTROL_DIR` names the
// directory of the control socket a reference Fastify started beside it reaches the vaults
// through (control.rs); without it no control socket is bound.
use atome_server::auth::{Sessions, media_token, sms::Sms};
use atome_server::billing::Billing;
use atome_server::http::{cors::CorsPolicy, statics::StaticRoots};
use atome_server::media::{Storage, Wallpaper, uploads::Uploads};
use atome_server::page_preview::{self, PreviewOrigin};
use atome_server::server_identity::ServerIdentity;
use atome_server::settings::Settings;
use atome_server::site::Site;
use atome_server::social::Social;
use atome_server::status::Status;
use atome_server::vault_router::{VaultRouter, central::Central};
use atome_server::web::{self, Web};
use atome_server::ws_api::WsApi;
use atome_server::ws_sync::SyncRuntime;
use atome_server::{control, vaults::Vaults};
use std::collections::HashSet;
use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tokio::signal::unix::{SignalKind, signal};

// A vault left this long without a request is stopped; the next one starts it again.
const VAULT_IDLE: Duration = Duration::from_secs(180);

fn port(settings: &Settings, name: &str, default: u16) -> Result<u16, String> {
    settings.get(name).map_or(Ok(default), |value| {
        value.parse().map_err(|_| format!("{name}_invalid"))
    })
}

fn listed(value: Option<String>) -> impl Iterator<Item = String> {
    value
        .unwrap_or_default()
        .split(',')
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .collect::<Vec<_>>()
        .into_iter()
}

struct Config {
    public: SocketAddr,
    project_root: PathBuf,
    vault_root: PathBuf,
    vault_binary: PathBuf,
    central: PathBuf,
    allowed_origins: Vec<String>,
    app_hosts: HashSet<String>,
    // The isolated preview origin of a person's page (page_preview.rs): its own listener, on
    // PORT+200 by default, and its public origin when one is configured (a sub-domain behind nginx).
    preview: SocketAddr,
    preview_origin: PreviewOrigin,
    // Fastify's device-session secret and the replication peers' token (auth), and
    // the media capability's lifetime.
    jwt_secret: Option<String>,
    sync_token: Option<String>,
    media_token_ttl: u64,
    // The server's identity keys and the values its status routes report (status.rs).
    identity: [Option<String>; 4],
    check_debug: Option<String>,
    node_env: Option<String>,
    use_https: Option<String>,
    host_setting: Option<String>,
    // The SMS of the phone link (auth/sms.rs).
    sms: Arc<Sms>,
    // The offer, the ledger and the store proofs (billing/).
    billing: Arc<Billing>,
    // The people's homes (`SQUIRREL_SHELL_USER_ROOT`, server/userHome.js).
    user_root: PathBuf,
    // The websites' origin, versions' root and certificate step (site/).
    site: atome_server::site::Setup,
    // The providers' own settings (keys' files, mocks, endpoints: providers/).
    settings: Settings,
}

fn config() -> Result<Config, String> {
    let project_root = std::env::current_dir().map_err(|e| e.to_string())?;
    if !project_root.join("server").join("server.js").is_file() {
        return Err("atome_server_not_started_at_project_root".into());
    }
    let settings = Settings::load(&project_root)?;
    // githubSync.js's opt-in auto-update (a zip of the repository over the tree) is not served.
    if settings.get("GITHUB_AUTO_SYNC").as_deref() == Some("true") {
        return Err("github_auto_sync_unsupported:unset_GITHUB_AUTO_SYNC".into());
    }
    let setting = |name: &str| settings.get(name);
    let public_port = port(&settings, "PORT", 3001)?;
    // Fastify's own rule: loopback in production (nginx in front), every interface otherwise.
    let host = setting("HOST").unwrap_or_else(|| {
        if setting("NODE_ENV").as_deref() == Some("production") {
            "127.0.0.1"
        } else {
            "0.0.0.0"
        }
        .to_string()
    });
    let host: IpAddr = host.parse().map_err(|_| "HOST_invalid".to_string())?;
    let vault_root = setting("SQUIRREL_VAULT_ROOT").map_or_else(
        || project_root.join("database_storage").join("vaults"),
        PathBuf::from,
    );
    let vault_root = if vault_root.is_absolute() {
        vault_root
    } else {
        project_root.join(vault_root)
    };
    let vault_binary = match setting("ATOME_VAULT_BINARY") {
        Some(path) => PathBuf::from(path),
        None => std::env::current_exe()
            .map_err(|e| e.to_string())?
            .with_file_name("atome-vault"),
    };
    if !vault_binary.is_file() {
        return Err(format!(
            "atome_vault_binary_missing:{}",
            vault_binary.display()
        ));
    }
    let central = settings.central_database(&project_root)?;
    // Before anything opens it: the tables, columns and migrations Fastify's `initDatabase` made.
    atome_server::central_schema::prepare(&central, &project_root)?;
    let preview_port = port(
        &settings,
        "ATOME_PAGE_PREVIEW_PORT",
        public_port.checked_add(200).ok_or("PORT_invalid")?,
    )?;
    let sms = Arc::new(Sms::load(&settings, &project_root)?);
    let billing = Arc::new(Billing::load(
        &settings,
        &project_root,
        Central::open(&central)?,
    )?);
    let user_root = project_root.join(
        setting("SQUIRREL_SHELL_USER_ROOT")
            .filter(|root| !root.is_empty())
            .unwrap_or_else(|| "data/users".into()),
    );
    let site = atome_server::site::Setup::load(&settings, &project_root);
    Ok(Config {
        public: SocketAddr::new(host, public_port),
        project_root,
        vault_root,
        vault_binary,
        central,
        allowed_origins: listed(setting("SQUIRREL_ALLOWED_ORIGINS")).collect(),
        preview: SocketAddr::new(host, preview_port),
        preview_origin: PreviewOrigin {
            public: setting("ATOME_PAGE_PREVIEW_ORIGIN"),
            port: preview_port,
        },
        // server/server.js: the hosts the application answers on; any other is a personal domain.
        app_hosts: listed(Some(setting("ATOME_APP_HOSTS").unwrap_or_else(|| {
            "atome.one,www.atome.one,localhost,127.0.0.1,::1".into()
        })))
        .map(|host| host.to_ascii_lowercase())
        .collect(),
        jwt_secret: setting("JWT_SECRET"),
        sync_token: setting("SQUIRREL_SYNC_TOKEN"),
        media_token_ttl: media_token::ttl_seconds(
            setting("SQUIRREL_MEDIA_TOKEN_TTL_SECONDS").as_deref(),
        ),
        identity: [
            setting("SERVER_ID"),
            setting("SERVER_NAME"),
            setting("SERVER_PRIVATE_KEY_PATH"),
            setting("SERVER_PUBLIC_KEY_PATH"),
        ],
        check_debug: setting("__CHECK_DEBUG__"),
        node_env: setting("NODE_ENV"),
        use_https: setting("USE_HTTPS"),
        host_setting: setting("HOST"),
        sms,
        billing,
        user_root,
        site,
        settings,
    })
}

async fn run() -> Result<i32, String> {
    let started = std::time::Instant::now();
    let config = config()?;
    let vaults = Vaults::new(
        config.vault_root.clone(),
        config.vault_binary.clone(),
        VAULT_IDLE,
    )?;
    let storage = Arc::new(Storage {
        user_root: config.user_root.clone(),
        uploads_tmp: config.project_root.join("data").join("uploads_tmp"),
    });
    let router = VaultRouter::new(
        vaults.clone(),
        Central::open(&config.central)?,
        storage.clone(),
    );
    // The sessions' and the status routes' own connection: a read never waits
    // behind the vault router's writes.
    let readings = Central::open(&config.central)?;
    let sessions = Arc::new(Sessions::new(
        config.jwt_secret.clone(),
        config.sync_token.clone(),
        readings.clone(),
    ));
    let sync = SyncRuntime::new(
        sessions.clone(),
        config.project_root.clone(),
        router.clone(),
    );
    // The one writer of the notification stacks, contacts and pushes, for Fastify's services and `/ws/api`.
    let social = Social::open(
        &config.central,
        router.clone(),
        storage.clone(),
        sync.clone(),
    )?;
    // The bottles' video switch, the setting `cb.bottle_video` (off, testers or all): off unless set.
    social.cb.set_bottle_video(
        atome_server::social::cb::bottles::BottleVideo::from_settings(&config.settings),
    );
    // The CB's channels: 55 listeners, 45 s of floor, unless `cb.channel_listeners` and `cb.floor_max_ms` say otherwise.
    social
        .cb
        .set_channel_limits(atome_server::social::cb::channels::Limits::from_settings(
            &config.settings,
        ));
    // The Appel: an invitation of 21 s, a pair not put in touch again for 21 days, unless `cb.call_invite_ms` and
    // `cb.call_pair_days` say otherwise.
    social
        .cb
        .calls
        .set_limits(atome_server::social::cb::random_call::Limits::from_settings(&config.settings));
    // An Appel's takes cut at the silence for its live translation: 600 ms of packets quieter than -40 dBov, unless
    // `cb.call_silence_dbov` and `cb.call_silence_ms` say otherwise.
    atome_server::social::cb::live_translate::segments::set_call_cut(
        atome_server::social::cb::live_translate::segments::CallCut::from_settings(
            &config.settings,
        ),
    );
    // The takes of the CB's voices: kept 21 days, a report holding 13 minutes, unless the settings say otherwise.
    social
        .cb
        .set_recording_limits(atome_server::social::cb::recordings::Limits::from_settings(
            &config.settings,
        ));
    // Sealed at rest (AES-256-GCM, `ATOME_CB_RECORDINGS_KEY`): without a key in production, the CB records nothing and
    // refuses its floor.
    social
        .cb
        .recordings
        .set_sealer(atome_server::social::cb::recordings::seal::from_settings(
            &config.settings,
            &config.project_root,
        )?);
    // The Appel's pairs put in touch, kept in `cb_call_pairs` under a keyed fingerprint whose key is derived from the
    // recordings' one; without that key, kept in memory only and forgotten at a restart.
    let call_pairs_key = atome_server::social::cb::recordings::seal::call_pairs_key(
        &config.settings,
        &config.project_root,
    );
    if call_pairs_key.is_none() {
        eprintln!("[cb] cb call pairs: no key, pairs kept in memory only");
    }
    social.cb.calls.set_pair_key(call_pairs_key);
    // The bytes of deletions no longer undoable (media/trash.rs) and the CB sociale's bottles past
    // their life, with their copies (social/cb/bottles.rs), and the takes past their 21 days
    // (social/cb/recordings): erased at start, then daily.
    let trash_root = config.user_root.clone();
    let purged_social = social.clone();
    tokio::spawn(async move {
        let mut daily = tokio::time::interval(std::time::Duration::from_secs(24 * 60 * 60));
        loop {
            daily.tick().await;
            let root = trash_root.clone();
            let purged = tokio::task::spawn_blocking(move || {
                atome_server::media::trash::purge(&root, atome_server::media::trash::KEEP)
            })
            .await;
            if let Ok(Err(error)) = purged {
                eprintln!("[media] trash purge failed: {error}");
            }
            if let Err(error) = purged_social.cb.purge_bottles().await {
                eprintln!("[cb] bottles purge failed: {error}");
            }
            if let Err(error) = purged_social.cb.purge_recordings().await {
                eprintln!("[cb] recordings purge failed: {error}");
            }
        }
    });
    // The calls' SFU: its worker starts once, before the server listens.
    atome_server::visio::start(
        &config.settings,
        Central::open(&config.central)?,
        social.clone(),
        router.clone(),
    )
    .await?;
    let providers = Arc::new(atome_server::providers::Providers::load(
        &config.settings,
        &config.project_root,
        config.vault_root.clone(),
        router.clone(),
        storage.clone(),
        Central::open(&config.central)?,
    )?);
    // The CB's and the Appel's live translation (R-173 lot TR) reaches the providers through its bridge.
    atome_server::providers::live_translate::Bridge::install(
        &social.cb.live,
        providers.clone(),
        &config.settings,
    );
    // The linked social accounts' 60 s polling (R-190): with none linked, a tick makes no call.
    let (polling, polled_social) = (providers.clone(), social.clone());
    tokio::spawn(async move { polling.social_poll(&polled_social.notifier).await });
    // The A/B probes' reference Fastify reaches the vaults, the vault router, `/ws/sync` and the
    // social services through the control socket, which only it uses.
    let control_directory = config
        .settings
        .get("ATOME_REFERENCE_CONTROL_DIR")
        .map(PathBuf::from);
    if let Some(directory) = &control_directory {
        let control = control::bind(directory, "vaults.sock")?;
        tokio::spawn(control.serve(
            vaults.clone(),
            Arc::new(control::Services {
                router: router.clone(),
                sync: sync.clone(),
                social: social.clone(),
            }),
        ));
    }
    tokio::spawn(vaults.clone().stop_idle());
    let offline_manifest =
        atome_server::http::offline_manifest::OfflineManifest::new(&config.project_root).await?;

    let mut terminate = signal(SignalKind::terminate()).map_err(|e| e.to_string())?;
    let mut interrupt = signal(SignalKind::interrupt()).map_err(|e| e.to_string())?;
    let serving = async {
        // The public directory projected again from every profile.
        let directory = social.clone();
        tokio::spawn(async move {
            match directory.directory.rebuild().await {
                Ok(rebuilt) if rebuilt["failed"] == serde_json::json!([]) => {}
                Ok(rebuilt) => eprintln!("[directory] rebuild incomplete {}", rebuilt["failed"]),
                Err(error) => eprintln!("[directory] rebuild failed {error}"),
            }
        });
        let listener = tokio::net::TcpListener::bind(config.public)
            .await
            .map_err(|e| format!("atome_server_bind_failed:{e}"))?;
        let preview = tokio::net::TcpListener::bind(config.preview)
            .await
            .map_err(|e| format!("page_preview_bind_failed:{e}"))?;
        // The websites, and their clock.
        let site = Site::new(
            Central::open(&config.central)?,
            router.clone(),
            sync.clone(),
            config.billing.clone(),
            config.site.clone(),
            config.user_root.clone(),
        );
        tokio::spawn(site.clone().clock());
        let app = web::router(Arc::new(Web {
            statics: StaticRoots::of_project(&config.project_root),
            cors: CorsPolicy::new(config.allowed_origins.clone()),
            app_hosts: config.app_hosts.clone(),
            preview: config.preview_origin.clone(),
            ws_api: Arc::new(WsApi {
                router: router.clone(),
                sessions: sessions.clone(),
                sms: config.sms.clone(),
                storage: storage.clone(),
                social,
                billing: config.billing.clone(),
                site,
                providers,
            }),
            ws_sync: sync.clone(),
            uploads: Arc::new(Uploads {
                storage: storage.clone(),
                sessions: sessions.clone(),
                router: router.clone(),
                wallpaper: Wallpaper::new()?,
            }),
            offline_manifest,
            sessions,
            media_token_ttl: config.media_token_ttl,
            status: Arc::new(Status {
                identity: {
                    let [id, name, private, public] = config.identity.clone();
                    ServerIdentity::load(&config.project_root, id, name, private, public)
                },
                project_root: config.project_root.clone(),
                central: readings,
                started,
                started_at: atome_store::append::iso_now(),
                public_port: config.public.port(),
                check_debug: config.check_debug.clone(),
                package_version: std::env::var("npm_package_version").ok(),
                node_env: config.node_env.clone(),
                use_https: config.use_https.clone(),
                host: config.host_setting.clone(),
            }),
        }))
        .into_make_service_with_connect_info::<SocketAddr>();
        let app = async { axum::serve(listener, app).await.map_err(|e| e.to_string()) };
        tokio::try_join!(app, page_preview::serve(preview)).map(|_| ())
    };
    let outcome = tokio::select! {
        served = serving => served.map(|()| 0),
        _ = terminate.recv() => Ok(0),
        _ = interrupt.recv() => Ok(0),
    };
    sync.stop().await;
    vaults.stop_all().await;
    if let Some(directory) = &control_directory {
        let _ = std::fs::remove_dir_all(directory);
    }
    outcome
}

#[tokio::main]
async fn main() -> std::process::ExitCode {
    match run().await {
        Ok(0) => std::process::ExitCode::SUCCESS,
        Ok(code) => std::process::ExitCode::from(u8::try_from(code).unwrap_or(1)),
        Err(error) => {
            eprintln!("atome-server: {error}");
            std::process::ExitCode::FAILURE
        }
    }
}
