/** Publishing is a transaction on one explicitly named internal track. */
export function remoteVersionCodes(state) {
    const codes = [...state.bundles.map(bundle => bundle.versionCode), ...state.apks.map(apk => apk.versionCode)];
    for (const track of state.tracks) {
        if (!Array.isArray(track.releases) && track.releases !== undefined) throw new Error('Invalid Play track inventory');
        for (const release of track.releases || []) {
            if (!Array.isArray(release.versionCodes)) throw new Error('Invalid Play release inventory');
            codes.push(...release.versionCodes);
        }
    }
    const numbers = codes.map(Number);
    if (numbers.some(code => !Number.isSafeInteger(code) || code < 1 || code > 2100000000)) throw new Error('Invalid Play version inventory');
    return numbers;
}

function matchingBundle(state, report) {
    const bundle = state.bundles.find(item => Number(item.versionCode) === report.versionCode);
    if (bundle && bundle.sha256?.toLowerCase() !== report.metadata.sha256) throw new Error('Google Play has a different bundle for this version code');
    return bundle;
}

function completedInternal(state, report) {
    return state.tracks.find(track => track.track === 'internal')?.releases?.some(release =>
        release.status === 'completed' && release.versionCodes.map(Number).includes(report.versionCode));
}

export async function publishRelease({ client, report, save, releaseNotes = [] }) {
    if (report.track !== 'internal' || report.metadata.packageName !== report.packageName
        || report.metadata.versionCode !== report.versionCode || report.metadata.signature !== 'verified'
        || report.metadata.bundleValidation !== 'verified' || report.metadata.nativeLink !== 'verified') throw new Error('Android release has not passed its publication gate');
    const checkpoint = async patch => { Object.assign(report, patch); await save(report); };
    let existing = false;
    if (report.editId) {
        try { await client.getEdit(report.editId); existing = true; }
        catch (error) { if (error.status !== 404) throw error; }
    }
    if (!existing) {
        const edit = await client.createEdit();
        await checkpoint({ editId: edit.id, status: 'inspecting-play' });
    }
    const state = await client.state(report.editId);
    if (!state.tracks.some(track => track.track === 'internal')) throw new Error('Create the internal test track in Play Console first');
    const bundle = matchingBundle(state, report);
    // A fresh edit mirrors committed state. An existing edit can contain unsent changes.
    if (!existing && bundle && completedInternal(state, report)) {
        await client.deleteEdit(report.editId);
        await checkpoint({ status: 'committed-confirmed', googleConfirmed: true });
        return report;
    }
    if (remoteVersionCodes(state).some(code => code > report.versionCode)) {
        throw new Error('A newer Google Play version exists; this prepared bundle cannot replace it. Prepare a new release');
    }
    if (!bundle) {
        if (report.uploadAttempted) throw new Error('Previous upload is uncertain or its edit expired; do not reuse this version code. Inspect Play Console or prepare a higher code');
        if (remoteVersionCodes(state).some(code => code >= report.versionCode)) throw new Error('Prepared version code is no longer newer than Google Play; prepare a new release');
        await checkpoint({ status: 'uploading', uploadAttempted: true });
        const uploaded = await client.upload(report.editId, report.metadata.artifact);
        if (Number(uploaded.versionCode) !== report.versionCode || uploaded.sha256?.toLowerCase() !== report.metadata.sha256) {
            throw new Error('Google Play upload response does not confirm the planned version and SHA-256');
        }
        await checkpoint({ status: 'uploaded' });
    }
    await client.updateInternal(report.editId, { versionCode: report.versionCode, versionName: report.versionName, releaseNotes });
    await checkpoint({ status: 'internal-track-updated' });
    await client.validate(report.editId);
    await checkpoint({ status: 'committing', commitAttempted: true });
    await client.commit(report.editId);
    await checkpoint({ status: 'committed-unverified', googleConfirmed: false });
    const verification = await client.createEdit();
    await checkpoint({ verificationEditId: verification.id });
    try {
        const committed = await client.state(verification.id);
        if (!matchingBundle(committed, report) || !completedInternal(committed, report)) throw new Error('Google Play has not confirmed the committed internal release');
    } finally {
        // This discards only our read-back edit, never an artifact or published release.
        await client.deleteEdit(verification.id);
    }
    await checkpoint({ status: 'committed-confirmed', googleConfirmed: true });
    return report;
}
