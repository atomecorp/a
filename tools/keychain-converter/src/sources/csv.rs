//! RFC 4180 CSV reading: quoted fields (with `""` escapes and line breaks),
//! CRLF or LF records, a comma, semicolon or tab delimiter detected from the
//! header line. An unterminated quote or text after a closing quote is an error
//! naming the line, never the content.

use crate::error::{Result, err};

pub const MAX_COLUMNS: usize = 512;
pub const MAX_ROWS: usize = 1_000_000;

fn delimiter(text: &str) -> char {
    let mut counts = [(',', 0usize), (';', 0), ('\t', 0)];
    let mut quoted = false;
    for c in text.chars() {
        match c {
            '"' => quoted = !quoted,
            '\n' | '\r' if !quoted => break,
            _ if !quoted => {
                if let Some(entry) = counts.iter_mut().find(|(d, _)| *d == c) {
                    entry.1 += 1;
                }
            }
            _ => {}
        }
    }
    counts
        .iter()
        .fold(
            (',', 0),
            |best, &(d, n)| if n > best.1 { (d, n) } else { best },
        )
        .0
}

/// The records of `text`, each with the line it starts on; blank lines are skipped.
pub fn parse(text: &str) -> Result<Vec<(usize, Vec<String>)>> {
    let delimiter = delimiter(text);
    let mut records = Vec::new();
    let mut record: Vec<String> = Vec::new();
    let mut field = String::new();
    let (mut quoted, mut closed) = (false, false);
    let (mut line, mut start) = (1usize, 1usize);
    let mut chars = text.chars().peekable();
    let finish_record = |record: &mut Vec<String>,
                         field: &mut String,
                         start: usize,
                         records: &mut Vec<_>|
     -> Result<()> {
        record.push(std::mem::take(field));
        let fields = std::mem::take(record);
        if fields.len() > MAX_COLUMNS {
            return Err(err("csv_too_many_columns", format!("line {start}")));
        }
        if !(fields.len() == 1 && fields[0].is_empty()) {
            records.push((start, fields));
        }
        if records.len() > MAX_ROWS {
            return Err(err("csv_too_many_rows", MAX_ROWS.to_string()));
        }
        Ok(())
    };
    while let Some(c) = chars.next() {
        if quoted {
            match c {
                '"' if chars.peek() == Some(&'"') => {
                    chars.next();
                    field.push('"');
                }
                '"' => (quoted, closed) = (false, true),
                _ => {
                    if c == '\n' {
                        line += 1;
                    }
                    field.push(c);
                }
            }
            continue;
        }
        match c {
            _ if c == delimiter => {
                record.push(std::mem::take(&mut field));
                closed = false;
            }
            '\r' | '\n' => {
                if c == '\r' && chars.peek() == Some(&'\n') {
                    chars.next();
                }
                finish_record(&mut record, &mut field, start, &mut records)?;
                closed = false;
                line += 1;
                start = line;
            }
            _ if closed => return Err(err("csv_text_after_closing_quote", format!("line {line}"))),
            '"' if field.is_empty() => quoted = true,
            _ => field.push(c),
        }
    }
    if quoted {
        return Err(err("csv_unterminated_quote", format!("line {start}")));
    }
    if !field.is_empty() || !record.is_empty() {
        finish_record(&mut record, &mut field, start, &mut records)?;
    }
    Ok(records)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_quotes_breaks_and_delimiters() {
        let rows = parse("a,b,c\r\n\"x, \"\"y\"\"\",\"line1\nline2\",\r\n\r\nz,,\n").unwrap();
        assert_eq!(
            rows[1],
            (
                2,
                vec!["x, \"y\"".into(), "line1\nline2".into(), String::new()]
            )
        );
        assert_eq!(rows[2], (5, vec!["z".into(), String::new(), String::new()]));
        assert_eq!(parse("a;b\n1;2").unwrap()[1].1, vec!["1", "2"]);
        assert_eq!(
            parse("a,b\n\"open,2").unwrap_err().code,
            "csv_unterminated_quote"
        );
        assert_eq!(
            parse("a,b\n\"x\"y,2").unwrap_err().code,
            "csv_text_after_closing_quote"
        );
    }
}
