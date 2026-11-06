// The restricted shell of `/ws/api` (server/shell.js `executeShellCommand`, ported): disabled
// unless its policy enables it (shell_policy.rs), open to the accounts its allowlist or a
// per-account policy names, one command from an allowlist run without a shell (shell_run.rs),
// inside the person's sandbox home unless a token-guarded `root` or `elevated` (install only)
// scope is allowed. Fastify's checks run in its order.
use super::shell_policy::{
    self, DEFAULT_ALLOWED, DEFAULT_DURATION_MS, DEFAULT_OUTPUT_BYTES, Policy, includes,
    truthy_setting,
};
use super::shell_run;
use crate::settings::Settings;
use crate::vault_router::js;
use serde_json::{Value as JsonValue, json};
use std::path::{Component, Path, PathBuf};

const UNSAFE: [char; 7] = [';', '&', '|', '>', '<', '`', '$'];

/// The account a shell request acts for: its id and, when its account is found, its name.
pub struct Caller {
    pub id: String,
    pub username: Option<JsonValue>,
}

// `path.resolve(base, path)` of an absolute `base`: lexical, `..` stopping at the root.
pub(super) fn resolve(base: &Path, path: &str) -> PathBuf {
    let mut resolved: Vec<String> = if path.starts_with('/') {
        Vec::new()
    } else {
        base.components()
            .filter_map(|part| match part {
                Component::Normal(name) => Some(name.to_string_lossy().into_owned()),
                _ => None,
            })
            .collect()
    };
    for segment in path.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                resolved.pop();
            }
            name => resolved.push(name.to_string()),
        }
    }
    PathBuf::from(format!("/{}", resolved.join("/")))
}

// `path.relative(from, to)` of two resolved paths starts with `..`.
fn outside(from: &Path, to: &Path) -> bool {
    let (from, to): (Vec<_>, Vec<_>) = (from.components().collect(), to.components().collect());
    let common = from.iter().zip(&to).take_while(|(a, b)| a == b).count();
    common < from.len()
        || to
            .get(common)
            .is_some_and(|part| part.as_os_str().to_string_lossy().starts_with(".."))
}

// `parseCommand`: white space splits, quotes group, a backslash escapes the next character.
fn parsed(command: &str) -> Result<Vec<String>, String> {
    let (mut tokens, mut current) = (Vec::new(), String::new());
    let (mut quote, mut escape) = (None, false);
    for c in command.chars() {
        if escape {
            current.push(c);
            escape = false;
        } else if c == '\\' {
            escape = true;
        } else if let Some(open) = quote {
            if c == open {
                quote = None;
            } else {
                current.push(c);
            }
        } else if c == '"' || c == '\'' {
            quote = Some(c);
        } else if (c.is_whitespace() && c != '\u{85}') || c == '\u{feff}' {
            if !current.is_empty() {
                tokens.push(std::mem::take(&mut current));
            }
        } else {
            current.push(c);
        }
    }
    if escape || quote.is_some() {
        return Err("Invalid command syntax (unfinished escape/quote)".into());
    }
    if !current.is_empty() {
        tokens.push(current);
    }
    Ok(tokens)
}

// `normalizeTokens`.
fn tokens(payload: &JsonValue) -> Result<Vec<String>, String> {
    let texts = |items: &Vec<JsonValue>| {
        items
            .iter()
            .map(|item| js::text(Some(item)))
            .collect::<Vec<_>>()
    };
    Ok(
        match (
            payload.get("tokens"),
            payload.get("args"),
            payload.get("command"),
        ) {
            (Some(JsonValue::Array(tokens)), _, _) => texts(tokens),
            (_, Some(JsonValue::Array(args)), Some(JsonValue::String(command))) => {
                std::iter::once(command.clone())
                    .chain(texts(args))
                    .collect()
            }
            (_, _, Some(JsonValue::Array(command))) => texts(command),
            (_, _, Some(JsonValue::String(command))) => parsed(command)?,
            _ => Vec::new(),
        },
    )
}

fn install_allowlist(policy: &Policy) -> Vec<String> {
    if let Some(items) = policy
        .install_commands
        .as_array()
        .filter(|items| !items.is_empty())
    {
        return items
            .iter()
            .filter_map(|item| item.as_str().map(str::to_string))
            .collect();
    }
    match std::env::consts::OS {
        "macos" => vec!["brew".into()],
        "freebsd" => vec!["pkg".into()],
        _ => Vec::new(),
    }
}

// `validateTokens`: Ok(None) when the command may run, Ok(Some(refusal)) otherwise.
fn refusal(
    tokens: &[String],
    policy: &Policy,
    scope: &str,
) -> Result<Option<&'static str>, String> {
    if tokens.is_empty() {
        return Ok(Some("Command is required"));
    }
    if tokens.join(" ").encode_utf16().count() > 512 {
        return Ok(Some("Command too long"));
    }
    if tokens.iter().any(|token| token.contains(UNSAFE)) {
        return Ok(Some("Unsafe token detected"));
    }
    if scope == "elevated" {
        if !policy.allow_install {
            return Ok(Some("Install commands are disabled"));
        }
        if !install_allowlist(policy).contains(&tokens[0]) {
            return Ok(Some("Installer command not allowed"));
        }
        if tokens.get(1).map(String::as_str) != Some("install") {
            return Ok(Some("Only install actions are allowed"));
        }
        let packages = tokens[2..].iter().any(|token| !token.starts_with('-'));
        return Ok((!packages).then_some("Missing package name"));
    }
    if scope == "root" && !policy.allow_root {
        return Ok(Some("Root scope is disabled"));
    }
    let defaults = json!(DEFAULT_ALLOWED);
    let allowed = if js::truthy(Some(&policy.allowed_commands)) {
        &policy.allowed_commands
    } else {
        &defaults
    };
    let all = allowed
        .as_array()
        .is_some_and(|items| items.iter().any(|item| item == "*"));
    if !all && !includes(allowed, "allowed", &tokens[0])? {
        return Ok(Some("Command not allowed"));
    }
    if scope != "root" {
        let path_like = |token: &String| {
            !token.is_empty()
                && !token.starts_with('-')
                && (token.starts_with(['/', '~', '.']) || token.contains('/'))
        };
        let traversal = |token: &String| token.contains("..") || token.starts_with(['~', '/']);
        if tokens
            .iter()
            .any(|token| path_like(token) && traversal(token))
        {
            return Ok(Some("Path traversal detected"));
        }
    }
    Ok(None)
}

// `path.resolve(base, value)` of a payload's `cwd`, which Node refuses when it is no text.
fn resolved_cwd(base: &Path, value: &JsonValue) -> Result<PathBuf, String> {
    let received = match value {
        JsonValue::String(text) => return Ok(resolve(base, text)),
        JsonValue::Number(_) => format!("type number ({})", js::string(value)),
        JsonValue::Bool(flag) => format!("type boolean ({flag})"),
        JsonValue::Array(_) => "an instance of Array".into(),
        _ => "an instance of Object".into(),
    };
    Err(format!(
        "The \"paths[1]\" argument must be of type string. Received {received}"
    ))
}

fn refused(error: &str) -> JsonValue {
    json!({ "success": false, "error": error })
}

/// `executeShellCommand(payload)` for `caller`: the reply's fields after `type` and `requestId`,
/// or the error Fastify's handler catches.
pub async fn execute(
    project_root: &Path,
    payload: &JsonValue,
    caller: &Caller,
) -> Result<JsonValue, String> {
    let settings = Settings::load(project_root)?;
    let mut policy = shell_policy::load(&settings, project_root)?;
    if !policy.enabled {
        return Ok(refused("Shell API is disabled"));
    }
    let raw = shell_policy::user_policy(&policy, caller).cloned();
    if !policy.allow_all_users {
        let admitted = raw.is_some();
        let users = if js::truthy(Some(&policy.allowed_users)) {
            policy.allowed_users.clone()
        } else {
            json!([])
        };
        // `!allowedUsers.length`: a value without a length counts as empty.
        let empty = match &users {
            JsonValue::Array(items) => items.is_empty(),
            JsonValue::String(text) => text.is_empty(),
            _ => true,
        };
        if empty && !admitted {
            return Ok(
                json!({ "success": false, "error": "Shell allowlist is empty", "userId": caller.id }),
            );
        }
        if !includes(&users, "allowedUsers", &caller.id)? && !admitted {
            return Ok(
                json!({ "success": false, "error": "User is not allowed to run shell commands", "userId": caller.id }),
            );
        }
    }
    if let Some(raw) = &raw {
        shell_policy::overridden(&mut policy, raw);
    }
    let asked_scope = payload.get("scope").filter(|scope| js::truthy(Some(scope)));
    let scope = match asked_scope
        .map_or_else(
            || "sandbox".into(),
            |scope| js::text(Some(scope)).to_lowercase(),
        )
        .as_str()
    {
        "root" => "root",
        "elevated" => "elevated",
        _ => "sandbox",
    };
    let tokens = tokens(payload)?;
    if let Some(refusal) = refusal(&tokens, &policy, scope)? {
        return Ok(refused(refusal));
    }
    let required = truthy_setting(
        &settings,
        match scope {
            "root" => "SQUIRREL_SHELL_ROOT_TOKEN",
            "elevated" => "SQUIRREL_SHELL_ELEVATED_TOKEN",
            _ => "SQUIRREL_SHELL_TOKEN",
        },
    )
    .unwrap_or_default();
    if scope != "sandbox" || policy.require_token {
        if required.is_empty() {
            let error = if scope == "sandbox" {
                "Shell token not configured"
            } else {
                "Shell token not configured for this scope"
            };
            return Ok(refused(error));
        }
        if payload.get("token").and_then(JsonValue::as_str) != Some(required.as_str()) {
            return Ok(refused("Shell token missing or invalid"));
        }
    }
    let home_root = match policy
        .user_root
        .as_str()
        .map(js::trim)
        .filter(|root| !root.is_empty())
    {
        Some(root) => root.to_string(),
        None => truthy_setting(&settings, "SQUIRREL_SHELL_USER_ROOT")
            .unwrap_or_else(|| "data/users".into()),
    };
    let storage = crate::media::Storage {
        user_root: resolve(project_root, &home_root),
        uploads_tmp: project_root.join("data").join("uploads_tmp"),
    };
    let home = storage.home(&caller.id).map_err(|e| e.to_string())?;
    // `resolveCwd`: the root scope anywhere, the others inside the home.
    let cwd = match (
        scope,
        payload.get("cwd").filter(|cwd| js::truthy(Some(cwd))),
    ) {
        ("root", None) => Ok(PathBuf::from("/")),
        ("root", Some(cwd)) => resolved_cwd(Path::new("/"), cwd),
        (_, None) => Ok(home.clone()),
        (_, Some(cwd)) => resolved_cwd(&home, cwd).and_then(|cwd| {
            if outside(&home, &cwd) {
                Err("Working directory is outside of sandbox".into())
            } else {
                Ok(cwd)
            }
        }),
    };
    let cwd = match cwd {
        Ok(cwd) => cwd.to_string_lossy().into_owned(),
        Err(error) => return Ok(refused(&error)),
    };
    let limit = if policy.max_duration_ms != 0.0 && !policy.max_duration_ms.is_nan() {
        policy.max_duration_ms
    } else {
        DEFAULT_DURATION_MS
    };
    let asked =
        js::number(js::first(payload, &["timeoutMs", "timeout_ms"]).or(Some(&json!(limit))));
    let timeout = if asked.is_nan() {
        f64::NAN
    } else {
        asked.min(limit)
    };
    let output = if policy.max_output_bytes != 0.0 && !policy.max_output_bytes.is_nan() {
        policy.max_output_bytes
    } else {
        DEFAULT_OUTPUT_BYTES
    };
    let mut result = shell_run::run(&tokens, Path::new(&cwd), timeout, output).await;
    let username = caller
        .username
        .clone()
        .filter(|name| js::truthy(Some(name)));
    let summary = json!({ "userId": caller.id, "username": username.unwrap_or(JsonValue::Null),
        "scope": scope, "cwd": cwd, "command": tokens.join(" "), "connectionId": JsonValue::Null,
        "exitCode": result.get("exitCode") });
    println!("[shell] request {summary}");
    result["cwd"] = json!(cwd);
    result["scope"] = json!(scope);
    Ok(result)
}
