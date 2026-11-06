// The DAV wire readings both protocol clients share (atome/src/squirrel/contacts/carddav_protocol.js
// and carddav_shared.js, the multistatus readers of both node_protocol_clients.js and the checks of
// shared/dav_collection_read.js, ported): an element's text found by its local name whatever its
// prefix, the `response` blocks, the five XML entities, and the statuses a read depends on. As in
// JavaScript these are pattern readings, not an XML parser; their `/i` matches ASCII letters only.
use crate::vault_router::js;
use regex::Regex;
use std::collections::HashMap;
use std::sync::LazyLock;

// The elements read by name.
const TAGS: [&str; 11] = [
    "sync-token",
    "href",
    "status",
    "getetag",
    "calendar-data",
    "address-data",
    "resourcetype",
    "displayname",
    "current-user-principal",
    "calendar-home-set",
    "addressbook-home-set",
];
// `<(?:[A-Za-z0-9._-]+:)?${tag}\b[^>]*>([\s\S]*?)</(?:[A-Za-z0-9._-]+:)?${tag}>` (`i`).
static ELEMENTS: LazyLock<HashMap<&'static str, Regex>> = LazyLock::new(|| {
    TAGS.iter()
        .map(|tag| {
            let pattern = format!(
                r"<(?:[A-Za-z0-9._-]+:)?(?i-u:{tag})(?-u:\b)[^>]*>((?s:.)*?)</(?:[A-Za-z0-9._-]+:)?(?i-u:{tag})>",
                tag = regex::escape(tag)
            );
            (*tag, Regex::new(&pattern).expect("DAV element"))
        })
        .collect()
});
static RESPONSE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"<(?:[A-Za-z0-9._-]+:)?(?i-u:response)(?-u:\b)[^>]*>(?s:.)*?</(?:[A-Za-z0-9._-]+:)?(?i-u:response)>")
        .expect("DAV response")
});
static WITHIN_LIMITS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"<(?:[A-Za-z0-9_.-]+:)?(?i-u:number-of-matches-within-limits)(?-u:\b)")
        .expect("DAV limits")
});
static INSUFFICIENT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"<(?:[A-Za-z0-9_.-]+:)?(?i-u:status)(?-u:\b)[^>]*>(?i-u:HTTP)/[0-9](?:\.[0-9])? 507(?-u:\b)").expect("DAV 507")
});
static FAILED: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"<(?:[A-Za-z0-9_.-]+:)?(?i-u:status)(?-u:\b)[^>]*>(?i-u:HTTP)/[0-9](?:\.[0-9])? [45][0-9][0-9]").expect("DAV failure")
});
static ROW_507: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?-u:\b)507(?-u:\b)").expect("507"));
static CALENDAR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"<(?:[A-Za-z0-9._-]+:)?(?i-u:calendar)(?-u:\b)").expect("calendar type")
});
static ADDRESS_BOOK: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"<(?:[A-Za-z0-9._-]+:)?(?i-u:addressbook)(?-u:\b)").expect("address book type")
});
static UNSAFE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i-u:<!DOCTYPE|<!ENTITY)").expect("XML declarations"));

/// `extractTagValue(xml, tag)`: the text of the first such element.
pub fn tag_value<'a>(xml: &'a str, tag: &str) -> Option<&'a str> {
    ELEMENTS[tag]
        .captures(xml)
        .and_then(|found| found.get(1))
        .map(|text| text.as_str())
}

/// `extractResponseBlocks(xml)`.
pub fn response_blocks(xml: &str) -> Vec<&str> {
    RESPONSE
        .find_iter(xml)
        .map(|found| found.as_str())
        .collect()
}

/// `xmlDecode(value)`.
pub fn decode(value: &str) -> String {
    value
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&")
}

/// `escapeXml(value)`.
pub fn escape(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

/// `normalizeText(xmlDecode(extractTagValue(xml, tag) || '')) || null`.
pub fn text_of(xml: &str, tag: &str) -> Option<String> {
    let text = js::trim(&decode(tag_value(xml, tag).unwrap_or_default())).to_string();
    (!text.is_empty()).then_some(text)
}

/// `extractHrefFromProperty(xml, tag)`: the href inside that element.
pub fn href_of(xml: &str, tag: &str) -> Option<String> {
    tag_value(xml, tag)
        .filter(|content| !content.is_empty())
        .and_then(|content| text_of(content, "href"))
}

/// `limited(xml)`: the server cut the answer (`number-of-matches-within-limits`, a 507 status).
pub fn limited(xml: &str) -> bool {
    WITHIN_LIMITS.is_match(xml) || INSUFFICIENT.is_match(xml)
}

/// A listing block answering 4xx or 5xx.
pub fn failed(block: &str) -> bool {
    FAILED.is_match(block)
}

/// A delta row answering 507 (`/\b507\b/` on its status).
pub fn insufficient(status: Option<&str>) -> bool {
    ROW_507.is_match(status.unwrap_or_default())
}

/// `hasCalendarCollectionType` / `hasAddressBookCollectionType`: its resourcetype names it.
pub fn collection(block: &str, contact: bool) -> bool {
    let kind = tag_value(block, "resourcetype").unwrap_or_default();
    if contact {
        ADDRESS_BOOK.is_match(kind)
    } else {
        CALENDAR.is_match(kind)
    }
}

/// `/<!DOCTYPE|<!ENTITY/i`: an answer that declares anything.
pub fn declares(text: &str) -> bool {
    UNSAFE.is_match(text)
}

/// One `response` of a multistatus (`parseMultiStatus`, either client): its object data is
/// `address-data` or `calendar-data`.
pub struct Row {
    pub href: Option<String>,
    pub status: Option<String>,
    pub etag: Option<String>,
    pub deleted: bool,
    pub data: Option<String>,
}

/// `parseMultiStatus(xml)`: the trimmed sync token and the rows.
pub fn multistatus(xml: &str, data: &str) -> (Option<String>, Vec<Row>) {
    let rows = response_blocks(xml)
        .into_iter()
        .map(|block| {
            let status = text_of(block, "status");
            let found = tag_value(block, data).filter(|found| !found.is_empty());
            Row {
                href: text_of(block, "href"),
                deleted: found.is_none()
                    && status
                        .as_deref()
                        .is_some_and(|status| status.contains("404")),
                status,
                etag: text_of(block, "getetag"),
                data: found.map(decode),
            }
        })
        .collect();
    (text_of(xml, "sync-token"), rows)
}

/// What CardDAV and CalDAV write differently: their namespace and prefix, the object data, the
/// multiget, the home set, the query and the failure label of `ensureOkResponse`.
pub struct Protocol {
    pub contact: bool,
    pub prefix: &'static str,
    pub namespace: &'static str,
    pub data: &'static str,
    pub multiget: &'static str,
    pub home: &'static str,
    pub label: &'static str,
    pub query: &'static str,
}

pub const CARDDAV: Protocol = Protocol {
    contact: true,
    prefix: "card",
    namespace: "urn:ietf:params:xml:ns:carddav",
    data: "address-data",
    multiget: "addressbook-multiget",
    home: "addressbook-home-set",
    label: "carddav_http_failed",
    query: "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<card:addressbook-query xmlns:d=\"DAV:\" xmlns:card=\"urn:ietf:params:xml:ns:carddav\">\n  <d:prop>\n    <d:getetag />\n    <card:address-data />\n  </d:prop>\n</card:addressbook-query>",
};

pub const CALDAV: Protocol = Protocol {
    contact: false,
    prefix: "c",
    namespace: "urn:ietf:params:xml:ns:caldav",
    data: "calendar-data",
    multiget: "calendar-multiget",
    home: "calendar-home-set",
    label: "caldav_http_failed",
    query: "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<c:calendar-query xmlns:d=\"DAV:\" xmlns:c=\"urn:ietf:params:xml:ns:caldav\">\n  <d:prop>\n    <d:getetag />\n    <c:calendar-data />\n  </d:prop>\n  <c:filter>\n    <c:comp-filter name=\"VCALENDAR\">\n      <c:comp-filter name=\"VEVENT\">\n        \n      </c:comp-filter>\n    </c:comp-filter>\n  </c:filter>\n</c:calendar-query>",
};

pub const PRINCIPAL: &str = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<d:propfind xmlns:d=\"DAV:\">\n  <d:prop>\n    <d:current-user-principal />\n  </d:prop>\n</d:propfind>";
pub const SYNC_TOKEN: &str =
    "<d:propfind xmlns:d=\"DAV:\"><d:prop><d:sync-token /></d:prop></d:propfind>";
pub const LISTING: &str =
    "<d:propfind xmlns:d=\"DAV:\"><d:prop><d:getetag/><d:resourcetype/></d:prop></d:propfind>";

impl Protocol {
    /// A PROPFIND body asking `names` (the home set, or the collections' name and type).
    pub fn propfind(&self, names: &[&str]) -> String {
        let (prefix, namespace) = (self.prefix, self.namespace);
        let props: String = names
            .iter()
            .map(|name| format!("\n    <{name} />"))
            .collect();
        format!(
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<d:propfind xmlns:d=\"DAV:\" xmlns:{prefix}=\"{namespace}\">\n  <d:prop>{props}\n  </d:prop>\n</d:propfind>"
        )
    }

    /// `buildSyncCollectionBody({ cursor })`.
    pub fn sync_collection(&self, token: &str) -> String {
        let (prefix, namespace, data, token) =
            (self.prefix, self.namespace, self.data, escape(token));
        format!(
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<d:sync-collection xmlns:d=\"DAV:\" xmlns:{prefix}=\"{namespace}\">\n  <d:sync-token>{token}</d:sync-token>\n  <d:sync-level>1</d:sync-level>\n  <d:prop>\n    <d:getetag />\n    <{prefix}:{data} />\n  </d:prop>\n</d:sync-collection>"
        )
    }

    /// The multiget body of a batch of hrefs.
    pub fn multiget(&self, hrefs: &[String]) -> String {
        let (element, namespace, data) = (self.multiget, self.namespace, self.data);
        let listed: String = hrefs
            .iter()
            .map(|href| format!("<d:href>{}</d:href>", escape(href)))
            .collect();
        format!(
            "<c:{element} xmlns:d=\"DAV:\" xmlns:c=\"{namespace}\"><d:prop><d:getetag/><c:{data}/></d:prop>{listed}</c:{element}>"
        )
    }
}
