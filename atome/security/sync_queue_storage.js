const DEVICE_ID_STORAGE_KEY = 'squirrel_device_id';

const getDeviceKey = () => {
    let deviceId = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (!deviceId) {
        deviceId = crypto.randomUUID
            ? crypto.randomUUID()
            : `dev_${Math.random().toString(36).substr(2, 16)}${Date.now().toString(36)}`;
        localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
    }
    return deviceId;
};

const encodeForStorage = (data) => {
    const key = getDeviceKey();
    const str = JSON.stringify(data);
    let result = '';
    for (let index = 0; index < str.length; index += 1) {
        result += String.fromCharCode(str.charCodeAt(index) ^ key.charCodeAt(index % key.length));
    }
    return btoa(result);
};

const decodeFromStorage = (encoded) => {
    try {
        const key = getDeviceKey();
        const str = atob(encoded);
        let result = '';
        for (let index = 0; index < str.length; index += 1) {
            result += String.fromCharCode(str.charCodeAt(index) ^ key.charCodeAt(index % key.length));
        }
        return JSON.parse(result);
    } catch (_) {
        return null;
    }
};

export const readStoredData = (storageKey, fallback) => {
    try {
        const encoded = localStorage.getItem(storageKey);
        if (!encoded) return fallback;
        return decodeFromStorage(encoded) || fallback;
    } catch (_) {
        return fallback;
    }
};

export const writeStoredData = (storageKey, value) => {
    try {
        localStorage.setItem(storageKey, encodeForStorage(value));
    } catch (_) {
    }
};

export const removeStoredData = (storageKey) => {
    try {
        localStorage.removeItem(storageKey);
    } catch (_) {
    }
};
