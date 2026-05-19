// ============================================
// SHARE UI (UI ONLY)
// ============================================

import Button from '../../squirrel/components/button_builder.js';
import List from '../../squirrel/components/List_builder.js';
import dropDown from '../../squirrel/components/dropDown_builder.js';

import { ShareAPI } from './share.js';

const BASE_Z_INDEX = 50000;
const SHARE_UI_VERSION = '2025-12-18-three-panels-v6';

let dialogIsOpening = false;

let shareOverlay = null;
let usersList = null;
let sharedContainer = null;
let selectedTarget = null; // { phone, username, userId }
let modeDropDown = null;
let shareTypeDropDown = null;
let atomeIdInput = null;
let durationInput = null;
let conditionInput = null;
let atomesList = null;
let atomesHolderEl = null;
let statusLineEl = null;

let refreshAtomesInFlight = false;
let refreshSharedInFlight = false;

let shareUiEventHandlersRegistered = false;

function registerShareUiEventHandlers() {
    if (shareUiEventHandlersRegistered) return;
    shareUiEventHandlersRegistered = true;

    window.addEventListener('adole-share-imported', async () => {
        try {
            // Keep the dialog in sync when an import happens
            await refreshShared();
            await refreshAtomes();
        } catch (_) { }
    });

    window.addEventListener('abox-share-selection', async () => {
        try {
            await refreshAtomes();
        } catch (_) { }
    });
}

function uniqueUiId(prefix) {
    try {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return `${prefix}-${crypto.randomUUID()}`;
        }
    } catch (_) { }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getIntuitionHost() {
    return document.getElementById('intuition');
}

function waitForIntuitionHost({ maxAttempts = 60, intervalMs = 250 } = {}) {
    return new Promise((resolve) => {
        let attempts = 0;
        const tick = () => {
            attempts += 1;
            const host = getIntuitionHost();
            if (host) return resolve(host);
            if (attempts >= maxAttempts) return resolve(null);
            setTimeout(tick, intervalMs);
        };
        tick();
    });
}

let shareButtonRetryTimer = null;
let shareButtonRetryCount = 0;
const SHARE_BUTTON_MAX_RETRIES = 600; // ~5 minutes at 500ms
let shareButtonWarned = false;
let shareButtonObserver = null;

function scheduleShareButtonRetry() {
    if (shareButtonRetryTimer) return;
    if (shareButtonRetryCount >= SHARE_BUTTON_MAX_RETRIES) return;
    shareButtonRetryTimer = setTimeout(() => {
        shareButtonRetryTimer = null;
        shareButtonRetryCount += 1;
        createShareButton();
    }, 500);
}

function ensureShareButton() {
    const root = getIntuitionHost();
    if (!root) return;
    if (document.getElementById('share_button_holder')) return;
    createShareButton();
}

function watchShareButton() {
    if (shareButtonObserver || typeof MutationObserver === 'undefined') return;
    shareButtonObserver = new MutationObserver(() => {
        ensureShareButton();
    });
    shareButtonObserver.observe(document.body, { childList: true, subtree: true });
}

function destroyDialog() {
    if (shareOverlay) {
        shareOverlay.remove();
        shareOverlay = null;
    }
    usersList = null;
    sharedContainer = null;
    selectedTarget = null;
    modeDropDown = null;
    shareTypeDropDown = null;
    atomeIdInput = null;
    durationInput = null;
    conditionInput = null;
    atomesList = null;
    atomesHolderEl = null;
    statusLineEl = null;
}

function formatUserLabel(user) {
    const username = user.username || user.data?.username || user.particles?.username || 'Unknown';
    const phone = user.phone || user.data?.phone || user.particles?.phone || '';
    return phone ? `${username} (${phone})` : `${username}`;
}

function clearSharedList() {
    if (!sharedContainer) return;
    sharedContainer.innerHTML = '';
}

function refreshAtomeIdFromSelection() {
    if (!atomeIdInput) return;
    const selected = ShareAPI.get_selected_atome_id ? ShareAPI.get_selected_atome_id() : null;
    if (selected) atomeIdInput.value = String(selected);
}

function setStatus(message, type = 'info') {
    if (!statusLineEl) return;
    statusLineEl.textContent = message || '';
    statusLineEl.style.color = type === 'error' ? '#ff7a7a' : type === 'success' ? '#7dff9b' : '#aaa';
}

function getABoxSelectedAtomeIds() {
    if (typeof window === 'undefined') return [];
    const ids = window.__aBoxShareSelection?.atomeIds;
    if (!Array.isArray(ids)) return [];
    return ids.map(String).filter(Boolean);
}

function getABoxSelectedItems() {
    if (typeof window === 'undefined') return [];
    const items = window.__aBoxShareSelection?.items;
    if (!Array.isArray(items)) return [];
    return items.filter(item => item && item.id).map(item => ({
        id: String(item.id),
        label: item.label || item.filePath || item.fileName || String(item.id),
        filePath: item.filePath || null,
        fileName: item.fileName || null,
        type: item.type || 'abox'
    }));
}

function formatImportStatus(res) {
    if (!res) return 'Share updated.';
    const effectiveShareType = res.shareType || 'linked';
    if (effectiveShareType === 'linked' && (!res.imported || res.imported === 0)) {
        return res.sharedProjectId
            ? 'Linked share active. Shared project added to your list.'
            : 'Linked share active.';
    }
    const count = res.imported || 0;
    return `Imported ${count} atome(s).`;
}

async function refreshAtomes() {
    if (refreshAtomesInFlight) return;
    refreshAtomesInFlight = true;

    const holderEl = atomesHolderEl?.element || atomesHolderEl;
    try {
        if (!atomesHolderEl) return;

        try { atomesList?.destroy?.(); } catch (_) { }
        try { holderEl.innerHTML = ''; } catch (_) { }
        try {
            const attachEl = document.querySelector('#share_atomes_list');
            if (attachEl && attachEl !== holderEl) attachEl.innerHTML = '';
        } catch (_) { }
        atomesList = null;

        const res = await ShareAPI.list_current_project_atomes_normalized();
        const items = res.ok ? (res.items || []) : [];
        const aBoxItems = getABoxSelectedItems();
        const uniqueABoxItems = [];
        const seenABox = new Set();
        aBoxItems.forEach((item) => {
            if (seenABox.has(item.id)) return;
            seenABox.add(item.id);
            uniqueABoxItems.push(item);
        });
        const existingIds = new Set(items.map(item => String(item.id)));
        const aBoxExtras = uniqueABoxItems
            .filter(item => !existingIds.has(String(item.id)))
            .map((item) => ({
                id: String(item.id),
                type: item.type || 'abox',
                label: item.label || `aBox • ${String(item.id).slice(0, 8)}`,
                particles: {}
            }));
        const listItems = [...aBoxExtras, ...items];

        if (!listItems.length) {
            if (!res.ok) {
                const msg = res.error || 'Failed to load atomes';
                $('div', { parent: holderEl, css: { color: '#ff7a7a', fontSize: '12px' }, text: msg });
            } else {
                $('div', { parent: holderEl, css: { color: '#888', fontSize: '12px' }, text: 'No atomes in current project.' });
            }
            return;
        }

        const attachEl = document.querySelector('#share_atomes_list');
        const listWidth = Math.max(200, (attachEl?.clientWidth || 520));
        const listHeight = Math.max(120, (attachEl?.clientHeight || 160));

        atomesList = new List({
            id: uniqueUiId('share-atomes'),
            attach: '#share_atomes_list',
            position: { x: 0, y: 0 },
            size: { width: listWidth, height: listHeight },
            spacing: { vertical: 4, itemPadding: 10, marginTop: 6, marginBottom: 6 },
            containerStyle: { background: 'transparent' },
            itemStyle: {
                fontSize: '12px',
                fontWeight: '400',
                lineHeight: '1.3',
                textColor: '#ddd',
                backgroundColor: '#1e1e1e',
                borderRadius: '8px'
            },
            states: {
                hover: { backgroundColor: '#2a2a2a' },
                selected: { backgroundColor: '#2f5eff', color: 'white' }
            },
            items: listItems.map(a => ({ content: `${a.type} • ${a.label} • ${String(a.id).slice(0, 8)}` })),
            onItemClick: (item) => {
                const idx = listItems.findIndex(a => `${a.type} • ${a.label} • ${String(a.id).slice(0, 8)}` === item.content);
                const a = listItems[idx];
                if (!a) return;
                if (atomeIdInput) atomeIdInput.value = String(a.id);
            }
        });
    } finally {
        refreshAtomesInFlight = false;
    }
}

function renderSharedEntry(entry, parent, { kind, showAcceptReject = false, showPush = false, showImport = false } = {}) {
    const row = $('div', {
        parent,
        css: {
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            alignItems: 'center',
            padding: '8px',
            backgroundColor: '#1e1e1e',
            borderRadius: '8px'
        }
    });

    const status = entry.status || null;
    const isTerminal = status === 'accepted' || status === 'rejected';

    // Per-row checkbox:
    // - pending: allow toggle (checked = accept)
    // - outgoing/shared-by-others: enabled toggle (unchecked = disabled)
    const checkboxWrap = $('div', {
        parent: row,
        css: { display: 'flex', alignItems: 'center', gap: '6px' }
    });

    const checkbox = $('input', {
        parent: checkboxWrap,
        attrs: { type: 'checkbox' },
        css: { width: '16px', height: '16px', cursor: isTerminal ? 'not-allowed' : 'pointer', pointerEvents: 'auto' }
    });

    const checkboxEl = checkbox?.element || checkbox;

    const setCheckboxState = () => {
        if (!checkboxEl) return;
        if (kind === 'pending') {
            checkboxEl.checked = false;
        } else {
            checkboxEl.checked = status !== 'disabled' && status !== 'rejected';
        }
        checkboxEl.disabled = !!isTerminal;
    };

    setCheckboxState();

    const checkboxHint = kind === 'pending' ? 'Allow/Deny' : 'Enabled';
    $('div', {
        parent: checkboxWrap,
        text: checkboxHint,
        css: { color: '#888', fontSize: '11px' }
    });

    const label = (() => {
        const target = entry.targetPhone || 'unknown';
        const mode = entry.mode || 'unknown';
        const shareType = entry.shareType || 'linked';
        const box = entry.box || 'box?';
        const statusLabel = entry.status || 'status?';
        const ids = Array.isArray(entry.atomeIds) ? entry.atomeIds : [];
        const count = ids.length;
        const idsLabel = ids.length ? ids.map(id => String(id).slice(0, 8)).join(', ') : '';
        const ts = entry.timestamp || '';
        const metaParts = [];
        if (entry.shareMeta?.duration) metaParts.push(`duration:${entry.shareMeta.duration}`);
        if (entry.shareMeta?.condition) metaParts.push('condition:yes');
        const metaLabel = metaParts.length ? ` • ${metaParts.join(' • ')}` : '';
        const idsPart = idsLabel ? ` • ${idsLabel}` : '';
        return `${box}:${statusLabel} • ${target} • ${mode} • ${shareType} • ${count} atomes${idsPart} • ${ts}${metaLabel}`;
    })();

    $('div', {
        parent: row,
        css: { color: '#d0d0d0', fontSize: '12px', flex: '1' },
        text: label
    });

    if (checkboxEl && !isTerminal) {
        checkboxEl.onchange = async () => {
            try {
                if (kind === 'pending') {
                    // Checked = allow (accept/import). Unchecked = deny (reject).
                    if (checkboxEl.checked) {
                        const res = await ShareAPI.accept_request(entry.atomeId);
                        if (!res?.ok) {
                            setStatus(res?.error || 'Accept failed.', 'error');
                        } else {
                            setStatus(formatImportStatus(res), 'success');
                        }
                    } else {
                        const res = await ShareAPI.reject_request(entry.atomeId);
                        if (!res?.ok) setStatus(res?.error || 'Reject failed.', 'error');
                        else setStatus('Request rejected.', 'success');
                    }
                } else {
                    const next = checkboxEl.checked
                        ? (entry.mode === 'validation-based' ? 'pending' : 'active')
                        : 'disabled';
                    if (ShareAPI.set_request_status) {
                        await ShareAPI.set_request_status(entry.atomeId, next);
                    }
                }
            } finally {
                await refreshShared();
            }
        };
    }

    if (showAcceptReject) {
        Button({
            template: 'material_design_blue',
            onText: 'Accept',
            offText: 'Accept',
            parent: row,
            forceText: true,
            css: { position: 'relative', height: '34px' },
            onAction: async () => {
                const res = await ShareAPI.accept_request(entry.atomeId);
                if (!res?.ok) setStatus(res?.error || 'Accept failed.', 'error');
                else setStatus(formatImportStatus(res), 'success');
                await refreshShared();
            },
            offAction: async () => {
                const res = await ShareAPI.accept_request(entry.atomeId);
                if (!res?.ok) setStatus(res?.error || 'Accept failed.', 'error');
                else setStatus(formatImportStatus(res), 'success');
                await refreshShared();
            }
        });

        Button({
            template: 'material_design_blue',
            onText: 'Reject',
            offText: 'Reject',
            parent: row,
            forceText: true,
            css: { position: 'relative', height: '34px' },
            onAction: async () => {
                const res = await ShareAPI.reject_request(entry.atomeId);
                if (!res?.ok) setStatus(res?.error || 'Reject failed.', 'error');
                else setStatus('Request rejected.', 'success');
                await refreshShared();
            },
            offAction: async () => {
                const res = await ShareAPI.reject_request(entry.atomeId);
                if (!res?.ok) setStatus(res?.error || 'Reject failed.', 'error');
                else setStatus('Request rejected.', 'success');
                await refreshShared();
            }
        });
        return;
    }

    if (showImport) {
        Button({
            template: 'material_design_blue',
            onText: 'Import',
            offText: 'Import',
            parent: row,
            forceText: true,
            css: { position: 'relative', height: '34px' },
            onAction: async () => {
                const res = await ShareAPI.accept_request(entry.atomeId);
                if (!res?.ok) setStatus(res?.error || 'Import failed.', 'error');
                else setStatus(formatImportStatus(res), 'success');
                await refreshShared();
            },
            offAction: async () => {
                const res = await ShareAPI.accept_request(entry.atomeId);
                if (!res?.ok) setStatus(res?.error || 'Import failed.', 'error');
                else setStatus(formatImportStatus(res), 'success');
                await refreshShared();
            }
        });
    }

    if (showPush) {
        Button({
            template: 'material_design_blue',
            onText: 'Push',
            offText: 'Push',
            parent: row,
            forceText: true,
            css: { position: 'relative', height: '34px' },
            onAction: async () => {
                await ShareAPI.push_share(entry);
                await refreshShared();
            },
            offAction: async () => {
                await ShareAPI.push_share(entry);
                await refreshShared();
            }
        });
    }
}

function renderSharePanel(title, items, { kind, parent } = {}) {
    if (!parent) return;

    const panel = $('div', {
        parent,
        css: {
            flex: '1 0 280px',
            minWidth: '280px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            borderRadius: '10px',
            backgroundColor: '#141414',
            border: '1px solid #333',
            padding: '10px',
            overflow: 'hidden'
        }
    });

    const header = $('div', {
        parent: panel,
        css: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
    });

    $('div', {
        parent: header,
        text: title,
        css: { color: '#bbb', fontSize: '12px', fontWeight: '600' }
    });

    $('div', {
        parent: header,
        text: String(items.length),
        css: { color: '#888', fontSize: '11px' }
    });

    const list = $('div', {
        parent: panel,
        css: {
            flex: '1',
            minHeight: '0',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            paddingTop: '8px'
        }
    });

    if (!items.length) {
        $('div', {
            parent: list,
            text: 'None',
            css: { color: '#666', fontSize: '12px', padding: '6px 0' }
        });
        return;
    }

    for (const entry of items) {
        const showAcceptReject = kind === 'pending';
        const showPush = kind === 'outgoing' && entry.mode === 'validation-based';
        const showImport = kind === 'shared-by-others';
        renderSharedEntry(entry, list, { kind, showAcceptReject, showPush, showImport });
    }
}

async function refreshShared() {
    if (refreshSharedInFlight) return;
    refreshSharedInFlight = true;

    try {
        if (!sharedContainer) return;
        clearSharedList();

        const result = await ShareAPI.list_shares();
        if (!result.ok) {
            $('div', { parent: sharedContainer, css: { color: '#ff7a7a' }, text: result.error || 'Failed to list shares' });
            return;
        }

        const all = result.items || [];
        if (!all.length) {
            $('div', { parent: sharedContainer, css: { color: '#888', fontSize: '12px' }, text: 'No shares yet.' });
            return;
        }

        const pendingIncoming = all.filter(e => e.box === 'inbox' && (!e.status || e.status === 'pending'));
        const mySharesWithOthers = all.filter(e => e.box === 'outbox');
        const sharedByOtherUsers = all.filter(e => e.box === 'inbox' && e.status && e.status !== 'pending');

        const panels = $('div', {
            parent: sharedContainer,
            css: {
                display: 'flex',
                gap: '10px',
                flex: '1',
                minHeight: '0',
                overflowX: 'auto',
                overflowY: 'hidden',
                paddingBottom: '2px'
            }
        });

        renderSharePanel('Pending share requests (to allow)', pendingIncoming, { kind: 'pending', parent: panels });
        renderSharePanel('Shared items with other users (my outgoing)', mySharesWithOthers, { kind: 'outgoing', parent: panels });
        renderSharePanel('Items shared by other users (incoming)', sharedByOtherUsers, { kind: 'shared-by-others', parent: panels });
    } finally {
        refreshSharedInFlight = false;
    }
}

async function openDialog() {
    if (shareOverlay) return;
    if (dialogIsOpening) return;
    dialogIsOpening = true;

    try { registerShareUiEventHandlers(); } catch (_) { }

    try {
        destroyDialog();

        const host = await waitForIntuitionHost();
        if (!host) {
            console.error('[ShareUI] Cannot open Share dialog: #intuition not found');
            return;
        }

        shareOverlay = $('div', {
            parent: host,
            id: 'share_overlay',
            css: {
                position: 'fixed',
                top: '0',
                left: '0',
                width: '100%',
                height: '100%',
                backgroundColor: 'rgba(0,0,0,0.5)',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: '10000020',
                pointerEvents: 'auto'
            }
        });

        const modal = $('div', {
            parent: shareOverlay,
            id: 'share_modal',
            css: {
                width: '1100px',
                maxWidth: '98vw',
                height: '600px',
                maxHeight: '90vh',
                backgroundColor: '#121212',
                borderRadius: '12px',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                pointerEvents: 'auto'
            }
        });

        const header = $('div', {
            parent: modal,
            css: {
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                backgroundColor: '#181818'
            }
        });

        $('div', {
            parent: header,
            css: { color: '#fff', fontSize: '16px', fontWeight: '600' },
            text: `Sharing (${SHARE_UI_VERSION})`
        });

        Button({
            template: 'material_design_blue',
            onText: 'Close',
            offText: 'Close',
            parent: header,
            forceText: true,
            css: { position: 'relative', height: '36px' },
            onAction: destroyDialog,
            offAction: destroyDialog
        });

        const body = $('div', {
            parent: modal,
            css: {
                flex: '1',
                display: 'flex',
                gap: '12px',
                padding: '12px',
                minHeight: '0',
                overflowY: 'auto',
                overflowX: 'auto'
            }
        });

        const left = $('div', {
            parent: body,
            css: {
                flex: '0 0 320px',
                width: '320px',
                minWidth: '320px',
                maxWidth: '320px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                minHeight: '0',
                overflow: 'hidden'
            }
        });

        $('div', {
            parent: left,
            css: { color: '#bbb', fontSize: '12px' },
            text: 'Users'
        });

        const usersHolder = $('div', {
            parent: left,
            id: 'share_users_list',
            css: {
                flex: '1',
                minHeight: '0',
                borderRadius: '10px',
                backgroundColor: '#1a1a1a',
                position: 'relative',
                overflow: 'hidden'
            }
        });

        const right = $('div', {
            parent: body,
            css: {
                flex: '1',
                minWidth: '0',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                minHeight: '0',
                overflow: 'hidden'
            }
        });

        const controls = $('div', {
            parent: right,
            css: {
                display: 'flex',
                flexWrap: 'wrap',
                gap: '10px',
                alignItems: 'center',
                padding: '10px',
                borderRadius: '10px',
                backgroundColor: '#1a1a1a'
            }
        });

        statusLineEl = $('div', {
            parent: right,
            css: { color: '#aaa', fontSize: '12px', minHeight: '16px' },
            text: ''
        });

        const modeHolder = $('div', {
            parent: controls,
            css: { width: '200px', height: '30px' }
        });

        modeDropDown = dropDown({
            parent: modeHolder,
            id: 'share_mode',
            theme: 'dark',
            options: [
                { label: 'Real-time', value: 'real-time' },
                { label: 'Manual (push)', value: 'validation-based' }
            ],
            value: 'real-time'
        });

        const shareTypeHolder = $('div', {
            parent: controls,
            css: { width: '220px', height: '30px' }
        });

        shareTypeDropDown = dropDown({
            parent: shareTypeHolder,
            id: 'share_type',
            theme: 'dark',
            options: [
                { label: 'Linked (sync)', value: 'linked' },
                { label: 'Copy (independent)', value: 'copy' }
            ],
            value: 'linked'
        });

        const atomeWrap = $('div', {
            parent: controls,
            css: { display: 'flex', flexDirection: 'column', gap: '4px' }
        });

        $('div', {
            parent: atomeWrap,
            text: 'Atome ID',
            css: { color: '#aaa', fontSize: '11px' }
        });

        const atomeRow = $('div', {
            parent: atomeWrap,
            css: { display: 'flex', gap: '8px', alignItems: 'center' }
        });

        atomeIdInput = $('input', {
            parent: atomeRow,
            id: 'share_atome_id',
            attrs: { placeholder: 'Select an atome, then click Use selected' },
            value: '',
            css: {
                height: '28px',
                width: '260px',
                padding: '0 10px',
                borderRadius: '8px',
                border: '1px solid #333',
                backgroundColor: '#121212',
                color: '#fff',
                pointerEvents: 'auto'
            }
        });

        Button({
            template: 'material_design_blue',
            onText: 'Use selected',
            offText: 'Use selected',
            parent: atomeRow,
            forceText: true,
            css: { position: 'relative', height: '34px' },
            onAction: () => refreshAtomeIdFromSelection(),
            offAction: () => refreshAtomeIdFromSelection()
        });

        const durationWrap = $('div', {
            parent: controls,
            css: { display: 'flex', flexDirection: 'column', gap: '4px' }
        });

        $('div', {
            parent: durationWrap,
            text: 'Duration',
            css: { color: '#aaa', fontSize: '11px' }
        });

        durationInput = $('input', {
            parent: durationWrap,
            id: 'share_duration',
            attrs: { placeholder: 'e.g. 7d or 2026-01-30' },
            value: '',
            css: {
                height: '28px',
                width: '240px',
                padding: '0 10px',
                borderRadius: '8px',
                border: '1px solid #333',
                backgroundColor: '#121212',
                color: '#fff',
                pointerEvents: 'auto'
            }
        });

        const conditionWrap = $('div', {
            parent: controls,
            css: { display: 'flex', flexDirection: 'column', gap: '4px' }
        });

        $('div', {
            parent: conditionWrap,
            text: 'Condition',
            css: { color: '#aaa', fontSize: '11px' }
        });

        conditionInput = $('input', {
            parent: conditionWrap,
            id: 'share_condition',
            attrs: { placeholder: 'Optional rule/DSL' },
            value: '',
            css: {
                height: '28px',
                width: '240px',
                padding: '0 10px',
                borderRadius: '8px',
                border: '1px solid #333',
                backgroundColor: '#121212',
                color: '#fff',
                pointerEvents: 'auto'
            }
        });

        Button({
            template: 'material_design_blue',
            onText: 'Share',
            offText: 'Share',
            parent: controls,
            forceText: true,
            css: { position: 'relative', height: '36px' },
            onAction: async () => {
                setStatus('', 'info');
                const mode = modeDropDown?.getValue ? modeDropDown.getValue() : 'real-time';
                const shareType = shareTypeDropDown?.getValue ? shareTypeDropDown.getValue() : 'linked';
                const atomeId = atomeIdInput?.value ? String(atomeIdInput.value).trim() : '';
                const duration = durationInput?.value || null;
                const condition = conditionInput?.value || null;
                const aBoxIds = getABoxSelectedAtomeIds();
                const atomeIds = aBoxIds.length ? aBoxIds : (atomeId ? [atomeId] : []);
                const usingABox = aBoxIds.length > 0;

                if (!selectedTarget?.phone) {
                    setStatus('Select a user first.', 'error');
                    await refreshShared();
                    return;
                }

                if (!atomeIds.length) {
                    setStatus('Select an atome first (or use the list).', 'error');
                    await refreshShared();
                    return;
                }

                const result = await ShareAPI.share_with([
                    { phone: selectedTarget.phone, userId: selectedTarget.userId, username: selectedTarget.username }
                ], {
                    mode,
                    shareType,
                    atomeIds,
                    duration,
                    condition
                });

                if (!result.ok) {
                    const firstErr = (result.results || []).find(r => !r.ok)?.error;
                    setStatus(firstErr || 'Share failed.', 'error');
                    console.warn('[ShareUI] Share failed', { result, atomeIds, target: selectedTarget });
                } else {
                    const label = usingABox ? `Share request created (${atomeIds.length} aBox items).` : 'Share request created.';
                    setStatus(label, 'success');
                }

                await refreshShared();
            },
            offAction: async () => {
                setStatus('', 'info');
                const mode = modeDropDown?.getValue ? modeDropDown.getValue() : 'real-time';
                const shareType = shareTypeDropDown?.getValue ? shareTypeDropDown.getValue() : 'linked';
                const atomeId = atomeIdInput?.value ? String(atomeIdInput.value).trim() : '';
                const duration = durationInput?.value || null;
                const condition = conditionInput?.value || null;
                const aBoxIds = getABoxSelectedAtomeIds();
                const atomeIds = aBoxIds.length ? aBoxIds : (atomeId ? [atomeId] : []);
                const usingABox = aBoxIds.length > 0;

                if (!selectedTarget?.phone) {
                    setStatus('Select a user first.', 'error');
                    await refreshShared();
                    return;
                }

                if (!atomeIds.length) {
                    setStatus('Select an atome first (or use the list).', 'error');
                    await refreshShared();
                    return;
                }

                const result = await ShareAPI.share_with([
                    { phone: selectedTarget.phone, userId: selectedTarget.userId, username: selectedTarget.username }
                ], {
                    mode,
                    shareType,
                    atomeIds,
                    duration,
                    condition
                });

                if (!result.ok) {
                    const firstErr = (result.results || []).find(r => !r.ok)?.error;
                    setStatus(firstErr || 'Share failed.', 'error');
                    console.warn('[ShareUI] Share failed', { result, atomeIds, target: selectedTarget });
                } else {
                    const label = usingABox ? `Share request created (${atomeIds.length} aBox items).` : 'Share request created.';
                    setStatus(label, 'success');
                }

                await refreshShared();
            }
        });

        const atomesHeader = $('div', {
            parent: right,
            css: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
        });

        $('div', {
            parent: atomesHeader,
            css: { color: '#bbb', fontSize: '12px', marginTop: '4px' },
            text: 'Atomes (current project)'
        });

        Button({
            template: 'material_design_blue',
            onText: 'Refresh',
            offText: 'Refresh',
            parent: atomesHeader,
            forceText: true,
            css: { position: 'relative', height: '34px' },
            onAction: refreshAtomes,
            offAction: refreshAtomes
        });

        atomesHolderEl = $('div', {
            parent: right,
            id: 'share_atomes_list',
            css: {
                height: '180px',
                borderRadius: '10px',
                backgroundColor: '#141414',
                padding: '10px',
                overflow: 'hidden',
                position: 'relative'
            }
        });

        $('div', {
            parent: right,
            css: { color: '#bbb', fontSize: '12px', marginTop: '4px' },
            text: 'Shared items'
        });

        sharedContainer = $('div', {
            parent: right,
            id: 'share_shared_list',
            css: {
                flex: '0 0 auto',
                display: 'flex',
                flexDirection: 'column',
                minHeight: '260px',
                borderRadius: '10px',
                backgroundColor: '#141414',
                padding: '10px',
                overflow: 'auto'
            }
        });

        // Load users
        const usersHolderEl = usersHolder.element || usersHolder;
        try { usersList?.destroy?.(); } catch (_) { }
        try { usersHolderEl.innerHTML = ''; } catch (_) { }
        try {
            const attachEl = document.querySelector('#share_users_list');
            if (attachEl && attachEl !== usersHolderEl) attachEl.innerHTML = '';
        } catch (_) { }
        usersList = null;

        const usersResult = await ShareAPI.list_users_normalized();
        if (!usersResult.ok) {
            $('div', { parent: usersHolder, css: { color: '#ff7a7a' }, text: usersResult.error || 'Failed to load users' });
        } else {
            const users = usersResult.items;

            const attachEl = document.querySelector('#share_users_list');
            const listWidth = Math.max(200, (attachEl?.clientWidth || 320));
            const listHeight = Math.max(200, (attachEl?.clientHeight || 520));

            usersList = new List({
                id: uniqueUiId('share-users'),
                attach: '#share_users_list',
                position: { x: 0, y: 0 },
                size: { width: listWidth, height: listHeight },
                spacing: { vertical: 4, itemPadding: 10, marginTop: 6, marginBottom: 6 },
                containerStyle: { background: 'transparent' },
                itemStyle: {
                    fontSize: '12px',
                    fontWeight: '400',
                    lineHeight: '1.3',
                    textColor: '#ddd',
                    backgroundColor: '#1e1e1e',
                    borderRadius: '8px'
                },
                states: {
                    hover: { backgroundColor: '#2a2a2a' },
                    selected: { backgroundColor: '#2f5eff', color: 'white' }
                },
                items: users.map(u => ({ content: formatUserLabel(u) })),
                onItemClick: (item) => {
                    const idx = users.findIndex(u => formatUserLabel(u) === item.content);
                    const u = users[idx];
                    if (!u) return;
                    selectedTarget = { phone: u.phone, username: u.username, userId: u.id };
                }
            });
        }

        // Load projects
        refreshAtomeIdFromSelection();
        await refreshAtomes();

        await refreshShared();
    } finally {
        dialogIsOpening = false;
    }
}

function createShareButton() {
    const root = getIntuitionHost();
    if (!root) {
        if (!shareButtonWarned && typeof window !== 'undefined' && window.__SQUIRREL_DEBUG_SHARE_UI__ === true) {
            console.warn('[ShareUI] #intuition host not ready; Share button not created yet');
        }
        shareButtonWarned = true;
        scheduleShareButtonRetry();
        return;
    }
    const existing = document.getElementById('share_button_holder');
    if (existing) return;

    const holder = $('div', {
        parent: root,
        id: 'share_button_holder',
        css: {
            position: 'fixed',
            right: '12px',
            bottom: '12px',
            zIndex: String(BASE_Z_INDEX + 2),
            pointerEvents: 'auto'
        }
    });

    Button({
        id: 'share_button',
        template: 'material_design_blue',
        onText: 'Share',
        offText: 'Share',
        parent: holder,
        forceText: true,
        css: { position: 'relative', height: '36px' },
        onAction: openDialog,
        offAction: openDialog
    });
}

createShareButton();
watchShareButton();

export { createShareButton, openDialog };
