import { TV_COMMANDS, validateTvInput } from '../tv/contracts.js';
import { YOUTUBE_COMMANDS, validateYoutubeInput } from '../youtube/contracts.js';
import { PEERTUBE_COMMANDS, validatePeertubeInput } from '../peertube/contracts.js';
import { SOCIAL_COMMANDS, validateSocialInput } from '../social/contracts.js';
import { APPLE_MUSIC_COMMANDS, validateAppleMusicInput } from '../apple_music/contracts.js';
import { MUSIC_COMMANDS, validateMusicInput } from '../music/contracts.js';
import { GPS_COMMANDS, validateGpsInput } from '../gps/contracts.js';
import { TRAINING_COMMANDS, validateTrainingInput } from '../training/contracts.js';
import { SHOPPING_COMMANDS, validateShoppingInput } from '../shopping/contracts.js';
import { FOOD_COMMANDS, validateFoodInput } from '../food/contracts.js';
import { DASHBOARD_PROGRESSION_COMMANDS, validateDashboardProgressionInput } from '../dashboard_progression/contracts.js';
import { ensureRuntimeToolApi } from './mcp_bridges.js';
import { buildRuntimeInvocationPayload, projectRuntimeMcpResult } from './mcp_runtime.js';

// Direct MCP calls of a contract family (TV, social sharing) go through the
// same runtime tools as the eVe interface: one contract, one owner, one audit.
const ENVELOPE_KEYS = new Set(['actor', 'source', 'trace_id', 'intent_id', 'idempotency_key', 'meta', '__mcp', 'dry_run']);
const createContractHandlers = ({ commands, validate, layer, noClient }) => Object.fromEntries(commands.map((command) => [command.name, async (params = {}) => {
    const input = Object.fromEntries(Object.entries(params).filter(([key]) => !ENVELOPE_KEYS.has(key)));
    const error = validate(command.action, input);
    if (error) return { ok: false, error };
    if (!globalThis.window?.document && !globalThis.document) return { ok: false, error: noClient };
    const runtime = ensureRuntimeToolApi();
    return projectRuntimeMcpResult(await runtime.invokeById(buildRuntimeInvocationPayload({
        ...params, tool_id: command.name, input
    }, { layer, presentation: 'mcp' })));
}]));

export const createMcpTvHandlers = () => createContractHandlers({
    commands: TV_COMMANDS, validate: validateTvInput, layer: 'atome_mcp_tv', noClient: 'NO_ACTIVE_CLIENT' });
export const createMcpYoutubeHandlers = () => createContractHandlers({
    commands: YOUTUBE_COMMANDS, validate: validateYoutubeInput, layer: 'atome_mcp_youtube', noClient: 'NO_ACTIVE_VIDEO' });
export const createMcpPeertubeHandlers = () => createContractHandlers({
    commands: PEERTUBE_COMMANDS, validate: validatePeertubeInput, layer: 'atome_mcp_peertube', noClient: 'NO_ACTIVE_VIDEO' });
export const createMcpSocialHandlers = () => createContractHandlers({
    commands: SOCIAL_COMMANDS, validate: validateSocialInput, layer: 'atome_mcp_social', noClient: 'social_handoff_unavailable' });
export const createMcpAppleMusicHandlers = () => createContractHandlers({
    commands: APPLE_MUSIC_COMMANDS, validate: validateAppleMusicInput, layer: 'atome_mcp_apple_music', noClient: 'HOST_UNSUPPORTED' });
export const createMcpMusicHandlers = () => createContractHandlers({
    commands: MUSIC_COMMANDS, validate: validateMusicInput, layer: 'atome_mcp_music', noClient: 'AUTH_REQUIRED' });
export const createMcpGpsHandlers = () => createContractHandlers({
    commands: GPS_COMMANDS, validate: validateGpsInput, layer: 'atome_mcp_gps', noClient: 'HOST_UNSUPPORTED' });
export const createMcpTrainingHandlers = () => createContractHandlers({
    commands: TRAINING_COMMANDS, validate: validateTrainingInput, layer: 'atome_mcp_training', noClient: 'AUTH_REQUIRED' });
export const createMcpShoppingHandlers = () => createContractHandlers({
    commands: SHOPPING_COMMANDS, validate: validateShoppingInput, layer: 'atome_mcp_shopping', noClient: 'AUTH_REQUIRED' });
export const createMcpFoodHandlers = () => createContractHandlers({
    commands: FOOD_COMMANDS, validate: validateFoodInput, layer: 'atome_mcp_food', noClient: 'HOST_UNSUPPORTED' });
export const createMcpDashboardProgressionHandlers = () => createContractHandlers({
    commands: DASHBOARD_PROGRESSION_COMMANDS, validate: validateDashboardProgressionInput, layer: 'atome_mcp_dashboard_progression', noClient: 'progression_actor_required' });
