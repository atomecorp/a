//! One conversion: source → CXF document → package (in memory) → sealed envelope
//! by default. The document is validated against CXF before it can be written;
//! nothing reaches the disk in clear unless a plaintext CXF was explicitly asked.

use std::collections::HashSet;
use std::fs::OpenOptions;
use std::io::Write;
use std::os::unix::fs::OpenOptionsExt;
use std::path::Path;

use zeroize::Zeroizing;

use crate::cxf::Header;
use crate::error::{Result, err};
use crate::package::{self, PackageWriter};
use crate::report::Report;
use crate::seal;
use crate::sources::{self, Format};
use crate::validate::validate;

/// A package built in memory: wiped when dropped.
pub struct Built {
    pub package: Zeroizing<Vec<u8>>,
    pub report: Report,
}

/// An `item-reference` whose target is not in the same account is legal (§3.3.10)
/// but worth telling: the related item did not come with this export.
fn check_references(header: &Header, report: &mut Report) {
    for account in &header.accounts {
        let ids: HashSet<&str> = account.items.iter().map(|item| item.id.as_str()).collect();
        for item in &account.items {
            for credential in &item.credentials {
                if let Some(target) = credential["reference"]["item"].as_str()
                    && !ids.contains(target)
                {
                    report.warn("reference_target_absent", Some(&item.id), "");
                }
            }
        }
    }
}

fn first_violations(violations: Vec<String>) -> crate::Error {
    err(
        "cxf_validation_failed",
        violations
            .into_iter()
            .take(5)
            .collect::<Vec<_>>()
            .join("; "),
    )
}

/// Builds the package of `source`. `for_sealing` adds the fidelity backup and the
/// report, which only a sealed package may carry.
pub fn build(
    source: &Path,
    format: Option<Format>,
    timestamp: u64,
    for_sealing: bool,
) -> Result<Built> {
    let format = match format {
        Some(format) => format,
        None => sources::detect(source)?,
    };
    let mut package = PackageWriter::new(for_sealing);
    let mut report = Report::new("");
    let accounts = sources::read(source, format, &mut package, &mut report)?;
    let header = Header::new(timestamp, accounts);
    check_references(&header, &mut report);
    report.tally(&header);
    report.sealed = for_sealing;
    report.fidelity_backup = for_sealing;
    let index = Zeroizing::new(
        serde_json::to_vec_pretty(&header).map_err(|e| err("cxf_encode_failed", e.to_string()))?,
    );
    drop(header);
    let document: serde_json::Value =
        serde_json::from_slice(&index).map_err(|e| err("cxf_encode_failed", e.to_string()))?;
    let violations = validate(&document, package.documents());
    drop(document);
    if !violations.is_empty() {
        return Err(first_violations(violations));
    }
    let report_json = serde_json::to_vec_pretty(&report)
        .map_err(|e| err("report_encode_failed", e.to_string()))?;
    Ok(Built {
        package: Zeroizing::new(package.finish(&index, &report_json)?),
        report,
    })
}

/// Seals a built package under `passphrase` (KDF parameters of `seal::KdfParams`).
pub fn seal(built: Built, passphrase: &str, params: seal::KdfParams) -> Result<Vec<u8>> {
    let Built { mut package, .. } = built;
    seal::seal(std::mem::take(&mut *package), passphrase, params)
}

/// Writes `bytes` to `path` with owner-only permissions, through a sibling
/// file renamed into place, so a failure never leaves a partial output.
pub fn write_file(path: &Path, bytes: &[u8], replace: bool) -> Result<()> {
    if path.exists() && !replace {
        return Err(err("output_exists", ""));
    }
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| err("output_path_invalid", ""))?;
    let partial = path.with_file_name(format!(".{name}.partial-{}", std::process::id()));
    let written = (|| -> Result<()> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&partial)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        std::fs::rename(&partial, path)?;
        Ok(())
    })();
    if written.is_err() {
        // The write error is the one returned; the partial file goes with it if it exists.
        let _ = std::fs::remove_file(&partial);
    }
    written
}

pub struct Verified {
    pub items: usize,
    pub documents: usize,
    pub fidelity_files: usize,
    pub report: Option<serde_json::Value>,
}

/// Opens a sealed file in memory and checks its integrity and its CXF document.
pub fn verify(sealed: &[u8], passphrase: &str) -> Result<Verified> {
    let plain = seal::open(sealed, passphrase)?;
    let package = package::read(&plain)?;
    let violations = validate(&package.index, &package.digests());
    if !violations.is_empty() {
        return Err(first_violations(violations));
    }
    let items = package.index["accounts"].as_array().map_or(0, |accounts| {
        accounts
            .iter()
            .map(|a| a["items"].as_array().map_or(0, Vec::len))
            .sum()
    });
    Ok(Verified {
        items,
        documents: package.documents.len(),
        fidelity_files: package.fidelity.len(),
        report: package.report,
    })
}
