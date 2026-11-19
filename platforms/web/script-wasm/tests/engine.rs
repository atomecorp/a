//! The engine on the host: what a script sees, what it may write, and how each failure is named.
use atome_script_wasm::Engine;
use serde_json::{Value, json};

const OPAL_RUNTIME: &str = include_str!("../../../../atome/src/js/opal.min.js");
// A Ruby script compiled by Opal with the worker's prelude (script_worker.js `RUBY_PRELUDE`):
// `Doc.set("loyer", Doc.cell("base")["value"] + 100); puts "fait"; Doc.log(Doc.cells.length)`.
const RUBY_COMPILED: &str = include_str!("fixtures/ruby_doc.js");

fn request() -> String {
    json!({
        "snapshot": { "text": "Loyer 800 €, charges 120 €", "cells": [
            { "id": "c1", "label": "base", "role": "input", "value": 800, "text": "800 €" },
            { "id": "c2", "label": "charges", "role": "input", "value": 120, "text": "120 €" },
            { "id": "c3", "label": "loyer", "role": "output", "value": 920, "text": "920 €" }
        ] },
        "limits": { "writes": 3, "valueChars": 8, "logLines": 2, "logChars": 12, "resultChars": 4096 }
    })
    .to_string()
}

fn run(code: &str) -> Value {
    let mut engine = Engine::prepare(&request(), None).expect("prepared");
    serde_json::from_str(&engine.run(code)).expect("outcome is JSON")
}

#[test]
fn reads_the_snapshot_and_proposes_writes() {
    let outcome = run(r#"
        const base = doc.cell("base");
        doc.set("charges", base.value / 8);
        doc.set("c1", "neuf");
        doc.log("cellules", doc.cells().length, doc.text().length);
        doc.log(doc.cell("absent") === null);
    "#);
    assert_eq!(
        outcome,
        json!({
            "writes": [
                { "target": "charges", "kind": "number", "value": "100" },
                { "target": "c1", "kind": "text", "value": "neuf" }
            ],
            "log": ["cellules 3 2", "true"]
        })
    );
}

#[test]
fn reaches_nothing_but_its_document() {
    let outcome = run(r#"
        const names = ["fetch", "XMLHttpRequest", "WebSocket", "importScripts", "postMessage", "console", "require",
            "process", "navigator", "location", "indexedDB", "caches", "self", "window", "Deno"];
        doc.log(names.filter(name => typeof globalThis[name] !== "undefined").join(",") || "rien");
    "#);
    assert_eq!(outcome["log"], json!(["rien"]));
    let imported = run(r#"import("https://example.org/x.js").then(() => doc.set("c1", 1));"#);
    assert_eq!(imported["writes"], json!([]));
}

#[test]
fn caps_writes_values_and_logs() {
    let outcome = run(r#"
        doc.set("c1", "123456789abc"); doc.set("c2", "ok");
        doc.log("1234567890123456"); doc.log("deux"); doc.log("trois");
    "#);
    assert_eq!(outcome["writes"][0]["value"], json!("123456789"));
    assert_eq!(outcome["log"], json!(["123456789012", "deux"]));
    let too_many = run(r#"for (let i = 0; i < 5; i += 1) doc.set("c1", i);"#);
    assert_eq!(
        too_many,
        json!({ "error": "SCRIPT_ERROR", "detail": "SCRIPT_TOO_M" })
    );
}

#[test]
fn names_each_failure() {
    assert_eq!(run("doc.set(")["error"], json!("SCRIPT_SYNTAX"));
    assert_eq!(
        run(r#"doc.set("c1", 1); throw new TypeError("non");"#),
        json!({ "error": "SCRIPT_ERROR", "detail": "non" })
    );
    assert_eq!(run(r#"throw { message: 42 };"#)["detail"], json!("thrown"));
    assert_eq!(
        run("const f = () => f(); f();")["error"],
        json!("SCRIPT_TOO_DEEP")
    );
    assert_eq!(
        Engine::prepare("{}", None)
            .err()
            .map(|failure| failure.error),
        Some("SCRIPT_REQUEST_INVALID")
    );
}

// Evaluating Opal's runtime nests deep in the unoptimised engine: its own thread, with room the release module's
// optimised frames do not need.
#[test]
fn runs_ruby_on_opal_runtime() {
    let outcome = std::thread::Builder::new()
        .stack_size(64 << 20)
        .spawn(|| {
            let mut engine =
                Engine::prepare(&request(), Some(OPAL_RUNTIME)).expect("Opal's runtime loads");
            serde_json::from_str::<Value>(&engine.run(RUBY_COMPILED)).expect("JSON")
        })
        .expect("thread")
        .join()
        .expect("joined");
    assert_eq!(
        outcome,
        json!({ "writes": [{ "target": "loyer", "kind": "number", "value": "900" }], "log": ["fait", "3"] })
    );
}
