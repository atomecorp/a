import { handleWsAtomeOperation } from './wsAtomeOperations.js';
import { handleWsExternalResourceOperation } from './wsExternalResourceOperations.js';
import { handleWsSurfaceOperation } from './wsSurfaceOperations.js';
import { handleWsTeleportOperation } from './wsTeleportOperations.js';
import { handleWsAiProviderOperation } from './wsAiProviderOperations.js';
import { handleWsSurfaceGrantOperation } from './wsSurfaceGrantOperations.js';
import { handleWsBillingOperation } from './billing/ws_billing_operations.js';

// Authenticated `/ws/api` families that answer with one reply envelope or null
// when the frame is not theirs. Order is the dispatch order.
const FAMILIES = Object.freeze([
    (data, connection, ip) => handleWsExternalResourceOperation(data, connection, ip),
    (data, connection) => handleWsAiProviderOperation(data, connection),
    (data, connection) => handleWsBillingOperation(data, connection),
    (data, connection) => handleWsAtomeOperation(data, connection),
    (data, connection) => handleWsSurfaceOperation(data, connection),
    (data, connection) => handleWsTeleportOperation(data, connection),
    (data, connection) => handleWsSurfaceGrantOperation(data, connection)
]);

export const handleWsApiOperationFamilies = async (data, connection, ip) => {
    for (const family of FAMILIES) {
        const response = await family(data, connection, ip);
        if (response) return response;
    }
    return null;
};
