export const readStorage = (key) => {
    if (typeof localStorage === 'undefined') return null;
    try {
        return localStorage.getItem(key);
    } catch (_) {
        return null;
    }
};

export const writeStorage = (key, value) => {
    if (typeof localStorage === 'undefined') return;
    
        if (value === null || value === undefined) {
            localStorage.removeItem(key);
            return;
        }
        localStorage.setItem(key, value);
    
};

export const readJson = (key) => {
    const raw = readStorage(key);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch (_) {
        return null;
    }
};

export const writeJson = (key, value) => {
    if (value === null || value === undefined) {
        writeStorage(key, null);
        return;
    }
    
        writeStorage(key, JSON.stringify(value));
    
};

export const removeStorage = (key) => {
    if (typeof localStorage === 'undefined') return;
    
        localStorage.removeItem(key);
    
};
