export const ACCESS_PUBLIC = 'public';
export const ACCESS_PRIVATE = 'private';

export function normalizeAccessValue(value) {
    const raw = String(value || '').trim().toLowerCase();
    return raw === ACCESS_PUBLIC ? ACCESS_PUBLIC : ACCESS_PRIVATE;
}

export function isPublicAccess(record) {
    if (!record) return false;
    const access = normalizeAccessValue(record.access || record.visibility || record.profile?.access || record.profile?.visibility);
    const visibility = normalizeAccessValue(record.visibility || record.profile?.visibility || record.profile?.access || record.access);
    return access === ACCESS_PUBLIC || visibility === ACCESS_PUBLIC;
}

const collectRecipientKeys = (record) => {
    if (!record || typeof record !== 'object') return [];
    const keys = [];
    const id = record.id || record.user_id || record.userId || record.atome_id || record.atomeId || null;
    if (id) keys.push(String(id));
    const phone = record.phone || record.phone_number || record.phoneNumber || record.mobile || record.msisdn || null;
    if (phone) keys.push(String(phone));
    return keys;
};

export function classifyRecipients(records, options = {}) {
    const list = Array.isArray(records) ? records : [];
    const allowAcceptedPrivate = !!options.allowAcceptedPrivate;
    const acceptedIds = options.acceptedIds instanceof Set
        ? options.acceptedIds
        : new Set(Array.isArray(options.acceptedIds) ? options.acceptedIds.map((value) => String(value)) : []);

    const accepted = [];
    const rejectedPrivate = [];

    list.forEach((record) => {
        if (!record) return;
        if (isPublicAccess(record)) {
            accepted.push(record);
            return;
        }
        if (allowAcceptedPrivate && acceptedIds.size) {
            const keys = collectRecipientKeys(record);
            const matched = keys.some((key) => acceptedIds.has(String(key)));
            if (matched) {
                accepted.push(record);
                return;
            }
        }
        rejectedPrivate.push(record);
    });

    return { accepted, rejectedPrivate };
}

export function summarizeRecipients(records) {
    const list = Array.isArray(records) ? records : [];
    return list.map((record) => ({
        id: record?.id || record?.user_id || record?.userId || record?.atome_id || record?.atomeId || null,
        name: record?.name || record?.username || null,
        phone: record?.phone || record?.phone_number || record?.phoneNumber || record?.mobile || record?.msisdn || null,
        access: record?.access || record?.visibility || null,
        visibility: record?.visibility || record?.access || null
    }));
}
