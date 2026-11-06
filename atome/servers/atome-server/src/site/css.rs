// The public site's stylesheet (server/site_projection_css.js, ported), validated as mockups M6
// and M9: the page at its own layout on a wide screen (scaled down to fit between the phone and
// its width), its objects restacked in reading order under 720 px. Values written into a page
// are first checked by `css_color` / `css_number`: nothing a project holds reaches the
// stylesheet unchecked.
use crate::vault_router::js;
use serde_json::Value as JsonValue;

const PHONE_BREAKPOINT_PX: u32 = 720;
const PAGE_BACKGROUND: &str = "#ffffff";

/// A number as a JavaScript template literal writes it.
pub fn number(value: f64) -> String {
    if value == 0.0 {
        "0".into()
    } else {
        format!("{value}")
    }
}

// JavaScript's `\s`.
fn space(c: char) -> bool {
    (c.is_whitespace() && c != '\u{85}') || c == '\u{feff}'
}

// `/^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla)\(\s*[-0-9.%,\s/]+\)|[a-z]{3,20})$/i`.
fn color_shaped(value: &str) -> bool {
    if let Some(hex) = value.strip_prefix('#') {
        return (3..=8).contains(&hex.len()) && hex.bytes().all(|c| c.is_ascii_hexdigit());
    }
    let lowered = value.to_ascii_lowercase();
    let function = ["rgba(", "hsla(", "rgb(", "hsl("]
        .iter()
        .find_map(|name| lowered.strip_prefix(name));
    if let Some(inner) = function.and_then(|rest| rest.strip_suffix(')')) {
        return !inner.is_empty()
            && inner
                .chars()
                .all(|c| c.is_ascii_digit() || "-.%,/".contains(c) || space(c));
    }
    (3..=20).contains(&value.len()) && value.bytes().all(|c| c.is_ascii_alphabetic())
}

/// `cssColor(value, fallback)`.
pub fn css_color(value: Option<&JsonValue>, fallback: &str) -> String {
    let raw = match value {
        None | Some(JsonValue::Null) => String::new(),
        Some(value) => js::text(Some(value)),
    };
    let trimmed = js::trim(&raw);
    if color_shaped(trimmed) {
        trimmed.to_string()
    } else {
        fallback.to_string()
    }
}

/// `Number.parseFloat(value)` of a property.
fn parse_float(value: Option<&JsonValue>) -> f64 {
    if let Some(JsonValue::Number(number)) = value {
        return number.as_f64().unwrap_or(f64::NAN);
    }
    let text = js::text(value);
    let text = text.trim_start_matches(space);
    let bytes = text.as_bytes();
    let mut end = 0;
    if matches!(bytes.first(), Some(b'+' | b'-')) {
        end = 1;
    }
    if text[end..].starts_with("Infinity") {
        return f64::INFINITY;
    }
    let digits = |from: usize| {
        from + bytes[from..]
            .iter()
            .take_while(|c| c.is_ascii_digit())
            .count()
    };
    let whole = digits(end);
    let mut last = whole;
    if bytes.get(last) == Some(&b'.') {
        last = digits(last + 1);
    }
    if last == end || (last == end + 1 && bytes[end] == b'.') {
        return f64::NAN;
    }
    if matches!(bytes.get(last), Some(b'e' | b'E')) {
        let mut exponent = last + 1;
        if matches!(bytes.get(exponent), Some(b'+' | b'-')) {
            exponent += 1;
        }
        let after = digits(exponent);
        if after > exponent {
            last = after;
        }
    }
    text[..last].parse().unwrap_or(f64::NAN)
}

/// `cssNumber(value, fallback)`.
pub fn css_number(value: Option<&JsonValue>, fallback: f64) -> f64 {
    let number = parse_float(value);
    if number.is_finite() { number } else { fallback }
}

// The three components of `rgb(…)` / `rgba(…)` as `/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/`
// reads them, each through `Number`.
fn rgb_components(value: &str) -> Option<Vec<f64>> {
    let rest = value
        .strip_prefix("rgba(")
        .or_else(|| value.strip_prefix("rgb("))?;
    let mut rest = rest.trim_start_matches(space);
    let mut out = Vec::new();
    for index in 0..3 {
        if index > 0 {
            let separated = rest.trim_start_matches(|c: char| space(c) || c == ',');
            if separated.len() == rest.len() {
                return None;
            }
            rest = separated;
        }
        let length = rest
            .bytes()
            .take_while(|c| c.is_ascii_digit() || *c == b'.')
            .count();
        if length == 0 {
            return None;
        }
        out.push(rest[..length].parse().unwrap_or(f64::NAN));
        rest = &rest[length..];
    }
    Some(out)
}

/// `inkOn(background)`: dark on a light ground, white on a dark one (relative luminance, sRGB).
pub fn ink_on(background: Option<&JsonValue>) -> &'static str {
    let value = css_color(background, PAGE_BACKGROUND).to_lowercase();
    let hex = value
        .strip_prefix('#')
        .filter(|hex| hex.bytes().all(|c| c.is_ascii_hexdigit()));
    let rgb = match hex.map(str::len) {
        Some(3 | 5) => {
            let hex = hex.unwrap_or_default();
            Some(
                hex.chars()
                    .take(3)
                    .map(|d| f64::from(u8::from_str_radix(&format!("{d}{d}"), 16).unwrap_or(0)))
                    .collect(),
            )
        }
        Some(6 | 8) => {
            let hex = hex.unwrap_or_default();
            Some(
                [0, 2, 4]
                    .iter()
                    .map(|i| f64::from(u8::from_str_radix(&hex[*i..i + 2], 16).unwrap_or(0)))
                    .collect(),
            )
        }
        Some(_) => None,
        None => rgb_components(&value),
    };
    let Some(rgb) = rgb else {
        return "#15182c";
    };
    let linear: Vec<f64> = rgb
        .iter()
        .map(|c| {
            let s = c / 255.0;
            if s <= 0.03928 {
                s / 12.92
            } else {
                ((s + 0.055) / 1.055).powf(2.4)
            }
        })
        .collect();
    if 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2] > 0.18 {
        "#15182c"
    } else {
        "#ffffff"
    }
}

const STYLESHEET: &str = r#"@font-face{font-family:Roboto;src:url(/_site/fonts/Roboto-Regular.ttf);font-weight:400;font-display:swap}
@font-face{font-family:Roboto;src:url(/_site/fonts/Roboto-Medium.ttf);font-weight:500;font-display:swap}
@font-face{font-family:Roboto;src:url(/_site/fonts/Roboto-Bold.ttf);font-weight:700;font-display:swap}
*{box-sizing:border-box;margin:0}html,body{background:@BACKGROUND@;font-family:Roboto,system-ui,sans-serif}
.page{position:relative;width:@WIDTH@px;height:@HEIGHT@px;margin:0 auto;overflow:hidden}
.r{display:contents}.c{position:absolute}.o{position:absolute;display:block}.t{white-space:normal;overflow:hidden;overflow-wrap:anywhere}
a.o,.o a{color:inherit;text-decoration:none}a.o:focus-visible,.o a:focus-visible{outline:2px solid currentColor;outline-offset:2px}
.i{object-fit:cover}.v{object-fit:contain;background:#000}
.f{display:flex;flex-direction:column;gap:14px;padding:28px;border-radius:15px;background:rgba(255,255,255,.06)}
.f label{display:flex;flex-direction:column;gap:6px;color:var(--ink);font-size:15px;font-weight:500}
.f input,.f textarea{font:inherit;font-weight:400;font-size:16px;color:var(--ink);background:rgba(127,127,127,.14);border:0;border-radius:10px;padding:12px 14px;resize:none}
.f .consent,.f .said{color:var(--ink);opacity:.6;font-size:13px}.f .hp{position:absolute;left:-9999px}
.f button{align-self:flex-start;font:inherit;font-weight:700;font-size:17px;color:#15182c;background:var(--accent);border:0;border-radius:15px;padding:14px 28px;cursor:pointer}
.credit{display:block;width:21px;height:21px;margin:21px 21px 21px auto;color:inherit;background:currentColor;opacity:.34;transition:opacity .2s;
 -webkit-mask:url(/_site/logo.svg) center/contain no-repeat;mask:url(/_site/logo.svg) center/contain no-repeat}.credit:hover,.credit:focus-visible{opacity:.8}
@media (max-width:@WIDTH@px) and (min-width:@TABLET@px){.page{zoom:calc(100vw / @WIDTH@px)}}
@media (max-width:@PHONE@px){.page{width:auto;height:auto;padding:24px 20px 8px;display:flex;flex-direction:column;gap:20px}
 .r{display:flex;flex-wrap:wrap;gap:12px 20px;align-items:center}
 .c{position:relative;left:auto!important;top:auto!important;width:auto!important;height:auto!important}
 .c:has(.i,.v){width:100%!important;aspect-ratio:calc(var(--w) / var(--h))}
 .c:has(.s){width:auto!important;min-width:calc(var(--w) * 1px);height:calc(var(--h) * 1px)!important;aspect-ratio:auto}
 .c:not(:has(.i,.v,.s)) .o{position:static;width:auto!important;height:auto!important}
 .t{font-size:clamp(16px,calc(var(--fs) * .62px),40px)!important}
 .c:has(.f){width:100%!important;height:auto!important}.c:has(.f) .o{position:static;width:100%!important;height:auto!important}
 .c:has(.i,.v) .o{width:100%!important;height:100%!important;left:0!important;top:0!important}}"#;

/// `siteStylesheet({ width, height, background })`.
pub fn stylesheet(width: f64, height: f64, background: Option<&JsonValue>) -> String {
    STYLESHEET
        .replace("@BACKGROUND@", &css_color(background, PAGE_BACKGROUND))
        .replace("@WIDTH@", &number(width))
        .replace("@HEIGHT@", &number(height))
        .replace("@TABLET@", &(PHONE_BREAKPOINT_PX + 1).to_string())
        .replace("@PHONE@", &PHONE_BREAKPOINT_PX.to_string())
}
