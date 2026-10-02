// Shared RFC content-line mechanics; domain converters own property semantics.
export const unfoldContentLines = value => String(value).replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
export const escapeContentText = value => String(value ?? '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
export const decodeContentText = value => String(value).replace(/\\([nN,;\\])/g, (_, char) => /n/i.test(char) ? '\n' : char);
export function splitContentValue(value, separator = ';') {
    const parts = []; let part = '', escaped = false, quoted = false;
    for (const char of String(value)) {
        if (!escaped && char === '"') quoted = !quoted;
        if (!escaped && !quoted && char === separator) { parts.push(part); part = ''; }
        else part += char;
        if (char === '\\' && !escaped) escaped = true; else escaped = false;
    }
    parts.push(part); return parts;
}
export function parseContentLine(line) {
    let quoted = false, colon = -1;
    for (let i = 0; i < line.length; i += 1) {
        if (line[i] === '"') quoted = !quoted;
        if (line[i] === ':' && !quoted) { colon = i; break; }
    }
    if (colon < 1) throw new Error('content_line_invalid');
    const [key, ...parameters] = splitContentValue(line.slice(0, colon));
    const nameParts = key.split('.'), name = nameParts.pop().toUpperCase();
    if (!/^[A-Z0-9-]+$/.test(name)) throw new Error('content_property_invalid');
    const params = {};
    for (const entry of parameters) {
        const equals = entry.indexOf('=');
        const key = (equals < 0 ? 'TYPE' : entry.slice(0, equals)).toUpperCase();
        if (!/^[A-Z0-9-]+$/.test(key)) throw new Error('content_parameter_invalid');
        const raw = equals < 0 ? entry : entry.slice(equals + 1);
        const decoded = raw.replace(/^"|"$/g, '').replace(/\^(\^|n|')/gi, (_, char) => char === '^' ? '^' : char === "'" ? '"' : '\n');
        params[key] = key === 'TYPE' && params[key] ? `${params[key]},${decoded}` : decoded;
    }
    return { name, group: nameParts.join('.'), params, value: line.slice(colon + 1) };
}
export function contentParameter(value, version = '4.0') {
    let text = String(value);
    if (version === '4.0') text = text.replace(/\^/g, '^^').replace(/"/g, "^'").replace(/\r?\n/g, '^n');
    else text = text.replace(/[\r\n]/g, ' ').replace(/"/g, "'");
    return /[:;,]/.test(text) ? `"${text}"` : text;
}
export function buildContentLine({ name, group = '', params = {}, value }, version = '4.0') {
    if (!/^[A-Z0-9-]+$/i.test(name) || (group && !/^[A-Z0-9-]+$/i.test(group))) throw new Error('content_property_invalid');
    if (/[\r\n]/.test(String(value))) throw new Error('content_value_newline');
    const parameters = Object.entries(params).map(([key, entry]) => {
        if (!/^[A-Z0-9-]+$/i.test(key)) throw new Error('content_parameter_invalid');
        const parameter = key.toUpperCase() === 'TYPE'
            ? String(entry).split(',').map(value => contentParameter(value, version)).join(',') : contentParameter(entry, version);
        return `;${key.toUpperCase()}=${parameter}`;
    }).join('');
    return `${group ? group + '.' : ''}${name.toUpperCase()}${parameters}:${value}`;
}
export function foldContentLine(line) {
    const encoder = new TextEncoder(); let folded = '', size = 0;
    for (const char of line) {
        const bytes = encoder.encode(char).length;
        if (size + bytes > 75) { folded += '\r\n '; size = 1; }
        folded += char; size += bytes;
    }
    return folded;
}
export function readContentComponents(input, type) {
    if (typeof input !== 'string' || input.length > 32 * 1024 * 1024) throw new Error('content_file_size_invalid');
    const components = []; let current = null;
    for (const line of unfoldContentLines(input)) {
        if (!line) continue;
        if (line.toUpperCase() === `BEGIN:${type}`) {
            if (current) throw new Error('content_component_nested'); current = [];
        } else if (line.toUpperCase() === `END:${type}`) {
            if (!current) throw new Error('content_component_unmatched'); components.push(current); current = null;
        } else if (current) current.push(parseContentLine(line));
        else throw new Error('content_component_required');
    }
    if (current || !components.length) throw new Error('content_component_incomplete');
    return components;
}
