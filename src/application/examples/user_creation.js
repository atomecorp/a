/**
 * User Account Management - Squirrel Framework
 * 
 * Complete authentication UI with:
 * - Registration (username, phone, password)
 * - Login with password verification
 * - Session management via JWT cookies
 * - Password reset via SMS OTP
 * - Profile editing
 * - Support for local and remote servers
 * - Server identity verification (cryptographic)
 * - Custom server URL configuration
 */

// =============================================================================
// IMPORTS - Server Verification & Sync Queue
// =============================================================================

// Import server verification module (loaded dynamically if available)
let ServerVerification = null;
let TrustedKeys = null;
let SyncQueue = null;

// Try to load security modules
(async function loadSecurityModules() {
    try {
        ServerVerification = await import('../security/serverVerification.js');
        TrustedKeys = await import('../security/trusted_keys.js');
        console.log('[auth] Security modules loaded');
    } catch (e) {
        console.warn('[auth] Security modules not available:', e.message);
    }

    // Load sync queue module
    try {
        SyncQueue = await import('../security/syncQueue.js');
        // Initialize sync queue (starts auto-sync if enabled)
        SyncQueue.initSyncQueue();
        console.log('[auth] Sync queue module loaded');
    } catch (e) {
        console.warn('[auth] Sync queue module not available:', e.message);
    }
})();

const rootId = 'userAccountExampleRoot';

// =============================================================================
// CONFIGURATION - API BASE URL
// =============================================================================

/**
 * Resolves the API base URL based on platform and environment.
 * Supports local development, Tauri apps, and remote servers.
 * @returns {{ base: string, isLocal: boolean }}
 */
function resolveApiConfig() {
    // Check if a custom API URL is configured (for remote server)
    if (typeof window !== 'undefined' && window.SQUIRREL_API_BASE) {
        return { base: window.SQUIRREL_API_BASE, isLocal: false };
    }

    // Check localStorage for user-configured remote server
    try {
        const stored = localStorage.getItem('squirrel_api_base');
        if (stored) return { base: stored, isLocal: false };
    } catch (e) { /* localStorage not available */ }

    // Auto-detect Tauri platform
    let isTauri = false;

    // Method 1: Check window.__TAURI__ (Tauri v1 and v2)
    if (typeof window !== 'undefined' && window.__TAURI__) {
        isTauri = true;
    }

    // Method 2: Check current_platform() function
    if (!isTauri) {
        try {
            const platform = typeof current_platform === 'function' ? current_platform() : '';
            if (typeof platform === 'string' && platform.toLowerCase().includes('taur')) {
                isTauri = true;
            }
        } catch (_) { }
    }

    // Method 3: Check if we're on Tauri dev server port (1420)
    if (!isTauri && typeof window !== 'undefined') {
        const port = window.location?.port;
        if (port === '1420') {
            isTauri = true;
        }
    }

    console.log('[auth] Platform detection: isTauri =', isTauri);
    console.log('[auth] Location:', window.location?.hostname, window.location?.port, window.location?.href);

    if (isTauri) {
        // Tauri/iOS: use local Axum server with SQLite on port 3000
        return { base: 'http://127.0.0.1:3000', isLocal: true };
    }

    // Check if we're on localhost development (not Tauri)
    // Safari/Chrome on localhost should use Fastify on port 3001
    if (typeof window !== 'undefined') {
        const hostname = window.location?.hostname;
        const port = window.location?.port;

        // If on localhost:3000 (Squirrel dev server) → use Fastify on 3001
        if ((hostname === 'localhost' || hostname === '127.0.0.1') && port === '3000') {
            console.log('[auth] Dev mode detected (localhost:3000), using Fastify on port 3001');
            return { base: 'http://localhost:3001', isLocal: false };
        }
    }

    // Default: same origin (relative URLs) - assumes Fastify cloud server
    console.log('[auth] Using same origin (Fastify cloud server mode)');
    return { base: '', isLocal: false };
}

const apiConfig = resolveApiConfig();
let apiBase = apiConfig.base;
const useLocalAuth = apiConfig.isLocal; // true = Axum/SQLite, false = Fastify/PostgreSQL
console.log('[auth] Final config: apiBase =', apiBase, ', useLocalAuth =', useLocalAuth, ', authPrefix =', useLocalAuth ? '/api/auth/local' : '/api/auth');

// Auth route prefix: local Axum uses /api/auth/local/*, cloud Fastify uses /api/auth/*
const authPrefix = useLocalAuth ? '/api/auth/local' : '/api/auth';

// Server verification state
let serverVerificationStatus = {
    verified: false,
    official: false,
    serverId: null,
    serverName: null,
    error: null,
    lastChecked: null
};

/**
 * Set the API base URL (useful for switching between local/remote)
 * @param {string} base - The API base URL (e.g., 'https://api.example.com')
 */
function setApiBase(base) {
    apiBase = base || '';
    // Reset verification status when URL changes
    serverVerificationStatus = {
        verified: false,
        official: false,
        serverId: null,
        serverName: null,
        error: null,
        lastChecked: null
    };
    try {
        if (base) {
            localStorage.setItem('squirrel_api_base', base);
        } else {
            localStorage.removeItem('squirrel_api_base');
        }
    } catch (e) { /* localStorage not available */ }
}

/**
 * Verify the current server before sensitive operations
 * @returns {Promise<object>} Verification result
 */
async function verifyCurrentServer() {
    if (!ServerVerification) {
        // Security modules not loaded, allow connection with warning
        return {
            verified: false,
            official: false,
            success: true,
            warnings: ['Security modules not loaded']
        };
    }

    const url = apiBase || window.location.origin;
    const result = await ServerVerification.verifyServer(url);

    serverVerificationStatus = {
        ...result,
        lastChecked: Date.now()
    };

    return result;
}

// =============================================================================
// ACCOUNT STATE
// =============================================================================

const AccountState = {
    UNKNOWN: 'unknown',
    PROFILE: 'profile',
    LOGIN: 'login',
    SIGNUP: 'signup',
    RECOVERY: 'recovery',
    OTP_VERIFY: 'otp_verify',
    SERVER_CONFIG: 'server_config'
};

const accountStore = {
    currentUser: null,
    isLoggedIn: false,
    optionalFieldsVisible: false,
    formData: {
        username: '',
        phone: '',
        password: '',
        passwordConfirm: '',
        otpCode: '',
        newPassword: '',
        serverUrl: ''
    },
    error: null,
    loading: false
};

// =============================================================================
// API FUNCTIONS
// =============================================================================

async function apiRequest(endpoint, options = {}) {
    const url = apiBase ? `${apiBase}${endpoint}` : endpoint;

    const headers = { 'Content-Type': 'application/json', ...options.headers };

    // Add Authorization header for local auth
    if (useLocalAuth) {
        const token = localStorage.getItem('local_auth_token');
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
    }

    const defaultOptions = {
        headers,
        credentials: 'include' // Important for cookies
    };

    const response = await fetch(url, { ...defaultOptions, ...options, headers });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data;
}

async function apiRegister(username, phone, password, optional = {}) {
    const url = apiBase ? `${apiBase}${authPrefix}/register` : `${authPrefix}/register`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, phone, password, optional }),
        credentials: 'include'
    });

    const data = await response.json().catch(() => ({}));

    // Don't throw on expected errors (409 = conflict/already exists, 400 = validation)
    if (response.status === 409 || response.status === 400) {
        return { success: false, error: data.error || 'Registration failed' };
    }

    if (!response.ok) {
        return { success: false, error: data.error || `HTTP ${response.status}` };
    }

    return { success: true, ...data };
}

async function apiLogin(phone, password) {
    const url = apiBase ? `${apiBase}${authPrefix}/login` : `${authPrefix}/login`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password }),
        credentials: 'include'
    });

    const data = await response.json().catch(() => ({}));

    // Don't throw on 401 - it's expected for wrong credentials
    if (response.status === 401) {
        return { success: false, error: data.error || 'Invalid credentials' };
    }

    if (!response.ok) {
        return { success: false, error: data.error || `HTTP ${response.status}` };
    }

    // Store JWT token for local auth (Axum returns token in body, not cookie)
    if (useLocalAuth && data.token) {
        try {
            localStorage.setItem('local_auth_token', data.token);
            console.log('[auth] Local token stored');
        } catch (e) {
            console.warn('[auth] Could not store token:', e);
        }
    }

    return data;
}

async function apiLogout() {
    const url = apiBase ? `${apiBase}${authPrefix}/logout` : `${authPrefix}/logout`;

    // Build headers - include Authorization for local auth
    const headers = { 'Content-Type': 'application/json' };
    if (useLocalAuth) {
        const token = localStorage.getItem('local_auth_token');
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        // Clear local token
        localStorage.removeItem('local_auth_token');
    }

    const response = await fetch(url, {
        method: 'POST',
        headers,
        body: '{}',
        credentials: 'include'
    });
    return response.json().catch(() => ({ success: true }));
}

async function apiGetMe() {
    try {
        const url = apiBase ? `${apiBase}${authPrefix}/me` : `${authPrefix}/me`;
        console.log('[auth] apiGetMe calling:', url);

        // Build headers - include Authorization for local auth
        const headers = {};
        if (useLocalAuth) {
            const token = localStorage.getItem('local_auth_token');
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
        }

        const response = await fetch(url, {
            method: 'GET',
            headers,
            credentials: 'include'
        });

        console.log('[auth] apiGetMe response:', response.status, response.ok);

        // 401 is expected when not logged in - don't treat as error
        if (response.status === 401) {
            return { success: false, notAuthenticated: true };
        }

        if (!response.ok) {
            return { success: false, error: `HTTP ${response.status}` };
        }

        return await response.json();
    } catch (e) {
        console.error('[auth] apiGetMe error:', e);
        return { success: false, error: e.message };
    }
}

async function apiUpdateProfile(userData) {
    return apiRequest(`${authPrefix}/update`, {
        method: 'PUT',
        body: JSON.stringify(userData)
    });
}

async function apiRequestOtp(phone) {
    return apiRequest(`${authPrefix}/request-otp`, {
        method: 'POST',
        body: JSON.stringify({ phone })
    });
}

async function apiResetPassword(phone, code, newPassword) {
    return apiRequest(`${authPrefix}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ phone, code, newPassword })
    });
}

// =============================================================================
// UI HELPERS
// =============================================================================

function ensureRootContainer() {
    if (document.getElementById(rootId)) return;
    $('div', {
        id: rootId,
        css: {
            backgroundColor: '#181818',
            color: '#f4f4f4',
            padding: '20px',
            margin: '12px',
            borderRadius: '10px',
            width: '360px',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
        }
    });
}

function clearRoot() {
    const root = document.getElementById(rootId);
    if (!root) return;
    while (root.firstChild) {
        root.removeChild(root.firstChild);
    }
}

function showError(message) {
    const errorId = 'auth_error_msg';
    let errorDiv = document.getElementById(errorId);

    if (!errorDiv) {
        $('div', {
            id: errorId,
            parent: `#${rootId}`,
            css: {
                backgroundColor: '#ff5252',
                color: 'white',
                padding: '10px',
                borderRadius: '4px',
                marginBottom: '12px',
                fontSize: '13px',
                display: message ? 'block' : 'none'
            },
            text: message || ''
        });
    } else {
        errorDiv.textContent = message || '';
        errorDiv.style.display = message ? 'block' : 'none';
    }
}

function showSuccess(message) {
    const successId = 'auth_success_msg';
    let successDiv = document.getElementById(successId);

    if (!successDiv) {
        $('div', {
            id: successId,
            parent: `#${rootId}`,
            css: {
                backgroundColor: '#4caf50',
                color: 'white',
                padding: '10px',
                borderRadius: '4px',
                marginBottom: '12px',
                fontSize: '13px',
                display: message ? 'block' : 'none'
            },
            text: message || ''
        });
    } else {
        successDiv.textContent = message || '';
        successDiv.style.display = message ? 'block' : 'none';
    }
}

function buildInput({ id, label, type = 'text', value = '', placeholder = '', onInput, disabled = false }) {
    const rowId = `${id}_row`;
    const isPassword = type === 'password';

    $('div', {
        id: rowId,
        parent: `#${rootId}`,
        css: { marginBottom: '14px' }
    });

    $('div', {
        parent: `#${rowId}`,
        text: label,
        css: {
            fontSize: '13px',
            marginBottom: '6px',
            color: '#aaa',
            fontWeight: '500'
        }
    });

    // Container for input + toggle button
    const inputContainerId = `${id}_container`;
    $('div', {
        id: inputContainerId,
        parent: `#${rowId}`,
        css: {
            position: 'relative',
            display: 'flex',
            alignItems: 'center'
        }
    });

    $('input', {
        id: id,
        parent: `#${inputContainerId}`,
        value: value,
        placeholder: placeholder,
        css: {
            width: '100%',
            padding: isPassword ? '10px 40px 10px 12px' : '10px 12px',
            borderRadius: '6px',
            border: '1px solid #333',
            backgroundColor: disabled ? '#1a1a1a' : '#222',
            color: disabled ? '#666' : '#fff',
            fontSize: '14px',
            boxSizing: 'border-box',
            outline: 'none'
        },
        onInput: onInput
    });

    // Force the input type after creation (Squirrel may not handle 'type' attribute properly)
    setTimeout(() => {
        const input = document.getElementById(id);
        if (input) {
            input.type = type;
        }
    }, 0);

    // Add password visibility toggle
    if (isPassword && !disabled) {
        const toggleId = `${id}_toggle`;
        $('div', {
            id: toggleId,
            parent: `#${inputContainerId}`,
            text: '👁',
            css: {
                position: 'absolute',
                right: '10px',
                cursor: 'pointer',
                fontSize: '16px',
                opacity: '0.6',
                userSelect: 'none'
            },
            onClick: () => {
                const input = document.getElementById(id);
                const toggle = document.getElementById(toggleId);
                if (input && toggle) {
                    if (input.type === 'password') {
                        input.type = 'text';
                        toggle.textContent = '🙈';
                        toggle.style.opacity = '1';
                    } else {
                        input.type = 'password';
                        toggle.textContent = '👁';
                        toggle.style.opacity = '0.6';
                    }
                }
            }
        });
    }

    if (disabled) {
        setTimeout(() => {
            const input = document.getElementById(id);
            if (input) input.disabled = true;
        }, 0);
    }
}

function buildButton({ text, onClick, variant = 'primary', fullWidth = true }) {
    const colors = {
        primary: { bg: '#1976d2', hover: '#1565c0' },
        success: { bg: '#2e7d32', hover: '#256427' },
        danger: { bg: '#c62828', hover: '#a32323' },
        warning: { bg: '#ff8800', hover: '#e67a00' },
        secondary: { bg: '#424242', hover: '#333333' }
    };

    const color = colors[variant] || colors.primary;

    $('div', {
        parent: `#${rootId}`,
        text: text,
        css: {
            backgroundColor: color.bg,
            color: 'white',
            padding: '12px 16px',
            borderRadius: '6px',
            textAlign: 'center',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '14px',
            marginBottom: '10px',
            width: fullWidth ? '100%' : 'auto',
            boxSizing: 'border-box',
            transition: 'background-color 0.2s'
        },
        onClick: onClick
    });
}

function buildLink({ text, onClick }) {
    $('div', {
        parent: `#${rootId}`,
        text: text,
        css: {
            color: '#4db6ff',
            cursor: 'pointer',
            fontSize: '13px',
            marginTop: '8px',
            textAlign: 'center'
        },
        onClick: onClick
    });
}

function buildTitle(text) {
    $('div', {
        parent: `#${rootId}`,
        text: text,
        css: {
            fontSize: '20px',
            fontWeight: 'bold',
            marginBottom: '20px',
            textAlign: 'center',
            color: '#fff'
        }
    });
}

function buildDivider() {
    $('div', {
        parent: `#${rootId}`,
        css: {
            borderTop: '1px solid #333',
            margin: '16px 0'
        }
    });
}

// =============================================================================
// RENDER FUNCTIONS
// =============================================================================

function renderLoginForm() {
    clearRoot();
    buildTitle('Sign In');

    buildInput({
        id: 'login_phone',
        label: 'Phone Number',
        type: 'tel',
        value: accountStore.formData.phone,
        placeholder: '+33 6 12 34 56 78',
        onInput: (e) => { accountStore.formData.phone = e.target.value; }
    });

    buildInput({
        id: 'login_password',
        label: 'Password',
        type: 'password',
        placeholder: 'Enter your password',
        onInput: (e) => { accountStore.formData.password = e.target.value; }
    });

    buildButton({
        text: 'Sign In',
        variant: 'primary',
        onClick: handleLogin
    });

    buildDivider();

    buildLink({
        text: 'Forgot password?',
        onClick: () => renderAccountPanel(AccountState.RECOVERY)
    });

    buildLink({
        text: "Don't have an account? Sign up",
        onClick: () => renderAccountPanel(AccountState.SIGNUP)
    });

    // Server configuration link
    buildDivider();
    buildLink({
        text: `Server: ${apiBase || 'Local'}`,
        onClick: renderServerConfig
    });
}

function renderSignupForm() {
    clearRoot();
    buildTitle('Create Account');

    buildInput({
        id: 'signup_username',
        label: 'Username',
        value: accountStore.formData.username,
        placeholder: 'Your display name',
        onInput: (e) => { accountStore.formData.username = e.target.value; }
    });

    buildInput({
        id: 'signup_phone',
        label: 'Phone Number',
        type: 'tel',
        value: accountStore.formData.phone,
        placeholder: '+33 6 12 34 56 78',
        onInput: (e) => { accountStore.formData.phone = e.target.value; }
    });

    buildInput({
        id: 'signup_password',
        label: 'Password (min. 8 characters)',
        type: 'password',
        placeholder: 'Create a strong password',
        onInput: (e) => { accountStore.formData.password = e.target.value; }
    });

    buildInput({
        id: 'signup_password_confirm',
        label: 'Confirm Password',
        type: 'password',
        placeholder: 'Repeat your password',
        onInput: (e) => { accountStore.formData.passwordConfirm = e.target.value; }
    });

    buildButton({
        text: 'Create Account',
        variant: 'success',
        onClick: handleSignup
    });

    buildDivider();

    buildLink({
        text: 'Already have an account? Sign in',
        onClick: () => renderAccountPanel(AccountState.LOGIN)
    });
}

function renderProfileEditor() {
    clearRoot();
    buildTitle('My Account');

    const user = accountStore.currentUser || {};

    // Display user info prominently
    $('div', {
        parent: `#${rootId}`,
        css: {
            backgroundColor: '#252525',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '16px',
            textAlign: 'center'
        }
    });

    $('div', {
        parent: `#${rootId} > div:last-child`,
        text: '👤',
        css: {
            fontSize: '40px',
            marginBottom: '8px'
        }
    });

    $('div', {
        parent: `#${rootId} > div:first-of-type`,
        text: user.username || 'Unknown User',
        css: {
            fontSize: '18px',
            fontWeight: 'bold',
            color: '#fff',
            marginBottom: '4px'
        }
    });

    $('div', {
        parent: `#${rootId} > div:first-of-type`,
        text: user.phone || 'No phone',
        css: {
            fontSize: '14px',
            color: '#888'
        }
    });

    buildDivider();

    // Editable username
    buildInput({
        id: 'profile_username',
        label: 'Username',
        value: user.username || '',
        onInput: (e) => {
            accountStore.currentUser = { ...accountStore.currentUser, username: e.target.value };
        }
    });

    buildButton({
        text: 'Save Username',
        variant: 'success',
        onClick: handleUpdateProfile
    });

    buildDivider();

    // Change password section
    $('div', {
        parent: `#${rootId}`,
        text: 'Change Password',
        css: {
            fontSize: '14px',
            fontWeight: '600',
            color: '#aaa',
            marginBottom: '12px'
        }
    });

    buildInput({
        id: 'profile_current_password',
        label: 'Current Password',
        type: 'password',
        placeholder: 'Enter current password',
        onInput: (e) => { accountStore.formData.currentPassword = e.target.value; }
    });

    buildInput({
        id: 'profile_new_password',
        label: 'New Password (min. 8 characters)',
        type: 'password',
        placeholder: 'Enter new password',
        onInput: (e) => { accountStore.formData.newPassword = e.target.value; }
    });

    buildInput({
        id: 'profile_confirm_password',
        label: 'Confirm New Password',
        type: 'password',
        placeholder: 'Repeat new password',
        onInput: (e) => { accountStore.formData.passwordConfirm = e.target.value; }
    });

    buildButton({
        text: 'Change Password',
        variant: 'warning',
        onClick: handleChangePassword
    });

    buildDivider();

    // Change phone section
    $('div', {
        parent: `#${rootId}`,
        text: 'Change Phone Number',
        css: {
            fontSize: '14px',
            fontWeight: '600',
            color: '#aaa',
            marginBottom: '12px'
        }
    });

    $('div', {
        parent: `#${rootId}`,
        text: 'To change your phone number, you will receive a verification code.',
        css: {
            fontSize: '12px',
            color: '#666',
            marginBottom: '12px'
        }
    });

    buildInput({
        id: 'profile_new_phone',
        label: 'New Phone Number',
        type: 'tel',
        placeholder: '+33 6 XX XX XX XX',
        onInput: (e) => { accountStore.formData.newPhone = e.target.value; }
    });

    buildButton({
        text: 'Request Phone Change',
        variant: 'secondary',
        onClick: handleRequestPhoneChange
    });

    buildDivider();

    // Danger Zone - Delete Account
    $('div', {
        parent: `#${rootId}`,
        text: '⚠️ Danger Zone',
        css: {
            fontSize: '14px',
            fontWeight: '600',
            color: '#ff5252',
            marginBottom: '12px'
        }
    });

    buildButton({
        text: 'Delete My Account',
        variant: 'danger',
        onClick: renderDeleteConfirmation
    });

    buildDivider();

    // =========================================================================
    // Cloud Sync Section
    // =========================================================================

    $('div', {
        parent: `#${rootId}`,
        text: '☁️ Cloud Synchronization',
        css: {
            fontSize: '14px',
            fontWeight: '600',
            color: '#2196f3',
            marginBottom: '12px'
        }
    });

    // Sync status display
    const syncStatus = user.cloudId ?
        { icon: '✅', text: 'Synced to cloud', color: '#4caf50' } :
        { icon: '📱', text: 'Local account only', color: '#ff9800' };

    $('div', {
        parent: `#${rootId}`,
        css: {
            backgroundColor: '#1a2535',
            padding: '12px',
            borderRadius: '6px',
            marginBottom: '12px'
        }
    });

    $('div', {
        parent: `#${rootId} > div:last-child`,
        text: `${syncStatus.icon} ${syncStatus.text}`,
        css: {
            fontSize: '13px',
            color: syncStatus.color,
            marginBottom: user.cloudId ? '4px' : '0'
        }
    });

    if (user.cloudId) {
        $('div', {
            parent: `#${rootId} > div:nth-last-child(1)`,
            text: `Cloud ID: ${user.cloudId}`,
            css: {
                fontSize: '11px',
                color: '#666',
                fontFamily: 'monospace'
            }
        });
    }

    if (!user.cloudId) {
        $('div', {
            parent: `#${rootId}`,
            text: 'Sync your account to the cloud to access it from any device and share aBoxes online.',
            css: {
                fontSize: '12px',
                color: '#888',
                marginBottom: '12px'
            }
        });

        buildButton({
            text: '☁️ Sync to Cloud',
            variant: 'primary',
            onClick: renderCloudSyncPanel
        });
    } else {
        $('div', {
            parent: `#${rootId}`,
            text: 'Your account is synchronized with the cloud.',
            css: {
                fontSize: '12px',
                color: '#666',
                marginBottom: '12px'
            }
        });
    }

    buildDivider();

    // Server info
    $('div', {
        parent: `#${rootId}`,
        text: `Connected to: ${apiBase || 'Local server'}`,
        css: {
            fontSize: '11px',
            color: '#666',
            marginBottom: '12px',
            textAlign: 'center'
        }
    });

    buildButton({
        text: 'Log Out',
        variant: 'danger',
        onClick: handleLogout
    });
}

function renderRecoveryForm() {
    clearRoot();
    buildTitle('Reset Password');

    $('div', {
        parent: `#${rootId}`,
        text: 'Enter your phone number to receive a verification code via SMS.',
        css: {
            fontSize: '13px',
            color: '#aaa',
            marginBottom: '16px',
            textAlign: 'center'
        }
    });

    buildInput({
        id: 'recovery_phone',
        label: 'Phone Number',
        type: 'tel',
        value: accountStore.formData.phone,
        placeholder: '+33 6 12 34 56 78',
        onInput: (e) => { accountStore.formData.phone = e.target.value; }
    });

    buildButton({
        text: 'Send Verification Code',
        variant: 'warning',
        onClick: handleRequestOtp
    });

    buildDivider();

    buildLink({
        text: '← Back to Sign In',
        onClick: () => renderAccountPanel(AccountState.LOGIN)
    });
}

function renderOtpVerification() {
    clearRoot();
    buildTitle('Verify Code');

    $('div', {
        parent: `#${rootId}`,
        text: `Enter the 6-digit code sent to ${accountStore.formData.phone}`,
        css: {
            fontSize: '13px',
            color: '#aaa',
            marginBottom: '16px',
            textAlign: 'center'
        }
    });

    buildInput({
        id: 'otp_code',
        label: 'Verification Code',
        type: 'text',
        placeholder: '000000',
        onInput: (e) => { accountStore.formData.otpCode = e.target.value; }
    });

    buildInput({
        id: 'otp_new_password',
        label: 'New Password (min. 8 characters)',
        type: 'password',
        placeholder: 'Enter your new password',
        onInput: (e) => { accountStore.formData.newPassword = e.target.value; }
    });

    buildButton({
        text: 'Reset Password',
        variant: 'primary',
        onClick: handleResetPassword
    });

    buildDivider();

    buildLink({
        text: 'Resend code',
        onClick: handleRequestOtp
    });

    buildLink({
        text: '← Back to Sign In',
        onClick: () => renderAccountPanel(AccountState.LOGIN)
    });
}

function renderServerConfig() {
    clearRoot();
    buildTitle('🔐 Server Configuration');

    // Current server status display
    const statusIcon = serverVerificationStatus.official ? '✅' :
        serverVerificationStatus.verified ? '⚠️' :
            serverVerificationStatus.error ? '❌' : '❓';

    const statusText = serverVerificationStatus.official ? 'Official Server' :
        serverVerificationStatus.verified ? 'Verified (Unofficial)' :
            serverVerificationStatus.error ? 'Not Verified' : 'Unknown';

    $('div', {
        parent: `#${rootId}`,
        css: {
            backgroundColor: '#252525',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '16px'
        }
    });

    $('div', {
        parent: `#${rootId} > div:last-child`,
        text: `${statusIcon} ${statusText}`,
        css: {
            fontSize: '14px',
            fontWeight: 'bold',
            color: serverVerificationStatus.official ? '#4caf50' :
                serverVerificationStatus.verified ? '#ff9800' : '#999',
            marginBottom: '8px'
        }
    });

    if (serverVerificationStatus.serverName) {
        $('div', {
            parent: `#${rootId} > div:first-of-type`,
            text: `Server: ${serverVerificationStatus.serverName}`,
            css: { fontSize: '12px', color: '#888' }
        });
    }

    if (serverVerificationStatus.error) {
        $('div', {
            parent: `#${rootId} > div:first-of-type`,
            text: `⚠️ ${serverVerificationStatus.error}`,
            css: { fontSize: '12px', color: '#ff5252', marginTop: '4px' }
        });
    }

    buildDivider();

    // Server URL input
    $('div', {
        parent: `#${rootId}`,
        text: 'Enter the server URL or leave empty for local server.',
        css: {
            fontSize: '13px',
            color: '#aaa',
            marginBottom: '12px'
        }
    });

    buildInput({
        id: 'server_url',
        label: 'API Server URL',
        type: 'url',
        value: apiBase,
        placeholder: 'https://api.example.com or leave empty'
    });

    // Verify & Connect button
    buildButton({
        text: '🔐 Verify & Connect',
        variant: 'primary',
        onClick: handleVerifyAndConnect
    });

    // Test Connection only (without full verification)
    buildButton({
        text: '🔗 Test Connection Only',
        variant: 'secondary',
        onClick: handleTestConnection
    });

    buildDivider();

    // Quick presets
    $('div', {
        parent: `#${rootId}`,
        text: 'Quick Presets:',
        css: {
            fontSize: '12px',
            color: '#888',
            marginBottom: '8px'
        }
    });

    // Local server preset
    buildLink({
        text: '🏠 Use Local Server (localhost:3001)',
        onClick: () => {
            document.getElementById('server_url').value = 'http://127.0.0.1:3001';
        }
    });

    // Official server preset (example)
    buildLink({
        text: '☁️ Use Official Server (if available)',
        onClick: () => {
            // In production, this would be the real official server URL
            document.getElementById('server_url').value = 'https://api.atome.cloud';
        }
    });

    buildDivider();

    // Security info
    $('div', {
        parent: `#${rootId}`,
        css: {
            backgroundColor: '#1a1a2e',
            padding: '12px',
            borderRadius: '6px',
            marginBottom: '12px'
        }
    });

    $('div', {
        parent: `#${rootId} > div:last-child`,
        text: '🛡️ Security Information',
        css: {
            fontSize: '13px',
            fontWeight: 'bold',
            color: '#4fc3f7',
            marginBottom: '8px'
        }
    });

    $('div', {
        parent: `#${rootId} > div:nth-last-child(1)`,
        text: 'Official servers are cryptographically verified using RSA signatures. ' +
            'Only connect to servers you trust. Unofficial servers will show a warning.',
        css: {
            fontSize: '11px',
            color: '#999',
            lineHeight: '1.5'
        }
    });

    buildDivider();

    buildLink({
        text: '← Back',
        onClick: () => renderAccountPanel(accountStore.isLoggedIn ? AccountState.PROFILE : AccountState.LOGIN)
    });
}

/**
 * Handle server verification and connection
 */
async function handleVerifyAndConnect() {
    const newUrl = document.getElementById('server_url')?.value?.trim() || '';

    showError(null);

    // Update API base
    setApiBase(newUrl);

    // Show loading state
    $('div', {
        id: 'verify_status',
        parent: `#${rootId}`,
        text: '🔄 Verifying server...',
        css: {
            color: '#4fc3f7',
            textAlign: 'center',
            padding: '10px',
            marginBottom: '10px'
        }
    });

    try {
        // Step 1: Verify server identity
        const verifyResult = await verifyCurrentServer();

        const statusDiv = document.getElementById('verify_status');

        if (verifyResult.verified && verifyResult.official) {
            // Official server - proceed with confidence
            if (statusDiv) statusDiv.innerHTML = '✅ Official server verified!';
            showSuccess(`Connected to ${verifyResult.serverName || 'Official Server'}`);

            setTimeout(() => {
                renderAccountPanel(AccountState.LOGIN);
            }, 1500);

        } else if (verifyResult.verified) {
            // Verified but not official - warn user
            if (statusDiv) statusDiv.innerHTML = '⚠️ Server verified but not official';

            const proceed = confirm(
                `This server (${verifyResult.serverName || 'Unknown'}) is verified but not in the official trusted list.\n\n` +
                `Warnings:\n${(verifyResult.warnings || []).join('\n')}\n\n` +
                `Do you want to proceed anyway?`
            );

            if (proceed) {
                showSuccess('Connected to unofficial server');
                setTimeout(() => renderAccountPanel(AccountState.LOGIN), 1000);
            } else {
                showError('Connection cancelled');
                if (statusDiv) statusDiv.remove();
            }

        } else if (verifyResult.success) {
            // Connection OK but verification failed/not supported
            if (statusDiv) statusDiv.innerHTML = '⚠️ Server does not support verification';

            const proceed = confirm(
                `This server does not support cryptographic verification.\n\n` +
                `Warnings:\n${(verifyResult.warnings || []).join('\n')}\n\n` +
                `⚠️ Your credentials could be at risk!\n\n` +
                `Only proceed if you trust this server. Continue?`
            );

            if (proceed) {
                showSuccess('Connected (unverified)');
                setTimeout(() => renderAccountPanel(AccountState.LOGIN), 1000);
            } else {
                showError('Connection cancelled');
                if (statusDiv) statusDiv.remove();
            }

        } else {
            // Verification failed
            if (statusDiv) statusDiv.innerHTML = '❌ Verification failed';
            showError(verifyResult.error || 'Server verification failed');
        }

    } catch (e) {
        const statusDiv = document.getElementById('verify_status');
        if (statusDiv) statusDiv.remove();
        showError(`Verification error: ${e.message}`);
    }
}

/**
 * Handle simple connection test (without full verification)
 */
async function handleTestConnection() {
    const newUrl = document.getElementById('server_url')?.value?.trim() || '';

    showError(null);
    setApiBase(newUrl);

    try {
        const response = await fetch(`${newUrl || ''}/api/server-info`, {
            method: 'GET',
            timeout: 5000
        });

        if (response.ok) {
            const data = await response.json();
            showSuccess(`Connected! Server: ${data.type || 'Unknown'}, Version: ${data.version || 'Unknown'}`);

            // Update local status (but not verified)
            serverVerificationStatus = {
                verified: false,
                official: false,
                serverName: data.type,
                lastChecked: Date.now()
            };

        } else {
            throw new Error(`Server returned ${response.status}`);
        }
    } catch (e) {
        showError(`Connection failed: ${e.message}`);
    }
}

// =============================================================================
// EVENT HANDLERS
// =============================================================================

async function handleLogin() {
    const phone = accountStore.formData.phone?.trim();
    const password = accountStore.formData.password;

    if (!phone || !password) {
        showError('Phone and password are required');
        return;
    }

    try {
        showError(null);
        puts('[auth] Logging in...');

        const result = await apiLogin(phone, password);
        console.log('[auth] Login result:', result);

        if (result.success) {
            accountStore.isLoggedIn = true;
            accountStore.currentUser = result.user;
            console.log('[auth] accountStore updated:', accountStore.isLoggedIn, accountStore.currentUser);

            // AUTO-SYNC on login (local auth only)
            if (useLocalAuth && SyncQueue && result.user?.id) {
                // Store/update credentials for future syncs
                SyncQueue.storeCredentialsForSync(result.user.id, password, true);

                // Perform auto-sync in background
                performAutoCloudSync(result.user, result.user.username, phone, password, 'SYNC_DATA')
                    .catch(e => console.warn('[auth] Background sync error:', e));
            }

            accountStore.formData.password = ''; // Clear password from memory
            puts(`[auth] Login successful: ${result.user.username}`);
            renderAccountPanel(AccountState.PROFILE);
        } else {
            puts('[auth] Login failed: ' + (result.error || 'Invalid credentials'));
            showError(result.error || 'Login failed');
        }
    } catch (e) {
        // Only log unexpected errors (network issues, etc.)
        console.warn('[auth] Login network error:', e.message);
        showError('Connection error. Please try again.');
    }
}

async function handleSignup() {
    const username = accountStore.formData.username?.trim();
    const phone = accountStore.formData.phone?.trim();
    const password = accountStore.formData.password;
    const passwordConfirm = accountStore.formData.passwordConfirm;

    // Validation
    if (!username || username.length < 2) {
        showError('Username must be at least 2 characters');
        return;
    }

    if (!phone || phone.length < 6) {
        showError('Valid phone number is required');
        return;
    }

    if (!password || password.length < 8) {
        showError('Password must be at least 8 characters');
        return;
    }

    if (password !== passwordConfirm) {
        showError('Passwords do not match');
        return;
    }

    try {
        showError(null);
        puts('[auth] Creating account...');

        const result = await apiRegister(username, phone, password);

        if (result.success) {
            puts('[auth] Account created, logging in...');
            // Auto-login after registration
            const loginResult = await apiLogin(phone, password);

            if (loginResult.success) {
                accountStore.isLoggedIn = true;
                accountStore.currentUser = loginResult.user;
                accountStore.formData.password = '';
                accountStore.formData.passwordConfirm = '';

                // AUTO-SYNC: If local auth, automatically sync to cloud
                if (useLocalAuth && SyncQueue && loginResult.user?.id) {
                    await performAutoCloudSync(loginResult.user, username, phone, password, 'CREATE_ACCOUNT');
                }

                renderAccountPanel(AccountState.PROFILE);
            } else {
                // Registration succeeded but login failed, go to login page
                showSuccess('Account created! Please sign in.');
                setTimeout(() => renderAccountPanel(AccountState.LOGIN), 1500);
            }
        } else {
            puts('[auth] Registration failed: ' + (result.error || 'Unknown error'));
            showError(result.error || 'Registration failed');
        }
    } catch (e) {
        // Only log unexpected errors (network issues, etc.)
        console.warn('[auth] Registration network error:', e.message);
        showError('Connection error. Please try again.');
    }
}

async function handleLogout() {
    try {
        await apiLogout();
        puts('[auth] Logout request sent');
    } catch (e) {
        console.warn('Logout request failed:', e);
        // Continue with local cleanup even if server request fails
    }

    // Clear local state
    accountStore.isLoggedIn = false;
    accountStore.currentUser = null;

    // Clear any stored tokens
    try {
        localStorage.removeItem('local_auth_token');
        localStorage.removeItem('cloud_auth_token');
    } catch (e) { /* localStorage not available */ }

    // Clear all form data
    accountStore.formData = {
        username: '',
        phone: '',
        password: '',
        passwordConfirm: '',
        otpCode: '',
        newPassword: '',
        currentPassword: '',
        newPhone: '',
        pendingPhone: '',
        phoneOtpCode: ''
    };

    // Reset button appearance
    const btn = document.getElementById('account_entry_btn');
    if (btn) {
        btn.style.backgroundColor = '#1976d2';
        btn.title = '';
    }

    // Remove the account panel and show login
    clearRoot();
    renderAccountPanel(AccountState.LOGIN);

    puts('[auth] Logged out successfully');
}

async function handleUpdateProfile() {
    try {
        showError(null);
        const result = await apiUpdateProfile({
            username: accountStore.currentUser?.username,
            optional: accountStore.currentUser?.optional
        });

        if (result.success) {
            accountStore.currentUser = result.user;
            showSuccess('Profile updated successfully!');
            setTimeout(() => {
                showSuccess(null);
                renderAccountPanel(AccountState.PROFILE); // Re-render to update display
            }, 1500);
        } else {
            showError(result.error || 'Update failed');
        }
    } catch (e) {
        console.error('Update error:', e);
        showError(e.message || 'Update failed');
    }
}

async function handleChangePassword() {
    const currentPassword = accountStore.formData.currentPassword;
    const newPassword = accountStore.formData.newPassword;
    const confirmPassword = accountStore.formData.passwordConfirm;

    if (!currentPassword) {
        showError('Current password is required');
        return;
    }

    if (!newPassword || newPassword.length < 8) {
        showError('New password must be at least 8 characters');
        return;
    }

    if (newPassword !== confirmPassword) {
        showError('New passwords do not match');
        return;
    }

    try {
        showError(null);
        puts('[auth] Changing password...');

        const result = await apiRequest(`${authPrefix}/change-password`, {
            method: 'POST',
            body: JSON.stringify({
                currentPassword,
                newPassword
            })
        });

        if (result.success) {
            accountStore.formData.currentPassword = '';
            accountStore.formData.newPassword = '';
            accountStore.formData.passwordConfirm = '';
            showSuccess('Password changed successfully!');
            setTimeout(() => {
                showSuccess(null);
                renderAccountPanel(AccountState.PROFILE);
            }, 2000);
        } else {
            showError(result.error || 'Password change failed');
        }
    } catch (e) {
        console.error('Password change error:', e);
        showError(e.message || 'Password change failed');
    }
}

async function handleRequestPhoneChange() {
    const newPhone = accountStore.formData.newPhone?.trim();

    if (!newPhone || newPhone.length < 6) {
        showError('Valid phone number is required');
        return;
    }

    try {
        showError(null);
        puts('[auth] Requesting phone change OTP...');

        const result = await apiRequest(`${authPrefix}/request-phone-change`, {
            method: 'POST',
            body: JSON.stringify({ newPhone })
        });

        if (result.success) {
            puts('[auth] Phone change OTP sent');
            showSuccess('Verification code sent to new phone!');
            // Store the new phone for verification
            accountStore.formData.pendingPhone = newPhone;
            setTimeout(() => {
                showSuccess(null);
                renderPhoneVerification();
            }, 1500);
        } else {
            showError(result.error || 'Failed to send code');
        }
    } catch (e) {
        console.error('Phone change request error:', e);
        showError(e.message || 'Failed to request phone change');
    }
}

function renderPhoneVerification() {
    clearRoot();
    buildTitle('Verify New Phone');

    $('div', {
        parent: `#${rootId}`,
        text: `Enter the code sent to ${accountStore.formData.pendingPhone || accountStore.formData.newPhone}`,
        css: {
            fontSize: '13px',
            color: '#aaa',
            marginBottom: '16px',
            textAlign: 'center'
        }
    });

    buildInput({
        id: 'phone_verify_code',
        label: 'Verification Code',
        type: 'text',
        placeholder: '000000',
        onInput: (e) => { accountStore.formData.phoneOtpCode = e.target.value; }
    });

    buildButton({
        text: 'Verify & Update Phone',
        variant: 'primary',
        onClick: handleVerifyPhoneChange
    });

    buildDivider();

    buildLink({
        text: '← Back to Profile',
        onClick: () => renderAccountPanel(AccountState.PROFILE)
    });
}

async function handleVerifyPhoneChange() {
    const code = accountStore.formData.phoneOtpCode?.trim();
    const newPhone = accountStore.formData.pendingPhone || accountStore.formData.newPhone;

    if (!code) {
        showError('Verification code is required');
        return;
    }

    try {
        showError(null);
        puts('[auth] Verifying phone change...');

        const result = await apiRequest(`${authPrefix}/verify-phone-change`, {
            method: 'POST',
            body: JSON.stringify({ newPhone, code })
        });

        if (result.success) {
            accountStore.currentUser = result.user;
            accountStore.formData.newPhone = '';
            accountStore.formData.pendingPhone = '';
            accountStore.formData.phoneOtpCode = '';
            showSuccess('Phone number updated!');
            setTimeout(() => {
                showSuccess(null);
                renderAccountPanel(AccountState.PROFILE);
            }, 1500);
        } else {
            showError(result.error || 'Verification failed');
        }
    } catch (e) {
        console.error('Phone verification error:', e);
        showError(e.message || 'Verification failed');
    }
}

// =============================================================================
// CLOUD SYNC PANEL
// =============================================================================

// Import cloud sync module dynamically
let CloudSync = null;
(async function loadCloudSyncModule() {
    try {
        CloudSync = await import('../security/cloudSync.js');
        console.log('[auth] Cloud sync module loaded');
    } catch (e) {
        console.warn('[auth] Cloud sync module not available:', e.message);
    }
})();

function renderCloudSyncPanel() {
    clearRoot();
    buildTitle('☁️ Sync to Cloud');

    // Warning about password requirement
    $('div', {
        parent: `#${rootId}`,
        css: {
            backgroundColor: '#1a2535',
            border: '1px solid #2196f3',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '16px'
        }
    });

    $('div', {
        parent: `#${rootId} > div:last-child`,
        text: 'ℹ️ Cloud Synchronization',
        css: {
            fontSize: '14px',
            fontWeight: 'bold',
            color: '#2196f3',
            marginBottom: '8px'
        }
    });

    $('div', {
        parent: `#${rootId} > div:first-of-type`,
        text: 'Syncing your account to the cloud allows you to:',
        css: {
            fontSize: '13px',
            color: '#ccc',
            marginBottom: '8px'
        }
    });

    const syncBenefits = [
        '• Access your account from any device',
        '• Share aBoxes online with others',
        '• Backup your data securely',
        '• Collaborate in real-time'
    ];

    syncBenefits.forEach(benefit => {
        $('div', {
            parent: `#${rootId} > div:first-of-type`,
            text: benefit,
            css: {
                fontSize: '12px',
                color: '#888',
                marginLeft: '8px',
                marginBottom: '2px'
            }
        });
    });

    buildDivider();

    // Server URL configuration
    $('div', {
        parent: `#${rootId}`,
        text: 'Cloud Server',
        css: {
            fontSize: '13px',
            fontWeight: '600',
            color: '#aaa',
            marginBottom: '8px'
        }
    });

    buildInput({
        id: 'cloud_server_url',
        label: 'Cloud Server URL',
        type: 'url',
        value: 'http://localhost:3001',
        placeholder: 'https://api.atome.cloud'
    });

    // Server verification status
    const verifyStatusContainer = $('div', {
        id: 'cloud_verify_status',
        parent: `#${rootId}`,
        css: {
            padding: '8px',
            borderRadius: '4px',
            marginBottom: '12px',
            display: 'none'
        }
    });

    buildButton({
        text: '🔐 Verify Server',
        variant: 'secondary',
        onClick: handleVerifyCloudServer
    });

    buildDivider();

    // Auto-sync option (only in local mode)
    if (useLocalAuth && SyncQueue) {
        const config = SyncQueue.getSyncConfig();
        const user = accountStore.currentUser;
        const hasStoredCreds = user && SyncQueue.isAutoSyncEnabled(user.id);

        $('div', {
            parent: `#${rootId}`,
            text: '🔄 Automatic Synchronization',
            css: {
                fontSize: '13px',
                fontWeight: '600',
                color: '#4caf50',
                marginBottom: '8px'
            }
        });

        $('div', {
            parent: `#${rootId}`,
            text: 'Enable auto-sync to automatically synchronize your account when the cloud server is available. Your password will be stored securely on this device.',
            css: {
                fontSize: '12px',
                color: '#888',
                marginBottom: '12px'
            }
        });

        // Auto-sync toggle
        const autoSyncContainer = $('div', {
            parent: `#${rootId}`,
            css: {
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '12px'
            }
        });

        $('input', {
            id: 'auto_sync_checkbox',
            parent: autoSyncContainer,
            type: 'checkbox',
            checked: config.autoSyncEnabled && hasStoredCreds,
            css: {
                width: '18px',
                height: '18px',
                cursor: 'pointer'
            },
            onChange: (e) => {
                const enabled = e.target.checked;
                const currentConfig = SyncQueue.getSyncConfig();
                SyncQueue.saveSyncConfig({ ...currentConfig, autoSyncEnabled: enabled });
                console.log(`[auth] Auto-sync ${enabled ? 'enabled' : 'disabled'}`);
            }
        });

        $('label', {
            parent: autoSyncContainer,
            for: 'auto_sync_checkbox',
            text: 'Enable automatic sync',
            css: {
                fontSize: '13px',
                color: '#ccc',
                cursor: 'pointer'
            }
        });

        // Pending actions count
        if (user) {
            const pendingActions = SyncQueue.getPendingActionsForUser(user.id);
            if (pendingActions.length > 0) {
                $('div', {
                    parent: `#${rootId}`,
                    text: `📋 ${pendingActions.length} action(s) pending sync`,
                    css: {
                        fontSize: '12px',
                        color: '#ff9800',
                        backgroundColor: '#3d2e1a',
                        padding: '8px',
                        borderRadius: '4px',
                        marginBottom: '12px'
                    }
                });
            }
        }

        buildDivider();
    }

    // Check if credentials are already stored for this user
    const user = accountStore.currentUser;
    const storedCreds = (useLocalAuth && SyncQueue && user) ? SyncQueue.getCredentialsForUser(user.id) : null;

    if (storedCreds && storedCreds.password) {
        // Credentials already stored - offer quick sync
        $('div', {
            parent: `#${rootId}`,
            text: '🔓 Credentials Saved',
            css: {
                fontSize: '13px',
                fontWeight: '600',
                color: '#4caf50',
                marginBottom: '8px'
            }
        });

        $('div', {
            parent: `#${rootId}`,
            text: 'Your credentials are securely stored. You can sync without re-entering your password.',
            css: {
                fontSize: '12px',
                color: '#888',
                marginBottom: '12px'
            }
        });

        // Hidden password field with stored value (for handleCloudSync)
        const hiddenInput = document.createElement('input');
        hiddenInput.type = 'hidden';
        hiddenInput.id = 'sync_password';
        hiddenInput.value = storedCreds.password;
        document.getElementById(rootId).appendChild(hiddenInput);

        buildDivider();

        // Quick sync button
        buildButton({
            text: '☁️ Sync Now',
            variant: 'primary',
            onClick: handleCloudSync
        });

        // Option to re-enter password
        $('div', {
            parent: `#${rootId}`,
            css: { marginTop: '12px' }
        });

        buildButton({
            text: '🔑 Use Different Password',
            variant: 'secondary',
            onClick: () => {
                // Remove stored credentials and re-render
                SyncQueue.removeCredentials(user.id);
                renderCloudSyncPanel();
            }
        });
    } else {
        // No stored credentials - require password input
        $('div', {
            parent: `#${rootId}`,
            text: '🔑 Confirmation Required',
            css: {
                fontSize: '13px',
                fontWeight: '600',
                color: '#ff9800',
                marginBottom: '8px'
            }
        });

        $('div', {
            parent: `#${rootId}`,
            text: 'Enter your password to confirm the sync. The same credentials will be used for your cloud account.',
            css: {
                fontSize: '12px',
                color: '#888',
                marginBottom: '12px'
            }
        });

        buildInput({
            id: 'sync_password',
            label: 'Your Password',
            type: 'password',
            placeholder: 'Enter your password to confirm'
        });

        buildDivider();

        // Sync button
        buildButton({
            text: '☁️ Start Sync to Cloud',
            variant: 'primary',
            onClick: handleCloudSync
        });
    }

    // Cancel
    buildLink({
        text: '← Back to Profile',
        onClick: () => renderAccountPanel(AccountState.PROFILE)
    });
}

async function handleVerifyCloudServer() {
    const urlInput = document.getElementById('cloud_server_url');
    const statusDiv = document.getElementById('cloud_verify_status');

    if (!urlInput || !statusDiv) return;

    const serverUrl = urlInput.value.trim();

    if (!serverUrl) {
        statusDiv.style.display = 'block';
        statusDiv.style.backgroundColor = '#3d1a1a';
        statusDiv.textContent = '❌ Please enter a server URL';
        return;
    }

    statusDiv.style.display = 'block';
    statusDiv.style.backgroundColor = '#1a1a2e';
    statusDiv.textContent = '🔄 Verifying server...';

    try {
        if (!ServerVerification) {
            statusDiv.style.backgroundColor = '#3d3d1a';
            statusDiv.textContent = '⚠️ Security modules not loaded. Proceed with caution.';
            return;
        }

        const result = await ServerVerification.verifyServer(serverUrl);

        if (result.verified) {
            if (result.isOfficial) {
                statusDiv.style.backgroundColor = '#1a3d1a';
                statusDiv.textContent = `✅ Official server verified: ${result.serverName}`;
            } else {
                statusDiv.style.backgroundColor = '#3d3d1a';
                statusDiv.textContent = `⚠️ Server verified but UNOFFICIAL: ${result.serverName}`;
            }
        } else {
            statusDiv.style.backgroundColor = '#3d1a1a';
            statusDiv.textContent = `❌ Server verification failed: ${result.error || 'Unknown error'}`;
        }
    } catch (err) {
        statusDiv.style.backgroundColor = '#3d1a1a';
        statusDiv.textContent = `❌ Verification error: ${err.message}`;
    }
}

/**
 * Perform automatic cloud sync - called on signup/login
 * If cloud server is unavailable, queue the action for later
 * 
 * @param {object} user - User object with id, username
 * @param {string} username - Username
 * @param {string} phone - Phone number
 * @param {string} password - Password (for cloud account creation)
 * @param {string} actionType - 'CREATE_ACCOUNT' | 'SYNC_DATA'
 */
async function performAutoCloudSync(user, username, phone, password, actionType) {
    if (!SyncQueue || !CloudSync) {
        console.warn('[auto-sync] Sync modules not loaded');
        return;
    }

    // Get or set default cloud server URL
    let config = SyncQueue.getSyncConfig();
    const cloudServerUrl = config.cloudServerUrl || 'http://localhost:3001';

    // Save config with URL if not set
    if (!config.cloudServerUrl) {
        SyncQueue.saveSyncConfig({ ...config, cloudServerUrl, autoSyncEnabled: true });
        config = SyncQueue.getSyncConfig();
    }

    console.log(`[auto-sync] Starting ${actionType} sync to ${cloudServerUrl}...`);

    // Store credentials for future syncs
    SyncQueue.storeCredentialsForSync(user.id, password, true);

    // Check if cloud server is available
    const serverAvailable = await SyncQueue.isCloudServerAvailable(cloudServerUrl);

    if (serverAvailable) {
        // Server available - sync immediately
        console.log('[auto-sync] Cloud server available, syncing now...');

        try {
            const result = await CloudSync.syncToCloud({
                cloudServerUrl,
                localToken: localStorage.getItem('local_auth_token'),
                username,
                phone,
                password,
                verifyServer: true
            });

            if (result.success) {
                console.log('[auto-sync] ✅ Sync successful, cloudId:', result.cloudId);

                // Update user with cloud info
                if (accountStore.currentUser) {
                    accountStore.currentUser.cloudId = result.cloudId;
                    accountStore.currentUser.synced = true;
                }

                // Store cloud token
                if (result.cloudToken) {
                    localStorage.setItem('cloud_auth_token', result.cloudToken);
                }

                // Update config with last sync time
                SyncQueue.saveSyncConfig({
                    ...config,
                    lastSuccessfulSync: new Date().toISOString()
                });

                // Process any pending actions in queue
                const pendingResult = await SyncQueue.processAllPendingActions(cloudServerUrl);
                if (pendingResult.processed > 0) {
                    console.log(`[auto-sync] Processed ${pendingResult.succeeded}/${pendingResult.processed} pending actions`);
                }

            } else if (result.result === CloudSync.SyncResult.CREDENTIALS_MISMATCH) {
                console.warn('[auto-sync] Credentials mismatch - account exists with different password');
                // Don't queue, user needs to resolve manually
            } else {
                console.warn('[auto-sync] Sync failed:', result.error);
                // Queue for retry
                queueSyncAction(user, username, phone, password, actionType);
            }
        } catch (err) {
            console.error('[auto-sync] Sync error:', err.message);
            // Queue for retry
            queueSyncAction(user, username, phone, password, actionType);
        }
    } else {
        // Server unavailable - queue for later
        console.log('[auto-sync] Cloud server unavailable, queuing action...');
        queueSyncAction(user, username, phone, password, actionType);
    }
}

/**
 * Queue a sync action for later processing
 */
function queueSyncAction(user, username, phone, password, actionType) {
    if (!SyncQueue) return;

    const syncActionType = actionType === 'CREATE_ACCOUNT'
        ? SyncQueue.SyncAction.CREATE_ACCOUNT
        : SyncQueue.SyncAction.SYNC_DATA;

    SyncQueue.addToQueue({
        type: syncActionType,
        userId: user.id,
        username: username,
        phone: phone,
        data: { password } // Password stored encrypted in queue
    });

    console.log(`[auto-sync] Action queued: ${actionType} for user ${user.id}`);
}

async function handleCloudSync() {
    const urlInput = document.getElementById('cloud_server_url');
    const passwordInput = document.getElementById('sync_password');

    if (!urlInput || !passwordInput) return;

    const cloudServerUrl = urlInput.value.trim();
    const password = passwordInput.value;

    if (!cloudServerUrl) {
        showError('Please enter the cloud server URL');
        return;
    }

    if (!password) {
        showError('Please enter your password to confirm');
        return;
    }

    if (!CloudSync) {
        showError('Cloud sync module not loaded');
        return;
    }

    accountStore.loading = true;
    showError(null);

    // Show loading state
    $('div', {
        id: 'sync_progress',
        parent: `#${rootId}`,
        text: '🔄 Syncing to cloud...',
        css: {
            padding: '12px',
            backgroundColor: '#1a1a2e',
            borderRadius: '6px',
            textAlign: 'center',
            marginBottom: '12px'
        }
    });

    try {
        // Get local token from storage
        const localToken = localStorage.getItem('local_auth_token');
        const user = accountStore.currentUser;

        console.log('[sync] accountStore.currentUser:', user);
        console.log('[sync] accountStore.isLoggedIn:', accountStore.isLoggedIn);

        if (!user) {
            throw new Error('No user logged in');
        }

        const result = await CloudSync.syncToCloud({
            cloudServerUrl,
            localToken,
            username: user.username,
            phone: user.phone,
            password,
            verifyServer: true
        });

        // Remove progress indicator
        const progressEl = document.getElementById('sync_progress');
        if (progressEl) progressEl.remove();

        if (result.success) {
            // Update local user with cloud info
            accountStore.currentUser = {
                ...accountStore.currentUser,
                cloudId: result.cloudId,
                synced: true
            };

            // Store cloud token if available
            if (result.cloudToken) {
                localStorage.setItem('cloud_auth_token', result.cloudToken);
            }

            // Always store credentials after successful sync (for future syncs without password)
            // The user has already provided their password, so we save it securely
            if (SyncQueue && accountStore.currentUser) {
                try {
                    const autoSyncCheckbox = document.getElementById('auto_sync_checkbox');
                    const enableAutoSync = autoSyncCheckbox ? autoSyncCheckbox.checked : false;
                    await SyncQueue.storeCredentialsForSync(accountStore.currentUser.id, password, enableAutoSync);
                    console.log('[auth] Credentials stored for future syncs');

                    // Also save the cloud server URL in config
                    const currentConfig = SyncQueue.getSyncConfig();
                    SyncQueue.saveSyncConfig({
                        ...currentConfig,
                        cloudServerUrl,
                        lastSuccessfulSync: new Date().toISOString()
                    });
                } catch (credErr) {
                    console.warn('[auth] Failed to store credentials:', credErr);
                }
            }

            // Show success
            showSuccessMessage('✅ Account synced to cloud successfully!');

            // Return to profile after delay
            setTimeout(() => {
                renderAccountPanel(AccountState.PROFILE);
            }, 2000);

        } else if (result.result === CloudSync.SyncResult.CREDENTIALS_MISMATCH) {
            // Show conflict resolution
            renderSyncConflict(cloudServerUrl, password);
        } else {
            showError(`Sync failed: ${result.error || 'Unknown error'}`);
        }

    } catch (err) {
        const progressEl = document.getElementById('sync_progress');
        if (progressEl) progressEl.remove();

        showError(`Sync error: ${err.message}`);
    } finally {
        accountStore.loading = false;
    }
}

function renderSyncConflict(cloudServerUrl, localPassword) {
    clearRoot();
    buildTitle('⚠️ Sync Conflict');

    $('div', {
        parent: `#${rootId}`,
        css: {
            backgroundColor: '#3d3d1a',
            border: '1px solid #ff9800',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '16px'
        }
    });

    $('div', {
        parent: `#${rootId} > div:last-child`,
        text: '⚠️ Account Already Exists',
        css: {
            fontSize: '14px',
            fontWeight: 'bold',
            color: '#ff9800',
            marginBottom: '8px'
        }
    });

    $('div', {
        parent: `#${rootId} > div:first-of-type`,
        text: 'A cloud account with this phone number already exists but has a different password.',
        css: {
            fontSize: '13px',
            color: '#ccc',
            marginBottom: '12px'
        }
    });

    buildDivider();

    $('div', {
        parent: `#${rootId}`,
        text: 'How would you like to resolve this?',
        css: {
            fontSize: '13px',
            color: '#aaa',
            marginBottom: '12px'
        }
    });

    // Option 1: Use cloud password
    $('div', {
        parent: `#${rootId}`,
        text: '1️⃣ Use Cloud Account Password',
        css: {
            fontSize: '13px',
            fontWeight: '600',
            color: '#2196f3',
            marginBottom: '8px'
        }
    });

    $('div', {
        parent: `#${rootId}`,
        text: 'Enter your existing cloud password to link accounts:',
        css: {
            fontSize: '12px',
            color: '#888',
            marginBottom: '8px'
        }
    });

    buildInput({
        id: 'cloud_password',
        label: 'Cloud Account Password',
        type: 'password',
        placeholder: 'Enter your cloud password'
    });

    buildButton({
        text: 'Link with Cloud Password',
        variant: 'primary',
        onClick: () => handleResolveConflict(cloudServerUrl, localPassword, false)
    });

    buildDivider();

    // Option 2: Update cloud to local password
    $('div', {
        parent: `#${rootId}`,
        text: '2️⃣ Update Cloud Password to Match Local',
        css: {
            fontSize: '13px',
            fontWeight: '600',
            color: '#ff9800',
            marginBottom: '8px'
        }
    });

    $('div', {
        parent: `#${rootId}`,
        text: 'This will change your cloud account password to match your local password.',
        css: {
            fontSize: '12px',
            color: '#888',
            marginBottom: '8px'
        }
    });

    buildButton({
        text: 'Update Cloud Password',
        variant: 'warning',
        onClick: () => handleResolveConflict(cloudServerUrl, localPassword, true)
    });

    buildDivider();

    buildLink({
        text: '← Cancel and go back',
        onClick: () => renderAccountPanel(AccountState.PROFILE)
    });
}

async function handleResolveConflict(cloudServerUrl, localPassword, keepLocal) {
    if (!CloudSync) {
        showError('Cloud sync module not loaded');
        return;
    }

    const cloudPasswordInput = document.getElementById('cloud_password');
    const cloudPassword = cloudPasswordInput?.value || '';

    if (!keepLocal && !cloudPassword) {
        showError('Please enter your cloud password');
        return;
    }

    accountStore.loading = true;
    clearError();

    try {
        const user = accountStore.currentUser;

        const result = await CloudSync.resolveConflict({
            cloudServerUrl,
            phone: user.phone,
            localPassword,
            cloudPassword,
            keepLocal
        });

        if (result.success) {
            // Update local user
            accountStore.currentUser = {
                ...accountStore.currentUser,
                cloudId: result.cloudId,
                synced: true
            };

            if (result.cloudToken) {
                localStorage.setItem('cloud_auth_token', result.cloudToken);
            }

            showSuccessMessage('✅ Conflict resolved and accounts linked!');

            setTimeout(() => {
                renderAccountPanel(AccountState.PROFILE);
            }, 2000);
        } else {
            showError(`Resolution failed: ${result.message}`);
        }

    } catch (err) {
        showError(`Error: ${err.message}`);
    } finally {
        accountStore.loading = false;
    }
}

function showSuccessMessage(message) {
    // Remove any existing success message
    const existing = document.getElementById('success_message');
    if (existing) existing.remove();

    $('div', {
        id: 'success_message',
        parent: `#${rootId}`,
        text: message,
        css: {
            backgroundColor: '#1a3d1a',
            color: '#4caf50',
            padding: '12px',
            borderRadius: '6px',
            textAlign: 'center',
            marginBottom: '12px'
        }
    });
}

// =============================================================================
// DELETE ACCOUNT
// =============================================================================

function renderDeleteConfirmation() {
    clearRoot();
    buildTitle('⚠️ Delete Account');

    $('div', {
        parent: `#${rootId}`,
        css: {
            backgroundColor: '#3d1a1a',
            border: '1px solid #ff5252',
            borderRadius: '8px',
            padding: '16px',
            marginBottom: '16px'
        }
    });

    $('div', {
        parent: `#${rootId} > div:last-child`,
        text: '⚠️ WARNING',
        css: {
            fontSize: '16px',
            fontWeight: 'bold',
            color: '#ff5252',
            marginBottom: '12px',
            textAlign: 'center'
        }
    });

    $('div', {
        parent: `#${rootId} > div:first-of-type`,
        text: 'This action is PERMANENT and cannot be undone.',
        css: {
            fontSize: '14px',
            color: '#ffaaaa',
            marginBottom: '8px',
            textAlign: 'center'
        }
    });

    $('div', {
        parent: `#${rootId} > div:first-of-type`,
        text: 'All your data will be permanently deleted:',
        css: {
            fontSize: '13px',
            color: '#ccc',
            marginBottom: '8px'
        }
    });

    const deleteItems = [
        '• Your profile and personal information',
        '• Your account credentials',
        '• All associated data'
    ];

    deleteItems.forEach(item => {
        $('div', {
            parent: `#${rootId} > div:first-of-type`,
            text: item,
            css: {
                fontSize: '12px',
                color: '#aaa',
                marginLeft: '10px',
                marginBottom: '4px'
            }
        });
    });

    buildDivider();

    $('div', {
        parent: `#${rootId}`,
        text: 'To confirm deletion, enter your password:',
        css: {
            fontSize: '13px',
            color: '#aaa',
            marginBottom: '12px'
        }
    });

    buildInput({
        id: 'delete_confirm_password',
        label: 'Your Password',
        type: 'password',
        placeholder: 'Enter your password to confirm',
        onInput: (e) => { accountStore.formData.deleteConfirmPassword = e.target.value; }
    });

    $('div', {
        parent: `#${rootId}`,
        css: {
            display: 'flex',
            gap: '10px',
            marginTop: '16px'
        }
    });

    // Cancel button
    $('div', {
        parent: `#${rootId} > div:last-child`,
        text: 'Cancel',
        css: {
            flex: '1',
            backgroundColor: '#424242',
            color: 'white',
            padding: '12px 16px',
            borderRadius: '6px',
            textAlign: 'center',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '14px'
        },
        onClick: () => renderAccountPanel(AccountState.PROFILE)
    });

    // Delete button
    $('div', {
        parent: `#${rootId} > div:last-child`,
        text: 'DELETE',
        css: {
            flex: '1',
            backgroundColor: '#c62828',
            color: 'white',
            padding: '12px 16px',
            borderRadius: '6px',
            textAlign: 'center',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '14px'
        },
        onClick: handleDeleteAccount
    });
}

async function handleDeleteAccount() {
    const password = accountStore.formData.deleteConfirmPassword;
    const user = accountStore.currentUser;

    if (!password) {
        showError('Password is required to confirm deletion');
        return;
    }

    if (!user) {
        showError('No user logged in');
        return;
    }

    try {
        showError(null);
        puts('[auth] Deleting account...');

        // Local auth uses /delete, cloud uses /delete-account
        const deleteEndpoint = useLocalAuth ? `${authPrefix}/delete` : `${authPrefix}/delete-account`;
        const result = await apiRequest(deleteEndpoint, {
            method: 'DELETE',
            body: JSON.stringify({ password })
        });

        if (result.success) {
            puts('[auth] Local account deleted');

            // If using local auth, sync deletion to cloud
            if (useLocalAuth && SyncQueue) {
                const config = SyncQueue.getSyncConfig();
                const cloudServerUrl = config.cloudServerUrl || 'http://localhost:3001';

                // Try to delete from cloud immediately
                const serverAvailable = await SyncQueue.isCloudServerAvailable(cloudServerUrl);

                if (serverAvailable) {
                    puts('[auth] Cloud server available, deleting from cloud...');

                    try {
                        // Login first to get token (cookies don't work cross-origin)
                        const loginResponse = await fetch(`${cloudServerUrl}/api/auth/login`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ phone: user.phone, password })
                        });

                        const loginData = await loginResponse.json().catch(() => ({}));

                        if (loginData.success && loginData.token) {
                            // Now delete using the token from login
                            const deleteResponse = await fetch(`${cloudServerUrl}/api/auth/delete-account`, {
                                method: 'DELETE',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${loginData.token}`
                                },
                                body: JSON.stringify({ password })
                            });

                            const deleteData = await deleteResponse.json().catch(() => ({}));

                            if (deleteData.success) {
                                puts('[auth] ✅ Account deleted from cloud');
                            } else {
                                puts('[auth] Cloud deletion failed:', deleteData.error);
                            }
                        } else if (loginData.error?.includes('Invalid') || loginData.error?.includes('not found')) {
                            puts('[auth] Account not found on cloud (already deleted or never synced)');
                        } else {
                            // Queue for later
                            puts('[auth] Cloud login failed, queuing deletion...');
                            SyncQueue.addToQueue({
                                type: SyncQueue.SyncAction.DELETE_ACCOUNT,
                                userId: user.id,
                                username: user.username,
                                phone: user.phone,
                                data: { password }
                            });
                        }
                    } catch (err) {
                        puts('[auth] Cloud deletion error:', err.message);
                        // Queue for later
                        SyncQueue.addToQueue({
                            type: SyncQueue.SyncAction.DELETE_ACCOUNT,
                            userId: user.id,
                            username: user.username,
                            phone: user.phone,
                            data: { password }
                        });
                    }
                } else {
                    puts('[auth] Cloud server not available, queuing deletion...');
                    // Queue for later sync
                    SyncQueue.addToQueue({
                        type: SyncQueue.SyncAction.DELETE_ACCOUNT,
                        userId: user.id,
                        username: user.username,
                        phone: user.phone,
                        data: { password }
                    });
                }

                // Remove stored credentials for this user
                SyncQueue.removeCredentials(user.id);
            }

            // Logout from all servers
            puts('[auth] Logging out from all servers...');
            
            // Logout from local Axum server (port 3000)
            try {
                await fetch('http://localhost:3000/api/auth/local/logout', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('local_auth_token') || ''}`
                    }
                });
                puts('[auth] Logged out from local server');
            } catch (e) {
                puts('[auth] Local logout skipped:', e.message);
            }
            
            // Logout from cloud Fastify server (port 3001)
            try {
                await fetch('http://localhost:3001/api/auth/logout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include'
                });
                puts('[auth] Logged out from cloud server');
            } catch (e) {
                puts('[auth] Cloud logout skipped:', e.message);
            }

            // Clear local token
            localStorage.removeItem('local_auth_token');

            // Clear everything
            accountStore.isLoggedIn = false;
            accountStore.currentUser = null;
            accountStore.formData = {
                username: '',
                phone: '',
                password: '',
                passwordConfirm: '',
                otpCode: '',
                newPassword: '',
                currentPassword: '',
                newPhone: '',
                pendingPhone: '',
                phoneOtpCode: '',
                deleteConfirmPassword: ''
            };

            // Reset button
            const btn = document.getElementById('account_entry_btn');
            if (btn) {
                btn.style.backgroundColor = '#1976d2';
                btn.title = '';
            }

            // Show goodbye message then remove panel
            clearRoot();
            $('div', {
                parent: `#${rootId}`,
                text: '👋 Account Deleted',
                css: {
                    fontSize: '18px',
                    fontWeight: 'bold',
                    textAlign: 'center',
                    marginBottom: '12px'
                }
            });

            $('div', {
                parent: `#${rootId}`,
                text: 'Your account has been permanently deleted. Thank you for using our service.',
                css: {
                    fontSize: '13px',
                    color: '#aaa',
                    textAlign: 'center'
                }
            });

            setTimeout(() => {
                const root = document.getElementById(rootId);
                if (root) root.remove();
            }, 3000);

        } else {
            showError(result.error || 'Deletion failed');
        }
    } catch (e) {
        console.error('Delete account error:', e);
        showError(e.message || 'Deletion failed');
    }
}

async function handleRequestOtp() {
    const phone = accountStore.formData.phone?.trim();

    if (!phone) {
        showError('Phone number is required');
        return;
    }

    try {
        showError(null);
        puts('[auth] Requesting OTP...');

        const result = await apiRequestOtp(phone);

        if (result.success) {
            puts('[auth] OTP sent');
            showSuccess('Verification code sent!');
            setTimeout(() => {
                showSuccess(null);
                renderAccountPanel(AccountState.OTP_VERIFY);
            }, 1000);
        } else {
            showError(result.error || 'Failed to send code');
        }
    } catch (e) {
        console.error('OTP request error:', e);
        showError(e.message || 'Failed to send code');
    }
}

async function handleResetPassword() {
    const phone = accountStore.formData.phone?.trim();
    const code = accountStore.formData.otpCode?.trim();
    const newPassword = accountStore.formData.newPassword;

    if (!phone || !code || !newPassword) {
        showError('All fields are required');
        return;
    }

    if (newPassword.length < 8) {
        showError('Password must be at least 8 characters');
        return;
    }

    try {
        showError(null);
        puts('[auth] Resetting password...');

        const result = await apiResetPassword(phone, code, newPassword);

        if (result.success) {
            puts('[auth] Password reset successful');
            accountStore.formData.otpCode = '';
            accountStore.formData.newPassword = '';
            showSuccess('Password reset! Please sign in.');
            setTimeout(() => renderAccountPanel(AccountState.LOGIN), 1500);
        } else {
            showError(result.error || 'Reset failed');
        }
    } catch (e) {
        console.error('Reset error:', e);
        showError(e.message || 'Reset failed');
    }
}

// =============================================================================
// MAIN RENDER FUNCTION
// =============================================================================

function renderAccountPanel(state) {
    ensureRootContainer();

    switch (state) {
        case AccountState.PROFILE:
            renderProfileEditor();
            break;
        case AccountState.LOGIN:
            renderLoginForm();
            break;
        case AccountState.SIGNUP:
            renderSignupForm();
            break;
        case AccountState.RECOVERY:
            renderRecoveryForm();
            break;
        case AccountState.OTP_VERIFY:
            renderOtpVerification();
            break;
        case AccountState.SERVER_CONFIG:
            renderServerConfig();
            break;
        default:
            clearRoot();
            $('div', {
                parent: `#${rootId}`,
                text: 'Loading...',
                css: {
                    color: '#ccc',
                    fontStyle: 'italic',
                    textAlign: 'center',
                    padding: '20px'
                }
            });
    }
}

// =============================================================================
// ENTRY POINT
// =============================================================================

/**
 * Check for existing session on page load
 * This ensures the session persists after page reload
 */
async function checkSessionOnLoad() {
    puts('[auth] Checking session on load...');
    const result = await apiGetMe();

    if (result.success && result.user) {
        accountStore.isLoggedIn = true;
        accountStore.currentUser = result.user;
        puts(`[auth] Session restored: ${result.user.username}`);
        return true;
    }

    accountStore.isLoggedIn = false;
    accountStore.currentUser = null;
    return false;
}

function buildEntryButton() {
    $('button', {
        id: 'account_entry_btn',
        text: '👤',
        css: {
            padding: '0',
            backgroundColor: '#1976d2',
            color: '#fff',
            border: 'none',
            width: '50px',
            height: '50px',
            borderRadius: '50%',
            cursor: 'pointer',
            margin: '12px',
            fontSize: '20px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
        },
        onClick: async () => {
            ensureRootContainer();

            // If already logged in, show profile directly
            if (accountStore.isLoggedIn && accountStore.currentUser) {
                renderAccountPanel(AccountState.PROFILE);
                return;
            }

            // Check for existing session
            puts('[auth] Checking session...');
            const result = await apiGetMe();

            if (result.success && result.user) {
                accountStore.isLoggedIn = true;
                accountStore.currentUser = result.user;
                puts(`[auth] Session found: ${result.user.username}`);
                renderAccountPanel(AccountState.PROFILE);
            } else {
                puts('[auth] No active session');
                renderAccountPanel(AccountState.LOGIN);
            }
        }
    });
}

// Initialize
buildEntryButton();

// Check session on page load (for persistence after reload)
checkSessionOnLoad().then((hasSession) => {
    if (hasSession) {
        // Update button appearance to show logged-in state
        const btn = document.getElementById('account_entry_btn');
        if (btn) {
            btn.style.backgroundColor = '#2e7d32'; // Green for logged in
            btn.title = `Logged in as ${accountStore.currentUser?.username || 'User'}`;
        }
    }
});

// Also check session when page becomes visible again (tab switch)
if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible' && accountStore.isLoggedIn) {
            // Re-verify session when tab becomes visible
            const result = await apiGetMe();
            if (!result.success || !result.user) {
                accountStore.isLoggedIn = false;
                accountStore.currentUser = null;
                const btn = document.getElementById('account_entry_btn');
                if (btn) {
                    btn.style.backgroundColor = '#1976d2';
                    btn.title = '';
                }
            }
        }
    });
}

// Export for external use
if (typeof window !== 'undefined') {
    window.SquirrelAuth = {
        setApiBase,
        getApiBase: () => apiBase,
        renderPanel: renderAccountPanel,
        AccountState,
        isLoggedIn: () => accountStore.isLoggedIn,
        getCurrentUser: () => accountStore.currentUser,
        checkSession: checkSessionOnLoad
    };
}
