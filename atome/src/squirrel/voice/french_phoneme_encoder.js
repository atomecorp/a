const WORD_EXCEPTIONS = Object.freeze({
    au: ['o'],
    aux: ['o'],
    bonjour: ['b', 'ɔ', '̃', 'ʒ', 'u', 'ʁ'],
    est: ['ɛ'],
    et: ['e'],
    eux: ['ø'],
    fait: ['f', 'ɛ'],
    femme: ['f', 'a', 'm'],
    les: ['l', 'e'],
    monsieur: ['m', 'ə', 's', 'j', 'ø'],
    plus: ['p', 'l', 'y'],
    que: ['k', 'ə'],
    salut: ['s', 'a', 'l', 'y'],
    tous: ['t', 'u'],
    tu: ['t', 'y'],
    veux: ['v', 'ø'],
    yeux: ['j', 'ø']
});

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
    .replace(/([a-zàâäçéèêëîïôöùûüÿœ])'(?=[a-zàâäçéèêëîïôöùûüÿœ])/gi, '$1 ')
    .toLocaleLowerCase('fr-FR')
    .replace(/[^a-zàâäçéèêëîïôöùûüÿœ'(),.!?:;\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const pushNasal = (output, vowel) => output.push(vowel, '̃');

const wordToPhonemes = (word) => {
    if (WORD_EXCEPTIONS[word]) return [...WORD_EXCEPTIONS[word]];
    const output = [];
    let index = 0;
    while (index < word.length) {
        const rest = word.slice(index);
        const final = index === word.length - 1;
        if (/^(eaux|aux|eau|au)/.test(rest)) {
            output.push('o');
            index += rest.startsWith('eaux') ? 4 : (rest.startsWith('aux') || rest.startsWith('eau') ? 3 : 2);
            continue;
        }
        if (/^(oin)/.test(rest)) { output.push('w'); pushNasal(output, 'ɛ'); index += 3; continue; }
        if (/^(ain|ein|aim|eim|in|im|yn|ym)/.test(rest)) { pushNasal(output, 'ɛ'); index += rest.match(/^(ain|ein|aim|eim)/) ? 3 : 2; continue; }
        if (/^(an|am|en|em)/.test(rest)) { pushNasal(output, 'ɑ'); index += 2; continue; }
        if (/^(on|om)/.test(rest)) { pushNasal(output, 'ɔ'); index += 2; continue; }
        if (/^(un|um)/.test(rest)) { pushNasal(output, 'œ'); index += 2; continue; }
        if (rest.startsWith('œu') || rest.startsWith('oeu')) { output.push('œ'); index += 3; continue; }
        if (rest.startsWith('eu')) { output.push(final || index + 2 === word.length ? 'ø' : 'œ'); index += 2; continue; }
        if (rest.startsWith('ou')) { output.push('u'); index += 2; continue; }
        if (rest.startsWith('oi')) { output.push('w', 'a'); index += 2; continue; }
        if (/^(ai|ais|ait|ei|è|ê|ë)/.test(rest)) { output.push('ɛ'); index += rest[0] === 'a' && rest[1] === 'i' ? (rest.startsWith('ais') || rest.startsWith('ait') ? 3 : 2) : rest.startsWith('ei') ? 2 : 1; continue; }
        if (/^(é|er|ez)/.test(rest)) { output.push('e'); index += rest[0] === 'é' ? 1 : 2; continue; }
        if (rest.startsWith('gn')) { output.push('ɲ'); index += 2; continue; }
        if (rest.startsWith('ch')) { output.push('ʃ'); index += 2; continue; }
        if (rest.startsWith('ph')) { output.push('f'); index += 2; continue; }
        if (rest.startsWith('th')) { output.push('t'); index += 2; continue; }
        if (rest.startsWith('qu')) { output.push('k'); index += 2; continue; }
        if (rest.startsWith('ill')) { output.push('j'); index += 3; continue; }
        const letter = rest[0];
        const next = rest[1] || '';
        if (letter === 'c') output.push(/[eéièêëiy]/.test(next) ? 's' : 'k');
        else if (letter === 'ç') output.push('s');
        else if (letter === 'g') output.push(/[eéièêëiy]/.test(next) ? 'ʒ' : 'ɡ');
        else if (letter === 'j') output.push('ʒ');
        else if (letter === 'r') output.push('ʁ');
        else if (letter === 'u' || /[ûü]/.test(letter)) output.push('y');
        else if (/[àâä]/.test(letter)) output.push('a');
        else if (/[îï]/.test(letter)) output.push('i');
        else if (/[ôö]/.test(letter)) output.push('o');
        else if (/[ù]/.test(letter)) output.push('u');
        else if (letter === 'y') output.push('i');
        else if (letter === 'e') { if (!final) output.push('ə'); }
        else if (letter === 'h' || letter === "'") { /* French h and elision are silent. */ }
        else if (final && /[dpsxtz]/.test(letter)) { /* Frequent final consonants are silent. */ }
        else if (letter === 'x') output.push('k', 's');
        else if (letter === 'q') output.push('k');
        else if (letter === 'w') output.push('w');
        else output.push(letter);
        index += 1;
    }
    return output;
};

export const encodeFrenchPhonemes = (text, phonemeIdMap) => {
    if (!phonemeIdMap || typeof phonemeIdMap !== 'object') throw new Error('french_tts_phoneme_map_required');
    const normalizedText = normalizeFrenchTtsText(text);
    if (!normalizedText) throw new Error('french_tts_text_required');
    const phonemes = ['^'];
    const tokens = normalizedText.match(/[a-zàâäçéèêëîïôöùûüÿœ']+|[(),.!?:;\-]/g) || [];
    tokens.forEach((token, tokenIndex) => {
        if (/^[(),.!?:;\-]$/.test(token)) phonemes.push(token);
        else phonemes.push(...wordToPhonemes(token));
        if (tokenIndex < tokens.length - 1) phonemes.push(' ');
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
