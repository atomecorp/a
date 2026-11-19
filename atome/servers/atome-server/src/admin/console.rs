// What Node's console wrote for the scripts' flat records, so the ported tools print the same lines:
// `console.log(object)` (util.inspect, its one-line or one-property-a-line form) and
// `console.table(rows)` (left-aligned cells, strings quoted).
use serde_json::Value as JsonValue;

/// One record: its properties in order.
pub(super) type Record = Vec<(&'static str, JsonValue)>;

// A primitive as util.inspect writes it: strings in single quotes.
fn inspect(value: &JsonValue) -> String {
    match value {
        JsonValue::String(text) => {
            let quote = if text.contains('\'') && !text.contains('"') {
                '"'
            } else {
                '\''
            };
            let mut out = String::from(quote);
            for c in text.chars() {
                match c {
                    '\n' => out.push_str("\\n"),
                    '\\' => out.push_str("\\\\"),
                    c if c == quote => {
                        out.push('\\');
                        out.push(c);
                    }
                    c => out.push(c),
                }
            }
            out.push(quote);
            out
        }
        other => other.to_string(),
    }
}

/// `console.log(record)`: one line when it holds within 80 columns (util.inspect's
/// `isBelowBreakLength`), else one property a line.
pub(super) fn object(record: &[(&'static str, JsonValue)]) -> String {
    let entries: Vec<String> = record
        .iter()
        .map(|(key, value)| format!("{key}: {}", inspect(value)))
        .collect();
    let count = entries.len();
    // `start = output.length + indentationLvl + braces[0].length + base.length + 10`.
    let mut total = count + (count + 1 + 10);
    let mut below = total + count <= 80;
    for entry in &entries {
        total += entry.chars().count();
        below &= total <= 80;
    }
    if entries.is_empty() {
        "{}".into()
    } else if below {
        format!("{{ {} }}", entries.join(", "))
    } else {
        format!("{{\n  {}\n}}", entries.join(",\n  "))
    }
}

/// `console.table(rows)`: an `(index)` column, then each property of the first row.
pub(super) fn table(rows: &[Record]) -> String {
    let mut header = vec!["(index)".to_string()];
    header.extend(
        rows.first()
            .into_iter()
            .flatten()
            .map(|(key, _)| key.to_string()),
    );
    let body: Vec<Vec<String>> = rows
        .iter()
        .enumerate()
        .map(|(index, row)| {
            std::iter::once(index.to_string())
                .chain(row.iter().map(|(_, value)| inspect(value)))
                .collect()
        })
        .collect();
    let widths: Vec<usize> = (0..header.len())
        .map(|column| {
            std::iter::once(&header)
                .chain(&body)
                .filter_map(|line| line.get(column))
                .map(|text| text.chars().count() + 2)
                .max()
                .unwrap_or(2)
        })
        .collect();
    let rule = |left: &str, middle: &str, right: &str| {
        let bars: Vec<String> = widths.iter().map(|width| "─".repeat(*width)).collect();
        format!("{left}{}{right}", bars.join(middle))
    };
    let line = |cells: &[String]| {
        let padded: Vec<String> = cells
            .iter()
            .zip(&widths)
            .map(|(text, width)| format!(" {text}{}", " ".repeat(width - 1 - text.chars().count())))
            .collect();
        format!("│{}│", padded.join("│"))
    };
    let mut out = vec![rule("┌", "┬", "┐"), line(&header), rule("├", "┼", "┤")];
    out.extend(body.iter().map(|cells| line(cells)));
    out.push(rule("└", "┴", "┘"));
    out.join("\n")
}
