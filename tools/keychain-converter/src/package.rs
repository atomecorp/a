//! The converted package: a ZIP laid out like the CXP credential payload
//! (`index.json` = the CXF document, `documents/<file id>` = the files of the
//! `file` credentials), plus, in a sealed package only, `fidelity/` (the source
//! export verbatim) and `report.json`. Entries carry fixed dates so the same
//! source gives the same package.

use std::collections::BTreeMap;
use std::io::{Cursor, Write};

use serde_json::Value;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, DateTime, ZipWriter};

use crate::error::{Result, err};
use crate::ids::sha256_b64url;
use crate::safe_zip::{Limits, SafeZip};

pub const INDEX: &str = "index.json";
pub const REPORT: &str = "report.json";
pub const DOCUMENTS: &str = "documents/";
pub const FIDELITY: &str = "fidelity/";

/// Size and SHA-256 (base64url) of each document, by CXF file id.
pub type DocumentDigests = BTreeMap<String, (u64, String)>;

pub struct PackageWriter {
    zip: ZipWriter<Cursor<Vec<u8>>>,
    documents: DocumentDigests,
    keep_fidelity: bool,
}

fn options(method: CompressionMethod) -> SimpleFileOptions {
    SimpleFileOptions::default()
        .compression_method(method)
        .last_modified_time(DateTime::default())
        .unix_permissions(0o600)
}

fn zip_error(error: zip::result::ZipError) -> crate::Error {
    err("package_write_failed", error.to_string())
}

impl PackageWriter {
    pub fn new(keep_fidelity: bool) -> Self {
        Self {
            zip: ZipWriter::new(Cursor::new(Vec::new())),
            documents: BTreeMap::new(),
            keep_fidelity,
        }
    }

    fn entry(&mut self, name: &str, method: CompressionMethod, bytes: &[u8]) -> Result<()> {
        self.zip
            .start_file(name, options(method))
            .map_err(zip_error)?;
        self.zip.write_all(bytes)?;
        Ok(())
    }

    /// Stores a document once under its CXF file id; returns its digest.
    pub fn add_document(&mut self, id: &str, bytes: &[u8]) -> Result<(u64, String)> {
        if let Some(digest) = self.documents.get(id) {
            return Ok(digest.clone());
        }
        let digest = (bytes.len() as u64, sha256_b64url(bytes));
        self.entry(
            &format!("{DOCUMENTS}{id}"),
            CompressionMethod::Stored,
            bytes,
        )?;
        self.documents.insert(id.to_string(), digest.clone());
        Ok(digest)
    }

    /// Keeps a source file verbatim in the fidelity backup (sealed packages only).
    pub fn add_fidelity(&mut self, name: &str, bytes: &[u8]) -> Result<()> {
        if self.keep_fidelity {
            self.entry(
                &format!("{FIDELITY}{name}"),
                CompressionMethod::Deflated,
                bytes,
            )?;
        }
        Ok(())
    }

    pub fn keeps_fidelity(&self) -> bool {
        self.keep_fidelity
    }

    pub fn documents(&self) -> &DocumentDigests {
        &self.documents
    }

    pub fn finish(mut self, index: &[u8], report: &[u8]) -> Result<Vec<u8>> {
        if self.keep_fidelity {
            self.entry(REPORT, CompressionMethod::Deflated, report)?;
        }
        self.entry(INDEX, CompressionMethod::Deflated, index)?;
        Ok(self.zip.finish().map_err(zip_error)?.into_inner())
    }
}

pub struct Package {
    pub index: Value,
    pub documents: BTreeMap<String, Vec<u8>>,
    pub fidelity: Vec<String>,
    pub report: Option<Value>,
}

impl Package {
    pub fn digests(&self) -> DocumentDigests {
        self.documents
            .iter()
            .map(|(id, bytes)| (id.clone(), (bytes.len() as u64, sha256_b64url(bytes))))
            .collect()
    }
}

fn json(bytes: &[u8], name: &str) -> Result<Value> {
    serde_json::from_slice(bytes).map_err(|e| err("package_json_invalid", format!("{name}: {e}")))
}

/// Reads a package back, with the same archive checks as any untrusted ZIP.
pub fn read(bytes: &[u8]) -> Result<Package> {
    let mut zip = SafeZip::open(Cursor::new(bytes), Limits::DEFAULT)?;
    let names: Vec<String> = zip.names().map(str::to_string).collect();
    let index = json(&zip.read(INDEX)?, INDEX)?;
    let report = if zip.contains(REPORT) {
        Some(json(&zip.read(REPORT)?, REPORT)?)
    } else {
        None
    };
    let mut documents = BTreeMap::new();
    let mut fidelity = Vec::new();
    for name in names {
        if let Some(id) = name.strip_prefix(DOCUMENTS) {
            documents.insert(id.to_string(), zip.read(&name)?);
        } else if let Some(file) = name.strip_prefix(FIDELITY) {
            fidelity.push(file.to_string());
        } else if name != INDEX && name != REPORT {
            return Err(err("package_entry_unexpected", format!("{name:?}")));
        }
    }
    Ok(Package {
        index,
        documents,
        fidelity,
        report,
    })
}
