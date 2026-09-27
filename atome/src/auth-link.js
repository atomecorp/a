import { parseAuthLink } from './shared/auth_link_contract.js';

// Retain the secret only in the fragment during navigation. Application boot
// must consume and erase this fragment before initializing the login facade.
try {
    const { attemptId, token } = parseAuthLink(location.href);
    location.replace(`/#auth-link=${attemptId}.${token}`);
} catch {
    location.replace('/');
}
