//! The text of a PDF laid as positioned runs, read from its content streams with lopdf. lopdf's own
//! `Document::extract_text` gives a page's text without positions, which mixes a table's columns; here a run is
//! the text drawn from one text positioning operator (Td, TD, T*, Tm, ' and ") to the next, with its exact
//! start, its baseline and its drawn size. The glyphs' widths are never needed: only a run's start is used. The
//! thesaurus's mechanism (left column) and conduct (right column) are told apart by the start of their runs.
//! The text is decoded by each font's own encoding as lopdf reads it (its `/Encoding`, else its ToUnicode CMap).

use lopdf::{
    DEFAULT_MAX_DECOMPRESSED_SIZE, Dictionary, Document, Encoding, Object, content::Content,
};
use std::collections::BTreeMap;

/// One horizontal piece of text on a page, top-down coordinates in PDF points.
#[derive(Debug, Clone, PartialEq)]
pub struct Run {
    pub page: u32,
    /// Start of the run, exact: every run begins at a text positioning operator.
    pub x: f64,
    /// Baseline, measured from the top of the page.
    pub y: f64,
    pub size: f64,
    pub text: String,
}

/// An affine matrix [a b c d e f], points as row vectors (PDF 32000-1 § 8.3.4).
#[derive(Clone, Copy)]
struct Matrix([f64; 6]);

const IDENTITY: Matrix = Matrix([1.0, 0.0, 0.0, 1.0, 0.0, 0.0]);

impl Matrix {
    /// `self` then `then`.
    fn then(self, then: Matrix) -> Matrix {
        let [a, b, c, d, e, f] = self.0;
        let [p, q, r, s, t, u] = then.0;
        Matrix([
            a * p + b * r,
            a * q + b * s,
            c * p + d * r,
            c * q + d * s,
            e * p + f * r + t,
            e * q + f * s + u,
        ])
    }

    fn translation(x: f64, y: f64) -> Matrix {
        Matrix([1.0, 0.0, 0.0, 1.0, x, y])
    }
}

fn number(object: &Object) -> Result<f64, String> {
    match object {
        Object::Integer(value) => Ok(*value as f64),
        Object::Real(value) => Ok(f64::from(*value)),
        other => Err(format!("pdf_operand_not_a_number: {other:?}")),
    }
}

fn numbers<const N: usize>(operands: &[Object]) -> Result<[f64; N], String> {
    let values: Vec<f64> = operands.iter().map(number).collect::<Result<_, _>>()?;
    values
        .try_into()
        .map_err(|values: Vec<f64>| format!("pdf_operands: {} instead of {N}", values.len()))
}

#[derive(Clone)]
struct State {
    ctm: Matrix,
    font: Option<Vec<u8>>,
    font_size: f64,
    scaling: f64,
    leading: f64,
    rise: f64,
}

struct Page<'a> {
    document: &'a Document,
    number: u32,
    height: f64,
    encodings: BTreeMap<(Vec<u8>, usize), Encoding<'a>>,
    current: Option<Run>,
    runs: Vec<Run>,
}

impl<'a> Page<'a> {
    fn close(&mut self) {
        if let Some(run) = self.current.take()
            && !run.text.trim().is_empty()
        {
            self.runs.push(run);
        }
    }

    /// The font `name` of `resources`, its encoding read once per resources dictionary.
    fn encoding(
        &mut self,
        resources: &'a Dictionary,
        name: &[u8],
    ) -> Result<&Encoding<'a>, String> {
        let key = (name.to_vec(), std::ptr::from_ref(resources) as usize);
        if !self.encodings.contains_key(&key) {
            let fonts = self
                .document
                .get_dict_in_dict(resources, b"Font")
                .map_err(|error| format!("pdf_fonts page {}: {error}", self.number))?;
            let font = self
                .document
                .get_dict_in_dict(fonts, name)
                .map_err(|error| format!("pdf_font page {}: {error}", self.number))?;
            let encoding = font
                .get_font_encoding_with_limit(self.document, DEFAULT_MAX_DECOMPRESSED_SIZE)
                .map_err(|error| format!("pdf_font_encoding page {}: {error}", self.number))?;
            self.encodings.insert(key.clone(), encoding);
        }
        Ok(&self.encodings[&key])
    }

    /// Text drawn at the text matrix: it joins the current run unless it lies on another baseline.
    fn show(&mut self, state: &State, tm: Matrix, text: String) {
        let trm = Matrix([state.scaling, 0.0, 0.0, 1.0, 0.0, state.rise])
            .then(tm)
            .then(state.ctm);
        let [a, _, _, d, e, f] = trm.0;
        let size = ((a * state.font_size) * (d * state.font_size)).abs().sqrt();
        let y = self.height - f;
        if self
            .current
            .as_ref()
            .is_some_and(|run| (run.y - y).abs() > run.size / 3.0)
        {
            self.close();
        }
        match self.current.as_mut() {
            Some(run) => run.text.push_str(&text),
            None => {
                self.current = Some(Run {
                    page: self.number,
                    x: e,
                    y,
                    size,
                    text,
                })
            }
        }
    }

    fn decode(
        &mut self,
        resources: &'a Dictionary,
        state: &State,
        bytes: &[u8],
    ) -> Result<String, String> {
        let font = state
            .font
            .clone()
            .ok_or_else(|| format!("pdf_text_without_font page {}", self.number))?;
        let encoding = self.encoding(resources, &font)?;
        Document::decode_text(encoding, bytes)
            .map_err(|error| format!("pdf_text_undecodable: {error}"))
    }

    /// One content stream (a page's, or a form's) with its resources.
    fn stream(
        &mut self,
        data: &[u8],
        resources: &'a Dictionary,
        mut state: State,
    ) -> Result<(), String> {
        let content = Content::decode(data)
            .map_err(|error| format!("pdf_content page {}: {error}", self.number))?;
        let mut stack: Vec<State> = Vec::new();
        let (mut tm, mut tlm) = (IDENTITY, IDENTITY);
        for operation in &content.operations {
            let operands = operation.operands.as_slice();
            // T*, and the move ' and " make before their text.
            let next_line = |tlm: &mut Matrix, tm: &mut Matrix, page: &mut Self, leading: f64| {
                *tlm = Matrix::translation(0.0, -leading).then(*tlm);
                *tm = *tlm;
                page.close();
            };
            match operation.operator.as_str() {
                "q" => stack.push(state.clone()),
                "Q" => {
                    state = stack
                        .pop()
                        .ok_or_else(|| format!("pdf_unbalanced_q page {}", self.number))?
                }
                "cm" => state.ctm = Matrix(numbers::<6>(operands)?).then(state.ctm),
                "BT" | "ET" => (tm, tlm) = (IDENTITY, IDENTITY),
                "Tf" => {
                    let name = operands.first().and_then(|name| name.as_name().ok());
                    state.font = Some(name.ok_or("pdf_tf_without_name")?.to_vec());
                    state.font_size = number(operands.get(1).ok_or("pdf_tf_without_size")?)?;
                }
                "Tz" => state.scaling = numbers::<1>(operands)?[0] / 100.0,
                "TL" => state.leading = numbers::<1>(operands)?[0],
                "Ts" => state.rise = numbers::<1>(operands)?[0],
                "Tm" => {
                    tlm = Matrix(numbers::<6>(operands)?);
                    tm = tlm;
                    self.close();
                }
                "Td" | "TD" => {
                    let [x, y] = numbers::<2>(operands)?;
                    if operation.operator == "TD" {
                        state.leading = -y;
                    }
                    tlm = Matrix::translation(x, y).then(tlm);
                    tm = tlm;
                    self.close();
                }
                "T*" => next_line(&mut tlm, &mut tm, self, state.leading),
                "Tj" | "'" | "\"" => {
                    if operation.operator != "Tj" {
                        next_line(&mut tlm, &mut tm, self, state.leading);
                    }
                    let bytes = operands
                        .last()
                        .and_then(|text| text.as_str().ok())
                        .ok_or_else(|| format!("pdf_text_operand page {}", self.number))?;
                    let text = self.decode(resources, &state, bytes)?;
                    self.show(&state, tm, text);
                }
                "TJ" => {
                    let parts = operands
                        .first()
                        .and_then(|array| array.as_array().ok())
                        .ok_or_else(|| format!("pdf_tj_operand page {}", self.number))?;
                    for part in parts {
                        match part {
                            Object::String(bytes, _) => {
                                let text = self.decode(resources, &state, bytes)?;
                                self.show(&state, tm, text);
                            }
                            // Before the first glyph, an adjustment moves the run's start; after it, only
                            // glyphs the run already holds.
                            adjustment if self.current.is_none() => {
                                let shift =
                                    -number(adjustment)? / 1000.0 * state.font_size * state.scaling;
                                tm = Matrix::translation(shift, 0.0).then(tm);
                            }
                            _ => {}
                        }
                    }
                }
                "Do" => {
                    let name = operands
                        .first()
                        .and_then(|name| name.as_name().ok())
                        .ok_or("pdf_do_without_name")?;
                    let xobjects = self
                        .document
                        .get_dict_in_dict(resources, b"XObject")
                        .map_err(|error| format!("pdf_xobjects page {}: {error}", self.number))?;
                    let form = xobjects
                        .get(name)
                        .and_then(|object| self.document.dereference(object))
                        .and_then(|(_, object)| object.as_stream())
                        .map_err(|error| format!("pdf_xobject page {}: {error}", self.number))?;
                    if form.dict.get(b"Subtype").and_then(Object::as_name).ok()
                        == Some(b"Form".as_slice())
                    {
                        let inner = match form.dict.get(b"Resources") {
                            Ok(object) => self
                                .document
                                .dereference(object)
                                .and_then(|(_, object)| object.as_dict())
                                .map_err(|error| {
                                    format!("pdf_form_resources page {}: {error}", self.number)
                                })?,
                            Err(_) => resources,
                        };
                        let matrix = match form.dict.get(b"Matrix") {
                            Ok(Object::Array(values)) => Matrix(numbers::<6>(values)?),
                            _ => IDENTITY,
                        };
                        let data = form
                            .get_plain_content_with_limit(DEFAULT_MAX_DECOMPRESSED_SIZE)
                            .map_err(|error| {
                                format!("pdf_form_content page {}: {error}", self.number)
                            })?;
                        let mut inside = state.clone();
                        inside.ctm = matrix.then(state.ctm);
                        self.stream(&data, inner, inside)?;
                    }
                }
                _ => {}
            }
        }
        Ok(())
    }
}

/// The page's MediaBox, inherited from the page tree when the page has none.
fn media_box<'a>(document: &'a Document, mut node: &'a Dictionary) -> Result<[f64; 4], String> {
    loop {
        if let Ok(Object::Array(values)) = node.get(b"MediaBox") {
            return numbers::<4>(values);
        }
        node = document
            .get_dict_in_dict(node, b"Parent")
            .map_err(|error| format!("pdf_mediabox_missing: {error}"))?;
    }
}

/// The runs of every page of a PDF, page after page, in drawing order.
pub fn pdf_runs(bytes: &[u8]) -> Result<Vec<Run>, String> {
    let document = Document::load_mem(bytes).map_err(|error| format!("pdf_unreadable: {error}"))?;
    if document.is_encrypted() {
        return Err("pdf_encrypted".to_string());
    }
    let empty = Dictionary::new();
    let mut runs = Vec::new();
    for (number, id) in document.get_pages() {
        let dictionary = document
            .get_dictionary(id)
            .map_err(|error| format!("pdf_page {number}: {error}"))?;
        let [_, lly, _, ury] = media_box(&document, dictionary)?;
        let (own, inherited) = document
            .get_page_resources(id)
            .map_err(|error| format!("pdf_resources page {number}: {error}"))?;
        let resources = match (own, inherited.first()) {
            (Some(resources), _) => resources,
            (None, Some(id)) => document
                .get_dictionary(*id)
                .map_err(|error| format!("pdf_resources page {number}: {error}"))?,
            (None, None) => &empty,
        };
        let data = document
            .get_page_content_with_limit(id, DEFAULT_MAX_DECOMPRESSED_SIZE)
            .map_err(|error| format!("pdf_content page {number}: {error}"))?;
        let mut page = Page {
            document: &document,
            number,
            height: ury - lly,
            encodings: BTreeMap::new(),
            current: None,
            runs: Vec::new(),
        };
        let state = State {
            ctm: IDENTITY,
            font: None,
            font_size: 0.0,
            scaling: 1.0,
            leading: 0.0,
            rise: 0.0,
        };
        page.stream(&data, resources, state)?;
        page.close();
        runs.append(&mut page.runs);
    }
    Ok(runs)
}
