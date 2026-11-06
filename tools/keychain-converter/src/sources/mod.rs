//! The official exports a person can choose, read only from the file they chose.

mod csv;
mod csv_rows;
mod onepassword;
mod onepassword_rules;
mod onepif;
mod onepux;
mod strict;

use std::io::Read;
use std::path::Path;

use crate::cxf::Account;
use crate::error::{Result, err};
use crate::package::PackageWriter;
use crate::report::Report;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Format {
    OnePux,
    OnePif,
    Csv,
}

impl Format {
    pub fn parse(name: &str) -> Result<Self> {
        match name {
            "1pux" => Ok(Format::OnePux),
            "1pif" => Ok(Format::OnePif),
            "csv" => Ok(Format::Csv),
            other => Err(err("format_unknown", other.to_string())),
        }
    }
}

/// The format of `path`: a ZIP is a 1PUX, a `.1pif` file or a folder holding
/// `data.1pif` is a 1PIF, anything else is read as CSV (and refused if it is not).
pub fn detect(path: &Path) -> Result<Format> {
    if path.is_dir() {
        return if path.join("data.1pif").is_file() {
            Ok(Format::OnePif)
        } else {
            Err(err("source_folder_not_1pif", ""))
        };
    }
    let mut magic = [0u8; 4];
    let read = std::fs::File::open(path)?.read(&mut magic)?;
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    Ok(match () {
        _ if read == 4 && magic == *b"PK\x03\x04" => Format::OnePux,
        _ if extension == "1pif" => Format::OnePif,
        _ => Format::Csv,
    })
}

/// Reads the source into CXF accounts; attachments and the fidelity backup go to `package`.
pub fn read(
    path: &Path,
    format: Format,
    package: &mut PackageWriter,
    report: &mut Report,
) -> Result<Vec<Account>> {
    match format {
        Format::OnePux => {
            report.source_format = onepux::SOURCE.into();
            onepux::convert(path, package, report)
        }
        Format::OnePif => {
            report.source_format = onepif::SOURCE.into();
            onepif::convert(path, package, report)
        }
        Format::Csv => {
            let (provider, accounts) = csv_rows::convert(path, package, report)?;
            report.source_format = provider;
            Ok(accounts)
        }
    }
}
