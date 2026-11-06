//! The macOS flow: choose the export, see what it holds, give a passphrase,
//! choose where to save, read the outcome. Each step is a standard system
//! dialog run by `osascript`; texts and the passphrase travel as process
//! arguments or through a pipe, never through a file or a script string.

use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};

use atome_keychain_converter::convert::{self, Built};
use atome_keychain_converter::error::{Error, Result, err};
use atome_keychain_converter::seal::{self, KdfParams, MIN_PASSPHRASE_CHARS};
use zeroize::Zeroizing;

use crate::messages::{Lang, Texts};

/// Runs an AppleScript `on run argv` handler; `None` when the person cancelled.
fn osascript(body: &str, args: &[&str]) -> Result<Option<Zeroizing<String>>> {
    let script = format!("on run argv\nactivate\n{body}\nend run");
    let output = Command::new("/usr/bin/osascript")
        .arg("-e")
        .arg(script)
        .args(args)
        .output()?;
    if output.status.success() {
        let mut text = Zeroizing::new(String::from_utf8_lossy(&output.stdout).into_owned());
        let trimmed = text.trim_end_matches('\n').len();
        text.truncate(trimmed);
        return Ok(Some(text));
    }
    if String::from_utf8_lossy(&output.stderr).contains("-128") {
        return Ok(None);
    }
    Err(err(
        "dialog_failed",
        String::from_utf8_lossy(&output.stderr).trim().to_string(),
    ))
}

fn lang() -> Lang {
    match osascript("return user locale of (get system info)", &[]) {
        Ok(Some(locale)) if locale.starts_with("fr") => Lang::Fr,
        _ => Lang::En,
    }
}

fn message(texts: &Texts, text: &str) -> Result<()> {
    let body = "display dialog (item 1 of argv) buttons {(item 2 of argv)} default button 1 with title (item 3 of argv)";
    osascript(body, &[text, texts.ok(), texts.title()]).map(|_| ())
}

fn confirm(texts: &Texts, text: &str) -> Result<bool> {
    let body = "display dialog (item 1 of argv) buttons {(item 2 of argv), (item 3 of argv)} default button 2 \
        cancel button 1 with title (item 4 of argv)";
    Ok(osascript(
        body,
        &[text, texts.cancel(), texts.convert(), texts.title()],
    )?
    .is_some())
}

fn hidden_answer(texts: &Texts, prompt: &str) -> Result<Option<Zeroizing<String>>> {
    let body = "text returned of (display dialog (item 1 of argv) default answer \"\" with hidden answer \
        buttons {(item 2 of argv), (item 3 of argv)} default button 2 cancel button 1 with title (item 4 of argv))";
    osascript(body, &[prompt, texts.cancel(), texts.ok(), texts.title()])
}

fn passphrase(texts: &Texts) -> Result<Option<Zeroizing<String>>> {
    let mut prompt = texts.passphrase(MIN_PASSPHRASE_CHARS);
    loop {
        let Some(first) = hidden_answer(texts, &prompt)? else {
            return Ok(None);
        };
        if seal::check_passphrase(&first).is_err() {
            prompt = texts.passphrase(MIN_PASSPHRASE_CHARS);
            continue;
        }
        let Some(second) = hidden_answer(texts, texts.passphrase_again())? else {
            return Ok(None);
        };
        if *first == *second {
            return Ok(Some(first));
        }
        prompt = format!(
            "{}\n\n{}",
            texts.passphrase_mismatch(),
            texts.passphrase(MIN_PASSPHRASE_CHARS)
        );
    }
}

fn default_name(source: &Path) -> String {
    let stem = source
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("keychain");
    let stem = if stem == "data" { "1password" } else { stem };
    format!("{stem}.atomecxf")
}

fn flow(texts: &Texts) -> Result<()> {
    let choose = "POSIX path of (choose file with prompt (item 1 of argv))";
    let Some(source) = osascript(choose, &[texts.choose_source()])? else {
        return Ok(());
    };
    let source = PathBuf::from(source.as_str());
    let built: Built = convert::build(&source, None, crate::now(), true)?;
    if !confirm(texts, &texts.preview(&built.report))? {
        return Ok(());
    }
    let Some(secret) = passphrase(texts)? else {
        return Ok(());
    };
    let save = "POSIX path of (choose file name with prompt (item 1 of argv) default name (item 2 of argv))";
    let Some(target) = osascript(save, &[texts.save(), &default_name(&source)])? else {
        return Ok(());
    };
    let target = PathBuf::from(target.as_str());
    let report = built.report.to_json();
    let summary = texts.done(&built.report, &target.to_string_lossy());
    let sealed = convert::seal(built, &secret, KdfParams::DEFAULT)?;
    drop(secret);
    convert::write_file(&target, &sealed, true)?;
    let report_path = target.with_file_name(format!(
        "{}.report.json",
        target
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("keychain")
    ));
    let report_text = serde_json::to_vec_pretty(&report)
        .map_err(|e| err("report_encode_failed", e.to_string()))?;
    convert::write_file(&report_path, &report_text, true)?;
    message(texts, &summary)
}

pub fn run() -> ExitCode {
    let texts = Texts { lang: lang() };
    match flow(&texts) {
        Ok(()) => ExitCode::SUCCESS,
        Err(Error { code, .. }) => {
            if let Err(dialog) = message(&texts, &texts.failed(code)) {
                eprintln!("error: {code} ({dialog})");
            }
            ExitCode::from(2)
        }
    }
}
