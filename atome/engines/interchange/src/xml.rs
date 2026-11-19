//! A small element tree read with quick-xml, for the XML formats (DAWproject,
//! FCPXML). Hostile documents are refused, never guessed at: a DOCTYPE may name
//! its root only (no internal subset, no entity declaration), only the five
//! predefined entities and character references are read, and the depth and the
//! element count are capped.

use crate::ImportError;
use quick_xml::events::{BytesStart, Event};
use quick_xml::{Reader, XmlVersion};

const MAX_DEPTH: usize = 256;
const MAX_ELEMENTS: usize = 2_000_000;

/// One element: its local name, its attributes, its children and its text.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Element {
    /// The local name (no namespace prefix).
    pub name: String,
    /// The attributes, in document order, values unescaped.
    pub attributes: Vec<(String, String)>,
    /// The child elements, in order.
    pub children: Vec<Element>,
    /// The text directly inside it, unescaped and joined.
    pub text: String,
}

impl Element {
    /// An attribute's value.
    pub fn attr(&self, name: &str) -> Option<&str> {
        self.attributes
            .iter()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.as_str())
    }

    /// The first child named `name`.
    pub fn child(&self, name: &str) -> Option<&Element> {
        self.children.iter().find(|child| child.name == name)
    }

    /// The children named `name`.
    pub fn children_named<'a>(&'a self, name: &'a str) -> impl Iterator<Item = &'a Element> + 'a {
        self.children.iter().filter(move |child| child.name == name)
    }

    /// An attribute read as a float (`None` when absent; an error when unreadable).
    pub fn f64_attr(&self, name: &str, code: &str) -> Result<Option<f64>, ImportError> {
        match self.attr(name) {
            None => Ok(None),
            Some(text) => text
                .trim()
                .parse::<f64>()
                .ok()
                .filter(|value| value.is_finite())
                .map(Some)
                .ok_or_else(|| {
                    ImportError::new(
                        code,
                        format!("<{}> {name}={text:?} is not a number", self.name),
                    )
                }),
        }
    }

    /// An attribute read as a boolean (`true`/`false`/`1`/`0`).
    pub fn bool_attr(&self, name: &str) -> Option<bool> {
        match self.attr(name)?.trim() {
            "true" | "1" => Some(true),
            "false" | "0" => Some(false),
            _ => None,
        }
    }
}

fn local_name(bytes: &[u8]) -> String {
    let text = String::from_utf8_lossy(bytes);
    match text.rsplit_once(':') {
        Some((_, local)) => local.to_string(),
        None => text.into_owned(),
    }
}

fn element(start: &BytesStart<'_>, code: &str) -> Result<Element, ImportError> {
    let mut attributes = Vec::new();
    for attribute in start.attributes() {
        let attribute =
            attribute.map_err(|error| ImportError::new(code, format!("XML attribute: {error}")))?;
        let value = attribute
            .normalized_value(XmlVersion::Implicit1_0)
            .map_err(|error| ImportError::new(code, format!("XML attribute: {error}")))?;
        attributes.push((local_name(attribute.key.as_ref()), value.into_owned()));
    }
    Ok(Element {
        name: local_name(start.name().as_ref()),
        attributes,
        children: Vec::new(),
        text: String::new(),
    })
}

fn predefined(name: &str) -> Option<char> {
    match name {
        "lt" => Some('<'),
        "gt" => Some('>'),
        "amp" => Some('&'),
        "apos" => Some('\''),
        "quot" => Some('"'),
        _ => None,
    }
}

/// Parses `text` into its root element; `code` prefixes the error codes
/// (`dawproject_xml_invalid`, `fcpxml_xml_invalid`).
pub fn parse(text: &str, code: &str) -> Result<Element, ImportError> {
    let fail = |message: String| ImportError::new(code, message);
    let mut reader = Reader::from_str(text);
    let mut stack: Vec<Element> = Vec::new();
    let mut root: Option<Element> = None;
    let mut count = 0usize;
    loop {
        let event = reader
            .read_event()
            .map_err(|error| fail(format!("XML: {error}")))?;
        match event {
            Event::Start(_) | Event::Empty(_) if root.is_some() => {
                return Err(fail("XML has content after its root element".into()));
            }
            Event::Start(start) => {
                count += 1;
                if stack.len() >= MAX_DEPTH || count > MAX_ELEMENTS {
                    return Err(fail("XML nests too deep or holds too many elements".into()));
                }
                stack.push(element(&start, code)?);
            }
            Event::Empty(start) => {
                count += 1;
                if count > MAX_ELEMENTS {
                    return Err(fail("XML holds too many elements".into()));
                }
                let leaf = element(&start, code)?;
                match stack.last_mut() {
                    Some(parent) => parent.children.push(leaf),
                    None => root = Some(leaf),
                }
            }
            Event::End(_) => {
                let done = stack
                    .pop()
                    .ok_or_else(|| fail("XML closes an element never opened".into()))?;
                match stack.last_mut() {
                    Some(parent) => parent.children.push(done),
                    None => root = Some(done),
                }
            }
            Event::Text(text) => {
                if let Some(current) = stack.last_mut() {
                    let decoded = text
                        .decode()
                        .map_err(|error| fail(format!("XML text: {error}")))?;
                    current.text.push_str(&decoded);
                }
            }
            Event::CData(data) => {
                if let Some(current) = stack.last_mut() {
                    let decoded = data
                        .decode()
                        .map_err(|error| fail(format!("XML text: {error}")))?;
                    current.text.push_str(&decoded);
                }
            }
            Event::GeneralRef(reference) => {
                let character =
                    if reference.is_char_ref() {
                        reference
                            .resolve_char_ref()
                            .map_err(|error| fail(format!("XML reference: {error}")))?
                    } else {
                        let name = reference
                            .decode()
                            .map_err(|error| fail(format!("XML reference: {error}")))?;
                        Some(predefined(&name).ok_or_else(|| {
                            fail(format!("XML entity &{name}; is not predefined"))
                        })?)
                    };
                if let (Some(current), Some(character)) = (stack.last_mut(), character) {
                    current.text.push(character);
                }
            }
            Event::DocType(doctype) => {
                let body = doctype
                    .decode()
                    .map_err(|error| fail(format!("XML doctype: {error}")))?;
                if body.contains('[')
                    || body.contains("ENTITY")
                    || body.contains("SYSTEM")
                    || body.contains("PUBLIC")
                {
                    return Err(fail("XML doctype declarations are refused".into()));
                }
            }
            Event::Decl(_) | Event::PI(_) | Event::Comment(_) => {}
            Event::Eof => break,
        }
    }
    if !stack.is_empty() {
        return Err(fail(
            "XML ends before its elements close (truncated)".into(),
        ));
    }
    root.ok_or_else(|| fail("XML holds no element".into()))
}
