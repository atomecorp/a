import { afterEach, describe, expect, it } from 'vitest';
import { ASSISTANT_CONTEXT_COMMANDS } from '../../atome/src/shared/assistant_context_contract.js';
import { executeAssistantContextCommand } from '../../eVe/voice/assistant/assistant_context_tools.js';
import { setEveLocale } from '../../eVe/i18n/i18n.js';
import { buildBootstrapDefsA } from '../../eVe/intuition/tools/core/tool_runtime_bootstrap_defs_a.js';
import { createToolRuntimeBootstrap } from '../../eVe/intuition/tools/core/tool_runtime_bootstrap.js';
import { HELP_TOPICS } from '../../eVe/intuition/tools/help_tool_topics.js';
import { helpTopicDisplayBody, helpTopicParagraphs, searchHelpQuestion, searchHelpTopics } from '../../eVe/intuition/tools/help_tool_model.js';
import { EVE_FR_HELP_MESSAGES } from '../../eVe/i18n/languages_fr_help.js';
import { EVE_EN_HELP_MESSAGES } from '../../eVe/i18n/languages_en_help.js';
import { existsSync } from 'node:fs';

afterEach(() => setEveLocale('fr'));

describe('Help through the assistant context', () => {
    it('declares a nonpersistent command for runtime discovery', () => {
        const command = ASSISTANT_CONTEXT_COMMANDS.find(item => item.name === 'help.search');
        expect(command).toBeDefined();
        expect(command.persistent).not.toBe(true);
        expect(command.properties.query.type).toBe('string');
        const definition = buildBootstrapDefsA(value => value, value => value, 'calendar', 'registered')
            .find(item => item.tool_id === 'help.search');
        expect(definition.execution_mode).toBe('registered');
        expect(definition.behavior.effects['pointer.click']).toBe('ephemeral');
        expect(definition.input_schema.properties.query.type).toBe('string');
    });

    it.each([['fr', 'sélection', 'select_item'], ['en', 'select', 'select_item']])
    ('reads the same local catalogue in %s without claiming verification', async (locale, query, id) => {
        setEveLocale(locale);
        const result = await executeAssistantContextCommand('help.search', { query, workspace_mode: 'project' });
        expect(result.ok).toBe(true);
        expect(result.locale).toBe(locale);
        expect(result.topics.some(topic => topic.id === id && topic.body && topic.verification === 'unverified')).toBe(true);
    });

    it('returns no invented result when no topic matches', async () => {
        const result = await executeAssistantContextCommand('help.search', { query: 'xyzzyunfindable' });
        expect(result.topics).toEqual([]);
    });

    it('finds the existing topic from an ordinary question', async () => {
        const result = await executeAssistantContextCommand('help.search', { query: 'aide-moi à créer un projet', workspace_mode: 'dashboard' });
        expect(result.topics[0]?.id).toBe('create_project');
    });

    it('returns the Web-verified dashboard topic with its sources', async () => {
        const result = await executeAssistantContextCommand('help.search', { query: 'help basic', workspace_mode: 'dashboard' });
        expect(result.topics).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'dashboard_help',
            verification: 'web_interaction_verified', sources: expect.arrayContaining(['eVe/intuition/tools/help_tool.js']) })]));
    });

    it('identifies unverified articles in the displayed language', () => {
        const topic = HELP_TOPICS.find(item => item.id === 'open_project');
        setEveLocale('fr');
        expect(helpTopicDisplayBody(topic)).toContain('pas encore été vérifié');
        setEveLocale('en');
        expect(helpTopicDisplayBody(topic)).toContain('not yet been verified');
        expect(helpTopicDisplayBody(HELP_TOPICS.find(item => item.id === 'basic_home'))).not.toContain('not yet been verified');
    });

    it('keeps every topic uniquely identified and translated in both languages', () => {
        expect(new Set(HELP_TOPICS.map(topic => topic.id)).size).toBe(HELP_TOPICS.length);
        for (const topic of HELP_TOPICS) {
            expect(['any', 'dashboard', 'project', 'about']).toContain(topic.context);
            for (const source of topic.sources || []) expect(existsSync(source), `${topic.id}: ${source}`).toBe(true);
            for (const messages of [EVE_FR_HELP_MESSAGES, EVE_EN_HELP_MESSAGES]) {
                expect(messages[`eve.help.topic.${topic.id}.title`]).toBeTruthy();
                expect(messages[`eve.help.topic.${topic.id}.body`]).toBeTruthy();
            }
        }
    });

    it('answers what atome/eVe is from the user\'s own pitch, never suggested by default', () => {
        expect(searchHelpQuestion('Pourquoi eVe existe ?').at(0)?.id).toBe('about_eve');
        expect(searchHelpQuestion('Qu’est-ce que atome ?').at(0)?.id).toBe('about_eve');
        expect(searchHelpQuestion('créer projet').map(topic => topic.id)).toEqual(['create_project']);
        expect(searchHelpTopics('', { workspaceMode: 'dashboard' }).some(topic => topic.context === 'about')).toBe(false);
        const eve = HELP_TOPICS.find(item => item.id === 'about_eve');
        setEveLocale('fr');
        expect(helpTopicDisplayBody(eve)).not.toContain('pas encore été vérifié');
        expect(helpTopicDisplayBody(eve)).not.toContain('**');
        expect(helpTopicParagraphs(eve).at(0)).toEqual({ lead: 'Et si la technologie vous aidait à vivre davantage, au lieu de vivre à votre place ?', text: '' });
    });

    it('registers an executable handler through the shared runtime bootstrap', async () => {
        const handlers = new Map();
        const runtime = createToolRuntimeBootstrap({ buildLabelKey: key => 'eve.tool.' + key,
            publishRuntimeRegisteredHandler: (id, handler) => handlers.set(id, handler),
            PANEL_RUNTIME_CONFIG_BY_TOOL_ID: {}, MAIN_TOOL_RUNTIME_CONFIG_BY_TOOL_ID: {},
            V2_CALENDAR_API_EXECUTION_MODE: 'calendar', V2_REGISTERED_HANDLER_EXECUTION_MODE: 'registered' });
        expect(runtime.resolveBootstrapRuntimeTool('help.search')?.id).toBe('help.search');
        const result = await handlers.get('help.search')({ input: { query: 'effort', workspace_mode: 'project' } });
        expect(result.topics.some(topic => topic.id === 'objective_effort')).toBe(true);
    });
});
