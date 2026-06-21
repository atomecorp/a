import { buildLocalApiUrl, isTauri } from '../apis/serverUrls.js';

const DEFAULT_TIMEOUT_MS = 20000;
const LOCAL_AI_PROXY_PATH = '/api/eve/ai/provider-completion';

const toText = (value) => String(value || '').trim();
const normalizeUsage = (usage = {}) => ({
    prompt_tokens: Number.isFinite(Number(usage?.prompt_tokens)) ? Number(usage.prompt_tokens) : 0,
    completion_tokens: Number.isFinite(Number(usage?.completion_tokens)) ? Number(usage.completion_tokens) : 0,
    total_tokens: Number.isFinite(Number(usage?.total_tokens))
        ? Number(usage.total_tokens)
        : (
            (Number.isFinite(Number(usage?.prompt_tokens)) ? Number(usage.prompt_tokens) : 0)
            + (Number.isFinite(Number(usage?.completion_tokens)) ? Number(usage.completion_tokens) : 0)
        )
});

const createTimeoutController = (timeoutMs) => {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || typeof AbortController !== 'function') {
        return { controller: null, clear: () => { } };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort('provider_timeout'), timeoutMs);
    return {
        controller,
        clear() {
            clearTimeout(timer);
        }
    };
};

const withMergedSignal = ({ signal = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => {
    const timeout = createTimeoutController(timeoutMs);
    if (!signal && timeout.controller) {
        return {
            signal: timeout.controller.signal,
            clear: timeout.clear
        };
    }
    if (!signal) {
        return {
            signal: null,
            clear: timeout.clear
        };
    }
    if (!timeout.controller) {
        return {
            signal,
            clear: () => { }
        };
    }
    if (typeof AbortController !== 'function') {
        return {
            signal,
            clear: timeout.clear
        };
    }
    const merged = new AbortController();
    const abort = (reason) => {
        if (!merged.signal.aborted) {
            merged.abort(reason);
        }
    };
    const onSignalAbort = () => abort(signal.reason || 'aborted');
    const onTimeoutAbort = () => abort(timeout.controller.signal.reason || 'provider_timeout');
    signal.addEventListener('abort', onSignalAbort, { once: true });
    timeout.controller.signal.addEventListener('abort', onTimeoutAbort, { once: true });
    return {
        signal: merged.signal,
        clear() {
            signal.removeEventListener('abort', onSignalAbort);
            timeout.controller.signal.removeEventListener('abort', onTimeoutAbort);
            timeout.clear();
        }
    };
};

const readResponseError = async (response) => {
    let rawBody = '';
    try {
        rawBody = await response.text();
    } catch (_) {
        rawBody = '';
    }

    const trimmed = toText(rawBody);
    let providerMessage = trimmed;
    let providerCode = '';

    if (trimmed) {
        try {
            const parsed = JSON.parse(trimmed);
            const error = parsed?.error && typeof parsed.error === 'object' ? parsed.error : null;
            providerMessage = toText(error?.message || parsed?.message || trimmed);
            providerCode = toText(error?.code || error?.type || parsed?.code || parsed?.type || '');
        } catch (_) {
            // Keep raw text when the provider did not return JSON.
        }
    }

    const segments = [`HTTP_${response.status}`];
    if (providerCode) segments.push(providerCode);
    if (providerMessage) segments.push(providerMessage);
    return {
        display: segments.join(' '),
        http_status: response.status,
        provider_code: providerCode,
        provider_message: providerMessage,
        raw_body: rawBody
    };
};

const createProviderHttpError = (info) => {
    const error = new Error(info.display);
    error.http_status = info.http_status;
    error.provider_code = info.provider_code;
    error.provider_message = info.provider_message;
    error.raw_body = info.raw_body;
    return error;
};

const shouldUseLocalAiProxy = ({ preferLocalProxy } = {}) => {
    if (preferLocalProxy === false) return false;
    if (preferLocalProxy === true) return true;
    return isTauri();
};

const requestViaLocalAiProxy = async ({
    provider,
    model,
    prompt,
    apiKey,
    systemPrompt = '',
    fetchImpl,
    signal,
    timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) => {
    const proxyUrl = buildLocalApiUrl(LOCAL_AI_PROXY_PATH);
    if (!proxyUrl) {
        throw new Error('provider_local_proxy_unavailable');
    }

    const response = await fetchImpl(proxyUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            provider_id: provider?.id || '',
            provider_type: provider?.type || '',
            completion_endpoint: provider?.endpoint || '',
            model: toText(model) || provider?.models?.[0] || '',
            prompt: String(prompt || ''),
            system_prompt: String(systemPrompt || ''),
            api_key: toText(apiKey),
            timeout_ms: Number.isFinite(Number(timeoutMs)) ? Number(timeoutMs) : DEFAULT_TIMEOUT_MS
        }),
        ...(signal ? { signal } : {})
    });

    if (!response.ok) {
        throw createProviderHttpError(await readResponseError(response));
    }

    const data = await response.json();
    return {
        text: toText(data?.text),
        usage: normalizeUsage(data?.usage || {})
    };
};

const requestOpenAiStyle = async ({
    provider,
    model,
    prompt,
    apiKey,
    systemPrompt = '',
    fetchImpl,
    signal
} = {}) => {
    const body = {
        model,
        temperature: 0.2,
        messages: [
            { role: 'system', content: String(systemPrompt || '') },
            { role: 'user', content: String(prompt || '') }
        ]
    };

    const response = await fetchImpl(provider.endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body),
        ...(signal ? { signal } : {})
    });

    if (!response.ok) {
        throw createProviderHttpError(await readResponseError(response));
    }

    const data = await response.json();
    return {
        text: toText(data?.choices?.[0]?.message?.content),
        usage: normalizeUsage(data?.usage || {})
    };
};

const requestAnthropic = async ({
    provider,
    model,
    prompt,
    apiKey,
    systemPrompt = '',
    fetchImpl,
    signal
} = {}) => {
    const body = {
        model,
        max_tokens: 2048,
        system: String(systemPrompt || ''),
        messages: [{ role: 'user', content: String(prompt || '') }]
    };

    const response = await fetchImpl(provider.endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body),
        ...(signal ? { signal } : {})
    });

    if (!response.ok) {
        throw createProviderHttpError(await readResponseError(response));
    }

    const data = await response.json();
    const parts = Array.isArray(data?.content) ? data.content : [];
    return {
        text: toText(parts.map((part) => toText(part?.text)).filter(Boolean).join('\n')),
        usage: normalizeUsage({
            prompt_tokens: data?.usage?.input_tokens,
            completion_tokens: data?.usage?.output_tokens
        })
    };
};

const requestGoogle = async ({
    provider,
    model,
    prompt,
    apiKey,
    systemPrompt = '',
    fetchImpl,
    signal
} = {}) => {
    const url = `${provider.endpoint}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const body = {
        systemInstruction: {
            parts: [{ text: String(systemPrompt || '') }]
        },
        contents: [
            {
                role: 'user',
                parts: [{ text: String(prompt || '') }]
            }
        ]
    };

    const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        ...(signal ? { signal } : {})
    });

    if (!response.ok) {
        throw createProviderHttpError(await readResponseError(response));
    }

    const data = await response.json();
    const parts = Array.isArray(data?.candidates?.[0]?.content?.parts) ? data.candidates[0].content.parts : [];
    return {
        text: toText(parts.map((part) => toText(part?.text)).filter(Boolean).join('\n')),
        usage: normalizeUsage({
            prompt_tokens: data?.usageMetadata?.promptTokenCount,
            completion_tokens: data?.usageMetadata?.candidatesTokenCount,
            total_tokens: data?.usageMetadata?.totalTokenCount
        })
    };
};

export {
    DEFAULT_TIMEOUT_MS,
    toText,
    normalizeUsage,
    withMergedSignal,
    shouldUseLocalAiProxy,
    requestViaLocalAiProxy,
    requestOpenAiStyle,
    requestAnthropic,
    requestGoogle
};
