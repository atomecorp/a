const storage = globalThis.localStorage;

if (!storage
    || typeof storage.getItem !== 'function'
    || typeof storage.setItem !== 'function'
    || typeof storage.removeItem !== 'function'
    || typeof storage.clear !== 'function') {
    const values = new Map();
    Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        writable: true,
        value: {
            getItem: (key) => values.has(String(key)) ? values.get(String(key)) : null,
            setItem: (key, value) => values.set(String(key), String(value)),
            removeItem: (key) => values.delete(String(key)),
            clear: () => values.clear()
        }
    });
}
