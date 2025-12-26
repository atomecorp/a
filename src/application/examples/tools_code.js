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

// ===== UI demo (basic menu + tool runner) =====

if (typeof window !== 'undefined' && typeof window.$ === 'function') {
  const toolRegistry = {
    [toolNudge.id]: toolNudge
  };
  const codeRegistry = {
    [codeNudge.id]: codeNudge
  };

  const demoState = {
    atomes: new Map(),
    selection: [],
    initialPositions: new Map()
  };

  const demoRoot = $('div', {
    id: 'tools-code-demo',
    parent: '#view',
    css: {
      margin: '16px',
      padding: '12px',
      border: '1px solid #333',
      borderRadius: '8px',
      backgroundColor: '#0f0f0f',
      color: '#e6e6e6',
      fontFamily: 'monospace'
    }
  });

  $('div', {
    parent: demoRoot,
    text: 'Tools code demo (basic menu)',
    css: {
      fontSize: '14px',
      marginBottom: '10px',
      letterSpacing: '0.4px'
    }
  });

  const menuBar = $('div', {
    parent: demoRoot,
    css: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '8px',
      marginBottom: '10px'
    }
  });

  const statusLine = $('div', {
    parent: demoRoot,
    text: 'Status: no demo atomes yet',
    css: {
      fontSize: '12px',
      marginBottom: '8px',
      color: '#9aa0a6'
    }
  });

  const codePanel = $('pre', {
    parent: demoRoot,
    text: '',
    css: {
      display: 'none',
      margin: '0 0 10px',
      padding: '10px',
      border: '1px solid #2f2f2f',
      borderRadius: '6px',
      backgroundColor: '#111',
      color: '#d9d9d9',
      fontSize: '11px',
      lineHeight: '1.4',
      whiteSpace: 'pre-wrap',
      maxHeight: '180px',
      overflow: 'auto'
    }
  });

  const stage = $('div', {
    parent: demoRoot,
    id: 'tools-code-stage',
    css: {
      position: 'relative',
      height: '200px',
      border: '1px dashed #444',
      borderRadius: '6px',
      overflow: 'hidden',
      backgroundColor: '#141414'
    }
  });

  const buttonCss = {
    padding: '6px 10px',
    borderRadius: '6px',
    border: '1px solid #444',
    backgroundColor: '#1f1f1f',
    color: '#e6e6e6',
    cursor: 'pointer',
    fontSize: '12px'
  };

  const createMenuButton = (label, onClick) => (
    $('button', {
      parent: menuBar,
      text: label,
      css: buttonCss,
      onclick: onClick
    })
  );

  const updateStatus = (message) => {
    statusLine.$({ text: message });
  };

  const getToolCodeText = () => {
    const handler = codeNudge?.props?.code;
    const handlerText = typeof handler === 'function'
      ? handler.toString()
      : '// Handler source unavailable';
    return [
      `// Tool: ${toolNudge.id}`,
      `// Handler: ${codeNudge.id}`,
      '',
      handlerText
    ].join('\n');
  };

  const syncSelectionStyles = () => {
    demoState.atomes.forEach((entry, id) => {
      const isSelected = demoState.selection.includes(id);
      entry.element.style.outline = isSelected ? '2px solid #39ff14' : 'none';
    });
  };

  const setSelection = (ids) => {
    demoState.selection = ids.slice();
    syncSelectionStyles();
    updateStatus(`Status: ${ids.length} selected`);
  };

  const toggleSelection = (id) => {
    const index = demoState.selection.indexOf(id);
    if (index === -1) {
      demoState.selection.push(id);
    } else {
      demoState.selection.splice(index, 1);
    }
    syncSelectionStyles();
    updateStatus(`Status: ${demoState.selection.length} selected`);
  };

  const createDemoAtomes = () => {
    if (demoState.atomes.size) {
      updateStatus('Status: demo atomes already exist');
      return;
    }

    const items = [
      { id: 'demo_box_1', x: 30, y: 40, color: '#ff6f61' },
      { id: 'demo_box_2', x: 140, y: 90, color: '#4fc3f7' }
    ];

    items.forEach((item) => {
      const element = $('div', {
        parent: stage,
        id: item.id,
        css: {
          position: 'absolute',
          left: `${item.x}px`,
          top: `${item.y}px`,
          width: '60px',
          height: '60px',
          borderRadius: '8px',
          backgroundColor: item.color,
          transition: 'left 120ms ease, top 120ms ease'
        },
        onclick: () => toggleSelection(item.id)
      });

      demoState.atomes.set(item.id, {
        id: item.id,
        element,
        props: {
          position: { x: item.x, y: item.y },
          size: [60, 60]
        }
      });
      demoState.initialPositions.set(item.id, { x: item.x, y: item.y });
    });

    setSelection(items.map(item => item.id));
    updateStatus('Status: demo atomes created (click boxes to toggle selection)');
  };

  const resetPositions = () => {
    demoState.atomes.forEach((entry, id) => {
      const initial = demoState.initialPositions.get(id);
      if (!initial) return;
      entry.props.position = { x: initial.x, y: initial.y };
      entry.element.style.left = `${initial.x}px`;
      entry.element.style.top = `${initial.y}px`;
    });
    updateStatus('Status: positions reset');
  };

  const demoCtx = {
    getMany(ids) {
      return ids
        .map(id => demoState.atomes.get(id))
        .filter(Boolean)
        .map(entry => ({
          id: entry.id,
          props: {
            position: { ...entry.props.position },
            size: Array.isArray(entry.props.size) ? [...entry.props.size] : entry.props.size
          }
        }));
    }
  };

  const applyPatch = (targetId, patch) => {
    const entry = demoState.atomes.get(targetId);
    if (!entry || !patch || !patch.props) return;

    if (patch.props.position) {
      const nextPos = {
        x: patch.props.position.x ?? entry.props.position.x,
        y: patch.props.position.y ?? entry.props.position.y
      };
      entry.props.position = nextPos;
      entry.element.style.left = `${nextPos.x}px`;
      entry.element.style.top = `${nextPos.y}px`;
    }

    if (patch.props.size) {
      const [w, h] = patch.props.size;
      entry.props.size = [w, h];
      entry.element.style.width = `${w}px`;
      entry.element.style.height = `${h}px`;
    }
  };

  const runToolEvent = async (payload) => {
    const tool = toolRegistry[payload.tool_id];
    if (!tool) {
      updateStatus(`Status: tool not found (${payload.tool_id})`);
      return;
    }

    const handlerId = tool.props?.handlers?.[payload.event];
    const codeAtom = handlerId ? codeRegistry[handlerId] : null;
    if (!codeAtom || typeof codeAtom.props?.code !== 'function') {
      updateStatus('Status: code handler not found');
      return;
    }

    const result = await codeAtom.props.code({
      ctx: demoCtx,
      event: payload.event,
      input: payload.input,
      state: {}
    });

    const commands = Array.isArray(result?.commands) ? result.commands : [];
    commands.forEach((command) => {
      if (command.action === 'PATCH') {
        applyPatch(command.target?.atome_id, command.patch);
      }
    });

    updateStatus(`Status: applied ${commands.length} command(s)`);
  };

  createMenuButton('Create demo atomes', createDemoAtomes);
  createMenuButton('Select all', () => setSelection(Array.from(demoState.atomes.keys())));
  createMenuButton('Reset positions', resetPositions);
  const showCodeButton = createMenuButton('Show code', () => {
    const isHidden = codePanel.style.display === 'none';
    if (isHidden) {
      codePanel.$({ text: getToolCodeText() });
      codePanel.style.display = 'block';
      showCodeButton.textContent = 'Hide code';
    } else {
      codePanel.style.display = 'none';
      showCodeButton.textContent = 'Show code';
    }
  });
  createMenuButton('Run nudge tool', () => {
    runToolEvent({
      tool_id: 'ui_nudge_tool',
      event: 'on_drag_move',
      input: {
        selection: demoState.selection,
        gesture: { type: 'drag', dx: 12, dy: -6 },
        params: { multiplier: 1 }
      },
      signals: { overall_confidence: 0.98 }
    });
  });
}
