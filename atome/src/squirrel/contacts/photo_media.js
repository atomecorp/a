import { importIdentity } from '../shared/canonical_import.js';

const CONTACT_PHOTO_ID_PREFIX = 'contact_photo_';
/** The one failure of an embedded photo: its contact is kept without it. */
export const CONTACT_PHOTO_PAYLOAD_INVALID = 'contact_photo_payload_invalid';

/** Contact photos stored as media before 24 Oct 2026; listings show them apart from the user's own files. */
export const isContactPhotoMedia = (file = {}) => [file.id, file.atome_id, file.file_name, file.name]
    .some(value => String(value || '').startsWith(CONTACT_PHOTO_ID_PREFIX));

// Variantes rencontrees a l'import (vCard, carnets natifs) ramenees a la forme acceptee.
const normalizeEmbeddedPhoto = (photo) => (typeof photo === 'string' && photo.startsWith('data:')
    ? photo.replace(/\s+/g, '').replace(/^data:image\/(?:image\/)?jpg;/i, 'data:image/jpeg;').replace(/^data:image\/image\//i, 'data:image/')
    : photo);
const EMBEDDED_PHOTO = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

/**
 * An imported photo lives inline in its card, like every identity photo (the
 * account's own photo, a photo picked for a contact): the card carries it to
 * every device of the account and back after a restore. A stored file was
 * bound to the importing device (an iOS local-server path) and was never seen
 * again on another device or after a reinstall. `photo_asset_id` names the
 * photo, so a repeated import recognizes the same one. Remote images are
 * never fetched.
 */
export async function persistContactPhoto(contact, context) {
    const photo = normalizeEmbeddedPhoto(contact.photo ?? contact.raw?.photo);
    if (photo === '') return { ...contact, photo: '', user_face: '', photo_asset_id: '' };
    if (!photo || !photo.startsWith('data:')) return contact;
    if (!EMBEDDED_PHOTO.test(photo) || photo.length > 1024 * 1024) throw new Error(CONTACT_PHOTO_PAYLOAD_INVALID);
    context.check();
    const id = `${CONTACT_PHOTO_ID_PREFIX}${await importIdentity([context.owner, photo])}`;
    return { ...contact, photo, photo_asset_id: id, user_face: photo };
}

/**
 * The photo of a card that names it by a stored file (`photo_asset_id`, every
 * import before 24 Oct 2026), read from the server, which holds every media of
 * the account (AGENTS.md rule 21): the card's own path was bound to the device
 * that imported it. Answers the inline photo, or '' when the server has no such
 * image (the photo is gone); a server out of reach throws, to be read again later.
 */
export async function readStoredContactPhoto(contact, context) {
    const asset = await context.store.getStateCurrent(contact.photo_asset_id);
    context.check();
    if (!asset) throw new Error('contact_photo_asset_unavailable');
    if (asset.owner_id && String(asset.owner_id) !== context.owner) throw new Error('contact_photo_owner_invalid');
    const props = asset.properties || {};
    if (!/^image\/(jpeg|png|webp)$/.test(props.mime_type) || !props.media_url) return '';
    const { fetchAuthorizedMedia } = await import('../../../../eVe/domains/media/api/media_api_auth.js');
    const response = await fetchAuthorizedMedia(props.media_url, { signal: AbortSignal.timeout(15000) });
    context.check();
    if (response.status === 404) return '';
    if (!response.ok) throw new Error(`contact_photo_read_failed:${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    context.check();
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    const photo = `data:${props.mime_type};base64,${btoa(binary)}`;
    return EMBEDDED_PHOTO.test(photo) && photo.length <= 1024 * 1024 ? photo : '';
}

/** A card whose photo is a stored file of the account (see readStoredContactPhoto). */
export const hasStoredContactPhoto = contact => !!contact.photo_asset_id && !String(contact.photo || '').startsWith('data:');

export async function exportContactPhoto(contact, context) {
    if (!hasStoredContactPhoto(contact)) return contact;
    return { ...contact, photo: await readStoredContactPhoto(contact, context) };
}
