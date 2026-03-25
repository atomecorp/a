const toText = (value) => String(value || '').trim();

const normalizeText = (value) => toText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isEnglish = (locale = '') => toText(locale).toLowerCase().startsWith('en');

const readContactFieldIntent = ({ utteranceRaw = '', utteranceNormalized = '' } = {}) => {
    const normalized = normalizeText(utteranceNormalized || utteranceRaw);
    if (!normalized) return null;
    if (
        normalized.includes('numero de telephone')
        || normalized.includes('telephone')
        || normalized.includes('numero')
        || normalized.includes('phone number')
        || normalized.includes('phone')
        || normalized.includes('mobile')
    ) {
        return 'phone';
    }
    if (normalized.includes('email') || normalized.includes('mail') || normalized.includes('adresse mail') || normalized.includes('adresse e mail')) {
        return 'email';
    }
    if (
        normalized.includes('societe')
        || normalized.includes('company')
        || normalized.includes('organisation')
        || normalized.includes('organization')
        || normalized.includes('entreprise')
    ) {
        return 'organization';
    }
    if (
        normalized.includes('quand est ce qu')
        || normalized.includes('mise a jour')
        || normalized.includes('mis a jour')
        || normalized.includes('updated')
        || normalized.includes('last update')
        || normalized.includes('derniere mise a jour')
    ) {
        return 'updated_at';
    }
    if (normalized.includes('nom') || normalized.includes('name')) {
        return 'name';
    }
    return null;
};

const isPluralContactFieldQuestion = ({ utteranceRaw = '', utteranceNormalized = '' } = {}) => {
    const normalized = normalizeText(utteranceNormalized || utteranceRaw);
    if (!normalized) return false;
    return (
        normalized.includes('leurs ')
        || normalized.includes('leur ')
        || normalized.includes('their ')
        || normalized.includes('emails')
        || normalized.includes('numeros')
        || normalized.includes('adresses')
    );
};

const readContactOrganization = (contact = {}) => toText(
    contact?.organization
    || contact?.company
    || contact?.organization_name
    || contact?.raw?.organization
    || contact?.custom_fields?.organization
);

const formatLocalizedDateTime = (value, locale = 'fr-FR') => {
    const text = toText(value);
    if (!text) return '';
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return text;
    try {
        return new Intl.DateTimeFormat(locale, {
            dateStyle: 'medium',
            timeStyle: 'short'
        }).format(date);
    } catch (_) {
        return date.toISOString();
    }
};

export const buildContactQueryReply = (contact = {}, {
    locale = 'fr-FR',
    utteranceRaw = '',
    utteranceNormalized = ''
} = {}) => {
    const field = readContactFieldIntent({ utteranceRaw, utteranceNormalized });
    if (!field) return '';
    const english = isEnglish(locale);
    const name = toText(
        contact?.name
        || contact?.display_name
        || contact?.full_name
        || contact?.nickname
    ) || (english ? 'this contact' : 'ce contact');
    if (field === 'phone') {
        const phone = toText(contact?.phone);
        if (!phone) {
            return english
                ? `I do not have a phone number for ${name}.`
                : `Je n'ai pas de numero de telephone pour ${name}.`;
        }
        return english
            ? `${name}'s phone number is ${phone}.`
            : `Le numero de telephone de ${name} est ${phone}.`;
    }
    if (field === 'email') {
        const email = toText(contact?.email);
        if (!email) {
            return english
                ? `I do not have an email address for ${name}.`
                : `Je n'ai pas d'adresse email pour ${name}.`;
        }
        return english
            ? `${name}'s email address is ${email}.`
            : `L'adresse email de ${name} est ${email}.`;
    }
    if (field === 'organization') {
        const organization = readContactOrganization(contact);
        if (!organization) {
            return english
                ? `I do not have a company for ${name}.`
                : `Je n'ai pas de societe pour ${name}.`;
        }
        return english
            ? `${name} is linked to ${organization}.`
            : `${name} est lie a ${organization}.`;
    }
    if (field === 'updated_at') {
        const updatedAt = toText(contact?.updated_at || contact?.updatedAt);
        if (!updatedAt) {
            return english
                ? `I do not know when ${name} was last updated.`
                : `Je ne sais pas quand ${name} a ete mis a jour pour la derniere fois.`;
        }
        const label = formatLocalizedDateTime(updatedAt, locale);
        return english
            ? `${name} was last updated on ${label}.`
            : `${name} a ete mis a jour pour la derniere fois le ${label}.`;
    }
    if (field === 'name') {
        return english
            ? `The contact name is ${name}.`
            : `Le nom du contact est ${name}.`;
    }
    return '';
};

export const buildContactsFieldReply = (contacts = [], options = {}) => {
    const items = Array.isArray(contacts) ? contacts.filter((entry) => entry && typeof entry === 'object') : [];
    if (!items.length) return '';
    const field = readContactFieldIntent(options);
    if (!field) return '';
    const locale = options?.locale || 'fr-FR';
    const english = isEnglish(locale);
    const pluralRequested = isPluralContactFieldQuestion(options);

    const lines = items.map((contact) => {
        const name = toText(
            contact?.name
            || contact?.display_name
            || contact?.full_name
            || contact?.nickname
        ) || (english ? 'this contact' : 'ce contact');
        if (field === 'email') {
            const email = toText(contact?.email);
            if (!email) return english ? `${name}: no email` : `${name} : pas d'adresse email`;
            return `${name}: ${email}`;
        }
        if (field === 'phone') {
            const phone = toText(contact?.phone);
            if (!phone) return english ? `${name}: no phone` : `${name} : pas de numero`;
            return `${name}: ${phone}`;
        }
        if (field === 'organization') {
            const organization = readContactOrganization(contact);
            if (!organization) return english ? `${name}: no company` : `${name} : pas de societe`;
            return `${name}: ${organization}`;
        }
        if (field === 'updated_at') {
            const updatedAt = toText(contact?.updated_at || contact?.updatedAt);
            if (!updatedAt) return english ? `${name}: unknown update` : `${name} : mise a jour inconnue`;
            return `${name}: ${formatLocalizedDateTime(updatedAt, locale)}`;
        }
        if (field === 'name') {
            return name;
        }
        return '';
    }).filter(Boolean);

    if (!lines.length) return '';
    if (items.length === 1 && !pluralRequested) {
        return buildContactQueryReply(items[0], options);
    }
    return english
        ? `I found ${items.length} contacts. ${lines.join('. ')}.`
        : `J'ai trouve ${items.length} contacts. ${lines.join('. ')}.`;
};
