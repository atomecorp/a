// Tool + code example using the canonical Atome object syntax.

const toolNudge = {
  id: 'ui_nudge_tool',
  type: 'tool',
  kind: 'tool',
  meta: {
    name: 'Nudge'
  },
  traits: ['ui.tool'],
  props: {
    label: 'Nudge',
    icon: 'move',
    group: 'transform',
    mode: 'continuous',
    gesture: 'drag_selection',
    handlers: {
      on_drag_move: 'code_nudge_selection'
    },
    ai_exposed: true,
    ai_name: 'ui.nudge_selection'
  }
};

const codeNudge = {
  id: 'code_nudge_selection',
  type: 'code',
  kind: 'code',
  meta: {
    name: 'Nudge Selection'
  },
  traits: ['code.behavior'],
  props: {
    language: 'javascript',
    capabilities: ['atome.write'],
    risk_level: 'LOW',
    code: async ({ ctx, input }) => {
      const selection = input?.selection || [];
      const gesture = input?.gesture || {};
      const params = input?.params || {};
      const multiplier = params.multiplier ?? 1;
      const dx = (gesture.dx || 0) * multiplier;
      const dy = (gesture.dy || 0) * multiplier;

      if (!selection.length || (!dx && !dy)) {
        return { action: 'BATCH', commands: [] };
      }

      const objects = await ctx.getMany(selection, ['id', 'props.position']);
      const commands = objects.map(obj => {
        const position = obj.props?.position || { x: 0, y: 0 };
        return {
          action: 'PATCH',
          target: { atome_id: obj.id },
          patch: {
            props: {
              position: {
                x: position.x + dx,
                y: position.y + dy
              }
            }
          }
        };
      });

      return { action: 'BATCH', commands };
    }
  }
};

// Register the tool + code when the runtime is available.
if (typeof atome === 'function') {
  atome(toolNudge);
  atome(codeNudge);
}

// Example tool invocation payload (UI/AI/voice normalized input).
const toolEventExample = {
  tool_id: 'ui_nudge_tool',
  event: 'on_drag_move',
  input: {
    selection: ['logo'],
    gesture: { type: 'drag', dx: 12, dy: -6 },
    params: { multiplier: 1 }
  },
  signals: { overall_confidence: 0.98 }
};

console.log('[tools_code] tool_event example payload:', toolEventExample);
