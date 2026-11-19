//! Reads one table of an SQLite database file held in memory, read-only: the
//! bundle's `objects` table (`id INTEGER PRIMARY KEY, type TEXT, contents BLOB`).
//! Pure Rust over the documented file format (sqlite.org/fileformat2.html), so the
//! same reader runs natively and in the browser's WebAssembly. It walks the table's
//! B-tree (interior and leaf table pages, overflow chains) and decodes each record.

#[derive(Debug, Clone, PartialEq)]
pub enum SqlValue {
    Null,
    Integer(i64),
    Real(f64),
    Text(String),
    Blob(Vec<u8>),
}

#[derive(Debug, Clone, PartialEq)]
pub struct SqlRow {
    pub rowid: i64,
    pub columns: Vec<SqlValue>,
}

#[derive(Debug, PartialEq, Eq)]
pub struct StoreError(pub String);

impl std::fmt::Display for StoreError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "sqlite_store:{}", self.0)
    }
}

impl std::error::Error for StoreError {}

fn fail<T>(message: impl Into<String>) -> Result<T, StoreError> {
    Err(StoreError(message.into()))
}

struct Database<'a> {
    bytes: &'a [u8],
    page_size: usize,
    usable: usize,
}

fn varint(bytes: &[u8], at: usize) -> Result<(i64, usize), StoreError> {
    let mut value: u64 = 0;
    for index in 0..9 {
        let Some(&byte) = bytes.get(at + index) else {
            return fail("truncated varint");
        };
        if index == 8 {
            return Ok((((value << 8) | u64::from(byte)) as i64, 9));
        }
        value = (value << 7) | u64::from(byte & 0x7f);
        if byte & 0x80 == 0 {
            return Ok((value as i64, index + 1));
        }
    }
    unreachable!("a varint has at most nine bytes")
}

fn big_endian(bytes: &[u8]) -> u64 {
    bytes
        .iter()
        .fold(0, |value, byte| (value << 8) | u64::from(*byte))
}

impl<'a> Database<'a> {
    fn open(bytes: &'a [u8]) -> Result<Self, StoreError> {
        if bytes.len() < 100 || &bytes[..16] != b"SQLite format 3\0" {
            return fail("not an SQLite 3 database");
        }
        let page_size = match big_endian(&bytes[16..18]) {
            1 => 65_536,
            size => size as usize,
        };
        if !page_size.is_power_of_two() || !(512..=65_536).contains(&page_size) {
            return fail("invalid page size");
        }
        if big_endian(&bytes[56..60]) > 1 {
            return fail("only UTF-8 databases are read");
        }
        let usable = page_size - usize::from(bytes[20]);
        Ok(Self {
            bytes,
            page_size,
            usable,
        })
    }

    fn page(&self, number: u64) -> Result<&'a [u8], StoreError> {
        let start = (number as usize)
            .checked_sub(1)
            .map(|index| index * self.page_size)
            .ok_or_else(|| StoreError("page 0".into()))?;
        self.bytes
            .get(start..start + self.page_size)
            .ok_or_else(|| StoreError(format!("page {number} beyond the file")))
    }

    /// The whole payload of a leaf cell: its local part, then its overflow chain.
    fn payload(&self, page: &[u8], at: usize, size: usize) -> Result<Vec<u8>, StoreError> {
        let usable = self.usable;
        let max_local = usable - 35;
        let local = if size <= max_local {
            size
        } else {
            let min_local = (usable - 12) * 32 / 255 - 23;
            let candidate = min_local + (size - min_local) % (usable - 4);
            if candidate <= max_local {
                candidate
            } else {
                min_local
            }
        };
        let mut payload = page
            .get(at..at + local)
            .ok_or_else(|| StoreError("truncated cell".into()))?
            .to_vec();
        if local < size {
            let mut next = big_endian(
                page.get(at + local..at + local + 4)
                    .ok_or_else(|| StoreError("truncated overflow pointer".into()))?,
            );
            while payload.len() < size {
                let overflow = self.page(next)?;
                let take = (size - payload.len()).min(usable - 4);
                payload.extend_from_slice(&overflow[4..4 + take]);
                next = big_endian(&overflow[..4]);
            }
        }
        Ok(payload)
    }

    fn walk(&self, number: u64, rows: &mut Vec<SqlRow>, depth: u32) -> Result<(), StoreError> {
        if depth > 64 {
            return fail("B-tree too deep");
        }
        let page = self.page(number)?;
        let header = if number == 1 { 100 } else { 0 };
        let kind = page[header];
        let cells = big_endian(&page[header + 3..header + 5]) as usize;
        let pointers = header + if kind == 0x05 { 12 } else { 8 };
        for index in 0..cells {
            let at = big_endian(&page[pointers + 2 * index..pointers + 2 * index + 2]) as usize;
            match kind {
                0x05 => self.walk(big_endian(&page[at..at + 4]), rows, depth + 1)?,
                0x0d => {
                    let (size, used) = varint(page, at)?;
                    let (rowid, used_rowid) = varint(page, at + used)?;
                    let payload = self.payload(page, at + used + used_rowid, size as usize)?;
                    rows.push(SqlRow {
                        rowid,
                        columns: record(&payload)?,
                    });
                }
                _ => return fail(format!("page {number} is not a table page ({kind:#x})")),
            }
        }
        if kind == 0x05 {
            self.walk(big_endian(&page[header + 8..header + 12]), rows, depth + 1)?;
        }
        Ok(())
    }
}

fn record(payload: &[u8]) -> Result<Vec<SqlValue>, StoreError> {
    let (header_size, mut at) = varint(payload, 0)?;
    let mut body = header_size as usize;
    let mut columns = Vec::new();
    while at < header_size as usize {
        let (serial, used) = varint(payload, at)?;
        at += used;
        let width = match serial {
            0 | 8 | 9 => 0,
            1..=4 => serial as usize,
            5 => 6,
            6 | 7 => 8,
            serial if serial >= 12 => ((serial - 12) / 2) as usize,
            _ => return fail(format!("reserved serial type {serial}")),
        };
        let field = payload
            .get(body..body + width)
            .ok_or_else(|| StoreError("truncated record".into()))?;
        body += width;
        columns.push(match serial {
            0 => SqlValue::Null,
            8 => SqlValue::Integer(0),
            9 => SqlValue::Integer(1),
            7 => SqlValue::Real(f64::from_bits(big_endian(field))),
            1..=6 => {
                let unsigned = big_endian(field);
                let shift = 64 - 8 * width as u32;
                SqlValue::Integer(((unsigned << shift) as i64) >> shift)
            }
            serial if serial % 2 == 0 => SqlValue::Blob(field.to_vec()),
            _ => SqlValue::Text(
                String::from_utf8(field.to_vec())
                    .map_err(|_| StoreError("invalid UTF-8".into()))?,
            ),
        });
    }
    Ok(columns)
}

/// Every row of `table`, in rowid order. A column declared `INTEGER PRIMARY KEY` is
/// stored as NULL in its record (it is the rowid): read [`SqlRow::rowid`] for it.
pub fn read_table(bytes: &[u8], table: &str) -> Result<Vec<SqlRow>, StoreError> {
    let database = Database::open(bytes)?;
    let mut schema = Vec::new();
    database.walk(1, &mut schema, 0)?;
    let root = schema
        .iter()
        .find(|row| {
            row.columns.first() == Some(&SqlValue::Text("table".into()))
                && row.columns.get(1) == Some(&SqlValue::Text(table.into()))
        })
        .and_then(|row| match row.columns.get(3) {
            Some(SqlValue::Integer(root)) => Some(*root as u64),
            _ => None,
        })
        .ok_or_else(|| StoreError(format!("no table {table}")))?;
    let mut rows = Vec::new();
    database.walk(root, &mut rows, 0)?;
    Ok(rows)
}
