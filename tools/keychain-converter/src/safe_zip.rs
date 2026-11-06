use std::collections::BTreeMap;
use std::io::{Read, Seek, SeekFrom};

use zip::ZipArchive;

use crate::error::{Result, err};

/// Bounds a hostile archive cannot pass: entry count, declared and actual sizes,
/// and the expansion ratio of a decompression bomb.
#[derive(Debug, Clone, Copy)]
pub struct Limits {
    pub max_entries: usize,
    pub max_entry_bytes: u64,
    pub max_total_bytes: u64,
    /// Largest uncompressed/compressed ratio accepted above one mebibyte.
    pub max_ratio: u64,
}

impl Limits {
    pub const DEFAULT: Limits = Limits {
        max_entries: 100_000,
        max_entry_bytes: 1 << 30,
        max_total_bytes: 2 << 30,
        max_ratio: 200,
    };
}

const RATIO_FLOOR: u64 = 1 << 20;

/// A ZIP read in memory only (nothing is ever extracted to disk), whose every
/// entry was checked before any is read: a safe relative name (no absolute path,
/// no `..`, no backslash, no NUL — Zip Slip), no symbolic link, no encryption,
/// no duplicate, sizes within the limits. A read checks the actual size against
/// the declared one and the CRC (by the `zip` crate) before returning bytes.
pub struct SafeZip<R> {
    archive: ZipArchive<R>,
    entries: BTreeMap<String, (usize, u64)>,
}

fn name_is_safe(name: &str) -> bool {
    if name.is_empty() || name.len() > 1024 || name.contains(['\\', '\0']) || name.starts_with('/')
    {
        return false;
    }
    let trimmed = name.strip_suffix('/').unwrap_or(name);
    !trimmed.is_empty()
        && trimmed
            .split('/')
            .all(|part| !part.is_empty() && part != "." && part != ".." && !part.contains(':'))
}

const EOCD_LEN: usize = 22;
const LOCATOR_LEN: u64 = 20;

fn le_u16(bytes: &[u8]) -> u16 {
    u16::from_le_bytes([bytes[0], bytes[1]])
}

fn le_u64(bytes: &[u8]) -> u64 {
    let mut array = [0u8; 8];
    array.copy_from_slice(bytes);
    u64::from_le_bytes(array)
}

/// The entry count the end-of-central-directory record declares (ZIP64 included).
/// `zip` keeps only one of several entries sharing a name, so a duplicate shows as
/// a declared count larger than the archive's; read first, the count also bounds
/// the central directory before `zip` allocates for it.
fn declared_entries<R: Read + Seek>(reader: &mut R) -> Result<u64> {
    let len = reader.seek(SeekFrom::End(0))?;
    let tail_start = len.saturating_sub((EOCD_LEN + usize::from(u16::MAX)) as u64);
    reader.seek(SeekFrom::Start(tail_start))?;
    let mut tail = Vec::new();
    reader.read_to_end(&mut tail)?;
    // The last signature whose comment length reaches exactly the end of the file.
    let at = (0..=tail.len().saturating_sub(EOCD_LEN))
        .rev()
        .find(|&i| {
            tail.len() - i >= EOCD_LEN
                && tail[i..i + 4] == *b"PK\x05\x06"
                && usize::from(le_u16(&tail[i + 20..])) == tail.len() - i - EOCD_LEN
        })
        .ok_or_else(|| err("zip_invalid", "no end of central directory"))?;
    let count = u64::from(le_u16(&tail[at + 10..]));
    let locator_at = (tail_start + at as u64).checked_sub(LOCATOR_LEN);
    let declared = match locator_at {
        Some(locator_at) if count == u64::from(u16::MAX) => {
            let mut locator = [0u8; LOCATOR_LEN as usize];
            reader.seek(SeekFrom::Start(locator_at))?;
            reader.read_exact(&mut locator)?;
            if locator[..4] == *b"PK\x06\x07" {
                let mut record = [0u8; 40];
                reader.seek(SeekFrom::Start(le_u64(&locator[8..16])))?;
                reader
                    .read_exact(&mut record)
                    .map_err(|_| err("zip_invalid", "ZIP64 record out of the file"))?;
                if record[..4] != *b"PK\x06\x06" {
                    return Err(err("zip_invalid", "ZIP64 record signature"));
                }
                le_u64(&record[32..40])
            } else {
                count
            }
        }
        _ => count,
    };
    reader.rewind()?;
    Ok(declared)
}

impl<R: Read + Seek> SafeZip<R> {
    pub fn open(mut reader: R, limits: Limits) -> Result<Self> {
        let declared = declared_entries(&mut reader)?;
        if declared > limits.max_entries as u64 {
            return Err(err("zip_too_many_entries", declared.to_string()));
        }
        let mut archive = ZipArchive::new(reader).map_err(|e| err("zip_invalid", e.to_string()))?;
        if archive.len() as u64 != declared {
            return Err(err(
                "zip_entry_duplicate",
                format!("{declared} declared, {} distinct", archive.len()),
            ));
        }
        let mut entries = BTreeMap::new();
        let mut total: u64 = 0;
        for index in 0..archive.len() {
            let entry = archive
                .by_index_raw(index)
                .map_err(|e| err("zip_invalid", e.to_string()))?;
            let name = entry
                .name()
                .map_err(|e| err("zip_entry_name_invalid", e.to_string()))?
                .into_owned();
            if !name_is_safe(&name) || entry.enclosed_name().is_none() {
                return Err(err("zip_entry_path_unsafe", format!("{name:?}")));
            }
            if entry.is_symlink() {
                return Err(err("zip_entry_symlink", format!("{name:?}")));
            }
            if entry.encrypted() {
                return Err(err("zip_entry_encrypted", format!("{name:?}")));
            }
            let size = entry.size();
            if size > limits.max_entry_bytes {
                return Err(err("zip_entry_too_large", format!("{name:?} {size}")));
            }
            if size > RATIO_FLOOR && size / entry.compressed_size().max(1) > limits.max_ratio {
                return Err(err("zip_entry_ratio_exceeded", format!("{name:?}")));
            }
            total = total.saturating_add(size);
            if total > limits.max_total_bytes {
                return Err(err("zip_total_too_large", total.to_string()));
            }
            if entry.is_dir() {
                continue;
            }
            entries.insert(name, (index, size));
        }
        Ok(Self { archive, entries })
    }

    pub fn contains(&self, name: &str) -> bool {
        self.entries.contains_key(name)
    }

    pub fn names(&self) -> impl Iterator<Item = &str> {
        self.entries.keys().map(String::as_str)
    }

    pub fn read(&mut self, name: &str) -> Result<Vec<u8>> {
        let (index, size) = *self
            .entries
            .get(name)
            .ok_or_else(|| err("zip_entry_missing", format!("{name:?}")))?;
        let entry = self
            .archive
            .by_index(index)
            .map_err(|e| err("zip_entry_corrupt", format!("{name:?}: {e}")))?;
        let mut bytes = Vec::with_capacity(size.min(64 << 20) as usize);
        entry
            .take(size + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| err("zip_entry_corrupt", format!("{name:?}: {e}")))?;
        if bytes.len() as u64 != size {
            return Err(err("zip_entry_size_mismatch", format!("{name:?}")));
        }
        Ok(bytes)
    }
}
