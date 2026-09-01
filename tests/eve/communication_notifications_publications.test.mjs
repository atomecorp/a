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
import { createCommunicationNewsPublication } from '../../eVe/intuition/tools/communication_news_publication.js';
import { createCommunicationToolUnreadRuntime } from '../../eVe/intuition/tools/communication_tool_unread_runtime.js';
import { buildMainMenuNotificationNodes } from '../../eVe/intuition/ribbon/bevy_ui_main_menu_notification.js';
import { createDashboardProjectAttachmentDrag } from '../../eVe/domains/dashboard/dashboard_project_attachment_drag.js';
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

    it('routes a real Dashboard Project drag through the shared BevyUI drop target', () => {
        const dispatchDropPayload = vi.fn(() => true);
        const drag = createDashboardProjectAttachmentDrag({
            readHit: () => ({
                category: { id: 'projects' },
                item: { id: 'project_1', title: 'Project One' }
            }),
            surface: () => ({ id: 'surface' }),
            uiRuntime: { dispatchDropPayload }
        });
        drag.press('project_card', { client_x: 10, client_y: 10 });
        drag.drag('project_card', { client_x: 40, client_y: 40 });
        expect(drag.release('project_card', { client_x: 80, client_y: 90 })).toMatchObject({ dropped: true });
        expect(dispatchDropPayload).toHaveBeenCalledWith(expect.objectContaining({
            clientX: 80,
            clientY: 90,
            payload: { id: 'project_1', type: 'project', kind: 'project', label: 'Project One' }
        }));
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
    it('creates one canonical News record and shares it without notifying the author', async () => {
        const createAtome = vi.fn(async (spec) => ({ ok: true, id: spec.id, canonicalState: spec }));
        const share = vi.fn(async () => ({ ok: true }));
        const invalidate = vi.fn(async () => {});
        const result = await createCommunicationNewsPublication({
            author: { id: 'user_a', name: 'Alice' },
            message: 'Hello',
            recipients: [{ id: 'user_a' }, { id: 'user_b' }],
            projectId: 'project_a',
            createAtome,
            share,
            invalidate,
            now: () => '2026-09-01T12:00:00.000Z',
            idFactory: () => 'news_publication_1'
        });

        expect(result).toMatchObject({ ok: true, id: 'news_publication_1' });
        expect(createAtome).toHaveBeenCalledWith(expect.objectContaining({
            id: 'news_publication_1',
            type: 'record',
            project_id: 'project_a',
            properties: expect.objectContaining({
                source_domain: 'eve.dashboard', category_id: 'news', author_id: 'user_a', preview: 'Hello'
            })
        }), { render: false });
        expect(share).toHaveBeenCalledTimes(1);
        expect(share).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'user_b' }),
            'news_publication_1',
            expect.objectContaining({ id: 'news_publication_1', type: 'record' })
        );
        expect(invalidate).toHaveBeenCalledWith(['news']);
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

    it('widens for unread messages, cycles summaries, and collapses after read', () => {
        const samples = [];
        const runtime = createCommunicationToolUnreadRuntime({
            project: (snapshot) => samples.push(snapshot),
            schedule: (callback) => { callback(1000); return 1; },
            cancelSchedule: () => {},
            now: () => 1000,
            reducedMotion: true
        });
        runtime.update([
            { id: 'm1', date: '2026-09-01T10:00:00Z', message: 'First', unread: true },
            { id: 'm2', date: '2026-09-01T11:00:00Z', message: 'Hello', unread: true }
        ]);
        expect(runtime.readState()).toMatchObject({ count: 2, summary: 'Hello', open: true });
        expect(samples.at(-1)).toMatchObject({ count: 2, summary: 'Hello' });
        runtime.update([]);
        expect(runtime.readState()).toMatchObject({ count: 0, summary: '', open: false });
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
