// Words the spelling rules below get wrong, as IPA strings (a nasal vowel is
// its vowel plus the combining tilde, which `[...ipa]` keeps as two phonemes).
// Single letters are the elided forms (`t'écoute` is normalized to `t écoute`).
const WORD_EXCEPTIONS = Object.freeze(Object.fromEntries(Object.entries({
    api: 'apei', attends: 'atɑ̃', au: 'o', aux: 'o', bonjour: 'bɔ̃ʒuʁ', c: 's', ce: 'sə', ces: 'se', cet: 'sɛt',
    compte: 'kɔ̃t', d: 'd', de: 'də', des: 'de', es: 'ɛ', est: 'ɛ', et: 'e', eux: 'ø', fait: 'fɛ', femme: 'fam',
    dix: 'dis', http: 'aʃtetepe', huit: 'ɥit', ia: 'ia', mille: 'mil', sept: 'sɛt', six: 'sis', j: 'ʒ', je: 'ʒə', l: 'l', le: 'lə', les: 'le', lui: 'lɥi', m: 'm', mcp: 'ɛmsepe',
    me: 'mə', mes: 'me', monsieur: 'məsjø', n: 'n', ne: 'nə', one: 'wan', openai: 'opɛnai', patientez: 'pasjɑ̃te',
    peut: 'pø', peux: 'pø', plus: 'ply', puis: 'pɥi', qu: 'k', que: 'kə', réessaie: 'ʁeesɛ', s: 's', salut: 'saly',
    se: 'sə', ses: 'se', sms: 'ɛsɛmɛs', souhaites: 'swɛt', suis: 'sɥi', t: 't', te: 'tə', temps: 'tɑ̃', tes: 'te',
    tous: 'tu', tu: 'ty', veux: 'vø', vingt: 'vɛ̃', yeux: 'jø'
}).map(([word, ipa]) => [word, Object.freeze([...ipa])])));

const VOWEL = /[aeiouyàâäéèêëîïôöùûüÿœ]/;
const ELIDED = /^(c|d|j|l|m|n|s|t|qu)$/;
// Final letters that are not pronounced (`temps`, `projets`, `pendant`).
const SILENT_ENDING = /^[dpstxz]+$/;

const SMALL_NUMBERS = Object.freeze([
    'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
    'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize'
]);

const underHundred = (value) => {
    if (value < SMALL_NUMBERS.length) return SMALL_NUMBERS[value];
    if (value < 20) return `dix-${SMALL_NUMBERS[value - 10]}`;
    if (value < 70) {
        const tens = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante'];
        const unit = value % 10;
        return `${tens[Math.floor(value / 10)]}${unit === 0 ? '' : unit === 1 ? ' et un' : `-${SMALL_NUMBERS[unit]}`}`;
    }
    if (value < 80) return `soixante-${underHundred(value - 60)}`;
    const unit = value - 80;
    return `quatre-vingt${unit === 0 ? 's' : `-${underHundred(unit)}`}`;
};

const integerToFrench = (value) => {
    if (value < 100) return underHundred(value);
    if (value < 1000) {
        const hundreds = Math.floor(value / 100);
        const rest = value % 100;
        return `${hundreds === 1 ? '' : `${SMALL_NUMBERS[hundreds]} `}cent${rest === 0 && hundreds > 1 ? 's' : ''}${rest ? ` ${underHundred(rest)}` : ''}`;
    }
    if (value < 1000000) {
        const thousands = Math.floor(value / 1000);
        const rest = value % 1000;
        return `${thousands === 1 ? '' : `${integerToFrench(thousands)} `}mille${rest ? ` ${integerToFrench(rest)}` : ''}`;
    }
    throw new Error('french_tts_number_out_of_range');
};

export const normalizeFrenchTtsText = (text = '') => String(text)
    .normalize('NFC')
    .replace(/[’]/g, "'")
    .replace(/\b\d{1,6}\b/g, (token) => integerToFrench(Number(token)))
    // A host name is read out: `atome.one` is "atome point one".
    .replace(/\b([a-z]+)\.([a-z]{2,})\b/gi, '$1 point $2')
    .replace(/([a-zàâäçéèêëîïôöùûüÿœ])'(?=[a-zàâäçéèêëîïôöùûüÿœ])/gi, '$1 ')
    .toLocaleLowerCase('fr-FR')
    .replace(/[^a-zàâäçéèêëîïôöùûüÿœ'(),.!?:;\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const pushNasal = (output, vowel) => output.push(vowel, '̃');
// A vowel + n/m is nasal only when neither a vowel nor a second n/m follows (`bon`, `bonne`, `disponible`).
const nasalAt = (word, end) => !VOWEL.test(word[end] || '') && !/[nm]/.test(word[end] || '');
const isConsonant = (letter) => Boolean(letter) && !VOWEL.test(letter) && letter !== "'";

// The `e` of a syllable: silent at the end, open before two consonants (`merci`,
// `cette`), an `x` or a pronounced final consonant (`actuel`), schwa otherwise.
const eSound = (word, index) => {
    const after = word.slice(index + 1);
    if (!after) return null;
    if (SILENT_ENDING.test(after)) return after === 's' && index > 1 ? null : 'ɛ';
    const [first, second] = after;
    if (first === 'x' || (after.length === 1 && /[lrcf]/.test(first))) return 'ɛ';
    const cluster = /[bcdfgptv]/.test(first) && /[rl]/.test(second || '');
    const digraph = /^(ch|ph|th|gn)/.test(after);
    return isConsonant(first) && isConsonant(second) && !cluster && !digraph ? 'ɛ' : 'ə';
};

const wordToPhonemes = (word) => {
    if (WORD_EXCEPTIONS[word]) return [...WORD_EXCEPTIONS[word]];
    const output = [];
    let index = 0;
    while (index < word.length) {
        const rest = word.slice(index);
        if (index > 0 && SILENT_ENDING.test(rest)) break;
        const at = (length) => word[index + length] || '';
        const finalAfter = (length) => { const after = word.slice(index + length); return !after || SILENT_ENDING.test(after); };
        if (/^(eaux|aux|eau|au)/.test(rest)) {
            output.push('o');
            index += rest.startsWith('eaux') ? 4 : (rest.startsWith('aux') || rest.startsWith('eau') ? 3 : 2);
            continue;
        }
        if (/^(ail|eil)/.test(rest)) { output.push(rest[0] === 'a' ? 'a' : 'ɛ', 'j'); index += rest[3] === 'l' ? 4 : 3; continue; }
        if (rest.startsWith('ien') && nasalAt(word, index + 3)) { output.push('j'); pushNasal(output, 'ɛ'); index += 3; continue; }
        if (rest.startsWith('oin') && nasalAt(word, index + 3)) { output.push('w'); pushNasal(output, 'ɛ'); index += 3; continue; }
        if (/^(ain|ein|aim|eim)/.test(rest) && nasalAt(word, index + 3)) { pushNasal(output, 'ɛ'); index += 3; continue; }
        if (/^(in|im|yn|ym)/.test(rest) && nasalAt(word, index + 2)) { pushNasal(output, 'ɛ'); index += 2; continue; }
        if (/^(an|am|en|em)/.test(rest) && nasalAt(word, index + 2)) { pushNasal(output, 'ɑ'); index += 2; continue; }
        if (/^(on|om)/.test(rest) && nasalAt(word, index + 2)) { pushNasal(output, 'ɔ'); index += 2; continue; }
        if (/^(un|um)/.test(rest) && nasalAt(word, index + 2)) { pushNasal(output, 'œ'); index += 2; continue; }
        if (rest.startsWith('œu') || rest.startsWith('oeu')) { output.push('œ'); index += rest[0] === 'œ' ? 2 : 3; continue; }
        if (rest.startsWith('eu')) { output.push(finalAfter(2) ? 'ø' : 'œ'); index += 2; continue; }
        if (rest.startsWith('ou')) { output.push(VOWEL.test(at(2)) && !rest.startsWith('ouill') ? 'w' : 'u'); index += 2; continue; }
        if (rest.startsWith('oi')) { output.push('w', 'a'); index += 2; continue; }
        if (rest.startsWith('ui') && index > 0) { output.push('ɥ', 'i'); index += 2; continue; }
        if (/^(ai|ei|è|ê|ë)/.test(rest)) { output.push('ɛ'); index += /^(ai|ei)/.test(rest) ? 2 : 1; continue; }
        if (rest[0] === 'é') { output.push('e'); index += 1; continue; }
        if (/^(er|ez)$/.test(rest) || rest === 'ers') { output.push('e'); break; }
        if (rest.startsWith('tion')) { output.push('s'); index += 1; continue; }
        if (rest.startsWith('gn')) { output.push('ɲ'); index += 2; continue; }
        if (rest.startsWith('ch')) { output.push('ʃ'); index += 2; continue; }
        if (rest.startsWith('ph')) { output.push('f'); index += 2; continue; }
        if (rest.startsWith('th')) { output.push('t'); index += 2; continue; }
        if (rest.startsWith('qu')) { output.push('k'); index += 2; continue; }
        if (/^gu[eéèêiy]/.test(rest)) { output.push('ɡ'); index += 2; continue; }
        if (/^cc[eéèêiy]/.test(rest)) { output.push('k', 's'); index += 2; continue; }
        if (rest.startsWith('ill') && index > 0) { output.push('j'); index += 3; continue; }
        const letter = rest[0];
        const next = at(1);
        const previous = word[index - 1] || '';
        if (letter === 'c') output.push(/[eéèêëiy]/.test(next) ? 's' : 'k');
        else if (letter === 'ç') output.push('s');
        else if (letter === 'g') output.push(/[eéèêëiy]/.test(next) ? 'ʒ' : 'ɡ');
        else if (letter === 'j') output.push('ʒ');
        else if (letter === 'r') output.push('ʁ');
        else if (letter === 's') output.push(VOWEL.test(previous) && VOWEL.test(next) ? 'z' : 's');
        else if (letter === 'i') output.push(index > 0 && VOWEL.test(next) && !(next === 'e' && finalAfter(2)) ? 'j' : 'i');
        else if (letter === 'u' || /[ûü]/.test(letter)) output.push('y');
        else if (/[àâä]/.test(letter)) output.push('a');
        else if (/[îï]/.test(letter)) output.push('i');
        else if (/[ôö]/.test(letter)) output.push('o');
        else if (/[ù]/.test(letter)) output.push('u');
        else if (letter === 'y') output.push('i');
        else if (letter === 'e') { const sound = eSound(word, index); if (sound) output.push(sound); }
        else if (letter === 'h' || letter === "'") { /* French h and elision are silent. */ }
        else if (letter === 'x') output.push('k', 's');
        else if (letter === 'q') output.push('k');
        else output.push(letter);
        // A doubled consonant is pronounced once (`appareil`, `connecte`, `assez`).
        index += isConsonant(letter) && next === letter ? 2 : 1;
    }
    return output;
};

export const encodeFrenchPhonemes = (text, phonemeIdMap) => {
    if (!phonemeIdMap || typeof phonemeIdMap !== 'object') throw new Error('french_tts_phoneme_map_required');
    const normalizedText = normalizeFrenchTtsText(text);
    if (!normalizedText) throw new Error('french_tts_text_required');
    const phonemes = ['^'];
    // A hyphenated compound (`est-ce`, `connecte-toi`) and an elided word
    // (`t'écoute`) are one sound group: no word break inside them.
    const tokens = normalizedText.match(/[a-zàâäçéèêëîïôöùûüÿœ']+(?:-[a-zàâäçéèêëîïôöùûüÿœ']+)*|[(),.!?:;\-]/g) || [];
    tokens.forEach((token, tokenIndex) => {
        if (/^[(),.!?:;\-]$/.test(token)) phonemes.push(token);
        else token.split('-').forEach(word => phonemes.push(...wordToPhonemes(word)));
        if (tokenIndex < tokens.length - 1 && !ELIDED.test(token)) phonemes.push(' ');
    });
    phonemes.push('$');
    const ids = [];
    phonemes.forEach((phoneme, index) => {
        const mapped = phonemeIdMap[phoneme];
        if (!Array.isArray(mapped)) throw new Error(`french_tts_phoneme_unsupported:${phoneme}`);
        ids.push(...mapped);
        if (index < phonemes.length - 1) ids.push(...phonemeIdMap._);
    });
    return { ids, normalizedText, phonemes };
};
