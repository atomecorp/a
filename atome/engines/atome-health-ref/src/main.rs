//! `atome-health-ref`: the monthly health reference build, run by the server (atome-server src/health_reference.rs).
//!
//! ```text
//! atome-health-ref run     --sources DIR --out DIR [--rcp-budget N] [--rcp-max-age-days D] [--delay-ms MS]
//! atome-health-ref fetch   --sources DIR           [--rcp-budget N] [--rcp-max-age-days D] [--delay-ms MS]
//! atome-health-ref build   --sources DIR --out DIR
//! atome-health-ref fixture --sources DIR --to DIR
//! ```
//!
//! `run` is `fetch` then `build`. Each prints one JSON line on stdout (`{"ok":true,…}`) and exits 0, or prints
//! the error on stderr and exits 1.

use atome_health_ref::{bdpm, bundle, fetch, fixture, sources, text};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::time::Duration;

fn options(args: &[String]) -> Result<BTreeMap<String, String>, String> {
    let mut found = BTreeMap::new();
    let mut items = args.iter();
    while let Some(flag) = items.next() {
        let name = flag
            .strip_prefix("--")
            .ok_or_else(|| format!("unexpected argument '{flag}'"))?;
        let value = items
            .next()
            .ok_or_else(|| format!("--{name} needs a value"))?;
        found.insert(name.to_string(), value.clone());
    }
    Ok(found)
}

fn path(options: &BTreeMap<String, String>, name: &str) -> Result<PathBuf, String> {
    options
        .get(name)
        .map(PathBuf::from)
        .ok_or_else(|| format!("--{name} is required"))
}

fn number(options: &BTreeMap<String, String>, name: &str, default: i64) -> Result<i64, String> {
    match options.get(name) {
        Some(value) => value
            .parse()
            .map_err(|_| format!("--{name} '{value}' is not a number")),
        None => Ok(default),
    }
}

fn fetch_all(options: &BTreeMap<String, String>, today: &str) -> Result<serde_json::Value, String> {
    let root = path(options, "sources")?;
    let delay = Duration::from_millis(number(options, "delay-ms", 1_500)? as u64);
    let mut fetcher = fetch::Fetcher::new(delay)?;
    fetch::fetch_bases(&root, &mut fetcher, today)?;
    // The SmPC pages wanted are those of the medicines authorised and marketed in the files just fetched.
    let parsed = bdpm::parse(&sources::read_bdpm(&root)?)?;
    let wanted = parsed
        .medicines
        .values()
        .filter(|medicine| medicine.marketed && medicine.authorisation == "Autorisation active")
        .map(|medicine| medicine.cis.clone())
        .collect();
    let rcp_options = fetch::Options {
        delay,
        rcp_budget: number(options, "rcp-budget", 2_000)? as usize,
        rcp_max_age_days: number(options, "rcp-max-age-days", 90)?,
        rcp_wanted: wanted,
    };
    let (fetched, failures) = fetch::fetch_rcp(&root, &mut fetcher, &rcp_options, today)?;
    Ok(serde_json::json!({ "rcp_fetched": fetched, "rcp_failures": failures }))
}

fn build(options: &BTreeMap<String, String>, today: &str) -> Result<serde_json::Value, String> {
    let inputs = sources::read_inputs(&path(options, "sources")?, today)?;
    let built = bundle::build(&inputs)?;
    let directory = bundle::write(&built, &path(options, "out")?)?;
    Ok(serde_json::json!({
        "version": built.manifest.version,
        "directory": directory,
        "parts": built.manifest.parts.iter().map(|part| (part.name.as_str(), part.bytes)).collect::<BTreeMap<_, _>>(),
        "report": built.report,
    }))
}

fn run(args: &[String]) -> Result<serde_json::Value, String> {
    let (command, rest) = args
        .split_first()
        .ok_or("a command is required: run, fetch, build or fixture")?;
    let options = options(rest)?;
    let today = text::today();
    match command.as_str() {
        "fetch" => fetch_all(&options, &today),
        "build" => build(&options, &today),
        "run" => {
            let fetched = fetch_all(&options, &today)?;
            let built = build(&options, &today)?;
            Ok(serde_json::json!({ "fetch": fetched, "build": built }))
        }
        "fixture" => {
            let selection = fixture::Selection {
                medicines: &[
                    "doliprane",
                    "levothyrox",
                    "amoxicilline",
                    "augmentin",
                    "atorvastatine",
                    "simvastatine",
                    "tardyferon",
                    "cacit",
                    "calcium vitamine d3",
                    "pyostacine",
                    "coumadine",
                    "previscan",
                    "sintrom",
                    "acide alendronique",
                    "ciprofloxacine biogaran",
                    "metformine biogaran",
                    "kardegic",
                    "lasilix",
                    "spasfon",
                ],
                thesaurus: &[
                    "antivitamines k",
                    "hormones thyroidiennes",
                    "levothyroxine",
                    "atorvastatine",
                    "simvastatine",
                    "inhibiteurs de l'hmg coa reductase statines",
                    "fer",
                    "calcium",
                    "pristinamycine",
                    "millepertuis",
                    "pamplemousse jus et fruit",
                    "alcool boisson ou excipient",
                    "bisphosphonates",
                    "fluoroquinolones",
                    "metformine",
                    "cafeine",
                    "anticoagulants oraux",
                    "cytotoxiques",
                    "immunosuppresseurs",
                ],
                // Compl'Alim names a plant by its Latin name.
                supplements: &[
                    "hypericum perforatum",
                    "monascus purpureus",
                    "melatonine",
                    "curcuma longa",
                    "spirulina",
                    "citrus aurantium",
                    "citrus paradisi",
                    "ginkgo biloba",
                    "bisglycinate ferreux",
                    "carbonate de calcium",
                    "magnesium",
                ],
                per_supplement: 8,
            };
            let report = fixture::make(
                &path(&options, "sources")?,
                &path(&options, "to")?,
                &selection,
            )?;
            Ok(serde_json::json!({ "report": report }))
        }
        other => Err(format!("unknown command '{other}'")),
    }
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match run(&args) {
        Ok(mut value) => {
            value["ok"] = serde_json::Value::Bool(true);
            println!("{value}");
        }
        Err(error) => {
            eprintln!("atome-health-ref: {error}");
            std::process::exit(1);
        }
    }
}
