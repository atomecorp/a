const DEFAULT_STORAGE_FLUSH_MS = 750;
const DEFAULT_MESSAGE_INTERVAL_MS = 260;
const DEFAULT_STORAGE_EVENT_GAP_MS = 360;
const DEFAULT_LOG_INTERVAL_MS = 420;
const MAX_PENDING_MESSAGES = 16;

class LowTrafficModeController {
    constructor() {
        this.isActive = false;
        this.safeMode = false;
        this.patched = false;
        this.shadowStorage = new Map();
        this.pendingRemovals = new Set();
        this.storageQueue = new Map();
        this.storageFlushTimer = null;
        this.storageFlushInterval = DEFAULT_STORAGE_FLUSH_MS;
        this.minMessageInterval = DEFAULT_MESSAGE_INTERVAL_MS;
        this.storageEventGap = DEFAULT_STORAGE_EVENT_GAP_MS;
        this.lastLogTs = 0;
        this.logInterval = DEFAULT_LOG_INTERVAL_MS;
        this.storageListenerMap = new WeakMap();
        this.messageQueues = new Map();
        this.canStartWatchers = false;
        this.pendingWatchers = new Set();
    }

    initialize(options = {}) {
        if (this.patched) {
            window.LowTrafficMode = this;
            return;
        }
        this.storageFlushInterval = options.storageFlushInterval || DEFAULT_STORAGE_FLUSH_MS;
        this.minMessageInterval = options.messageInterval || DEFAULT_MESSAGE_INTERVAL_MS;
        this.storageEventGap = options.storageEventGap || DEFAULT_STORAGE_EVENT_GAP_MS;
        this.logInterval = options.logInterval || DEFAULT_LOG_INTERVAL_MS;
        const forced = typeof options.force === 'boolean' ? options.force : undefined;
        this.isActive = typeof forced === 'boolean' ? forced : this.detectLowTrafficContext();
        this.patched = true;
        window.LowTrafficMode = this;
        if (!this.isActive) {
            return;
        }
        this.patchConsole();
        this.patchStorageAccess();
        this.patchStorageEvents();
        this.patchMessageHandlers();
        this.patchIntervalTimers();
        this.patchObservers();
        document.addEventListener('DOMContentLoaded', () => this.releaseWatchers());
        window.addEventListener('load', () => this.releaseWatchers());
    }

    detectLowTrafficContext() {
        try {
            if (typeof window.__IS_AUV3__ === 'boolean') {
                return window.__IS_AUV3__;
            }
            const raw = (window.__EXECUTION_MODE__ || window.__HOST_ENV__ || '').toString().toLowerCase();
            return raw.includes('auv3');
        } catch (_) {
            return false;
        }
    }

    patchConsole() {
        const levels = ['log', 'info', 'debug', 'warn', 'error'];
        const originals = {};
        levels.forEach((level) => {
            originals[level] = console[level] ? console[level].bind(console) : () => { };
        });
        const shouldEmit = (isError) => {
            if (!this.isActive) {
                return true;
            }
            if (isError && this.safeMode) {
                return false;
            }
            const now = performance.now();
            if (now - this.lastLogTs < this.logInterval) {
                return false;
            }
            this.lastLogTs = now;
            return true;
        };
        ['log', 'info', 'debug'].forEach((level) => {
            console[level] = (...args) => {
                if (!shouldEmit(false)) {
                    return;
                }
                originals[level](...args);
            };
        });
        ['warn', 'error'].forEach((level) => {
            console[level] = (...args) => {
                if (!shouldEmit(level === 'error')) {
                    return;
                }
                originals[level](...args);
            };
        });
    }

    patchStorageAccess() {
        const proto = Storage.prototype;
        const originalSet = proto.setItem;
        const originalRemove = proto.removeItem;
        const originalGet = proto.getItem;
        const originalClear = proto.clear;
        this.originalStorageOps = {
            set: originalSet,
            remove: originalRemove,
            clear: originalClear
        };
        const controller = this;

        proto.setItem = function setItem(key, value) {
            if (!controller.isActive) {
                return originalSet.call(this, key, value);
            }
            controller.pendingRemovals.delete(key);
            controller.shadowStorage.set(key, value);
            controller.enqueueStorageOperation({ target: this, key, value, type: 'set' });
            return undefined;
        };

        proto.removeItem = function removeItem(key) {
            if (!controller.isActive) {
                return originalRemove.call(this, key);
            }
            controller.shadowStorage.delete(key);
            controller.pendingRemovals.add(key);
            controller.enqueueStorageOperation({ target: this, key, type: 'remove' });
            return undefined;
        };

        proto.clear = function clear() {
            if (!controller.isActive) {
                return originalClear.call(this);
            }
            controller.shadowStorage.clear();
            controller.pendingRemovals.clear();
            controller.storageQueue.clear();
            controller.enqueueStorageOperation({ target: this, type: 'clear' });
            return undefined;
        };

        proto.getItem = function getItem(key) {
            if (!controller.isActive) {
                return originalGet.call(this, key);
            }
            if (controller.pendingRemovals.has(key)) {
                return null;
            }
            if (controller.shadowStorage.has(key)) {
                return controller.shadowStorage.get(key);
            }
            return originalGet.call(this, key);
        };
    }

    enqueueStorageOperation(operation) {
        const opKey = operation.type === 'clear' ? `__clear__${Date.now()}` : operation.key;
        this.storageQueue.set(opKey, operation);
        if (!this.storageFlushTimer) {
            this.storageFlushTimer = window.setTimeout(() => this.flushStorageQueue(), this.storageFlushInterval);
        }
    }

    flushStorageQueue(force = false) {
        if (!this.storageQueue.size) {
            if (this.storageFlushTimer) {
                clearTimeout(this.storageFlushTimer);
                this.storageFlushTimer = null;
            }
            return;
        }
        const entries = Array.from(this.storageQueue.values());
        this.storageQueue.clear();
        if (this.storageFlushTimer) {
            clearTimeout(this.storageFlushTimer);
            this.storageFlushTimer = null;
        }
        entries.forEach((operation) => {
            if (!operation || !operation.target) {
                return;
            }
            try {
                if (operation.type === 'set') {
                    this.originalStorageOps.set.call(operation.target, operation.key, operation.value);
                } else if (operation.type === 'remove') {
                    this.originalStorageOps.remove.call(operation.target, operation.key);
                } else if (operation.type === 'clear') {
                    this.originalStorageOps.clear.call(operation.target);
                }
            } catch (error) {
                if (!force) {
                    console.warn('[LowTrafficMode] storage flush failed, retrying later:', error);
                    this.enqueueStorageOperation(operation);
                }
            }
        });
    }

    patchStorageEvents() {
        const controller = this;
        const originalAdd = window.addEventListener;
        const originalRemove = window.removeEventListener;
        window.addEventListener = function addEvent(type, listener, options) {
            if (!controller.isActive || type !== 'storage' || typeof listener !== 'function') {
                return originalAdd.call(this, type, listener, options);
            }
            const wrapped = controller.createStorageListener(listener);
            controller.storageListenerMap.set(listener, wrapped);
            return originalAdd.call(this, type, wrapped, options);
        };
        window.removeEventListener = function removeEvent(type, listener, options) {
            if (!controller.isActive || type !== 'storage' || typeof listener !== 'function') {
                return originalRemove.call(this, type, listener, options);
            }
            const wrapped = controller.storageListenerMap.get(listener);
            controller.storageListenerMap.delete(listener);
            return originalRemove.call(this, type, wrapped || listener, options);
        };
    }

    createStorageListener(listener) {
        let running = false;
        const queue = [];
        const gap = this.storageEventGap;
        return (event) => {
            queue.push(event);
            if (running) {
                return;
            }
            running = true;
            const process = () => {
                const next = queue.shift();
                if (!next) {
                    running = false;
                    return;
                }
                try {
                    listener(next);
                } catch (error) {
                    console.error('[LowTrafficMode] storage listener failed', error);
                }
                if (queue.length) {
                    window.setTimeout(process, gap);
                } else {
                    running = false;
                }
            };
            process();
        };
    }

    patchMessageHandlers() {
        if (!window.webkit || !window.webkit.messageHandlers) {
            return;
        }
        const handlerNames = ['swiftBridge', 'console', 'squirrel.openURL'];
        handlerNames.forEach((name) => {
            const handler = window.webkit.messageHandlers[name];
            if (!handler || typeof handler.postMessage !== 'function' || handler.postMessage.__lowTrafficWrapped) {
                return;
            }
            const original = handler.postMessage.bind(handler);
            const queue = [];
            this.messageQueues.set(name, queue);
            let sending = false;
            const interval = name === 'console' ? this.minMessageInterval * 2 : this.minMessageInterval;
            const pump = () => {
                if (!queue.length) {
                    sending = false;
                    return;
                }
                sending = true;
                const payload = queue.shift();
                try {
                    original(payload);
                } catch (error) {
                    console.error('[LowTrafficMode] postMessage failed', error);
                }
                window.setTimeout(pump, interval);
            };
            handler.postMessage = (payload) => {
                if (!this.isActive) {
                    return original(payload);
                }
                queue.push(payload);
                if (queue.length > MAX_PENDING_MESSAGES && !this.safeMode) {
                    this.enterSafeMode(`ipc:${name}`);
                }
                if (!sending) {
                    pump();
                }
            };
            handler.postMessage.__lowTrafficWrapped = true;
        });
    }

    patchIntervalTimers() {
        const originalSetInterval = window.setInterval;
        const controller = this;
        window.setInterval = function setInterval(handler, delay = 0, ...rest) {
            if (!controller.isActive) {
                return originalSetInterval(handler, delay, ...rest);
            }
            const safeDelay = Math.max(delay || 0, controller.safeMode ? 600 : 320);
            return originalSetInterval(handler, safeDelay, ...rest);
        };
    }

    patchObservers() {
        const controller = this;
        const names = ['MutationObserver', 'ResizeObserver'];
        names.forEach((name) => {
            const NativeObserver = window[name];
            if (!NativeObserver || NativeObserver.__lowTrafficWrapped || typeof NativeObserver !== 'function') {
                return;
            }
            function DeferredObserver(callback) {
                this.__native = new NativeObserver(callback);
                this.__pending = [];
            }
            DeferredObserver.prototype.observe = function observe(target, options) {
                if (!controller.isActive || controller.canStartWatchers) {
                    return this.__native.observe(target, options);
                }
                this.__pending.push({ target, options });
                controller.pendingWatchers.add(this);
                return undefined;
            };
            DeferredObserver.prototype.disconnect = function disconnect() {
                this.__pending.length = 0;
                return this.__native.disconnect();
            };
            DeferredObserver.prototype.takeRecords = function takeRecords() {
                return this.__native.takeRecords();
            };
            DeferredObserver.__lowTrafficWrapped = true;
            window[name] = DeferredObserver;
        });
    }

    releaseWatchers() {
        if (this.canStartWatchers) {
            return;
        }
        this.canStartWatchers = true;
        this.pendingWatchers.forEach((observer) => {
            if (!observer || !observer.__pending || !observer.__native) {
                return;
            }
            observer.__pending.forEach(({ target, options }) => {
                try {
                    observer.__native.observe(target, options);
                } catch (error) {
                    console.warn('[LowTrafficMode] failed to resume observer', error);
                }
            });
            observer.__pending.length = 0;
        });
        this.pendingWatchers.clear();
    }

    enterSafeMode(reason = 'auto') {
        if (this.safeMode) {
            return;
        }
        this.safeMode = true;
        this.logInterval = Math.max(this.logInterval, 650);
        this.storageFlushInterval = Math.max(this.storageFlushInterval, 1000);
        this.minMessageInterval = Math.max(this.minMessageInterval, 320);
        this.flushStorageQueue(true);
        try {
            const event = new CustomEvent('lyrix-safe-mode', { detail: { origin: 'js', reason } });
            window.dispatchEvent(event);
        } catch (_) {
            window.__LYRIX_SAFE_MODE__ = true;
        }
    }

    markAppReady() {
        this.releaseWatchers();
        this.flushStorageQueue(true);
    }

    debounce(fn, wait = 350) {
        let timer = null;
        return (...args) => {
            if (timer) {
                clearTimeout(timer);
            }
            timer = setTimeout(() => {
                fn(...args);
            }, wait);
        };
    }
}

export const LowTrafficMode = new LowTrafficModeController();
