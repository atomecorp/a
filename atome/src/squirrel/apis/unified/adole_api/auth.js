// Public auth facade — composes the login-flow and session/account method groups into a single
// `auth` object. Helpers live in auth_core / auth_backends / auth_fastify_token / auth_workspace /
// auth_state; the method bodies live in the two method-group modules below.
import { loginMethods } from './auth_methods_login.js';
import { sessionAccountMethods } from './auth_methods_session_account.js';
import { accountMethods } from './auth_methods_account.js';

export const auth = {
    ...loginMethods,
    ...sessionAccountMethods,
    ...accountMethods
};

export default auth;
