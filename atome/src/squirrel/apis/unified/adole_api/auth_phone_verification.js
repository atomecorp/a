import { TauriAdapter, FastifyAdapter, resolveAuthSource } from '../adole.js';

const adapters = {
    tauri: TauriAdapter,
    fastify: FastifyAdapter
};

const phoneVerificationBackendByPhone = new Map();

const normalizePhone = (phone) => {
    if (phone === null || phone === undefined) return '';
    const trimmed = String(phone).trim();
    if (!trimmed) return '';
    const cleaned = trimmed.replace(/[^\d+]/g, '');
    if (!cleaned) return '';
    if (cleaned.startsWith('+')) return `+${cleaned.slice(1).replace(/\+/g, '')}`;
    return cleaned.replace(/\+/g, '');
};

const normalizeBackend = (value) => (value === 'tauri' || value === 'fastify' ? value : null);
const getActiveBackend = (preferred = null) => {
    const backend = preferred ? normalizeBackend(preferred) : normalizeBackend(resolveAuthSource());
    if (!backend) throw new Error('phone_verification_backend_unresolved');
    return backend;
};

const extractOtpCode = (result) => (result && result.code ? result.code : null);
const isOtpBypassed = (result) => result?.otpBypassed === true || result?.otp_bypassed === true;

const requestPhoneVerificationBackend = async (backend, { phone, context, exposeForTest }) => {
    const adapter = adapters[backend];
    if (!adapter || !adapter.auth || typeof adapter.auth.requestPhoneVerification !== 'function') {
        throw new Error('phone_verification_request_adapter_missing');
    }
    const result = await adapter.auth.requestPhoneVerification({ phone, context, exposeForTest });
    const ok = !!(result && result.success === true);
    return {
        ok,
        code: extractOtpCode(result),
        otpBypassed: isOtpBypassed(result),
        raw: result,
        error: ok ? null : String(result && result.error ? result.error : 'phone_verification_request_failed')
    };
};

const verifyPhoneVerificationBackend = async (backend, { phone, code, context }) => {
    const adapter = adapters[backend];
    if (!adapter || !adapter.auth || typeof adapter.auth.verifyPhoneVerification !== 'function') {
        throw new Error('phone_verification_verify_adapter_missing');
    }
    const result = await adapter.auth.verifyPhoneVerification({ phone, code, context });
    const ok = !!(result && result.success === true);
    return {
        ok,
        raw: result,
        error: ok ? null : String(result && result.error ? result.error : 'phone_verification_failed')
    };
};

const requestPhoneVerification = async (phone, context = 'login_demo', options = {}) => {
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone || !context) return { ok: false, success: false, error: 'invalid_phone_verification_request' };
    const backend = getActiveBackend();
    const result = await requestPhoneVerificationBackend(backend, {
        phone: cleanPhone,
        context,
        exposeForTest: options && options.exposeForTest === true
    });
    if (result.ok) {
        phoneVerificationBackendByPhone.set(cleanPhone, backend);
        return {
            ok: true,
            success: true,
            backend,
            code: result.code,
            otpBypassed: result.otpBypassed === true,
            raw: result.raw
        };
    }
    return { ok: false, success: false, error: result.error };
};

const verifyPhoneVerification = async (phone, code, context = 'login_demo') => {
    const cleanPhone = normalizePhone(phone);
    const cleanCode = code === undefined || code === null ? '' : String(code).trim();
    if (!cleanPhone || !cleanCode || !context) return { ok: false, success: false, error: 'invalid_phone_verification' };
    const backend = getActiveBackend(phoneVerificationBackendByPhone.get(cleanPhone));
    const result = await verifyPhoneVerificationBackend(backend, { phone: cleanPhone, code: cleanCode, context });
    if (result.ok) {
        phoneVerificationBackendByPhone.delete(cleanPhone);
        return { ok: true, success: true, backend, raw: result.raw };
    }
    return { ok: false, success: false, error: result.error };
};

export {
    requestPhoneVerification,
    verifyPhoneVerification
};
