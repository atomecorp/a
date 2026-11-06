// The dates of mail as JavaScript reads and writes them: `Date.parse` of a message's `Date` header
// and of IMAP's INTERNALDATE (ECMAScript's own format first, then the legacy spellings V8 accepts:
// a day, a month's name, a year of two or four digits, a time, a zone by offset or by name,
// parenthesized comments; a day past its month's end carried into the next one, a date without a
// zone in the server's local time), and `Date.prototype.toUTCString`. V8's other legacy spellings
// (a month as a number, a date without its year) are not read: they are not mail's.
use crate::vault_router::js;
use chrono::TimeZone;
use serde_json::json;

const MONTHS: [&str; 12] = [
    "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
];
const MAX_TIME_MS: i64 = 8_640_000_000_000_000;

/// `new Date(ms).toUTCString()`.
pub fn utc_string(ms: i64) -> String {
    chrono::DateTime::from_timestamp_millis(ms)
        .unwrap_or_default()
        .format("%a, %d %b %Y %H:%M:%S GMT")
        .to_string()
}

#[derive(Clone, Copy, PartialEq)]
enum Token<'a> {
    Number(i64, usize),
    Word(&'a str),
    Sign(i64),
    Colon,
    Dot,
}

fn tokens(text: &str) -> Vec<Token<'_>> {
    let mut tokens = Vec::new();
    let mut chars = text.char_indices().peekable();
    let mut depth = 0;
    while let Some((start, c)) = chars.next() {
        let run = |chars: &mut std::iter::Peekable<std::str::CharIndices<'_>>,
                   test: fn(char) -> bool| {
            let mut end = start + c.len_utf8();
            while let Some((index, next)) = chars.peek().copied().filter(|(_, next)| test(*next)) {
                end = index + next.len_utf8();
                chars.next();
            }
            &text[start..end]
        };
        match c {
            '(' => depth += 1,
            ')' if depth > 0 => depth -= 1,
            _ if depth > 0 => {}
            '0'..='9' => {
                let digits = run(&mut chars, |c| c.is_ascii_digit());
                tokens.push(Token::Number(
                    digits.parse().unwrap_or(i64::MAX),
                    digits.len(),
                ));
            }
            _ if c.is_alphabetic() => {
                tokens.push(Token::Word(run(&mut chars, char::is_alphabetic)))
            }
            '+' => tokens.push(Token::Sign(1)),
            '-' => tokens.push(Token::Sign(-1)),
            ':' => tokens.push(Token::Colon),
            '.' => tokens.push(Token::Dot),
            _ => {}
        }
    }
    tokens
}

fn zone(word: &str) -> Option<i64> {
    Some(match word {
        "ut" | "utc" | "gmt" | "z" => 0,
        "edt" => -4 * 60,
        "est" | "cdt" => -5 * 60,
        "cst" | "mdt" => -6 * 60,
        "mst" | "pdt" => -7 * 60,
        "pst" => -8 * 60,
        _ => return None,
    })
}

/// `Date.parse(text)` of a mail date, none when it is NaN.
pub fn parse(text: &str) -> Option<i64> {
    js::date(Some(&json!(text))).or_else(|| legacy(text))
}

fn legacy(text: &str) -> Option<i64> {
    let tokens = tokens(text);
    let (mut comps, mut month, mut time, mut millis) = (Vec::new(), None, Vec::new(), 0);
    let (mut offset, mut meridiem, mut read_number) = (None::<i64>, None::<bool>, false);
    let mut index = 0;
    while index < tokens.len() {
        let next = |at: usize| tokens.get(at).copied();
        match tokens[index] {
            Token::Number(value, _) if next(index + 1) == Some(Token::Colon) && time.is_empty() => {
                read_number = true;
                time.push(value);
                while let (Some(Token::Colon), Some(Token::Number(part, _))) =
                    (next(index + 1), next(index + 2))
                {
                    time.push(part);
                    index += 2;
                }
                if let (Some(Token::Dot), Some(Token::Number(part, digits))) =
                    (next(index + 1), next(index + 2))
                {
                    let shown = part.to_string();
                    let kept = &format!("{shown:0>digits$}")[..digits.min(3)];
                    millis = kept.parse::<i64>().ok()? * 10_i64.pow(3 - kept.len() as u32);
                    index += 2;
                }
                if time.len() < 2 {
                    return None;
                }
            }
            Token::Number(value, digits) => {
                read_number = true;
                comps.push((value, digits));
            }
            Token::Word(word) => {
                let word = word.to_lowercase();
                let prefix: String = word.chars().take(3).collect();
                if let (true, Some(found)) =
                    (word.len() >= 3, MONTHS.iter().position(|m| *m == prefix))
                {
                    month = Some(found as u32 + 1);
                } else if let Some(minutes) = zone(&word) {
                    offset = Some(minutes);
                } else if word == "am" || word == "pm" {
                    meridiem = Some(word == "pm");
                } else if read_number {
                    return None;
                }
            }
            Token::Sign(sign) if !time.is_empty() || offset.is_some() => {
                let Some(Token::Number(value, digits)) = next(index + 1) else {
                    return None;
                };
                index += 1;
                let minutes = if digits >= 3 {
                    value / 100 * 60 + value % 100
                } else if let (Some(Token::Colon), Some(Token::Number(part, _))) =
                    (next(index + 1), next(index + 2))
                {
                    index += 2;
                    value * 60 + part
                } else {
                    value * 60
                };
                offset = Some(offset.unwrap_or(0) + sign * minutes);
            }
            _ => {}
        }
        index += 1;
    }
    let month = month?;
    let [(first, _), (second, _)] = comps[..] else {
        return None;
    };
    let (mut year, day) = if (1..=31).contains(&first) {
        (second, first)
    } else {
        (first, second)
    };
    year += match year {
        0..=49 => 2000,
        50..=99 => 1900,
        _ => 0,
    };
    let (mut hour, minute, second) = (
        time.first().copied().unwrap_or(0),
        time.get(1).copied().unwrap_or(0),
        time.get(2).copied().unwrap_or(0),
    );
    if let Some(pm) = meridiem {
        if !(0..=12).contains(&hour) {
            return None;
        }
        hour = hour % 12 + if pm { 12 } else { 0 };
    }
    let midnight = hour == 24 && minute == 0 && second == 0 && millis == 0;
    if !(1..=31).contains(&day) || !(hour < 24 || midnight) || minute > 59 || second > 59 {
        return None;
    }
    let first_day = chrono::NaiveDate::from_ymd_opt(i32::try_from(year).ok()?, month, 1)?;
    let wall = first_day.and_hms_opt(0, 0, 0)?
        + chrono::TimeDelta::days(day - 1)
        + chrono::TimeDelta::milliseconds(((hour * 60 + minute) * 60 + second) * 1000 + millis);
    let ms = match offset {
        Some(minutes) => wall.and_utc().timestamp_millis() - minutes * 60_000,
        None => chrono::Local
            .from_local_datetime(&wall)
            .earliest()?
            .timestamp_millis(),
    };
    (ms.abs() <= MAX_TIME_MS).then_some(ms)
}
