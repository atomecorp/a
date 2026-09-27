import { describe, expect, it } from 'vitest';
import {
    inferPhoneRegion,
    isE164Phone,
    normalizePhoneToE164,
    phoneCallingCode
} from '../../atome/src/shared/phone_number.js';

describe('local-first phone number normalization', () => {
    it('accepts a French local mobile number without displaying or requiring +33', () => {
        expect(normalizePhoneToE164('06 12 34 56 78', { region: 'FR' })).toBe('+33612345678');
        expect(isE164Phone(normalizePhoneToE164('06.12.34.56.78', { region: 'FR' }))).toBe(true);
    });

    it('keeps explicit international numbers and accepts the 00 prefix', () => {
        expect(normalizePhoneToE164('+41 79 123 45 67', { region: 'FR' })).toBe('+41791234567');
        expect(normalizePhoneToE164('0033 6 12 34 56 78', { region: 'US' })).toBe('+33612345678');
    });

    it('uses the browser locale and falls back to France when unavailable', () => {
        expect(inferPhoneRegion({ navigator: { languages: ['en-GB'] } })).toBe('GB');
        expect(normalizePhoneToE164('07123 456789', { region: 'GB' })).toBe('+447123456789');
        expect(inferPhoneRegion({})).toBe('FR');
        expect(phoneCallingCode(inferPhoneRegion({}))).toBe('33');
    });

    it('prefers a known local timezone over an unrelated display language', () => {
        const environment = {
            navigator: { languages: ['en-US'] },
            Intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: 'Europe/Paris' }) }) }
        };
        expect(inferPhoneRegion(environment)).toBe('FR');
    });

    it('rejects letters and malformed international input', () => {
        expect(normalizePhoneToE164('06 bonjour', { region: 'FR' })).toBe('');
        expect(normalizePhoneToE164('+33++612345678', { region: 'FR' })).toBe('');
        expect(isE164Phone(normalizePhoneToE164('123', { region: 'FR' }))).toBe(false);
    });
});
