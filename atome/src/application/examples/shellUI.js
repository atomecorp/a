const UI_ID = 'shell-ui-panel';
const STYLE_ID = 'shell-ui-styles';

function sanitizeName(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '_');
}

function getDefaultUserLabel() {
  const fallback = 'my_user';
  const candidate = window.__currentUser?.id || window.__currentUser?.username || window.__currentUser?.userName;
  return sanitizeName(candidate || fallback);
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Syne:wght@500;700&display=swap');

#${UI_ID} {
  position: fixed;
  right: 24px;
  bottom: 24px;
  width: min(420px, 92vw);
  background: linear-gradient(140deg, rgba(20, 30, 36, 0.96), rgba(10, 18, 22, 0.98));
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 18px;
  padding: 18px;
  color: #e6f1f5;
  font-family: 'Syne', sans-serif;
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35);
  z-index: 60000;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

#${UI_ID} * {
  box-sizing: border-box;
}

.shell-ui__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.shell-ui__title {
  font-size: 18px;
  letter-spacing: 0.04em;
}

.shell-ui__badge {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(80, 177, 120, 0.2);
  color: #7cffc3;
}

.shell-ui__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-family: 'IBM Plex Mono', monospace;
}

.shell-ui__row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.shell-ui__row--grid {
  grid-template-columns: 1fr 1fr;
}

.shell-ui__label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(230, 241, 245, 0.7);
}

.shell-ui__input,
.shell-ui__select,
.shell-ui__textarea {
  width: 100%;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.05);
  color: #f2f7fa;
  font-size: 12px;
  font-family: 'IBM Plex Mono', monospace;
}

.shell-ui__textarea {
  min-height: 58px;
  resize: vertical;
}

.shell-ui__actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.shell-ui__button {
  border: none;
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 12px;
  cursor: pointer;
  font-weight: 600;
  color: #081116;
  background: #6fffd2;
}

.shell-ui__button.secondary {
  background: rgba(255, 255, 255, 0.08);
  color: #f2f7fa;
}

.shell-ui__warning {
  padding: 8px 10px;
  border-radius: 10px;
  background: rgba(255, 155, 67, 0.16);
  color: #ffd1a3;
  font-size: 11px;
  line-height: 1.4;
}

.shell-ui__output {
  background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 10px;
  font-size: 11px;
  max-height: 180px;
  overflow: auto;
  white-space: pre-wrap;
}

.shell-ui__footer {
  font-size: 10px;
  color: rgba(230, 241, 245, 0.6);
}

.shell-ui__confirm {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: rgba(230, 241, 245, 0.75);
}
  `;
  document.head.appendChild(style);
}

function createField(label, inputEl) {
  const wrapper = document.createElement('div');
  wrapper.className = 'shell-ui__row';
  const labelEl = document.createElement('div');
  labelEl.className = 'shell-ui__label';
  labelEl.textContent = label;
  wrapper.appendChild(labelEl);
  wrapper.appendChild(inputEl);
  return wrapper;
}

function formatOutput(result) {
  const lines = [];
  lines.push(result.success ? '[ok]' : '[error]');
  if (result.error) lines.push(`error: ${result.error}`);
  if (result.userId) lines.push(`userId: ${result.userId}`);
  if (result.cwd) lines.push(`cwd: ${result.cwd}`);
  if (result.exitCode !== undefined) lines.push(`exit: ${result.exitCode}`);
  if (result.stdout) lines.push(`stdout:\n${result.stdout}`);
  else if (result.success) lines.push('stdout: (empty)');
  if (result.stderr) lines.push(`stderr:\n${result.stderr}`);
  return lines.join('\n');
}

function updateScopeWarning(scope, warningEl) {
  if (scope === 'root') {
    warningEl.textContent = 'Root scope: requires ROOT token and server permissions. Use sparingly.';
    warningEl.style.display = 'block';
    return;
  }
  if (scope === 'elevated') {
    warningEl.textContent = 'Elevated scope: only install commands allowed. Requires ELEVATED token.';
    warningEl.style.display = 'block';
    return;
  }
  warningEl.style.display = 'none';
}

function createUI() {
  if (document.getElementById(UI_ID)) return;
  const shellApi = window.shell;
  if (typeof shellApi !== 'function') {
    console.warn('[shellUI] shell() API not available');
    return;
  }

  ensureStyles();

  const host = document.getElementById('intuition')
    || document.getElementById('view')
    || document.body;

  const panel = document.createElement('div');
  panel.id = UI_ID;

  const header = document.createElement('div');
  header.className = 'shell-ui__header';
  const title = document.createElement('div');
  title.className = 'shell-ui__title';
  title.textContent = 'Shell Console';
  const badge = document.createElement('div');
  badge.className = 'shell-ui__badge';
  badge.textContent = 'sandbox';
  header.appendChild(title);
  header.appendChild(badge);

  const body = document.createElement('div');
  body.className = 'shell-ui__body';

  const cmdInput = document.createElement('textarea');
  cmdInput.className = 'shell-ui__textarea';
  cmdInput.placeholder = 'mkdir "my folder"';
  body.appendChild(createField('Command', cmdInput));

  const scopeSelect = document.createElement('select');
  scopeSelect.className = 'shell-ui__select';
  [
    { value: 'sandbox', label: 'sandbox (default)' },
    { value: 'elevated', label: 'elevated (install only)' },
    { value: 'root', label: 'root (full fs)' }
  ].forEach((opt) => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    scopeSelect.appendChild(option);
  });

  const cwdInput = document.createElement('input');
  cwdInput.className = 'shell-ui__input';
  const userLabel = getDefaultUserLabel();
  cwdInput.placeholder = `relative to data/users/${userLabel}`;

  const timeoutInput = document.createElement('input');
  timeoutInput.className = 'shell-ui__input';
  timeoutInput.type = 'number';
  timeoutInput.value = '15000';

  const row = document.createElement('div');
  row.className = 'shell-ui__row shell-ui__row--grid';
  row.appendChild(createField('Scope', scopeSelect));
  row.appendChild(createField('CWD', cwdInput));

  const row2 = document.createElement('div');
  row2.className = 'shell-ui__row shell-ui__row--grid';
  row2.appendChild(createField('Timeout (ms)', timeoutInput));
  const emptySlot = document.createElement('div');
  row2.appendChild(emptySlot);

  const tokenInput = document.createElement('input');
  tokenInput.className = 'shell-ui__input';
  tokenInput.type = 'password';
  tokenInput.placeholder = 'Shell token (for elevated/root)';

  const authInput = document.createElement('input');
  authInput.className = 'shell-ui__input';
  authInput.type = 'password';
  authInput.placeholder = 'Auth token (optional override)';

  body.appendChild(row);
  body.appendChild(row2);
  body.appendChild(createField('Shell token', tokenInput));
  body.appendChild(createField('Auth token', authInput));

  const warning = document.createElement('div');
  warning.className = 'shell-ui__warning';
  warning.style.display = 'none';
  body.appendChild(warning);

  const confirm = document.createElement('label');
  confirm.className = 'shell-ui__confirm';
  const confirmInput = document.createElement('input');
  confirmInput.type = 'checkbox';
  confirm.appendChild(confirmInput);
  confirm.appendChild(document.createTextNode('I understand the risk'));
  body.appendChild(confirm);

  const output = document.createElement('div');
  output.className = 'shell-ui__output';
  output.textContent = 'Awaiting command...';

  const actions = document.createElement('div');
  actions.className = 'shell-ui__actions';
  const runBtn = document.createElement('button');
  runBtn.className = 'shell-ui__button';
  runBtn.textContent = 'Run';
  const clearBtn = document.createElement('button');
  clearBtn.className = 'shell-ui__button secondary';
  clearBtn.textContent = 'Clear';
  actions.appendChild(runBtn);
  actions.appendChild(clearBtn);

  const footer = document.createElement('div');
  footer.className = 'shell-ui__footer';
  const currentUserLabel = window.__currentUser?.id || window.__currentUser?.username || userLabel;
  footer.textContent = `Default sandbox root: data/users/${currentUserLabel}`;

  panel.appendChild(header);
  panel.appendChild(body);
  panel.appendChild(actions);
  panel.appendChild(output);
  panel.appendChild(footer);

  host.appendChild(panel);

  function updateScope() {
    const scope = scopeSelect.value;
    badge.textContent = scope;
    updateScopeWarning(scope, warning);
    confirm.style.display = scope === 'sandbox' ? 'none' : 'flex';
    confirmInput.checked = scope === 'sandbox';
  }

  updateScope();

  scopeSelect.addEventListener('change', updateScope);

  async function runCommand() {
    const command = cmdInput.value.trim();
    if (!command) {
      output.textContent = 'Command is empty.';
      return;
    }
    const scope = scopeSelect.value;
    if (scope !== 'sandbox' && !confirmInput.checked) {
      output.textContent = 'Confirm the risk to use elevated/root scopes.';
      return;
    }

    const timeoutMs = Number(timeoutInput.value || 15000);
    const payload = {
      command,
      scope,
      cwd: cwdInput.value.trim(),
      shellToken: tokenInput.value.trim(),
      authToken: authInput.value.trim(),
      timeoutMs,
      silent: true
    };

    output.textContent = 'Running...';

    try {
      const result = await shellApi(payload);
      output.textContent = formatOutput(result);
    } catch (error) {
      output.textContent = `Error: ${error.message || error}`;
    }
  }

  runBtn.addEventListener('click', runCommand);

  clearBtn.addEventListener('click', () => {
    cmdInput.value = '';
    output.textContent = 'Cleared.';
  });

  cmdInput.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      runCommand();
    }
  });
}

if (typeof window !== 'undefined') {
  createUI();
}
