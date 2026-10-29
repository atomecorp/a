import { validateParams } from '../ai/agent_gateway_normalize.js';
import { SITE_SLUG_MAX } from '../../shared/site_contract.js';

// The public website of a project (todo/publication_web_2026-10-28.md): one contract for runtime V2, AI discovery,
// voice and direct MCP calls, run by eVe/domains/site/site_runtime.js. A project has at most one site, named by its
// `project_id`. Its pages are the Pages at the project's root; publishing freezes a version served at
// https://atome.one/<slug>[/<page>]. Domains and mail boxes go through a simulated provider: nothing is bought.
export const SITE_ERRORS = Object.freeze(['INVALID_ARGUMENT', 'NOT_FOUND', 'AUTH_REQUIRED', 'SLUG_TAKEN', 'SLUG_RESERVED', 'SLUG_INVALID',
    'NO_PAGE', 'NOT_PUBLISHED', 'NOT_ALLOWED', 'PRESENTATION_UNAVAILABLE', 'SOURCE_UNAVAILABLE', 'WRITE_FAILED', 'DOMAIN_TAKEN',
    'DOMAIN_INVALID', 'DOMAIN_NOT_VERIFIED', 'QUOTE_EXPIRED', 'PROVIDER_FAILED']);

const id = { type: 'string', minLength: 1, maxLength: 200 };
const project = { ...id, description: 'The project of the site (projects.list); absent: the project open.' };
const isoDate = { type: 'string', minLength: 10, maxLength: 40, description: 'ISO 8601 date-time; absent: now.' };
const domain = { type: 'string', minLength: 3, maxLength: 253, description: 'A domain name, e.g. atelier-lune.fr.' };
const settings = {
    slug: { type: 'string', minLength: 1, maxLength: SITE_SLUG_MAX, description: 'The address part after atome.one/.' },
    title: { type: 'string', maxLength: 120 }, description: { type: 'string', maxLength: 300 },
    page_ids: { type: 'array', maxItems: 200, items: id, description: 'The pages published (all the project\'s pages when absent).' },
    credit: { type: 'boolean', description: 'The « Créé avec atome » line at the foot of each page.' }
};
const definitions = {
    goto: [{ page_id: id, url: { type: 'string', minLength: 1, maxLength: 2000 }, new_tab: { type: 'boolean' } }, [],
        'Aller: show a page of the project (page_id), or open an outside http(s) address (url, in a new tab when new_tab). The action of an interaction «  Aller  ».', false, 'control'],
    pages: [{ project_id: project }, [], 'The site\'s pages: the project\'s root Pages in order, the home first marked, each with its address part.', false, 'read'],
    state: [{ project_id: project }, [], 'The site of a project: its address, whether it is online, its versions, the next planned operation, its domain.', false, 'read'],
    list: [{}, [], 'Every site of the user (Mes sites): name, address, state.', false, 'read'],
    settings: [{ project_id: project, ...settings }, [], 'Set the site\'s address, title, description, published pages or credit line (nothing goes online).', true, 'write'],
    check: [{ project_id: project }, [], 'Check the site before publishing: pages, links, images, objects a web page cannot show.', false, 'read'],
    preview: [{ project_id: project, page_id: id }, [], 'Open the preview of the site as it will be published.', false, 'control'],
    publish: [{ project_id: project, ...settings, at: isoDate }, [],
        'Publish the site (first time) or put the project\'s changes online, now or at a date (at). Say back the address and wait for the user\'s yes.', true, 'write'],
    cancel: [{ project_id: project }, [], 'Cancel the next planned operation of the site.', true, 'write'],
    history: [{ project_id: project }, [], 'The site\'s versions, newest first: number, date, author, state.', false, 'read'],
    rollback: [{ project_id: project, version: { type: 'integer', minimum: 1 } }, ['version'],
        'Put an earlier version back online (as a new version; the history is never rewritten). Wait for the user\'s yes.', true, 'write'],
    retire: [{ project_id: project }, [], 'Take the site offline (its address answers « Ce site n\'existe plus »); the project and the versions stay. Wait for the user\'s yes.', true, 'write'],
    menu: [{ project_id: project, page_ids: settings.page_ids, place: { type: 'string', enum: ['top', 'left', 'bottom'] } }, [],
        'Create the menu of the site: one text per page, each going to its page, the same on every page.', true, 'write'],
    form: [{ project_id: project, page_id: id }, [], 'Put a contact form on a page: visitors\' messages arrive in Communiquer.', true, 'write'],
    domain_search: [{ name: { type: 'string', minLength: 1, maxLength: 63 } }, ['name'], 'Search domain names (simulated provider): free or taken, yearly price.', false, 'read'],
    domain_quote: [{ domain }, ['domain'], 'The quote of a free domain: price, tax, total, renewal (kept 15 minutes).', false, 'read'],
    domain_buy: [{ project_id: project, domain, renew: { type: 'boolean' } }, ['domain'],
        'Buy a domain for the site (simulated: nothing is charged). Say back the domain and the total and wait for the user\'s yes.', true, 'write'],
    domain_connect: [{ project_id: project, domain }, ['domain'], 'Connect a domain the user already has: gives the TXT and CNAME to add at their DNS host.', true, 'write'],
    domain_verify: [{ project_id: project }, [], 'Check the connected domain\'s DNS records and certificate now.', false, 'read'],
    domain_primary: [{ project_id: project, primary: { type: 'string', enum: ['atome', 'domain'] } }, ['primary'], 'Choose the site\'s main address; the other redirects to it.', true, 'write'],
    domain_unlink: [{ project_id: project }, [], 'Unlink the domain from the site (atome.one/<slug> keeps working).', true, 'write'],
    domain_transfer: [{ project_id: project, domain, code: { type: 'string', minLength: 4, maxLength: 64 } }, ['domain', 'code'],
        'Transfer a domain of the user to atome (simulated). Wait for the user\'s yes.', true, 'write'],
    domain_records: [{ domain }, ['domain'], 'The DNS records and renewal of a domain the user has at atome.', false, 'read'],
    domain_record_set: [{ domain, type: { type: 'string', enum: ['A', 'AAAA', 'CNAME', 'TXT', 'MX'] }, name: { type: 'string', maxLength: 253 },
        value: { type: 'string', minLength: 1, maxLength: 1000 }, remove: { type: 'boolean' } }, ['domain', 'type', 'value'], 'Add, change or remove a DNS record (those atome sets are protected).', true, 'write'],
    domain_renewal: [{ domain, auto: { type: 'boolean' } }, ['domain', 'auto'], 'Renew the domain every year automatically, or not.', true, 'write'],
    domain_leave: [{ domain }, ['domain'], 'Get the code to transfer a domain away from atome. Wait for the user\'s yes.', true, 'write'],
    mail_list: [{ domain }, ['domain'], 'The mail boxes, aliases and forwards of a domain.', false, 'read'],
    mail_add: [{ domain, local: { type: 'string', minLength: 1, maxLength: 64 }, forward_to: { type: 'string', maxLength: 254 },
        alias_of: { type: 'string', maxLength: 254 } }, ['domain', 'local'], 'Create a mail box (simulated), or an alias (alias_of) or a forward (forward_to). Wait for the user\'s yes for a box.', true, 'write'],
    mail_remove: [{ domain, local: { type: 'string', minLength: 1, maxLength: 64 } }, ['domain', 'local'], 'Remove a mail box, alias or forward. Wait for the user\'s yes.', true, 'write'],
    hosting: [{}, [], 'Hosting: included in the subscription; sites online, traffic of the month, storage, domains and mail costs.', false, 'read']
};
export const SITE_COMMANDS = Object.freeze(Object.entries(definitions).map(([action, [properties, required, description, persistent, access]]) => Object.freeze({
    name: `site.${action}`, action, description, persistent, capability: `site.${access}`,
    input_schema: { type: 'object', additionalProperties: false, properties, required },
    output_schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' }, error: { type: 'string', enum: SITE_ERRORS },
        site: { type: 'object' }, sites: { type: 'array', items: { type: 'object' } }, pages: { type: 'array', items: { type: 'object' } },
        versions: { type: 'array', items: { type: 'object' } }, report: { type: 'object' }, results: { type: 'array', items: { type: 'object' } },
        quote: { type: 'object' }, records: { type: 'array', items: { type: 'object' } }, boxes: { type: 'array', items: { type: 'object' } },
        hosting: { type: 'object' }, url: { type: 'string' } } }
})));
export const SITE_CONFIRMED_COMMANDS = Object.freeze(['site.publish', 'site.rollback', 'site.retire', 'site.domain_buy', 'site.domain_transfer',
    'site.domain_leave', 'site.mail_add', 'site.mail_remove']);
export const validateSiteInput = (action, input) => {
    const contract = SITE_COMMANDS.find(command => command.action === action);
    return contract && validateParams(contract.input_schema, input).ok ? null : 'INVALID_ARGUMENT';
};
export const SITE_ASSISTANT_INSTRUCTIONS = 'Website (a project published at atome.one/<address>): « publie mon site » / « mets le site à jour » call site.publish (say back the address, wait for the yes); « publie-le demain à 9 h » adds at; « annule la mise à jour » calls site.cancel; « remets la version 2 » calls site.rollback; « retire mon site » calls site.retire; « mes sites » calls site.list; « crée un menu » calls site.menu; « ajoute un formulaire de contact » calls site.form; a page of the site is a Page of the project (ui.page.create with a name); « ce bouton va à la page Contact » is an interaction whose action is site.goto (interactions.create). Domains (simulated provider, nothing is bought): site.domain_search, site.domain_quote, site.domain_buy, site.domain_connect; mail boxes: site.mail_*. Hosting is included in the subscription (site.hosting).';
