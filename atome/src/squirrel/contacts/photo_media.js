import { importIdentity } from '../shared/canonical_import.js';

const CONTACT_PHOTO_ID_PREFIX = 'contact_photo_';
/** Failures a later read of the same source photo cannot fix. */
export const CONTACT_PHOTO_PERMANENT_ERRORS = new Set(['contact_photo_payload_invalid', 'contact_photo_owner_invalid']);
// The media record can outlive its file (iOS keeps files on the local server
// only; a reinstall empties it): such a photo is uploaded again.
const MEDIA_FILE_MISSING = new Set(['media_export_read_failed', 'media_export_file_unavailable']);

/** Contact photos are ordinary image media; listings show them apart from the user's own files. */
export const isContactPhotoMedia = (file = {}) => [file.id, file.atome_id, file.file_name, file.name]
    .some(value => String(value || '').startsWith(CONTACT_PHOTO_ID_PREFIX));

// Variantes rencontrees a l'import (vCard, carnets natifs) ramenees a la forme acceptee.
const normalizeEmbeddedPhoto = (photo) => (typeof photo === 'string' && photo.startsWith('data:')
    ? photo.replace(/\s+/g, '').replace(/^data:image\/(?:image\/)?jpg;/i, 'data:image/jpeg;').replace(/^data:image\/image\//i, 'data:image/')
    : photo);

/** Embedded images use the existing file/media intake; arbitrary remote images are never fetched. */
export async function persistContactPhoto(contact, context, signal) {
    const photo = normalizeEmbeddedPhoto(contact.photo ?? contact.raw?.photo);
    if (photo === '') return { ...contact, photo: '', user_face: '', photo_asset_id: '' };
    if (!photo || !photo.startsWith('data:')) return contact;
    const match = photo.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match || photo.length > 1024 * 1024) throw new Error('contact_photo_payload_invalid');
    context.check(); signal?.throwIfAborted();
    const id = `${CONTACT_PHOTO_ID_PREFIX}${await importIdentity([context.owner, photo])}`;
    let existing;
    try { existing = await context.store.getStateCurrent(id); }
    catch (error) { if (!/atome_not_available_locally|not_found/i.test(error.message)) throw error; }
    context.check();
    if (existing?.owner_id && String(existing.owner_id) !== context.owner) throw new Error('contact_photo_owner_invalid');
    let url = existing?.properties?.media_url;
    if (existing?.deleted_at || existing?.deleted || existing?.properties?.__deleted) url = null;
    const [{ createAssetFileUploader, readMediaAssetBytes }, { createUploadAtome }] = await Promise.all([
        import('../../../../eVe/domains/media/asset_box_file_upload.js'),
        import('../../../../eVe/domains/media/asset_box_atome_store.js')
    ]);
    if (url) {
        try { await readMediaAssetBytes({ fileName: existing.properties.file_name, ownerId: context.owner }); }
        catch (error) { if (!MEDIA_FILE_MISSING.has(error.message)) throw error; url = null; }
        context.check();
    }
    if (!url) {
        const upload = createAssetFileUploader({ setUploadsAuthMissing() {}, renderAuthMissingUploads() {}, createUploadAtomeForUpload: createUploadAtome });
        const binary = atob(match[2]), bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
        const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[match[1]];
        const file = new File([bytes], `${id}.${extension}`, { type: match[1] });
        const result = await upload({ file, name: file.name, type: file.type }, { atomeId: id, scope: 'global',
            checkSession: context.check, signal, typeOverride: 'image', extraParticles: { access: 'private', visibility: 'private' } });
        context.check();
        if (!result.ok || !result.mediaUrl) throw new Error('contact_photo_media_commit_failed');
        url = result.mediaUrl;
    }
    return { ...contact, photo: url, photo_asset_id: id, user_face: url };
}

export async function exportContactPhoto(contact, context) {
    if (!contact.photo_asset_id) return contact;
    const asset = await context.store.getStateCurrent(contact.photo_asset_id);
    context.check();
    const props = asset?.properties || {};
    if (asset?.owner_id && String(asset.owner_id) !== context.owner) throw new Error('contact_photo_owner_invalid');
    const { readMediaAssetBytes } = await import('../../../../eVe/domains/media/asset_box_file_upload.js');
    const bytes = await readMediaAssetBytes({ fileName: props.file_name, ownerId: context.owner });
    context.check();
    if (!/^image\/(jpeg|png|webp)$/.test(props.mime_type)) throw new Error('contact_photo_mime_invalid');
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    return { ...contact, photo: `data:${props.mime_type};base64,${btoa(binary)}` };
}
