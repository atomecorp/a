// The CardDAV and CalDAV read clients of a personal import (createNodeCarddavClient and
// createNodeCaldavClient of atome/src/squirrel/{contacts,calendar}/node_protocol_clients.js, with
// shared/dav_collection_read.js, ported): the collections found from the account's root, then each
// collection read whole (its sync token first, then a query, or href listings and bounded multigets
// when the server cuts the query) or from its cursor (sync-collection pages), every object read into
// its canonical item. Nothing is committed here.
use super::super::public_source::parse_url;
use super::dav::{Reply, Session};
use super::vcard;
use super::xml::{self, Protocol};
use crate::vault_router::js;
use atome_calendar::ical;
use base64::Engine;
use indexmap::{IndexMap, IndexSet};
use serde_json::{Map as JsonMap, Value as JsonValue, json};

const MAX_ITEMS: usize = 100_000;
const BATCH: usize = 200;
const PAGES: usize = 64;

/// One canonical contact or event as the collection read hands it on.
pub type Item = JsonMap<String, JsonValue>;

/// A collection the account holds: `{ url, name }`.
pub struct Collection {
    pub url: String,
    pub name: String,
}

/// What a collection read yields: `{ items, removed_hrefs, cursor }` (always complete).
pub struct Read {
    pub items: Vec<Item>,
    pub removed: Vec<String>,
    pub cursor: JsonValue,
}

/// `resolveUrl(base, href)`: the href against the base, the href itself when they do not read as one.
fn resolve_url(base: &str, href: &str) -> String {
    let href = js::trim(href);
    if href.is_empty() {
        return js::trim(base).to_string();
    }
    match parse_url(base, None).and_then(|base| parse_url(href, Some(&base))) {
        Ok(url) => url.to_string(),
        Err(_) => href.to_string(),
    }
}

/// `new URL(href, base).href`.
pub fn absolute(href: &str, base: &str) -> Result<String, String> {
    Ok(parse_url(href, Some(&parse_url(base, None)?))?.to_string())
}

/// `shouldDiscoverAddressBookUrl(url)`: an address naming no collection.
fn root(url: &str) -> bool {
    parse_url(url, None).is_ok_and(|url| url.path().is_empty() || url.path() == "/")
}

pub struct Client<'a> {
    session: Session<'a>,
    protocol: &'static Protocol,
    configured: String,
    authorization: Option<String>,
    // CardDAV's `discoveredAddressBookUrl`.
    discovered: Option<String>,
}

impl<'a> Client<'a> {
    /// The client of one protocol; `buildBasicAuthHeader` reads the trimmed credentials.
    pub fn new(
        session: Session<'a>,
        protocol: &'static Protocol,
        configured: String,
        username: &str,
        password: &str,
    ) -> Self {
        let (user, secret) = (js::trim(username), js::trim(password));
        let authorization = (!user.is_empty() && !secret.is_empty()).then(|| {
            format!(
                "Basic {}",
                base64::engine::general_purpose::STANDARD.encode(format!("{user}:{secret}"))
            )
        });
        Self {
            session,
            protocol,
            configured,
            authorization,
            discovered: None,
        }
    }

    /// `requestXml({ method, url, body, depth })` without its status check.
    async fn request(
        &mut self,
        method: &str,
        url: &str,
        depth: &str,
        body: String,
    ) -> Result<Reply, String> {
        let mut headers = Vec::new();
        if !self.protocol.contact {
            headers.push(("Accept", "application/xml, text/xml".to_string()));
        }
        headers.push(("Content-Type", "application/xml; charset=utf-8".to_string()));
        headers.push(("Depth", depth.to_string()));
        if let Some(authorization) = &self.authorization {
            headers.push(("Authorization", authorization.clone()));
        }
        self.session
            .fetch(js::trim(url), method, &headers, body)
            .await
    }

    /// `requestXml` then `ensureOkResponse`: the text of a 2xx answer.
    async fn xml(
        &mut self,
        method: &str,
        url: &str,
        depth: &str,
        body: String,
    ) -> Result<String, String> {
        let reply = self.request(method, url, depth, body).await?;
        if !reply.ok {
            return Err(format!("{}:{}", self.protocol.label, reply.status));
        }
        Ok(reply.text)
    }

    /// `discoverCollections()`.
    pub async fn collections(&mut self) -> Result<Vec<Collection>, String> {
        let configured = self.configured.clone();
        let (url, found) = self.discover(&configured).await?;
        Ok(found.unwrap_or_else(|| {
            vec![Collection {
                url,
                name: String::new(),
            }]
        }))
    }

    // `discoverAddressBookUrl()` / `discoverCalendarUrl({ calendar_url })`: the collection a read
    // targets and, from a root address, the collections found.
    async fn discover(
        &mut self,
        configured: &str,
    ) -> Result<(String, Option<Vec<Collection>>), String> {
        let (contact, configured) = (self.protocol.contact, js::trim(configured).to_string());
        if !root(&configured) {
            if contact {
                self.discovered = Some(configured.clone());
            }
            return Ok((configured, None));
        }
        // CardDAV needs each href and resolves them against the configured address; CalDAV goes on
        // from the address it asked and resolves the collections against the home.
        let principal = self
            .xml("PROPFIND", &configured, "0", xml::PRINCIPAL.into())
            .await?;
        let principal = match xml::href_of(&principal, "current-user-principal") {
            Some(href) => resolve_url(&configured, &href),
            None if contact => return Err("carddav_principal_discovery_failed".into()),
            None => resolve_url(&configured, &configured),
        };
        let home_body = self
            .protocol
            .propfind(&[&format!("{}:{}", self.protocol.prefix, self.protocol.home)]);
        let home = self.xml("PROPFIND", &principal, "0", home_body).await?;
        let home = match xml::href_of(&home, self.protocol.home) {
            Some(href) => resolve_url(if contact { &configured } else { &principal }, &href),
            None if contact => return Err("carddav_home_set_discovery_failed".into()),
            None => resolve_url(&principal, &principal),
        };
        let listing_body = self.protocol.propfind(&["d:displayname", "d:resourcetype"]);
        let listing = self.xml("PROPFIND", &home, "1", listing_body).await?;
        let blocks: Vec<&str> = xml::response_blocks(&listing)
            .into_iter()
            .filter(|block| xml::collection(block, contact))
            .collect();
        let base = if contact { configured.clone() } else { home };
        // CardDAV targets its first address book (its href decoded and trimmed), CalDAV its first
        // calendar (its href as written).
        let target = if contact {
            let first = blocks.first().and_then(|block| xml::text_of(block, "href"));
            let target = resolve_url(
                &base,
                &first.ok_or("carddav_addressbook_collection_missing")?,
            );
            self.discovered = Some(target.clone());
            target
        } else {
            resolve_url(
                &base,
                blocks
                    .first()
                    .and_then(|block| xml::tag_value(block, "href"))
                    .unwrap_or_default(),
            )
        };
        let collections: Vec<Collection> = blocks
            .iter()
            .map(|block| Collection {
                url: resolve_url(
                    &base,
                    &xml::decode(xml::tag_value(block, "href").unwrap_or_default()),
                ),
                name: xml::decode(xml::tag_value(block, "displayname").unwrap_or_default()),
            })
            .collect();
        if !contact && collections.is_empty() {
            return Err("dav_collection_missing".into());
        }
        Ok((target, Some(collections)))
    }

    // The collection a read targets: CardDAV's `ensureAddressBookUrl` (the address itself, else the
    // one discovered), CalDAV's `discoverCalendarUrl` from that address again.
    async fn target(&mut self, url: &str) -> Result<String, String> {
        let url = js::trim(url).to_string();
        if !self.protocol.contact {
            return Ok(self.discover(&url).await?.0);
        }
        if !url.is_empty() && !root(&url) {
            return Ok(url);
        }
        if let Some(discovered) = self.discovered.clone() {
            return Ok(discovered);
        }
        let configured = self.configured.clone();
        Ok(self.discover(&configured).await?.0)
    }

    /// `fetchInitialContacts` / `fetchInitialCalendar` (no cursor) or `fetchDelta` (a truthy one).
    pub async fn read(&mut self, url: &str, cursor: Option<&JsonValue>) -> Result<Read, String> {
        let target = self.target(url).await?;
        match cursor {
            Some(cursor) => self.delta(&target, url, cursor).await,
            None => self.initial(&target).await,
        }
    }

    // `normalizeCarddavResponseItems` / `normalizeCalendarResponseItems`.
    fn normalize(
        &self,
        rows: Vec<xml::Row>,
        collection: &str,
    ) -> Result<(Vec<Item>, Vec<String>), String> {
        let (mut items, mut removed, contact) = (Vec::new(), Vec::new(), self.protocol.contact);
        let collection = js::trim(collection).to_string();
        for row in rows {
            if row.deleted {
                removed.extend(row.href);
                continue;
            }
            let data = row.data.unwrap_or_default();
            let parsed = if contact {
                vec![vcard::parse(&data)?]
            } else {
                ical::parse(&data)?
            };
            for mut item in parsed {
                let id = item
                    .get("id")
                    .filter(|id| js::truthy(Some(id)))
                    .map(js::string);
                let id = id.or_else(|| row.href.clone()).unwrap_or_default();
                item.insert("id".into(), json!(js::trim(&id)));
                if contact {
                    let book = if collection.is_empty() {
                        JsonValue::Null
                    } else {
                        json!(collection)
                    };
                    item.insert("addressbookId".into(), book);
                } else {
                    item.insert("calendarId".into(), json!(collection));
                }
                item.insert("href".into(), json!(row.href));
                item.insert("etag".into(), json!(row.etag));
                if contact {
                    item.insert("raw_vcard".into(), json!(data));
                }
                items.push(item);
            }
        }
        Ok((items, removed))
    }

    // `readDavInitial`.
    async fn initial(&mut self, url: &str) -> Result<Read, String> {
        let token = self
            .xml("PROPFIND", url, "0", xml::SYNC_TOKEN.into())
            .await?;
        let cursor = xml::decode(xml::tag_value(&token, "sync-token").unwrap_or_default());
        let cursor = if cursor.is_empty() {
            JsonValue::Null
        } else {
            json!(cursor)
        };
        let answer = self
            .xml("REPORT", url, "1", self.protocol.query.into())
            .await?;
        if !xml::limited(&answer) {
            let (items, removed) =
                self.normalize(xml::multistatus(&answer, self.protocol.data).1, url)?;
            return Ok(Read {
                items,
                removed,
                cursor,
            });
        }
        let listing = self.xml("PROPFIND", url, "1", xml::LISTING.into()).await?;
        if xml::limited(&listing) {
            return Err("dav_listing_incomplete".into());
        }
        let mut hrefs = Vec::new();
        for block in xml::response_blocks(&listing) {
            let href = xml::decode(xml::tag_value(block, "href").unwrap_or_default());
            if href.is_empty() || href.ends_with('/') || absolute(&href, url)? == url {
                continue;
            }
            if xml::failed(block) {
                return Err("dav_listing_incomplete".into());
            }
            hrefs.push(href);
        }
        if hrefs.len() > MAX_ITEMS {
            return Err("dav_items_limit".into());
        }
        let mut pages = Vec::new();
        for batch in hrefs.chunks(BATCH) {
            let answer = self
                .xml("REPORT", url, "1", self.protocol.multiget(batch))
                .await?;
            if xml::limited(&answer) {
                return Err("dav_multiget_incomplete".into());
            }
            let (_, rows) = xml::multistatus(&answer, self.protocol.data);
            // `batch.some(href => !rows.some(row => row.href && same(row.href, href)))`, as lazily.
            for href in batch {
                let mut answered = false;
                for row in &rows {
                    if let Some(found) = &row.href
                        && absolute(found, url)? == absolute(href, url)?
                    {
                        answered = true;
                        break;
                    }
                }
                if !answered {
                    return Err("dav_multiget_incomplete".into());
                }
            }
            pages.push(self.normalize(rows, url)?);
        }
        let (items, removed) = merge(pages);
        Ok(Read {
            items,
            removed,
            cursor,
        })
    }

    // `readDavDelta`: sync-collection pages from the cursor, a refused token read again whole.
    async fn delta(
        &mut self,
        url: &str,
        configured: &str,
        cursor: &JsonValue,
    ) -> Result<Read, String> {
        // The cursor is truthy (the handler reads a falsy one whole), and so is every next token.
        let (mut pages, mut next) = (Vec::new(), cursor.clone());
        for _ in 0..PAGES {
            let body = self.protocol.sync_collection(&js::text(Some(&next)));
            let reply = self.request("REPORT", url, "1", body).await?;
            if !reply.ok {
                if reply.status == 403 && reply.text.contains("valid-sync-token") {
                    // `initial()`: the collection read whole, its target found again.
                    let target = self.target(configured).await?;
                    return self.initial(&target).await;
                }
                return Err(format!("{}:{}", self.protocol.label, reply.status));
            }
            let (token, rows) = xml::multistatus(&reply.text, self.protocol.data);
            let rows = rows
                .into_iter()
                .filter(|row| !xml::insufficient(row.status.as_deref()))
                .collect();
            pages.push(self.normalize(rows, url)?);
            let found = token
                .clone()
                .map_or_else(|| next.clone(), JsonValue::String);
            if !xml::limited(&reply.text) {
                let (items, removed) = merge(pages);
                return Ok(Read {
                    items,
                    removed,
                    cursor: found,
                });
            }
            if token.is_none() || found == next {
                return Err("dav_continuation_missing".into());
            }
            next = found;
        }
        Err("dav_pages_limit".into())
    }
}

// `item.href || item.id`-style key part: the first truthy value, else the last, as JSON.
fn key_part(item: &Item, keys: &[&str], last: JsonValue) -> String {
    let value = keys
        .iter()
        .filter_map(|key| item.get(*key))
        .find(|value| js::truthy(Some(value)));
    value.cloned().unwrap_or(last).to_string()
}

/// `mergePages(pages)`: one item per (href, uid, recurrence), a removal undone by a later item.
fn merge(pages: Vec<(Vec<Item>, Vec<String>)>) -> (Vec<Item>, Vec<String>) {
    let mut items: IndexMap<(String, String, String), Item> = IndexMap::new();
    let mut removed: IndexSet<String> = IndexSet::new();
    for (page_items, page_removed) in pages {
        for href in page_removed {
            items.retain(|_, item| {
                item.get("href").and_then(JsonValue::as_str) != Some(href.as_str())
            });
            removed.insert(href);
        }
        for item in page_items {
            if let Some(href) = item.get("href").and_then(JsonValue::as_str) {
                removed.shift_remove(href);
            }
            let id = item.get("id").cloned().unwrap_or(JsonValue::Null);
            let key = (
                key_part(&item, &["href", "id"], id.clone()),
                key_part(&item, &["uid", "id"], id),
                key_part(&item, &["recurrence_id"], json!("")),
            );
            items.insert(key, item);
        }
    }
    (items.into_values().collect(), removed.into_iter().collect())
}
