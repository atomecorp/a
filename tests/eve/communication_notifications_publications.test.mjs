import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    activeRecipientValues,
    addRecipientEntry,
    createCommPanelState,
    removeRecipientEntry,
    toggleRecipientEntry
} from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_comm_model.js';
import { commRuntime, commSurface } from '../../eVe/intuition/runtime/bevy_panel/bevy_panel_comm_runtime.js';
import { createCommCompose } from '../../eVe/intuition/tools/communication_compose.js';
import { resolveCommSendDraft } from '../../eVe/intuition/tools/communication_events.js';
import { createNewsPublishApi } from '../../eVe/domains/news/news_publish_api.js';
import { buildMainMenuNotificationNodes } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_notification.js';
import { dispatchAttachmentDrop } from '../../eVe/domains/rendering/surface_interaction_runtime.js';

const findNode = (entry, id) => {
    if (!entry || typeof entry !== 'object') return null;
    if (entry.id === id) return entry;
    for (const child of entry.children || []) {
        const found = findNode(child, id);
        if (found) return found;
    }
    return null;
};

const flatten = (entries = []) => entries.flatMap((entry) => [entry, ...flatten(entry?.children || [])]);

describe('Communication recipients and panel visibility', () => {
    beforeEach(() => commRuntime.reset());

    it('keeps All disabled by default and independently toggles or removes individual recipients', () => {
        const state = createCommPanelState();
        expect(activeRecipientValues(state.compose.recipients)).toEqual([]);
        state.compose.recipients = toggleRecipientEntry(state.compose.recipients, 'all');
        expect(activeRecipientValues(state.compose.recipients)).toEqual(['all']);
        state.compose.recipients = addRecipientEntry(state.compose.recipients, 'user_b');
        expect(activeRecipientValues(state.compose.recipients)).toEqual(['all', 'user_b']);
        state.compose.recipients = toggleRecipientEntry(state.compose.recipients, 'user_b');
        expect(activeRecipientValues(state.compose.recipients)).toEqual(['all']);
        state.compose.recipients = removeRecipientEntry(state.compose.recipients, 'user_b');
        expect(state.compose.recipients.map((entry) => entry.value)).toEqual(['all']);
    });

    it('renders Advanced and Conditions only while the footer Advanced action is active', async () => {
        const context = { emit: () => {}, bodyWidth: 420 };
        const closed = commSurface.buildContent(commRuntime.readState(), context);
        expect(flatten(closed).some((node) => node?.id === 'comm_advanced')).toBe(false);
        expect(flatten(closed).some((node) => node?.id === 'comm_conditions')).toBe(false);

        await commSurface.handleEvent({ type: 'comm.advanced.toggle' });
        const open = commSurface.buildContent(commRuntime.readState(), context);
        const advanced = findNode({ children: open }, 'comm_advanced');
        expect(advanced).toBeTruthy();
        expect(findNode(advanced, 'comm_conditions')).toBeTruthy();
    });

    it('refuses an empty active-recipient set and preserves an empty subject', async () => {
        expect(await commSurface.handleEvent({ type: 'comm.action.send' })).toEqual({
            ok: false,
            error: 'comm_active_recipient_required'
        });
        expect(resolveCommSendDraft({
            compose: { subject: '' }, body: 'Hello', recipients: ['user_b']
        })).toEqual({ subject: '', message: 'Hello', recipients: ['user_b'] });
    });
});

describe('Communication attachments', () => {
    const compose = createCommCompose({
        getCommitApi: () => ({}),
        getCurrentProjectId: () => 'project_current',
        resolveAtomeProperties: (record) => record?.properties || {}
    });

    const transfer = (payload) => ({
        getData: (type) => type === 'application/x-eve-atome' ? JSON.stringify(payload) : ''
    });

    it.each([
        ['atome', { id: 'shape_1', type: 'shape' }],
        ['molecule', { id: 'molecule_1', type: 'molecule' }],
        ['project', { id: 'project_1', type: 'project' }]
    ])('accepts a canonical %s drag payload', (kind, payload) => {
        expect(compose.getDropAttachment(transfer(payload))).toEqual({
            id: payload.id,
            label: payload.id,
            kind
        });
    });

    it('rejects an unsupported drag payload', () => {
        expect(compose.getDropAttachment(transfer({ label: 'missing id' }))).toBeNull();
    });

    it('keeps the compose drop zone inside the canonical BevyUI hit-test set', () => {
        commRuntime.reset();
        const content = commSurface.buildContent(commRuntime.readState(), { emit: () => {}, bodyWidth: 420 });
        expect(findNode({ children: content }, 'comm_compose_drop_target')?.kind).toBe('pointer_capture');
    });

    it('accepts the canonical internal BevyUI drop payload without a DataTransfer', async () => {
        commRuntime.reset();
        expect(await commSurface.handleEvent({
            type: 'comm.compose.drop',
            event: { payload: { id: 'project_1', type: 'project', label: 'Project One' } }
        })).toEqual({ ok: true });
        expect(commRuntime.readState().compose.attachments).toEqual([
            { id: 'project_1', kind: 'project', label: 'Project One' }
        ]);
    });

    it.each(['shape', 'molecule'])('routes a natural-canvas %s drag to the same drop target', (type) => {
        const dispatchDropPayload = vi.fn(() => true);
        const canvas = { ownerDocument: { defaultView: { eveBevyUiRuntime: { dispatchDropPayload } } } };
        expect(dispatchAttachmentDrop(canvas, {
            mode: 'drag', moved: true, atome_id: `${type}_1`,
            targets: [{ atome_id: `${type}_1`, origin: { type } }]
        }, { clientX: 44, clientY: 55 })).toBe(true);
        expect(dispatchDropPayload).toHaveBeenCalledWith(expect.objectContaining({
            clientX: 44,
            clientY: 55,
            payload: { id: `${type}_1`, type, kind: type }
        }));
    });
});

describe('Communication News publication', () => {
    // One publication chain (news_publish_api.js): the author's project, tagged `news`, is the durable object;
    // the server broadcasts its envelope (`news/publish`), never a client loop notifying each recipient.
    it('publishes one canonical News envelope through the server, never sharing it to the author', async () => {
        const records = [
            { id: 'project_a', properties: { name: 'Projet A', news_id: 'news_1' } },
            { id: 'contribution_a', properties: { news_contribution: true, author_id: 'user_a', news_post_id: 'news_publication_1' } }
        ];
        const runtime = {
            readProjectRecords: vi.fn(async () => records),
            markProjectAsNews: vi.fn(async () => ({ ok: true, created: false, news_id: 'news_1' })),
            ensureContributionMolecule: vi.fn(async () => ({ ok: true }))
        };
        const publish = vi.fn(async () => ({ ok: true }));
        const share = vi.fn(async () => ({ ok: true }));
        const news = createNewsPublishApi({ getApi: () => ({ news: { publish }, share }), loadThreadRuntime: async () => runtime,
            resolveAuthor: async () => ({ id: 'user_a', name: 'Alice' }), target: null });

        const result = await news.publish({ projectId: 'project_a', message: 'Hello' });

        expect(result).toMatchObject({ ok: true, publication: { id: 'news_publication_1', type: 'news_publication' } });
        expect(runtime.ensureContributionMolecule).not.toHaveBeenCalled();
        expect(publish).toHaveBeenCalledTimes(1);
        expect(publish).toHaveBeenCalledWith(expect.objectContaining({
            audience: 'all',
            publication: expect.objectContaining({
                id: 'news_publication_1',
                properties: expect.objectContaining({
                    source_domain: 'eve.dashboard', category_id: 'news', news_id: 'news_1', news_source_project_id: 'project_a',
                    author_id: 'user_a', author_name: 'Alice', preview: 'Hello'
                })
            })
        }));
        expect(share).not.toHaveBeenCalled();
    });
});

describe('Communicate main-menu unread projection', () => {
    it('preloads the existing Communication owner before the login queue can flush', () => {
        const source = readFileSync(new URL(
            '../../eVe/intuition/runtime/eve_intuition/boot_runtime.js', import.meta.url
        ), 'utf8');
        const warmups = source.slice(
            source.indexOf('const startWorkspaceWarmups'),
            source.indexOf('const startWarmupsWhenWorkspaceOrLoginIsReady')
        );
        expect(warmups).toContain('ensureCommunicatePanelModule()');
        expect(warmups).toContain('__eveCommunicationBootstrapError');
    });

    it('projects the unread summary and count into the reserved Communicate width', () => {
        const nodes = buildMainMenuNotificationNodes({
            itemSize: 64,
            width: 304,
            iconOffsetX: 240,
            summary: 'Hello',
            count: 2
        });
        expect(nodes.map((node) => node.id)).toEqual([
            'eve_bevy_ui_main_menu_communication_unread_surface',
            'eve_bevy_ui_main_menu_communication_unread_summary',
            'eve_bevy_ui_main_menu_communication_unread_count'
        ]);
        expect(nodes.find((node) => node.id.endsWith('_summary'))?.text).toBe('Hello');
        expect(nodes.find((node) => node.id.endsWith('_count'))?.text).toBe('2');
    });
});
