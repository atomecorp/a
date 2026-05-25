import { CREDENTIALS_STORAGE_KEY } from './sync_queue_constants.js';
import {
    readStoredData,
    removeStoredData,
    writeStoredData
} from './sync_queue_storage.js';

const getStoredCredentials = () => {
    const stored = readStoredData(CREDENTIALS_STORAGE_KEY, {});
    const credentials = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    let changed = false;
    for (const value of Object.values(credentials)) {
        if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'password')) {
            delete value.password;
            changed = true;
        }
    }
    if (changed) writeStoredData(CREDENTIALS_STORAGE_KEY, credentials);
    return credentials;
};

export const storeCredentialsForSync = (userId, password, enableAutoSync = true) => {
    const allCredentials = getStoredCredentials();
    allCredentials[userId] = {
        autoSync: enableAutoSync,
        storedAt: new Date().toISOString()
    };
    writeStoredData(CREDENTIALS_STORAGE_KEY, allCredentials);
};

export const getCredentialsForUser = (userId) => {
    const allCredentials = getStoredCredentials();
    return allCredentials[userId] || null;
};

export const removeCredentials = (userId) => {
    const allCredentials = getStoredCredentials();
    delete allCredentials[userId];
    if (Object.keys(allCredentials).length === 0) {
        removeStoredData(CREDENTIALS_STORAGE_KEY);
        return;
    }
    writeStoredData(CREDENTIALS_STORAGE_KEY, allCredentials);
};

export const isAutoSyncEnabled = (userId) => {
    const credentials = getCredentialsForUser(userId);
    return credentials?.autoSync === true;
};
