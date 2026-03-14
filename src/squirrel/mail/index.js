export {
    MAIL_V1_ARCHITECTURE_DECISION,
    createMailConnectorContract
} from './connector_contract.js';
export {
    createIcloudMailConnector,
    normalizeIcloudMailConnectorConfig,
    normalizeIcloudMailRecord
} from './icloud_connector.js';
export {
    createMailIndex,
    normalizeMailRecord
} from './local_index.js';
export { createMailSyncState } from './sync_state.js';
export { createMailService } from './service.js';
export {
    bootstrapGlobalMail,
    createGlobalMailApi
} from './bootstrap.js';
