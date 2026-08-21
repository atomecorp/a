import assert from 'node:assert/strict';
import test from 'node:test';
import {
    consumePhoneVerification,
    markPhoneVerification,
    requestPhoneVerificationDelivery,
    storeOTP,
    verifyOTP
} from '../../server/auth_otp.js';

const withEnvironment = async (values, run) => {
    const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
    Object.entries(values).forEach(([key, value]) => {
        if (value === null) delete process.env[key];
        else process.env[key] = value;
    });
    try {
        return await run();
    } finally {
        Object.entries(previous).forEach(([key, value]) => {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        });
    }
};

test('production enrollment display returns a real one-time OTP', async () => {
    await withEnvironment({
        NODE_ENV: 'production',
        SQUIRREL_AUTH_ENROLLMENT_OTP_DISPLAY: '1',
        SQUIRREL_AUTH_OTP_BYPASS: null
    }, async () => {
        const result = await requestPhoneVerificationDelivery({
            phone: '+999000000001',
            purpose: 'enrollment',
            exposeForTest: true
        });
        assert.equal(result.delivery, 'display');
        assert.match(result.code, /^\d{6}$/);
        assert.equal(verifyOTP('+999000000001', result.code, 'enrollment').valid, true);
        assert.equal(verifyOTP('+999000000001', result.code, 'enrollment').valid, false);
    });
});

test('production display never exposes non-enrollment OTPs', async () => {
    await withEnvironment({
        NODE_ENV: 'production',
        SQUIRREL_AUTH_ENROLLMENT_OTP_DISPLAY: '1',
        SQUIRREL_AUTH_OTP_BYPASS: null
    }, async () => {
        await assert.rejects(
            requestPhoneVerificationDelivery({
                phone: '+999000000002',
                purpose: 'change',
                exposeForTest: true
            }),
            /otp_delivery_unavailable/
        );
        assert.equal(verifyOTP('+999000000002', '000000', 'change').error, 'No pending OTP request for this phone number');
    });
});

test('production never enables the test OTP bypass', async () => {
    await withEnvironment({
        NODE_ENV: 'production',
        SQUIRREL_AUTH_ENROLLMENT_OTP_DISPLAY: null,
        SQUIRREL_AUTH_OTP_BYPASS: '1'
    }, async () => {
        await assert.rejects(
            requestPhoneVerificationDelivery({ phone: '+999000000003', purpose: 'enrollment' }),
            /otp_delivery_unavailable/
        );
    });
});

test('verified enrollment proof is connection-scoped, expiring and consumed once', () => {
    const connection = {};
    const otherConnection = {};
    const realNow = Date.now;
    let now = realNow();
    Date.now = () => now;
    try {
        assert.equal(markPhoneVerification(connection, '+999000000004', 'enrollment'), true);
        assert.equal(consumePhoneVerification(otherConnection, '+999000000004', 'enrollment'), false);
        assert.equal(consumePhoneVerification(connection, '+999000000004', 'enrollment'), true);
        assert.equal(consumePhoneVerification(connection, '+999000000004', 'enrollment'), false);

        assert.equal(markPhoneVerification(connection, '+999000000004', 'enrollment'), true);
        now += (5 * 60 * 1000) + 1;
        assert.equal(consumePhoneVerification(connection, '+999000000004', 'enrollment'), false);

        storeOTP('+999000000005', '123456', 'enrollment');
        now += (5 * 60 * 1000) + 1;
        assert.equal(verifyOTP('+999000000005', '123456', 'enrollment').error, 'OTP has expired');
    } finally {
        Date.now = realNow;
    }
});

test('a displayed enrollment OTP cannot authorize recovery or phone change', async () => {
    await withEnvironment({
        NODE_ENV: 'production',
        SQUIRREL_AUTH_ENROLLMENT_OTP_DISPLAY: '1',
        SQUIRREL_AUTH_OTP_BYPASS: null
    }, async () => {
        const result = await requestPhoneVerificationDelivery({
            phone: '+999000000006',
            purpose: 'enrollment'
        });
        assert.equal(verifyOTP('+999000000006', result.code, 'recovery').valid, false);
        assert.equal(verifyOTP('+999000000006', result.code, 'change').valid, false);
        assert.equal(verifyOTP('+999000000006', result.code, 'enrollment').valid, true);
    });
});
