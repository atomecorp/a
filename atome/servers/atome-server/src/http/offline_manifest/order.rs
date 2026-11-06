// `a.localeCompare(b)` as Node orders the manifest's addresses (server/offline_app_assets.js
// `listed`): ICU's root collation, Node's default `en-US` locale, three levels — the base
// characters, then the accents, then the case (a lower case first). Its key holds the printable
// ASCII characters and the Latin letters they carry an accent of (their canonical decomposition,
// one of the accents below over an ASCII letter); an address with any other character is refused
// by name, never ordered another way. The orders were read from Node 25's ICU
// (temp/l310_offline/ascii_order.mjs, 2026-11-05) and are checked against it by
// tests/atome_server/offline_manifest.rs.
use icu_normalizer::DecomposingNormalizerBorrowed;

// The printable ASCII characters by their base weight; a letter's two cases share one.
const BASES: [&str; 69] = [
    " ", "_", "-", ",", ";", ":", "!", "?", ".", "'", "\"", "(", ")", "[", "]", "{", "}", "@", "*",
    "/", "\\", "&", "#", "%", "`", "^", "+", "<", "=", ">", "|", "~", "$", "0", "1", "2", "3", "4",
    "5", "6", "7", "8", "9", "aA", "bB", "cC", "dD", "eE", "fF", "gG", "hH", "iI", "jJ", "kK",
    "lL", "mM", "nN", "oO", "pP", "qQ", "rR", "sS", "tT", "uU", "vV", "wW", "xX", "yY", "zZ",
];

// Each ASCII character's base weight (BASES' rank, from 1), none for the others.
const BASE_OF: [u8; 128] = {
    let mut table = [0; 128];
    let mut rank = 0;
    while rank < BASES.len() {
        let group = BASES[rank].as_bytes();
        let mut at = 0;
        while at < group.len() {
            table[group[at] as usize] = rank as u8 + 1;
            at += 1;
        }
        rank += 1;
    }
    table
};

// The accents of the Latin letters, by their accent weight: acute, grave, breve, circumflex,
// caron, ring, diaeresis, double acute, tilde, dot above, cedilla, ogonek, macron.
const ACCENTS: [char; 13] = [
    '\u{301}', '\u{300}', '\u{306}', '\u{302}', '\u{30c}', '\u{30a}', '\u{308}', '\u{30b}',
    '\u{303}', '\u{307}', '\u{327}', '\u{328}', '\u{304}',
];

/// An address's collation key: its base weights, its accent weights, its case weights, compared
/// one level after the other as ICU compares them.
pub type Key = (Vec<u8>, Vec<u8>, Vec<u8>);

/// The key of `text`, or the refusal naming the address that holds a character it cannot order.
pub fn key(text: &str) -> Result<Key, String> {
    let (mut bases, mut accents, mut cases) = (Vec::new(), Vec::new(), Vec::new());
    let mut after_base = false;
    for c in DecomposingNormalizerBorrowed::new_nfd()
        .normalize(text)
        .chars()
    {
        let base = if c.is_ascii() { BASE_OF[c as usize] } else { 0 };
        if base > 0 {
            bases.push(base);
            accents.push(1);
            cases.push(u8::from(c.is_ascii_uppercase()));
            after_base = true;
        } else if let Some(accent) = ACCENTS.iter().position(|accent| *accent == c)
            && after_base
        {
            accents.push(accent as u8 + 2);
            cases.push(0);
        } else {
            return Err(format!("offline_manifest_unordered_name:{text}"));
        }
    }
    Ok((bases, accents, cases))
}
