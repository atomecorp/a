/**
 * Authentication module for Squirrel Framework.
 *
 * Transport doctrine: authentication is served **only** by the `/ws/api`
 * WebSocket dispatch (see server/ws_auth_operations.js). The former
 * `registerAuthRoutes` Fastify plugin and its five `auth_routes_*` modules
 * mounted a second, parallel HTTP implementation of the same 21 operations;
 * nothing in `server/` ever called it and only test files kept it alive, so it
 * was removed. `scripts/check_websocket_only_transport.mjs` now scans every
 * `server/**\/*.js` and fails if business HTTP routes come back.
 *
 * This module is the shared surface the WebSocket handlers import from.
 */

import { normalizePhone, generateOpaquePrincipalId, hashPassword, verifyPassword } from './auth_crypto.js';
import { createUserAtome, findUserByPhone, findUserById, listAllUsers, updateUserParticle, deleteUserAtome } from './auth_users.js';
import { generateOTP, sendSMS } from './auth_otp.js';

export {
    consumePhoneVerification,
    enforceAuthIdentityRateLimit,
    generateOTP,
    isAuthOtpBypassEnabled,
    markPhoneVerification,
    requestPhoneVerificationDelivery,
    sendSMS,
    storeOTP,
    verifyOTP
} from './auth_otp.js';

// User management surface used by the WebSocket handlers.
export {
    createUserAtome,
    findUserByPhone,
    findUserById,
    listAllUsers,
    updateUserParticle,
    deleteUserAtome,
    generateOpaquePrincipalId,
    normalizePhone,
    hashPassword,
    verifyPassword
};

export default { hashPassword, verifyPassword, generateOTP, sendSMS };
