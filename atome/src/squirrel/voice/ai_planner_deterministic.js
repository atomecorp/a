import { normalizeVoiceIntent } from './intent_schema.js';
import { localizeRelativeMoveReply, localizeSceneGroundingFailure } from './ai_planner_runtime_context.js';
import { resolveRelativeMoveCommand } from './project_scene_targeting.js';
import { writeVoiceDiagnostic } from './telemetry.js';

export const resolveDeterministicPlannerIntent = ({ env, locale, options = {}, utterance = '' } = {}) => {
    const movement = resolveRelativeMoveCommand({
        utterance,
        projectScene: options.context?.project_scene || null
    });
    if (!movement.matched) return null;
    writeVoiceDiagnostic(env, 'voice.planner.deterministic', {
        session_id: options.session_id || null,
        intent_id: options.intent_id || null,
        command: 'move.relative',
        ok: movement.ok === true,
        target_id: movement.atome_id || null,
        delta_x: movement.delta_x ?? null,
        delta_y: movement.delta_y ?? null,
        target_reason: movement.target_reason || movement.reason || null,
        error: movement.error || null
    });
    const ready = movement.ok === true;
    return normalizeVoiceIntent({
        intent_id: options.intent_id,
        utterance: { raw: utterance },
        locale,
        source: options.source,
        context: {
            ...(options.context && typeof options.context === 'object' ? options.context : {}),
            planner_route: 'deterministic_move',
            ...(!ready ? {
                scene_grounding_error: movement.error,
                scene_grounding_matches: movement.matches || []
            } : {})
        },
        assistant_reply: ready
            ? localizeRelativeMoveReply(locale)
            : localizeSceneGroundingFailure(movement.error, locale),
        type: ready ? 'runtime_tool' : 'ambiguous',
        domain: 'creative',
        action: 'move_relative',
        confidence: ready ? 1 : 0,
        status: ready ? 'ready' : 'ambiguous',
        execution: {
            target: ready ? 'runtime_v2' : 'none',
            confirmation_required: false,
            toolchain: ready ? [{
                source: 'runtime_v2',
                tool_id: 'ui.move',
                action: 'move.relative',
                input: {
                    atome_id: movement.atome_id,
                    delta_x: movement.delta_x,
                    delta_y: movement.delta_y
                }
            }] : []
        }
    });
};
