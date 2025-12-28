if (typeof window !== 'undefined' && typeof window.$ === 'function') {
    const AI_PROVIDERS = {
        openai: {
            id: 'openai',
            label: 'OpenAI',
            type: 'openai',
            endpoint: 'https://api.openai.com/v1/chat/completions',
            models: ['gpt-4o-mini', 'gpt-4o']
        },
        anthropic: {
            id: 'anthropic',
            label: 'Anthropic',
            type: 'anthropic',
            endpoint: 'https://api.anthropic.com/v1/messages',
            models: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022']
        },
        mistral: {
            id: 'mistral',
            label: 'Mistral',
            type: 'openai',
            endpoint: 'https://api.mistral.ai/v1/chat/completions',
            models: ['mistral-large-latest', 'mistral-small-latest']
        },
        google: {
            id: 'google',
            label: 'Google',
            type: 'google',
            endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
            models: ['gemini-1.5-flash', 'gemini-1.5-pro']
        },
        deepseek: {
            id: 'deepseek',
            label: 'DeepSeek',
            type: 'openai',
            endpoint: 'https://api.deepseek.com/v1/chat/completions',
            models: ['deepseek-chat', 'deepseek-reasoner']
        }
    };

    const SYSTEM_PROMPT = [
        'Return JSON only.',
        'Schema: {"actions":[{"tool_name":"ui.create_boxes","params":{"count":2}}, {"tool_name":"ui.select_all","params":{}}, {"tool_name":"ui.move_selection","params":{"dx":20,"dy":0}}]}',
        'Available tools:',
        '- ui.create_boxes(count:number)',
        '- ui.select_all()',
        '- ui.move_selection(dx:number, dy:number)',
        'No extra text or markdown.'
    ].join('\n');

    const runtime = {
        items: new Map(),
        selection: [],
        counter: 0
    };

    const wrapper = $('div', {
        parent: '#view',
        id: 'ai-prompt-demo',
        css: {
            position: 'fixed',
            top: '555px',
            left: '16px',
            right: '16px',
            margin: '0',
            padding: '12px',
            border: '1px solid #2d2d2d',
            borderRadius: '8px',
            backgroundColor: '#101010',
            color: '#e6e6e6',
            fontFamily: 'monospace',
            maxWidth: '680px',
            zIndex: 10000001,
            pointerEvents: 'auto'
        }
    });

    $('div', {
        parent: wrapper,
        text: 'AI prompt input',
        css: {
            marginBottom: '8px',
            fontSize: '14px'
        }
    });

    const settingsRow = $('div', {
        parent: wrapper,
        css: {
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px',
            marginBottom: '8px'
        }
    });

    const providerSelect = $('select', {
        parent: settingsRow,
        css: {
            padding: '6px',
            borderRadius: '6px',
            border: '1px solid #444',
            backgroundColor: '#181818',
            color: '#e6e6e6'
        }
    });

    Object.values(AI_PROVIDERS).forEach((provider) => {
        providerSelect.appendChild(new Option(provider.label, provider.id));
    });

    const modelSelect = $('select', {
        parent: settingsRow,
        css: {
            padding: '6px',
            borderRadius: '6px',
            border: '1px solid #444',
            backgroundColor: '#181818',
            color: '#e6e6e6'
        }
    });

    const keyRow = $('div', {
        parent: wrapper,
        css: {
            display: 'grid',
            gridTemplateColumns: '1fr auto auto',
            gap: '8px',
            marginBottom: '8px'
        }
    });

    const keyInput = $('input', {
        parent: keyRow,
        attrs: {
            type: 'password',
            placeholder: 'API key for selected provider'
        },
        css: {
            padding: '6px',
            borderRadius: '6px',
            border: '1px solid #444',
            backgroundColor: '#181818',
            color: '#e6e6e6'
        }
    });

    const saveKeyButton = $('button', {
        parent: keyRow,
        text: 'Save key',
        css: {
            padding: '6px 10px',
            borderRadius: '6px',
            border: '1px solid #444',
            backgroundColor: '#1f1f1f',
            color: '#e6e6e6',
            cursor: 'pointer'
        }
    });

    const toggleKeyButton = $('button', {
        parent: keyRow,
        text: 'Show',
        css: {
            padding: '6px 10px',
            borderRadius: '6px',
            border: '1px solid #444',
            backgroundColor: '#1f1f1f',
            color: '#e6e6e6',
            cursor: 'pointer'
        }
    });

    const optionsRow = $('div', {
        parent: wrapper,
        css: {
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '8px'
        }
    });

    const streamToggle = $('input', {
        parent: optionsRow,
        attrs: {
            type: 'checkbox',
            checked: true
        }
    });

    $('span', {
        parent: optionsRow,
        text: 'Stream response'
    });

    const promptInput = $('textarea', {
        parent: wrapper,
        text: 'cree 2 ou trois elements qui peuvent etre selectionable et deplace les elements selectionnes de 20px vers la droite.',
        attrs: {
            rows: 4,
            placeholder: 'Ecris un prompt pour l AI...'
        },
        css: {
            width: '100%',
            padding: '8px',
            borderRadius: '6px',
            border: '1px solid #444',
            backgroundColor: '#181818',
            color: '#e6e6e6',
            resize: 'vertical',
            marginBottom: '8px'
        }
    });

    const buttonRow = $('div', {
        parent: wrapper,
        css: {
            display: 'flex',
            gap: '8px',
            marginBottom: '8px'
        }
    });

    const sendButton = $('button', {
        parent: buttonRow,
        text: 'Send prompt',
        css: {
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid #444',
            backgroundColor: '#1f1f1f',
            color: '#e6e6e6',
            cursor: 'pointer'
        }
    });

    const clearButton = $('button', {
        parent: buttonRow,
        text: 'Clear output',
        css: {
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid #444',
            backgroundColor: '#1f1f1f',
            color: '#e6e6e6',
            cursor: 'pointer'
        }
    });

    const statusLine = $('div', {
        parent: wrapper,
        text: 'Status: ready',
        css: {
            fontSize: '12px',
            color: '#9aa0a6',
            marginBottom: '8px'
        }
    });

    const outputPanel = $('pre', {
        parent: wrapper,
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
            maxHeight: '220px',
            overflow: 'auto'
        }
    });

    const stage = $('div', {
        parent: wrapper,
        id: 'ai-runner-stage',
        css: {
            position: 'relative',
            height: '220px',
            border: '1px dashed #3a3a3a',
            borderRadius: '6px',
            backgroundColor: '#141414',
            overflow: 'hidden'
        }
    });

    const updateStatus = (message) => {
        statusLine.$({ text: message });
    };

    const setOutput = (text) => {
        outputPanel.$({ text: text || '' });
        outputPanel.style.display = text ? 'block' : 'none';
    };

    const appendOutput = (text) => {
        const current = outputPanel.textContent || '';
        setOutput(current + text);
    };

    const syncSelectionStyles = () => {
        runtime.items.forEach((item, id) => {
            const isSelected = runtime.selection.includes(id);
            item.element.style.outline = isSelected ? '2px solid #39ff14' : 'none';
        });
    };

    const setSelection = (ids) => {
        runtime.selection = ids.slice();
        syncSelectionStyles();
    };

    const toggleSelection = (id) => {
        const index = runtime.selection.indexOf(id);
        if (index === -1) {
            runtime.selection.push(id);
        } else {
            runtime.selection.splice(index, 1);
        }
        syncSelectionStyles();
    };

    const createSelectableItems = (count) => {
        const colors = ['#ff6f61', '#4fc3f7', '#ffd166'];
        const createdIds = [];
        const total = Math.max(1, Math.min(6, Math.round(count || 2)));

        for (let i = 0; i < total; i += 1) {
            const id = `ai_box_${++runtime.counter}`;
            const x = 20 + ((runtime.counter - 1) % 5) * 70;
            const y = 20 + Math.floor((runtime.counter - 1) / 5) * 80;
            const color = colors[(runtime.counter - 1) % colors.length];

            const element = $('div', {
                parent: stage,
                id,
                css: {
                    position: 'absolute',
                    left: `${x}px`,
                    top: `${y}px`,
                    width: '60px',
                    height: '60px',
                    borderRadius: '8px',
                    backgroundColor: color,
                    transition: 'left 120ms ease, top 120ms ease'
                },
                onclick: () => toggleSelection(id)
            });

            runtime.items.set(id, {
                id,
                element,
                position: { x, y }
            });
            createdIds.push(id);
        }

        if (createdIds.length) {
            setSelection(createdIds);
        }

        return createdIds;
    };

    const moveSelection = (dx, dy) => {
        if (!runtime.selection.length) return 0;
        let moved = 0;
        runtime.selection.forEach((id) => {
            const item = runtime.items.get(id);
            if (!item) return;
            item.position = {
                x: item.position.x + dx,
                y: item.position.y + dy
            };
            item.element.style.left = `${item.position.x}px`;
            item.element.style.top = `${item.position.y}px`;
            moved += 1;
        });
        return moved;
    };

    const registerTools = () => {
        if (!window.AtomeAI) return;

        window.AtomeAI.registerTool({
            name: 'ui.create_boxes',
            description: 'Create selectable elements',
            capabilities: ['atome.write'],
            risk_level: 'LOW',
            params_schema: {
                properties: { count: { type: 'number' } }
            },
            handler: async ({ params }) => {
                const ids = createSelectableItems(params?.count || 2);
                return { result: { ids } };
            },
            summary: () => 'Create selectable elements'
        });

        window.AtomeAI.registerTool({
            name: 'ui.select_all',
            description: 'Select all elements',
            capabilities: ['atome.write'],
            risk_level: 'LOW',
            handler: async () => {
                const ids = Array.from(runtime.items.keys());
                setSelection(ids);
                return { result: { count: ids.length } };
            },
            summary: () => 'Select all elements'
        });

        window.AtomeAI.registerTool({
            name: 'ui.move_selection',
            description: 'Move selection',
            capabilities: ['atome.write'],
            risk_level: 'LOW',
            params_schema: {
                properties: {
                    dx: { type: 'number' },
                    dy: { type: 'number' }
                }
            },
            handler: async ({ params }) => {
                const moved = moveSelection(params?.dx || 0, params?.dy || 0);
                return { result: { moved } };
            },
            summary: () => 'Move selection'
        });
    };

    registerTools();

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let cachedCryptoKey = null;

    const bufferToBase64 = (buffer) => {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        bytes.forEach((b) => {
            binary += String.fromCharCode(b);
        });
        return btoa(binary);
    };

    const base64ToBuffer = (base64) => {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    };

    const getCryptoKey = async () => {
        if (cachedCryptoKey) return cachedCryptoKey;
        if (!window.crypto?.subtle) {
            throw new Error('Crypto API unavailable');
        }
        const storageKey = 'ai_secret_device_key';
        let rawKey = localStorage.getItem(storageKey);
        if (!rawKey) {
            const bytes = crypto.getRandomValues(new Uint8Array(32));
            rawKey = bufferToBase64(bytes.buffer);
            localStorage.setItem(storageKey, rawKey);
        }
        const keyBuffer = base64ToBuffer(rawKey);
        cachedCryptoKey = await crypto.subtle.importKey(
            'raw',
            keyBuffer,
            { name: 'AES-GCM' },
            false,
            ['encrypt', 'decrypt']
        );
        return cachedCryptoKey;
    };

    const encryptSecret = async (plainText) => {
        const key = await getCryptoKey();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const cipher = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            encoder.encode(plainText)
        );
        return JSON.stringify({
            v: 1,
            alg: 'AES-GCM',
            iv: bufferToBase64(iv.buffer),
            data: bufferToBase64(cipher)
        });
    };

    const decryptSecret = async (payload) => {
        const parsed = JSON.parse(payload || '{}');
        if (!parsed.data || !parsed.iv) return '';
        const key = await getCryptoKey();
        const plain = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: new Uint8Array(base64ToBuffer(parsed.iv)) },
            key,
            base64ToBuffer(parsed.data)
        );
        return decoder.decode(plain);
    };

    const getCurrentUserId = async () => {
        try {
            const result = await window.AdoleAPI?.auth?.current?.();
            if (result?.logged && result.user) {
                return result.user.user_id || result.user.atome_id || result.user.id || null;
            }
            const fallback = window.AdoleAPI?.auth?.getCurrentInfo?.();
            return fallback?.id || null;
        } catch (e) {
            const fallback = window.AdoleAPI?.auth?.getCurrentInfo?.();
            return fallback?.id || null;
        }
    };

    const normalizeSecretId = (providerId, userId) => {
        return `secret_ai_${userId}_${providerId}`.replace(/[^a-zA-Z0-9_]/g, '_');
    };

    const extractAtome = (result) => {
        if (!result) return null;
        if (result.tauri?.success && result.tauri?.atome) return result.tauri.atome;
        if (result.fastify?.success && result.fastify?.atome) return result.fastify.atome;
        return null;
    };

    const loadProviderKey = async (providerId, userId) => {
        if (!window.AdoleAPI?.atomes?.get) return '';
        const resolvedUserId = userId || await getCurrentUserId();
        if (!resolvedUserId) return '';
        const secretId = normalizeSecretId(providerId, resolvedUserId);
        const result = await window.AdoleAPI.atomes.get(secretId);
        const atome = extractAtome(result);
        const payload = atome?.particles?.payload ?? atome?.data?.payload;
        if (!payload) return '';
        try {
            return await decryptSecret(payload);
        } catch (e) {
            updateStatus('Status: failed to decrypt key');
            return '';
        }
    };

    const saveProviderKey = async (providerId, keyValue) => {
        if (!window.AdoleAPI?.atomes?.create) {
            updateStatus('Status: AdoleAPI not ready');
            return false;
        }
        const userId = await getCurrentUserId();
        if (!userId) {
            updateStatus('Status: please log in first');
            return false;
        }

        const secretId = normalizeSecretId(providerId, userId);
        const encrypted = await encryptSecret(keyValue);
        const particles = {
            provider: providerId,
            payload: encrypted,
            updated_at: new Date().toISOString()
        };

        const existing = await window.AdoleAPI.atomes.get(secretId);
        if (extractAtome(existing)) {
            const result = await window.AdoleAPI.atomes.alter(secretId, particles);
            const ok = result.tauri?.success || result.fastify?.success;
            updateStatus(ok ? 'Status: key updated' : 'Status: key update failed');
            return ok;
        }

        const createResult = await window.AdoleAPI.atomes.create({
            id: secretId,
            type: 'secret',
            ownerId: userId,
            particles: {
                ...particles,
                created_at: new Date().toISOString()
            }
        });

        const ok = createResult.tauri?.success || createResult.fastify?.success;
        updateStatus(ok ? 'Status: key saved' : 'Status: key save failed');
        return ok;
    };

    const readSSE = async (response, onData) => {
        if (!response.body) throw new Error('Stream unsupported');
        const reader = response.body.getReader();
        const textDecoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += textDecoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            lines.forEach((line) => {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) return;
                const data = trimmed.replace(/^data:\s*/, '');
                if (!data) return;
                onData(data);
            });
        }
    };

    const requestOpenAIStyle = async ({ provider, model, prompt, apiKey, stream, onToken }) => {
        const body = {
            model,
            temperature: 0.2,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: prompt }
            ],
            stream: Boolean(stream)
        };

        const response = await fetch(provider.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Provider error');
        }

        if (!stream) {
            const data = await response.json();
            return data?.choices?.[0]?.message?.content || '';
        }

        let fullText = '';
        await readSSE(response, (data) => {
            if (data === '[DONE]') return;
            let parsed;
            try {
                parsed = JSON.parse(data);
            } catch (e) {
                return;
            }
            const delta = parsed?.choices?.[0]?.delta?.content || '';
            if (delta) {
                fullText += delta;
                if (onToken) onToken(delta);
            }
        });

        return fullText;
    };

    const requestAnthropic = async ({ provider, model, prompt, apiKey, stream, onToken }) => {
        const body = {
            model,
            max_tokens: 1024,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: prompt }],
            stream: Boolean(stream)
        };

        const response = await fetch(provider.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Provider error');
        }

        if (!stream) {
            const data = await response.json();
            const parts = Array.isArray(data?.content) ? data.content : [];
            return parts.map((part) => part.text).join('');
        }

        let fullText = '';
        await readSSE(response, (data) => {
            let parsed;
            try {
                parsed = JSON.parse(data);
            } catch (e) {
                return;
            }
            if (parsed.type === 'content_block_delta') {
                const delta = parsed.delta?.text || '';
                if (delta) {
                    fullText += delta;
                    if (onToken) onToken(delta);
                }
            }
        });

        return fullText;
    };

    const requestGoogle = async ({ provider, model, prompt, apiKey, stream, onToken }) => {
        const baseUrl = `${provider.endpoint}/${model}`;
        const action = stream ? 'streamGenerateContent' : 'generateContent';
        const url = `${baseUrl}:${action}?key=${encodeURIComponent(apiKey)}${stream ? '&alt=sse' : ''}`;

        const body = {
            systemInstruction: {
                parts: [{ text: SYSTEM_PROMPT }]
            },
            contents: [
                { role: 'user', parts: [{ text: prompt }] }
            ]
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || 'Provider error');
        }

        if (!stream) {
            const data = await response.json();
            const parts = data?.candidates?.[0]?.content?.parts || [];
            return parts.map((part) => part.text).join('');
        }

        let fullText = '';
        await readSSE(response, (data) => {
            let parsed;
            try {
                parsed = JSON.parse(data);
            } catch (e) {
                return;
            }
            const parts = parsed?.candidates?.[0]?.content?.parts || [];
            const chunk = parts.map((part) => part.text).join('');
            if (chunk) {
                fullText += chunk;
                if (onToken) onToken(chunk);
            }
        });

        return fullText;
    };

    const requestCompletion = async ({ providerId, model, prompt, apiKey, stream, onToken }) => {
        const provider = AI_PROVIDERS[providerId];
        if (!provider) throw new Error('Unknown provider');
        if (provider.type === 'openai') {
            return requestOpenAIStyle({ provider, model, prompt, apiKey, stream, onToken });
        }
        if (provider.type === 'anthropic') {
            return requestAnthropic({ provider, model, prompt, apiKey, stream, onToken });
        }
        if (provider.type === 'google') {
            return requestGoogle({ provider, model, prompt, apiKey, stream, onToken });
        }
        throw new Error('Unsupported provider');
    };

    const extractJson = (text) => {
        const trimmed = (text || '').trim();
        if (!trimmed) return null;
        const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
        const raw = fenced ? fenced[1] : trimmed;
        const start = raw.indexOf('{');
        const end = raw.lastIndexOf('}');
        if (start === -1 || end === -1) return null;
        const jsonText = raw.slice(start, end + 1);
        return JSON.parse(jsonText);
    };

    const applyActions = async (actions) => {
        if (!Array.isArray(actions)) return 0;
        if (!window.AtomeAI) return 0;
        const actor = { user_id: 'local_user', agent_id: 'ai_prompt_ui', session_id: 'local' };
        const signals = { overall_confidence: 0.92 };
        let executed = 0;

        for (const action of actions) {
            if (!action?.tool_name) continue;
            await window.AtomeAI.callTool({
                tool_name: action.tool_name,
                params: action.params || {},
                actor,
                signals
            });
            executed += 1;
        }

        return executed;
    };

    const populateModels = (providerId) => {
        const provider = AI_PROVIDERS[providerId];
        const models = provider?.models || [];
        modelSelect.innerHTML = '';
        models.forEach((model) => {
            modelSelect.appendChild(new Option(model, model));
        });
    };

    let keyReloadTimer = null;
    let keyReloadAttempts = 0;
    const scheduleKeyReload = (delay = 300) => {
        if (keyReloadTimer) clearTimeout(keyReloadTimer);
        keyReloadTimer = setTimeout(() => {
            loadSelectedKey().catch(() => { });
        }, delay);
    };

    const loadSelectedKey = async () => {
        const providerId = providerSelect.value;
        const userId = await getCurrentUserId();
        if (!userId) {
            keyReloadAttempts += 1;
            if (keyReloadAttempts <= 30) {
                scheduleKeyReload(1000);
            }
            updateStatus('Status: please log in to load key');
            return;
        }
        keyReloadAttempts = 0;
        const keyValue = await loadProviderKey(providerId, userId);
        keyInput.value = keyValue || '';
        if (keyValue) {
            updateStatus('Status: key loaded');
        }
    };

    let keyWatchTimer = null;
    const startKeyWatcher = () => {
        if (keyWatchTimer) return;
        keyWatchTimer = setInterval(async () => {
            if (keyInput.value) return;
            const userId = await getCurrentUserId();
            if (!userId) return;
            const keyValue = await loadProviderKey(providerSelect.value, userId);
            if (keyValue) {
                keyInput.value = keyValue;
                updateStatus('Status: key loaded');
                clearInterval(keyWatchTimer);
                keyWatchTimer = null;
            }
        }, 2000);
    };

    providerSelect.value = 'openai';
    populateModels('openai');
    modelSelect.value = AI_PROVIDERS.openai.models[0];

    providerSelect.addEventListener('change', () => {
        populateModels(providerSelect.value);
        keyInput.value = '';
        scheduleKeyReload();
    });

    saveKeyButton.addEventListener('click', () => {
        const providerId = providerSelect.value;
        const keyValue = keyInput.value.trim();
        if (!keyValue) {
            updateStatus('Status: key is empty');
            return;
        }
        saveProviderKey(providerId, keyValue).then(() => {
            scheduleKeyReload();
        }).catch((error) => {
            updateStatus(`Status: ${error.message}`);
        });
    });

    toggleKeyButton.addEventListener('click', () => {
        const isPassword = keyInput.getAttribute('type') === 'password';
        keyInput.setAttribute('type', isPassword ? 'text' : 'password');
        toggleKeyButton.textContent = isPassword ? 'Hide' : 'Show';
    });

    clearButton.addEventListener('click', () => {
        setOutput('');
    });

    sendButton.addEventListener('click', async () => {
        const prompt = promptInput.value.trim();
        if (!prompt) {
            updateStatus('Status: prompt is empty');
            return;
        }

        const providerId = providerSelect.value;
        const model = modelSelect.value;
        const apiKey = keyInput.value.trim();
        if (!apiKey) {
            updateStatus('Status: API key missing');
            return;
        }

        setOutput('');
        updateStatus('Status: sending prompt...');

        try {
            const stream = streamToggle.checked;
            const responseText = await requestCompletion({
                providerId,
                model,
                prompt,
                apiKey,
                stream,
                onToken: (chunk) => {
                    appendOutput(chunk);
                }
            });

            if (!stream) {
                setOutput(responseText);
            }

            const parsed = extractJson(responseText || outputPanel.textContent || '');
            if (!parsed) {
                updateStatus('Status: failed to parse JSON response');
                return;
            }

            const actions = Array.isArray(parsed) ? parsed : parsed.actions;
            const executed = await applyActions(actions);
            updateStatus(`Status: executed ${executed} action(s)`);
        } catch (error) {
            const message = error && error.message ? error.message : 'Unknown error';
            updateStatus(`Status: ${message}`);
        }
    });

    window.addEventListener('squirrel:user-logged-in', scheduleKeyReload);
    window.addEventListener('squirrel:ready', scheduleKeyReload);
    scheduleKeyReload();
    startKeyWatcher();
}
