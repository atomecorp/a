//! One script run: a boa context holding only the ECMAScript built-ins and `doc` (doc.rs), Opal's runtime laid
//! first for Ruby, then the script, its outcome as the JSON the worker posts (script_worker.js).
use boa_engine::error::{EngineError, RuntimeLimitError};
use boa_engine::{Context, JsError, Script, Source, js_string};
use serde::{Deserialize, Serialize};
use serde_json::json;

use crate::doc::{self, Limits, Snapshot, Write, cut_utf16};

#[derive(Deserialize)]
struct Request {
    snapshot: Snapshot,
    limits: Limits,
}

/// A run that wrote nothing: a `SCRIPT_*` code and its detail.
#[derive(Debug, PartialEq, Eq)]
pub struct Failure {
    pub error: &'static str,
    pub detail: String,
}

impl Failure {
    pub fn to_json(&self) -> String {
        json!({ "error": self.error, "detail": self.detail }).to_string()
    }
}

#[derive(Serialize)]
struct Outcome {
    writes: Vec<Write>,
    log: Vec<String>,
}

pub struct Engine {
    context: Context,
    limits: Limits,
}

// A thrown value's message, as `error.message` reads it in JavaScript, else « thrown ».
fn message_of(error: &JsError, context: &mut Context) -> String {
    if let Some(native) = error.as_native() {
        return native.message().to_string();
    }
    if let Some(engine) = error.as_engine() {
        return engine.to_string();
    }
    error
        .as_opaque()
        .and_then(|value| value.as_object())
        .and_then(|object| object.get(js_string!("message"), context).ok())
        .and_then(|message| message.as_string().map(|text| text.to_std_string_escaped()))
        .unwrap_or_else(|| "thrown".to_string())
}

// The engine's own limits (calls nested too deep) are not the script's error: no `catch` of the script sees them.
fn code_of(error: &JsError) -> &'static str {
    match error.as_engine() {
        Some(EngineError::RuntimeLimit(
            RuntimeLimitError::Recursion | RuntimeLimitError::StackSize,
        )) => "SCRIPT_TOO_DEEP",
        Some(EngineError::RuntimeLimit(RuntimeLimitError::LoopIteration)) => "SCRIPT_TIMEOUT",
        _ => "SCRIPT_ERROR",
    }
}

impl Engine {
    /// A context over the request's snapshot (`{ snapshot, limits }`), `runtime` (Opal's) evaluated in it first.
    pub fn prepare(request: &str, runtime: Option<&str>) -> Result<Self, Failure> {
        let request: Request = serde_json::from_str(request).map_err(|error| Failure {
            error: "SCRIPT_REQUEST_INVALID",
            detail: error.to_string(),
        })?;
        let limits = request.limits;
        let mut context = Context::default();
        doc::install(&mut context, request.snapshot, limits).map_err(|error| Failure {
            error: "SCRIPT_ENGINE_UNAVAILABLE",
            detail: error.to_string(),
        })?;
        if let Some(runtime) = runtime {
            context
                .eval(Source::from_bytes(runtime))
                .map_err(|error| Failure {
                    error: "SCRIPT_ENGINE_UNAVAILABLE",
                    detail: cut_utf16(&message_of(&error, &mut context), limits.log_chars),
                })?;
        }
        Ok(Self { context, limits })
    }

    /// Runs `code` (JavaScript, or Opal's output) in strict mode as a function body: the outcome's JSON,
    /// `{ writes, log }` or `{ error, detail }`. A script that throws writes nothing.
    pub fn run(&mut self, code: &str) -> String {
        let limits = self.limits;
        let failure = |error, detail: String| {
            Failure {
                error,
                detail: cut_utf16(&detail, limits.log_chars),
            }
            .to_json()
        };
        let body = format!("(function () {{\"use strict\";\n{code}\n}}).call(undefined);");
        let script = match Script::parse(Source::from_bytes(&body), None, &mut self.context) {
            Ok(script) => script,
            Err(error) => {
                doc::take();
                return failure("SCRIPT_SYNTAX", message_of(&error, &mut self.context));
            }
        };
        if let Err(error) = script.evaluate(&mut self.context) {
            doc::take();
            return failure(code_of(&error), message_of(&error, &mut self.context));
        }
        let (writes, log) = doc::take();
        let text = json!(Outcome { writes, log }).to_string();
        if text.encode_utf16().count() > limits.result_chars {
            return failure("SCRIPT_TOO_LARGE", String::new());
        }
        text
    }
}
