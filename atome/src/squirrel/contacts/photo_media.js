import { importIdentity } from '../shared/canonical_import.js';

const CONTACT_PHOTO_ID_PREFIX = 'contact_photo_';

/** Contact photos are ordinary image media; listings show them apart from the user's own files. */
export const isContactPhotoMedia = (file = {}) => [file.id, file.atome_id, file.file_name, file.name]
    .some(value => String(value || '').startsWith(CONTACT_PHOTO_ID_PREFIX));

/** Embedded images use the existing file/media intake; arbitrary remote images are never fetched. */
export async function persistContactPhoto(contact, context, signal) {
    const photo = contact.photo ?? contact.raw?.photo;
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
    if (!url) {
        const [{ createAssetFileUploader }, { createUploadAtome }] = await Promise.all([
            import('../../../../eVe/domains/media/asset_box_file_upload.js'),
            import('../../../../eVe/domains/media/asset_box_atome_store.js')
        ]);
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
