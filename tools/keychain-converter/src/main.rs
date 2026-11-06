//! `atome-keychain-converter`: with no argument (opened as a macOS app) it runs the
//! five-step dialog flow of `gui`; with a command it is the automatable CLI.

mod gui;
mod messages;

use std::io::BufRead;
use std::path::PathBuf;
use std::process::ExitCode;
use std::time::{SystemTime, UNIX_EPOCH};

use atome_keychain_converter::convert;
use atome_keychain_converter::error::{Result, err};
use atome_keychain_converter::seal::KdfParams;
use atome_keychain_converter::sources::Format;
use zeroize::Zeroizing;

const USAGE: &str = "usage:
  atome-keychain-converter                      open the macOS dialogs
  atome-keychain-converter inspect <source> [--format 1pux|1pif|csv]
  atome-keychain-converter convert <source> --out <file> (--passphrase-stdin | --plaintext-cxf)
                           [--format 1pux|1pif|csv] [--timestamp <unix seconds>] [--report <file>] [--replace]
  atome-keychain-converter verify <file.atomecxf> --passphrase-stdin
The report (JSON, no secrets) is printed on stdout.";

struct Args {
    positional: Vec<String>,
    flags: Vec<(String, Option<String>)>,
}

impl Args {
    fn parse(raw: &[String]) -> Result<Self> {
        let with_value = ["--out", "--format", "--timestamp", "--report"];
        let (mut positional, mut flags) = (Vec::new(), Vec::new());
        let mut raw = raw.iter();
        while let Some(arg) = raw.next() {
            if with_value.contains(&arg.as_str()) {
                let value = raw
                    .next()
                    .ok_or_else(|| err("argument_value_missing", arg.clone()))?;
                flags.push((arg.clone(), Some(value.clone())));
            } else if arg.starts_with("--") {
                flags.push((arg.clone(), None));
            } else {
                positional.push(arg.clone());
            }
        }
        Ok(Self { positional, flags })
    }

    fn value(&self, name: &str) -> Option<&str> {
        self.flags
            .iter()
            .find(|(flag, _)| flag == name)
            .and_then(|(_, value)| value.as_deref())
    }

    fn has(&self, name: &str) -> bool {
        self.flags.iter().any(|(flag, _)| flag == name)
    }

    fn source(&self) -> Result<PathBuf> {
        self.positional
            .get(1)
            .map(PathBuf::from)
            .ok_or_else(|| err("argument_source_missing", ""))
    }

    fn format(&self) -> Result<Option<Format>> {
        self.value("--format").map(Format::parse).transpose()
    }
}

pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_secs())
}

fn passphrase_from_stdin() -> Result<Zeroizing<String>> {
    let mut line = Zeroizing::new(String::new());
    std::io::stdin().lock().read_line(&mut line)?;
    let trimmed = line.trim_end_matches(['\n', '\r']).len();
    line.truncate(trimmed);
    Ok(line)
}

fn print_json(value: &impl serde::Serialize) -> Result<()> {
    let text = serde_json::to_string_pretty(value)
        .map_err(|e| err("report_encode_failed", e.to_string()))?;
    println!("{text}");
    Ok(())
}

fn run(raw: &[String]) -> Result<()> {
    let args = Args::parse(raw)?;
    match args.positional.first().map(String::as_str) {
        Some("inspect") => {
            let built = convert::build(&args.source()?, args.format()?, now(), false)?;
            print_json(&built.report)
        }
        Some("convert") => {
            let out = PathBuf::from(
                args.value("--out")
                    .ok_or_else(|| err("argument_out_missing", ""))?,
            );
            let timestamp = match args.value("--timestamp") {
                Some(value) => value
                    .parse()
                    .map_err(|_| err("argument_timestamp_invalid", value))?,
                None => now(),
            };
            let plaintext = args.has("--plaintext-cxf");
            if plaintext == args.has("--passphrase-stdin") {
                return Err(err(
                    "argument_protection_required",
                    "--passphrase-stdin or --plaintext-cxf",
                ));
            }
            let passphrase = if plaintext {
                None
            } else {
                Some(passphrase_from_stdin()?)
            };
            let built = convert::build(&args.source()?, args.format()?, timestamp, !plaintext)?;
            let report = built.report.to_json();
            let bytes = match &passphrase {
                Some(passphrase) => convert::seal(built, passphrase, KdfParams::DEFAULT)?,
                None => {
                    eprintln!("{}", messages::PLAINTEXT_WARNING);
                    built.package.to_vec()
                }
            };
            convert::write_file(&out, &bytes, args.has("--replace"))?;
            if let Some(path) = args.value("--report") {
                let text = serde_json::to_vec_pretty(&report)
                    .map_err(|e| err("report_encode_failed", e.to_string()))?;
                convert::write_file(&PathBuf::from(path), &text, args.has("--replace"))?;
            }
            print_json(&report)
        }
        Some("verify") => {
            if !args.has("--passphrase-stdin") {
                return Err(err("argument_protection_required", "--passphrase-stdin"));
            }
            let sealed = std::fs::read(args.source()?)?;
            let verified = convert::verify(&sealed, &passphrase_from_stdin()?)?;
            print_json(&serde_json::json!({
                "integrity": "ok", "cxf": "valid", "items": verified.items, "documents": verified.documents,
                "fidelity_files": verified.fidelity_files, "report": verified.report,
            }))
        }
        Some("help") | Some("--help") => {
            println!("{USAGE}");
            Ok(())
        }
        _ => Err(err("argument_command_unknown", USAGE)),
    }
}

fn main() -> ExitCode {
    let raw: Vec<String> = std::env::args().skip(1).collect();
    if raw.is_empty() {
        return gui::run();
    }
    match run(&raw) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("error: {error}");
            ExitCode::from(2)
        }
    }
}
