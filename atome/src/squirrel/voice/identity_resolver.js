const normalizeText = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const cloneValue = (value) => {
    if (typeof structuredClone === 'function') return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
};

const EXACT_REFERENCE_TOKENS = new Set([
    'it', 'this', 'that', 'them', 'celui', 'celle', 'ce', 'cet', 'cette', 'ça', 'ca', 'cela',
    'lui', 'them', 'current', 'courant'
]);

const ORDINAL_PATTERNS = [
    { pattern: /\b(last|dernier|derniere)\b/i, value: 'last' },
    { pattern: /\b(first|premier|premiere)\b/i, value: 'first' },
    { pattern: /\b(next|suivant|suivante)\b/i, value: 'next' },
    { pattern: /\b(previous|precedent|precedente)\b/i, value: 'previous' }
];

const normalizeCandidateLabel = (item = {}) => String(
    item?.name
    || item?.title
    || item?.subject
    || item?.from?.name
    || item?.from?.address
    || item?.label
    || ''
).trim();

const scoreCandidate = (query, label) => {
    const normalizedQuery = normalizeText(query);
    const normalizedLabel = normalizeText(label);
    if (!normalizedQuery || !normalizedLabel) return 0;
    if (normalizedQuery === normalizedLabel) return 0.99;
    if (normalizedLabel.startsWith(normalizedQuery)) return 0.94;
    if (normalizedLabel.includes(normalizedQuery)) return 0.86;
    return 0;
};

const detectReferenceMode = (utterance = '') => {
    const normalized = normalizeText(utterance);
    if (!normalized) return 'none';
    for (const token of EXACT_REFERENCE_TOKENS) {
        if (` ${normalized} `.includes(` ${token} `)) return 'deictic';
    }
    for (const entry of ORDINAL_PATTERNS) {
        if (entry.pattern.test(utterance)) return entry.value;
    }
    return 'named';
};

const extractNamedCandidates = (utterance = '') => {
    const raw = String(utterance || '').trim();
    if (!raw) return [];
    const output = new Set();
    const prepositionMatches = raw.match(/\b(?:a|à|avec|with|from|de|to)\s+([A-ZÀ-ÿ][\wÀ-ÿ-]+(?:\s+[A-ZÀ-ÿ][\wÀ-ÿ-]+){0,2})/g) || [];
    prepositionMatches.forEach((match) => {
        const candidate = match.replace(/\b(?:a|à|avec|with|from|de|to)\s+/i, '').trim();
        if (candidate) output.add(candidate);
    });
    const properNameMatches = raw.match(/\b[A-ZÀ-ÿ][a-zà-ÿ-]{2,}(?:\s+[A-ZÀ-ÿ][a-zà-ÿ-]{2,}){0,2}\b/g) || [];
    properNameMatches.forEach((entry) => output.add(entry.trim()));
    return Array.from(output);
};

const pickWorkingMemoryCandidate = (workingMemory, domain, referenceMode) => {
    if (!workingMemory) return null;
    if (referenceMode === 'deictic' || referenceMode === 'next' || referenceMode === 'previous' || referenceMode === 'first' || referenceMode === 'last') {
        const active = typeof workingMemory.getActiveEntity === 'function' ? workingMemory.getActiveEntity(domain) : null;
        if (active?.id) {
            return {
                source: 'working_memory',
                domain,
                confidence: 0.99,
                entity_id: active.id,
                item: active.item || null
            };
        }
        const currentId = typeof workingMemory.getCurrentItemId === 'function' ? workingMemory.getCurrentItemId(domain) : null;
        const currentItem = typeof workingMemory.getCurrentItem === 'function' ? workingMemory.getCurrentItem(domain) : null;
        if (currentId) {
            return {
                source: 'working_memory',
                domain,
                confidence: 0.97,
                entity_id: currentId,
                item: currentItem || null
            };
        }
    }
    return null;
};

const resolveDomainCandidates = async ({
    domain,
    candidates = [],
    connectors = {}
} = {}) => {
    const api = connectors?.[domain] || null;
    const output = [];
    const queriedSources = [];
    if (!api || !candidates.length) {
        return { candidates: output, sources_queried: queriedSources };
    }
    for (const query of candidates) {
        try {
            if (domain === 'contacts' && typeof api.search === 'function') {
                queriedSources.push('contacts.search');
                const result = await api.search(query, { limit: 5 });
                (Array.isArray(result?.items) ? result.items : []).forEach((item) => {
                    const label = normalizeCandidateLabel(item);
                    const confidence = scoreCandidate(query, label);
                    if (confidence > 0) {
                        output.push({
                            source: 'contacts',
                            domain,
                            query,
                            confidence,
                            entity_id: item?.source_contact_id || item?.id || null,
                            item: cloneValue(item)
                        });
                    }
                });
            } else if (domain === 'calendar' && typeof api.search === 'function') {
                queriedSources.push('calendar.search');
                const result = await api.search(query, { limit: 5 });
                (Array.isArray(result?.items) ? result.items : []).forEach((item) => {
                    const label = normalizeCandidateLabel(item);
                    const confidence = scoreCandidate(query, label);
                    if (confidence > 0) {
                        output.push({
                            source: 'calendar',
                            domain,
                            query,
                            confidence,
                            entity_id: item?.id || null,
                            item: cloneValue(item)
                        });
                    }
                });
            } else if (domain === 'mail' && typeof api.search === 'function') {
                queriedSources.push('mail.search');
                const result = await api.search(query, { limit: 5 });
                (Array.isArray(result?.items) ? result.items : []).forEach((item) => {
                    const label = normalizeCandidateLabel(item);
                    const confidence = scoreCandidate(query, label);
                    if (confidence > 0) {
                        output.push({
                            source: 'mail',
                            domain,
                            query,
                            confidence,
                            entity_id: item?.message_id || item?.id || null,
                            item: cloneValue(item)
                        });
                    }
                });
            }
        } catch (_) {
            // Keep identity resolution best-effort and deterministic.
        }
    }
    return { candidates: output, sources_queried: queriedSources };
};

export const resolveIdentityContext = async ({
    utterance = '',
    workingMemory = null,
    connectors = {},
    ui_context = {},
    preferred_domains = ['contacts', 'calendar', 'mail', 'atome']
} = {}) => {
    const referenceMode = detectReferenceMode(utterance);
    const namedCandidates = extractNamedCandidates(utterance);
    const resolved = [];
    const ambiguities = [];
    const sourcesQueried = [];

    for (const domain of preferred_domains) {
        const workingMemoryCandidate = pickWorkingMemoryCandidate(workingMemory, domain, referenceMode);
        if (workingMemoryCandidate) {
            resolved.push(workingMemoryCandidate);
            sourcesQueried.push('working_memory');
            continue;
        }
        const uiSelection = ui_context?.[domain]?.selected_id || null;
        if ((referenceMode === 'deictic' || referenceMode === 'current') && uiSelection) {
            resolved.push({
                source: 'ui_context',
                domain,
                confidence: 0.98,
                entity_id: uiSelection,
                item: cloneValue(ui_context?.[domain]?.selected_item || null)
            });
            sourcesQueried.push('ui_context');
            continue;
        }
        if (namedCandidates.length && ['contacts', 'calendar', 'mail'].includes(domain)) {
            const queried = await resolveDomainCandidates({
                domain,
                candidates: namedCandidates,
                connectors
            });
            sourcesQueried.push(...queried.sources_queried);
            const ranked = queried.candidates.sort((left, right) => Number(right.confidence || 0) - Number(left.confidence || 0));
            if (ranked.length === 1) {
                resolved.push(ranked[0]);
            } else if (ranked.length > 1) {
                const top = ranked[0];
                const second = ranked[1];
                if ((Number(top.confidence || 0) - Number(second.confidence || 0)) >= 0.1) {
                    resolved.push(top);
                } else {
                    ambiguities.push({
                        domain,
                        candidates: ranked.slice(0, 5).map((entry) => ({
                            entity_id: entry.entity_id,
                            confidence: entry.confidence,
                            label: normalizeCandidateLabel(entry.item)
                        }))
                    });
                }
            }
        }
    }

    return {
        utterance: String(utterance || ''),
        reference_mode: referenceMode,
        named_candidates: namedCandidates,
        resolved: resolved.map((entry) => ({
            source: entry.source,
            domain: entry.domain,
            confidence: entry.confidence,
            entity_id: entry.entity_id,
            label: normalizeCandidateLabel(entry.item)
        })),
        ambiguities,
        sources_queried: Array.from(new Set(sourcesQueried))
    };
};
