export const QUEUE_STORAGE_KEY = 'squirrel_sync_queue';
export const CREDENTIALS_STORAGE_KEY = 'squirrel_sync_credentials';
export const SYNC_CONFIG_KEY = 'squirrel_sync_config';

export const SyncAction = {
    CREATE_ACCOUNT: 'create_account',
    UPDATE_ACCOUNT: 'update_account',
    DELETE_ACCOUNT: 'delete_account',
    SYNC_DATA: 'sync_data'
};

export const ActionStatus = {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    FAILED: 'failed',
    RETRY: 'retry'
};
