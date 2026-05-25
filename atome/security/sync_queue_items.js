import {
    ActionStatus,
    QUEUE_STORAGE_KEY
} from './sync_queue_constants.js';
import {
    readStoredData,
    writeStoredData
} from './sync_queue_storage.js';

export const getQueue = () => {
    const queue = readStoredData(QUEUE_STORAGE_KEY, []);
    return Array.isArray(queue) ? queue : [];
};

const saveQueue = (queue) => {
    writeStoredData(QUEUE_STORAGE_KEY, Array.isArray(queue) ? queue : []);
};

export const addToQueue = (action) => {
    const queue = getQueue();
    const actionId = `action_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    const queueItem = {
        id: actionId,
        type: action.type,
        userId: action.userId,
        username: action.username,
        phone: action.phone,
        data: action.data || {},
        status: ActionStatus.PENDING,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        retryCount: 0,
        maxRetries: 3,
        lastError: null
    };
    const existingIndex = queue.findIndex((item) => (
        item.type === action.type
        && item.userId === action.userId
        && item.status === ActionStatus.PENDING
    ));
    if (existingIndex >= 0) {
        queue[existingIndex] = { ...queue[existingIndex], ...queueItem, id: queue[existingIndex].id };
    } else {
        queue.push(queueItem);
    }
    saveQueue(queue);
    return existingIndex >= 0 ? queue[existingIndex].id : actionId;
};

export const removeFromQueue = (actionId) => {
    saveQueue(getQueue().filter((item) => item.id !== actionId));
};

export const updateActionStatus = (actionId, status, error = null) => {
    const queue = getQueue();
    const action = queue.find((item) => item.id === actionId);
    if (!action) return;
    action.status = status;
    action.updatedAt = new Date().toISOString();
    if (error) action.lastError = error;
    if (status === ActionStatus.RETRY) action.retryCount += 1;
    saveQueue(queue);
};

const isPendingAction = (action) => (
    action.status === ActionStatus.PENDING || action.status === ActionStatus.RETRY
);

export const getPendingActionsForUser = (userId) => (
    getQueue().filter((action) => action.userId === userId && isPendingAction(action))
);

export const getAllPendingActions = () => getQueue().filter(isPendingAction);

export const cleanupOldActions = (days = 7) => {
    const queue = getQueue();
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const nextQueue = queue.filter((action) => (
        action.status !== ActionStatus.COMPLETED || action.updatedAt > cutoff
    ));
    if (nextQueue.length !== queue.length) saveQueue(nextQueue);
};
