// The objects of a site page as HTML (server/site_projection.js, ported): read in rows, those
// that overlap laid together in one block at their canvas place, each one written from its
// checked properties (css.rs), a link wrapping what an « Aller » interaction makes one.
use super::css::{css_color, css_number, number};
use crate::vault_router::js;
use serde_json::Value as JsonValue;
use std::collections::HashMap;

const ROW_TOLERANCE_PX: f64 = 24.0;

pub(super) fn escape_html(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for c in value.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(c),
        }
    }
    out
}
// `String(value ?? '')`.
pub(super) fn string_of(value: Option<&JsonValue>) -> String {
    match value {
        None | Some(JsonValue::Null) => String::new(),
        value => js::text(value),
    }
}
#[derive(Clone)]
pub(super) struct Item<'a> {
    pub(super) id: String,
    pub(super) kind: String,
    pub(super) props: &'a JsonValue,
    pub(super) left: f64,
    pub(super) top: f64,
    pub(super) width: f64,
    pub(super) height: f64,
    pub(super) style: String,
}
pub(super) struct Link {
    pub(super) href: String,
    pub(super) new_tab: bool,
}
// `a - b` as a sort order.
fn order(difference: f64) -> std::cmp::Ordering {
    difference
        .partial_cmp(&0.0)
        .unwrap_or(std::cmp::Ordering::Equal)
}
pub(super) fn rows_of(mut items: Vec<Item<'_>>) -> Vec<Vec<Item<'_>>> {
    // `a.top - b.top || a.left - b.left`.
    items.sort_by(|a, b| {
        let top = a.top - b.top;
        if top != 0.0 && !top.is_nan() {
            order(top)
        } else {
            order(a.left - b.left)
        }
    });
    let mut rows: Vec<(f64, Vec<Item<'_>>)> = Vec::new();
    for item in items {
        match rows
            .iter_mut()
            .find(|(top, _)| (item.top - *top).abs() < ROW_TOLERANCE_PX)
        {
            Some((_, row)) => row.push(item),
            None => rows.push((item.top, vec![item])),
        }
    }
    rows.into_iter()
        .map(|(_, mut row)| {
            row.sort_by(|a, b| order(a.left - b.left));
            row
        })
        .collect()
}
fn overlaps(a: &Item<'_>, b: &Item<'_>) -> bool {
    a.left < b.left + b.width
        && b.left < a.left + a.width
        && a.top < b.top + b.height
        && b.top < a.top + a.height
}
pub(super) struct Context<'a> {
    pub(super) links: &'a HashMap<String, Link>,
    pub(super) media: &'a HashMap<String, String>,
    pub(super) site_id: &'a str,
    pub(super) ink: &'static str,
}
fn anchor(class: &str, style: &str, link: &Link, inner: &str) -> String {
    let tab = if link.new_tab {
        " target=\"_blank\" rel=\"noopener noreferrer\""
    } else {
        ""
    };
    format!(
        "<a class=\"{class}\"  style=\"{style}\" href=\"{}\"{tab}>{inner}</a>",
        escape_html(&link.href)
    )
}
fn form_html(item: &Item<'_>, context: &Context<'_>) -> String {
    format!(
        "<form class=\"o f\"  style=\"{};--accent:{};--ink:{}\" method=\"post\" action=\"/_site/contact\">
<input type=\"hidden\" name=\"site\" value=\"{}\"><input type=\"hidden\" name=\"form\" value=\"{}\">
<label class=\"hp\" aria-hidden=\"true\">Ne pas remplir<input name=\"website\" tabindex=\"-1\" autocomplete=\"off\"></label>
<label>Nom<input name=\"name\" autocomplete=\"name\" required maxlength=\"120\"></label>
<label>E-mail<input name=\"email\" type=\"email\" autocomplete=\"email\" required maxlength=\"254\"></label>
<label>Message<textarea name=\"message\" rows=\"5\" required maxlength=\"4000\"></textarea></label>
<p class=\"consent\">Vos coordonnées servent seulement à vous répondre.</p><button type=\"submit\">Envoyer</button></form>",
        item.style,
        css_color(item.props.get("color"), "#a9b2ff"),
        context.ink,
        escape_html(context.site_id),
        escape_html(&item.id)
    )
}
fn object_html(item: &mut Item<'_>, origin: (f64, f64), context: &Context<'_>) -> String {
    let p = item.props;
    let link = context.links.get(&item.id);
    let mut style = vec![
        format!("left:{}px", number(item.left - origin.0)),
        format!("top:{}px", number(item.top - origin.1)),
        format!("width:{}px", number(item.width)),
        format!("height:{}px", number(item.height)),
        format!(
            "z-index:{}",
            number((css_number(p.get("z_index"), 0.0) + 0.5).floor())
        ),
    ];
    if js::truthy(p.get("border_radius")) {
        style.push(format!(
            "border-radius:{}px",
            number(css_number(p.get("border_radius"), 0.0))
        ));
    }
    item.style = style.join(";");
    let wrap = |inner: String| match link {
        Some(link) => anchor("o", &item.style, link, &inner),
        None => inner,
    };
    match item.kind.as_str() {
        "text" => {
            let align = p
                .get("text_align")
                .and_then(JsonValue::as_str)
                .filter(|align| ["left", "center", "right", "justify"].contains(align))
                .unwrap_or("left");
            let font_size = number(css_number(p.get("font_size"), 16.0));
            let style = format!(
                "{};color:{};font-size:{font_size}px;font-weight:{};line-height:{};--fs:{font_size};text-align:{align}",
                item.style,
                css_color(p.get("color"), context.ink),
                number(css_number(p.get("font_weight"), 400.0)),
                number(css_number(p.get("line_height"), 1.2)),
            );
            let inner = escape_html(&string_of(p.get("text"))).replace('\n', "<br>");
            match link {
                Some(link) => anchor("o t", &style, link, &inner),
                None => format!("<div class=\"o t\"  style=\"{style}\">{inner}</div>"),
            }
        }
        "shape" | "group" => {
            let ground = [p.get("color"), p.get("background"), p.get("fill")]
                .into_iter()
                .find(|value| js::truthy(*value))
                .flatten();
            let placed = if link.is_some() {
                "position:absolute;inset:0;border-radius:inherit"
            } else {
                &item.style
            };
            let gap = if link.is_some() { "" } else { " " };
            wrap(format!(
                "<div class=\"o s\"{gap} style=\"{placed};background:{}\"></div>",
                css_color(ground, "transparent")
            ))
        }
        "form" => form_html(item, context),
        kind => {
            let media = context.media.get(&item.id).cloned().unwrap_or_default();
            if kind == "video" {
                return format!(
                    "<video class=\"o v\"  style=\"{}\" src=\"{media}\" controls preload=\"metadata\" playsinline></video>",
                    item.style
                );
            }
            if kind == "audio" || kind == "sound" {
                return format!(
                    "<audio class=\"o\"  style=\"{}\" src=\"{media}\" controls preload=\"none\"></audio>",
                    item.style
                );
            }
            let alt = [p.get("alt"), p.get("name")]
                .into_iter()
                .find(|value| js::truthy(*value))
                .flatten();
            let placed = if link.is_some() {
                "position:absolute;inset:0;width:100%;height:100%;border-radius:inherit"
            } else {
                &item.style
            };
            let gap = if link.is_some() { "" } else { " " };
            wrap(format!(
                "<img class=\"o i\"{gap} style=\"{placed}\" src=\"{media}\" alt=\"{}\" loading=\"lazy\">",
                escape_html(&string_of(alt))
            ))
        }
    }
}
pub(super) fn row_html(row: Vec<Item<'_>>, context: &Context<'_>) -> String {
    let mut clusters: Vec<Vec<Item<'_>>> = Vec::new();
    for item in row {
        match clusters
            .iter_mut()
            .find(|cluster| cluster.iter().any(|other| overlaps(other, &item)))
        {
            Some(cluster) => cluster.push(item),
            None => clusters.push(vec![item]),
        }
    }
    let mut html = String::from("<div class=\"r\">");
    for mut members in clusters {
        let fold = |pick: &dyn Fn(&Item<'_>) -> f64, min: bool| {
            members.iter().map(pick).fold(
                if min {
                    f64::INFINITY
                } else {
                    f64::NEG_INFINITY
                },
                |a, b| {
                    if min { a.min(b) } else { a.max(b) }
                },
            )
        };
        let left = fold(&|i| i.left, true);
        let top = fold(&|i| i.top, true);
        let width = fold(&|i| i.left + i.width, false) - left;
        let height = fold(&|i| i.top + i.height, false) - top;
        let (w, h) = (number(width), number(height));
        html.push_str(&format!(
            "<div class=\"c\" style=\"--w:{w};--h:{h};width:{w}px;height:{h}px;left:{}px;top:{}px\">",
            number(left),
            number(top)
        ));
        for item in &mut members {
            html.push_str(&object_html(item, (left, top), context));
        }
        html.push_str("</div>");
    }
    html.push_str("</div>");
    html
}
