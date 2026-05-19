// Mail trust scoring engine — spam/phishing/trust analysis for incoming mail.
// Returns a trust score (0.0–1.0) with signal breakdown.
// Score thresholds: >= 0.7 trusted, 0.4–0.7 suspicious (warn user), < 0.4 blocked.

const TRUST_THRESHOLD_OK = 0.7;
const TRUST_THRESHOLD_WARN = 0.4;

const PHISHING_PHRASES_EN = [
    'verify your account', 'confirm your identity', 'update your payment',
    'your account has been compromised', 'click here immediately',
    'act now or your account will be closed', 'you have won',
    'claim your prize', 'wire transfer', 'send money',
    'your password has expired', 'reset your password now',
    'urgent action required', 'immediate action required',
    'suspended account', 'unauthorized access detected',
    'confirm your bank details', 'provide your social security',
    'enter your credentials', 'validate your information',
    'security alert', 'unusual sign-in activity'
];

const PHISHING_PHRASES_FR = [
    'verifiez votre compte', 'confirmez votre identite',
    'mettez a jour vos informations de paiement',
    'votre compte a ete compromis', 'cliquez ici immediatement',
    'agissez maintenant', 'vous avez gagne',
    'reclamez votre prix', 'virement bancaire', 'envoyer de l argent',
    'votre mot de passe a expire', 'reinitialiser votre mot de passe',
    'action urgente requise', 'action immediate requise',
    'compte suspendu', 'acces non autorise detecte',
    'confirmez vos coordonnees bancaires', 'fournissez votre numero de securite sociale',
    'entrez vos identifiants', 'validez vos informations',
    'alerte de securite', 'activite de connexion inhabituelle'
];

const URGENCY_WORDS_EN = [
    'urgent', 'immediately', 'asap', 'right now', 'hurry',
    'deadline', 'last chance', 'final warning', 'expires today',
    'within 24 hours', 'within 48 hours', 'do not ignore'
];

const URGENCY_WORDS_FR = [
    'urgent', 'immediatement', 'des maintenant', 'depechez',
    'date limite', 'derniere chance', 'dernier avertissement',
    'expire aujourd hui', 'sous 24 heures', 'sous 48 heures',
    'ne pas ignorer'
];

const SUSPICIOUS_LINK_PATTERNS = [
    /https?:\/\/[^\s]*@[^\s]*/i,
    /https?:\/\/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/i,
    /https?:\/\/[^\s]*\.tk\b/i,
    /https?:\/\/[^\s]*\.ml\b/i,
    /https?:\/\/[^\s]*\.ga\b/i,
    /https?:\/\/[^\s]*\.cf\b/i,
    /https?:\/\/[^\s]*\.gq\b/i,
    /https?:\/\/[^\s]*\.xyz\b/i,
    /https?:\/\/[^\s]*\.top\b/i,
    /https?:\/\/[^\s]*\.click\b/i,
    /https?:\/\/[^\s]*\.info\b/i,
    /https?:\/\/bit\.ly\b/i,
    /https?:\/\/tinyurl\.com\b/i,
    /https?:\/\/t\.co\b/i,
    /https?:\/\/goo\.gl\b/i,
    /https?:\/\/[^\s]*-login[^\s]*/i,
    /https?:\/\/[^\s]*signin[^\s]*/i,
    /https?:\/\/[^\s]*secure-[^\s]*/i,
    /https?:\/\/[^\s]*account-verify[^\s]*/i
];

const extractSenderEmail = (mail) => {
    if (typeof mail?.from === 'string') return mail.from.trim().toLowerCase();
    if (typeof mail?.from?.address === 'string') return mail.from.address.trim().toLowerCase();
    return '';
};

const extractSenderName = (mail) => {
    if (typeof mail?.from?.name === 'string') return mail.from.name.trim();
    return '';
};

const extractBodyText = (mail) => {
    const candidates = [
        mail?.body_text,
        mail?.body,
        mail?.text,
        mail?.snippet,
        mail?.preview,
        mail?.content
    ];
    for (const c of candidates) {
        if (typeof c === 'string' && c.trim().length > 0) return c;
    }
    return '';
};

const extractSubject = (mail) => String(mail?.subject || '').trim();

const computeTrustScore = (mail) => {
    if (!mail || typeof mail !== 'object') {
        return { score: 0, level: 'blocked', signals: [{ id: 'no_mail_data', weight: -1.0 }] };
    }

    const signals = [];
    let penalty = 0;

    const senderEmail = extractSenderEmail(mail);
    const senderName = extractSenderName(mail);
    const bodyText = extractBodyText(mail);
    const subject = extractSubject(mail);
    const fullText = `${subject} ${bodyText}`.toLowerCase();

    // Signal 1: sender display name vs email domain mismatch
    if (senderName && senderEmail) {
        const nameLower = senderName.toLowerCase().replace(/[^a-z0-9]/g, '');
        const emailLocal = senderEmail.split('@')[0].replace(/[^a-z0-9]/g, '');
        const emailDomain = (senderEmail.split('@')[1] || '').split('.')[0];
        const nameWords = senderName.toLowerCase().split(/\s+/);
        const localMatchesName = nameWords.some((w) => w.length > 2 && emailLocal.includes(w));
        const domainMatchesName = nameWords.some((w) => w.length > 2 && emailDomain.includes(w));
        if (!localMatchesName && !domainMatchesName && nameLower !== emailLocal) {
            signals.push({ id: 'sender_name_email_mismatch', weight: -0.15 });
            penalty += 0.15;
        }
    }

    // Signal 2: no sender email at all
    if (!senderEmail) {
        signals.push({ id: 'no_sender_email', weight: -0.3 });
        penalty += 0.3;
    }

    // Signal 3: phishing phrases
    let phishingHits = 0;
    const allPhishingPhrases = [...PHISHING_PHRASES_EN, ...PHISHING_PHRASES_FR];
    for (const phrase of allPhishingPhrases) {
        if (fullText.includes(phrase.toLowerCase())) {
            phishingHits++;
        }
    }
    if (phishingHits > 0) {
        const phishWeight = Math.min(phishingHits * 0.15, 0.6);
        signals.push({ id: 'phishing_phrases', count: phishingHits, weight: -phishWeight });
        penalty += phishWeight;
    }

    // Signal 4: urgency language
    let urgencyHits = 0;
    const allUrgencyWords = [...URGENCY_WORDS_EN, ...URGENCY_WORDS_FR];
    for (const word of allUrgencyWords) {
        if (fullText.includes(word.toLowerCase())) {
            urgencyHits++;
        }
    }
    if (urgencyHits > 0) {
        const urgWeight = Math.min(urgencyHits * 0.1, 0.3);
        signals.push({ id: 'urgency_language', count: urgencyHits, weight: -urgWeight });
        penalty += urgWeight;
    }

    // Signal 5: suspicious links in body
    let suspiciousLinkCount = 0;
    for (const pattern of SUSPICIOUS_LINK_PATTERNS) {
        if (pattern.test(bodyText) || pattern.test(subject)) {
            suspiciousLinkCount++;
        }
    }
    if (suspiciousLinkCount > 0) {
        const linkWeight = Math.min(suspiciousLinkCount * 0.12, 0.5);
        signals.push({ id: 'suspicious_links', count: suspiciousLinkCount, weight: -linkWeight });
        penalty += linkWeight;
    }

    // Signal 6: request for credentials/money in body
    const credentialPatterns = [
        /password/i, /mot de passe/i, /credit card/i, /carte de credit/i,
        /bank account/i, /compte bancaire/i, /social security/i,
        /numero de securite sociale/i, /pin code/i, /cvv/i,
        /routing number/i, /iban/i, /swift/i
    ];
    let credentialHits = 0;
    for (const pat of credentialPatterns) {
        if (pat.test(fullText)) credentialHits++;
    }
    if (credentialHits > 0) {
        const credWeight = Math.min(credentialHits * 0.15, 0.5);
        signals.push({ id: 'credential_request', count: credentialHits, weight: -credWeight });
        penalty += credWeight;
    }

    // Signal 7: empty body with actionable subject
    if (!bodyText.trim() && subject.length > 0) {
        signals.push({ id: 'empty_body', weight: -0.1 });
        penalty += 0.1;
    }

    // Signal 8: excessive exclamation marks / caps
    const exclamationCount = (fullText.match(/!/g) || []).length;
    if (exclamationCount > 3) {
        signals.push({ id: 'excessive_exclamation', count: exclamationCount, weight: -0.1 });
        penalty += 0.1;
    }
    const upperRatio = subject.length > 5
        ? (subject.replace(/[^A-Z]/g, '').length / subject.length)
        : 0;
    if (upperRatio > 0.6) {
        signals.push({ id: 'excessive_caps_subject', ratio: upperRatio, weight: -0.1 });
        penalty += 0.1;
    }

    const rawScore = Math.max(0, Math.min(1, 1 - penalty));
    const level = rawScore >= TRUST_THRESHOLD_OK
        ? 'trusted'
        : rawScore >= TRUST_THRESHOLD_WARN
            ? 'suspicious'
            : 'blocked';

    return { score: Math.round(rawScore * 100) / 100, level, signals };
};

const buildTrustWarning = (trustResult, locale) => {
    const en = String(locale || '').toLowerCase().startsWith('en');
    const pct = Math.round(trustResult.score * 100);

    if (trustResult.level === 'blocked') {
        return en
            ? `This mail appears unsafe (trust score: ${pct}%). I blocked the action to protect you. Detected issues: ${describeTrustSignals(trustResult.signals, 'en')}.`
            : `Ce mail semble dangereux (score de confiance : ${pct}%). J'ai bloque l'action pour te proteger. Problemes detectes : ${describeTrustSignals(trustResult.signals, 'fr')}.`;
    }
    if (trustResult.level === 'suspicious') {
        return en
            ? `Warning: this mail looks suspicious (trust score: ${pct}%). Detected issues: ${describeTrustSignals(trustResult.signals, 'en')}. Do you still want to proceed?`
            : `Attention : ce mail semble suspect (score de confiance : ${pct}%). Problemes detectes : ${describeTrustSignals(trustResult.signals, 'fr')}. Veux-tu quand meme continuer ?`;
    }
    return '';
};

const SIGNAL_LABELS = {
    en: {
        sender_name_email_mismatch: 'sender name does not match the email address',
        no_sender_email: 'no sender email address',
        phishing_phrases: 'phishing phrases detected',
        urgency_language: 'urgency language detected',
        suspicious_links: 'suspicious links found',
        credential_request: 'request for sensitive credentials or financial data',
        empty_body: 'empty mail body with actionable subject',
        excessive_exclamation: 'excessive exclamation marks',
        excessive_caps_subject: 'subject in all caps',
        no_mail_data: 'no mail data to analyze'
    },
    fr: {
        sender_name_email_mismatch: 'le nom de l expediteur ne correspond pas a l adresse email',
        no_sender_email: 'pas d adresse email d expediteur',
        phishing_phrases: 'phrases d hameconnage detectees',
        urgency_language: 'langage d urgence detecte',
        suspicious_links: 'liens suspects trouves',
        credential_request: 'demande d identifiants sensibles ou de donnees financieres',
        empty_body: 'corps du mail vide avec un objet qui incite a agir',
        excessive_exclamation: 'points d exclamation excessifs',
        excessive_caps_subject: 'objet en majuscules',
        no_mail_data: 'aucune donnee de mail a analyser'
    }
};

const describeTrustSignals = (signals, lang = 'en') => {
    const labels = SIGNAL_LABELS[lang] || SIGNAL_LABELS.en;
    return signals
        .map((s) => labels[s.id] || s.id)
        .join(', ');
};

export {
    computeTrustScore,
    buildTrustWarning,
    describeTrustSignals,
    TRUST_THRESHOLD_OK,
    TRUST_THRESHOLD_WARN,
    extractSenderEmail,
    extractSenderName,
    extractBodyText,
    extractSubject
};
