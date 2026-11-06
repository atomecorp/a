//! The monthly download into the sources directory (`sources.rs`), one request at a time with a pause between
//! two (the BDPM site, the ANSM, data.gouv.fr are public services, not CDNs). The BDPM files and Compl'Alim are
//! fetched again at every run; the thesaurus once (its publisher froze it); the SmPC pages of the marketed
//! medicines within a budget per run, the missing ones first, then the oldest past their age. A file is
//! written only once whole, so a failed download leaves the previous copy in place; every failure is in the
//! report and the next run tries again.

use crate::bdpm::FILE_NAMES;
use crate::sources::{
    BDPM_DIR, COMPLALIM_FILE, RCP_DIR, SourcesState, THESAURUS_FILE, read_state, write_state,
};
use crate::text::{civil_date, iso_date};
use std::path::Path;
use std::time::{Duration, Instant};

const BDPM_FILES: &str = "https://base-donnees-publique.medicaments.gouv.fr/download/file/";
/// CIS_InfoImportantes is generated at each request, under its own path.
const BDPM_IMPORTANT: &str =
    "https://base-donnees-publique.medicaments.gouv.fr/download/CIS_InfoImportantes.txt";
const BDPM_RCP: &str =
    "https://base-donnees-publique.medicaments.gouv.fr/affichageDoc.php?typedoc=R&specid=";
const THESAURUS_PDF: &str = "https://ansm.sante.fr/uploads/2024/06/07/20230915-thesaurus-interactions-medicamenteuses-septembre-2023.pdf";
const COMPLALIM_DATASET: &str =
    "https://www.data.gouv.fr/api/1/datasets/declarations-de-complements-alimentaires/";
const USER_AGENT: &str = concat!(
    "atome-health-ref/",
    env!("CARGO_PKG_VERSION"),
    " (monthly reference build; https://atome.one)"
);

pub struct Options {
    /// The pause between two requests.
    pub delay: Duration,
    /// The SmPC pages fetched at most in one run.
    pub rcp_budget: usize,
    /// A SmPC page older than this is fetched again.
    pub rcp_max_age_days: i64,
    /// The CIS whose SmPC is wanted (the marketed medicines of the BDPM just fetched).
    pub rcp_wanted: Vec<String>,
}

pub struct Fetcher {
    client: reqwest::blocking::Client,
    delay: Duration,
    last: Option<Instant>,
}

impl Fetcher {
    pub fn new(delay: Duration) -> Result<Self, String> {
        let client = reqwest::blocking::Client::builder()
            .user_agent(USER_AGENT)
            .timeout(Duration::from_secs(300))
            .build()
            .map_err(|error| format!("http client: {error}"))?;
        Ok(Self {
            client,
            delay,
            last: None,
        })
    }

    pub fn get(&mut self, url: &str) -> Result<Vec<u8>, String> {
        if let Some(elapsed) = self.last.map(|last| last.elapsed())
            && elapsed < self.delay
        {
            std::thread::sleep(self.delay - elapsed);
        }
        self.last = Some(Instant::now());
        let response = self
            .client
            .get(url)
            .send()
            .map_err(|error| format!("{url}: {error}"))?;
        if !response.status().is_success() {
            return Err(format!("{url}: HTTP {}", response.status()));
        }
        response
            .bytes()
            .map(|bytes| bytes.to_vec())
            .map_err(|error| format!("{url}: {error}"))
    }
}

/// Writes through a temporary file, so the previous copy stays until the new one is whole.
fn store(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|error| format!("{}: {error}", parent.display()))?;
    }
    let partial = path.with_extension("partial");
    std::fs::write(&partial, bytes).map_err(|error| format!("{}: {error}", partial.display()))?;
    std::fs::rename(&partial, path).map_err(|error| format!("{}: {error}", path.display()))
}

fn days(date: &str) -> Result<i64, String> {
    let date = iso_date(date)?;
    let field = |range: std::ops::Range<usize>| {
        date[range]
            .parse::<i64>()
            .map_err(|_| format!("date '{date}'"))
    };
    let (year, month, day) = (field(0..4)?, field(5..7)?, field(8..10)?);
    // Days from civil (H. Hinnant), the inverse of `civil_date`.
    let year = if month <= 2 { year - 1 } else { year };
    let era = year.div_euclid(400);
    let yoe = year - era * 400;
    let doy = (153 * (if month > 2 { month - 3 } else { month + 9 }) + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146_097 + doe - 719_468;
    debug_assert_eq!(civil_date(days), date);
    Ok(days)
}

/// The BDPM files, the thesaurus (once) and Compl'Alim. Their failures stop the run: a build needs them all.
pub fn fetch_bases(
    root: &Path,
    fetcher: &mut Fetcher,
    today: &str,
) -> Result<SourcesState, String> {
    let mut state = read_state(root)?;
    for name in FILE_NAMES {
        let url = if name == "CIS_InfoImportantes.txt" {
            BDPM_IMPORTANT.to_string()
        } else {
            format!("{BDPM_FILES}{name}")
        };
        store(&root.join(BDPM_DIR).join(name), &fetcher.get(&url)?)?;
    }
    state.bdpm = Some(today.to_string());
    if !root.join(THESAURUS_FILE).exists() {
        store(&root.join(THESAURUS_FILE), &fetcher.get(THESAURUS_PDF)?)?;
        state.thesaurus = Some(today.to_string());
    }
    let dataset: serde_json::Value = serde_json::from_slice(&fetcher.get(COMPLALIM_DATASET)?)
        .map_err(|error| format!("Compl'Alim dataset: {error}"))?;
    let resource = dataset["resources"]
        .as_array()
        .and_then(|resources| {
            resources
                .iter()
                .find(|resource| resource["format"].as_str() == Some("csv"))
        })
        .ok_or_else(|| "Compl'Alim dataset: no CSV resource".to_string())?;
    let (Some(url), Some(modified)) =
        (resource["url"].as_str(), resource["last_modified"].as_str())
    else {
        return Err("Compl'Alim dataset: the CSV resource has no url or date".to_string());
    };
    store(&root.join(COMPLALIM_FILE), &fetcher.get(url)?)?;
    state.complalim = Some(today.to_string());
    state.complalim_version = Some(iso_date(
        modified
            .get(..10)
            .ok_or("Compl'Alim dataset: date too short")?,
    )?);
    write_state(root, &state)?;
    Ok(state)
}

/// The SmPC pages of this run; returns the pages fetched and the failures.
pub fn fetch_rcp(
    root: &Path,
    fetcher: &mut Fetcher,
    options: &Options,
    today: &str,
) -> Result<(usize, Vec<String>), String> {
    let mut state = read_state(root)?;
    let now = days(today)?;
    let mut due: Vec<(i64, &String)> = Vec::new();
    for cis in &options.rcp_wanted {
        match state.rcp.get(cis) {
            None => due.push((i64::MIN, cis)),
            Some(retrieved) if now - days(retrieved)? > options.rcp_max_age_days => {
                due.push((days(retrieved)?, cis))
            }
            Some(_) => {}
        }
    }
    due.sort();
    let mut fetched = 0;
    let mut failures = Vec::new();
    for (_, cis) in due.into_iter().take(options.rcp_budget) {
        let page = fetcher.get(&format!("{BDPM_RCP}{cis}")).and_then(|bytes| {
            std::str::from_utf8(&bytes).map_err(|_| format!("SmPC {cis}: not UTF-8"))?;
            Ok(bytes)
        });
        let bytes = match page {
            Ok(bytes) => bytes,
            Err(error) => {
                failures.push(error);
                continue;
            }
        };
        store(&root.join(RCP_DIR).join(format!("{cis}.html")), &bytes)?;
        state.rcp.insert(cis.clone(), today.to_string());
        fetched += 1;
        if fetched % 50 == 0 {
            write_state(root, &state)?;
        }
    }
    write_state(root, &state)?;
    Ok((fetched, failures))
}
