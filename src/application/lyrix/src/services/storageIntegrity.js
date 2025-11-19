import { LowTrafficMode } from '../core/lowTrafficMode.js';

const CONTROL_KEY = '__lyrix_integrity_anchor__';
const PROBE_KEY = '__lyrix_integrity_probe__';
const HEARTBEAT_MS = 20000;

class StorageIntegrityMonitor {
    constructor() {
        this.initialized = false;
        this.heartbeatTimer = null;
        this.hostInfo = null;
        this.pendingHostRequest = null;
        const debouncer = LowTrafficMode && typeof LowTrafficMode.debounce === 'function'
            ? LowTrafficMode.debounce((reason) => this.runCheck(reason), 420)
            : (reason) => this.runCheck(reason);
        this.scheduleCheck = debouncer;
    }

    init() {
        if (this.initialized) {
            return;
        }
        this.initialized = true;
        this.installBridgeHook();
        this.requestHostInfo();
        this.registerLifecycleEvents();
        this.runCheck('init');
        this.heartbeatTimer = setInterval(() => this.runCheck('heartbeat'), HEARTBEAT_MS);
        window.LyrixStorageIntegrity = this;
        window.debugLyrixStorage = () => this.runCheck('manual');
    }

    registerLifecycleEvents() {
        window.addEventListener('pageshow', () => this.scheduleCheck('pageshow'));
        window.addEventListener('pagehide', () => this.snapshot('pagehide'));
        window.addEventListener('visibilitychange', () => this.scheduleCheck(`visibility:${document.visibilityState}`));
        window.addEventListener('storage', (event) => {
            this.log(`storage event key=${event.key}`);
            this.scheduleCheck('storage-event');
        });
        window.addEventListener('beforeunload', () => this.snapshot('beforeunload'));
    }

    runCheck(reason) {
        const summary = this.collectSummary();
        summary.reason = reason;
        summary.timestamp = Date.now();
        this.log(`Integrity ${reason}: keys=${summary.count} bytes=${summary.totalBytes} probe=${summary.probeWriteOk}`);
        this.sendReport(summary);
        return summary;
    }

    snapshot(reason) {
        try {
            const payload = this.collectSummary();
            payload.reason = reason;
            this.sendReport(payload);
        } catch (error) {
            this.log(`Snapshot failed: ${error.message}`);
        }
    }

    collectSummary() {
        const summary = {
            accessible: false,
            error: null,
            count: 0,
            totalBytes: 0,
            controlMissing: false,
            controlValue: null,
            probeWriteOk: false,
            keys: []
        };
        if (typeof localStorage === 'undefined') {
            summary.error = 'localStorage undefined';
            return summary;
        }
        try {
            const previousControl = localStorage.getItem(CONTROL_KEY);
            summary.controlMissing = previousControl === null;
            summary.controlValue = previousControl;
            const newControl = JSON.stringify({ stamp: Date.now(), rand: Math.random() });
            localStorage.setItem(CONTROL_KEY, newControl);
            const probeValue = `${Date.now()}-${Math.random()}`;
            localStorage.setItem(PROBE_KEY, probeValue);
            summary.probeWriteOk = localStorage.getItem(PROBE_KEY) === probeValue;
            localStorage.removeItem(PROBE_KEY);
            const keys = [];
            for (let index = 0; index < localStorage.length; index += 1) {
                const key = localStorage.key(index);
                if (key === null) {
                    continue;
                }
                keys.push(key);
                const value = localStorage.getItem(key) || '';
                summary.totalBytes += key.length + value.length;
            }
            summary.keys = keys;
            summary.count = keys.length;
            summary.accessible = true;
        } catch (error) {
            summary.error = error.message;
        }
        return summary;
    }

    sendReport(summary) {
        if (!this.hasSwiftBridge()) {
            return;
        }
        const payload = {
            action: 'lyrixStorageIntegrityReport',
            payload: {
                summary,
                hostInfo: this.hostInfo || null
            }
        };
        this.postToSwift(payload);
    }

    installBridgeHook() {
        const bridge = window.AUv3API = window.AUv3API || {};
        if (bridge._lyrixIntegrityHookInstalled) {
            return;
        }
        const original = typeof bridge._receiveFromSwift === 'function' ? bridge._receiveFromSwift.bind(bridge) : null;
        bridge._receiveFromSwift = (msg) => {
            const handled = this.handleSwiftMessage(msg);
            if (original) {
                try {
                    original(msg);
                } catch (error) {
                    console.error('Lyrix integrity forwarding failed', error);
                }
            } else if (!handled && typeof msg === 'object' && msg && msg.action && String(msg.action).startsWith('lyrix')) {
                console.warn('Unhandled Lyrix message', msg);
            }
        };
        bridge._lyrixIntegrityHookInstalled = true;
    }

    handleSwiftMessage(raw) {
        const message = this.normalizeMessage(raw);
        if (!message || typeof message !== 'object') {
            return false;
        }
        if (message.action === 'lyrixStorageHostInfo') {
            this.hostInfo = message;
            this.log(`Host storage info: mode=${message.mode} persistent=${message.persistent}`);
            return true;
        }
        return false;
    }

    requestHostInfo() {
        if (!this.hasSwiftBridge()) {
            return;
        }
        this.pendingHostRequest = Date.now();
        this.postToSwift({ action: 'lyrixQueryStorageMode', requestId: this.pendingHostRequest });
    }

    normalizeMessage(message) {
        if (!message) {
            return null;
        }
        if (typeof message === 'string') {
            try {
                return JSON.parse(message);
            } catch (error) {
                this.log('Unable to parse Swift payload');
                return null;
            }
        }
        if (typeof message === 'object') {
            return message;
        }
        return null;
    }

    hasSwiftBridge() {
        return !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.swiftBridge);
    }

    postToSwift(payload) {
        try {
            window.webkit.messageHandlers.swiftBridge.postMessage(payload);
        } catch (error) {
            this.log(`Swift bridge unavailable: ${error.message}`);
        }
    }

    log(message) {
        try {
            console.log(`[LyrixStorageIntegrity] ${message}`);
        } catch (_) {
            // ignore
        }
    }
}

export const StorageIntegrity = new StorageIntegrityMonitor();
``