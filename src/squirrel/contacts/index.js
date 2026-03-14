export {
    CONTACTS_V1_ARCHITECTURE_DECISION,
    createContactsConnectorContract
} from './connector_contract.js';
export {
    createLocalContactsSource,
    normalizeLocalContact
} from './local_source.js';
export {
    createIcloudContactsConnector,
    normalizeIcloudContactsConnectorConfig
} from './icloud_connector.js';
export {
    createMacosContactsSource,
    normalizeMacosContact
} from './macos_source.js';
export { createContactsService } from './service.js';
export {
    bootstrapGlobalContacts,
    createGlobalContactsApi
} from './bootstrap.js';
