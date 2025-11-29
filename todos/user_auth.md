# User Authentication - Production TODO

## ✅ Completed

- [x] Backend auth module (`server/auth.js`)
- [x] Password hashing with bcrypt (10 rounds)
- [x] JWT session management with HttpOnly cookies
- [x] Registration endpoint (`POST /api/auth/register`)
- [x] Login endpoint with password verification (`POST /api/auth/login`)
- [x] Logout endpoint (`POST /api/auth/logout`)
- [x] Session check endpoint (`GET /api/auth/me`)
- [x] Profile update endpoint (`PUT /api/auth/update`)
- [x] OTP generation and verification for password reset
- [x] Frontend UI (login, signup, profile, recovery, OTP verification)
- [x] Local/remote server configuration in frontend
- [x] CORS configuration for credentials

---

## 🔴 TODO for Production

### 1. SMS Provider Integration (Critical)

Replace the simulated `sendSMS()` function in `server/auth.js` with a real provider:

**Options:**

- **Twilio** (recommended): <https://www.twilio.com/>
- **Vonage/Nexmo**: <https://www.vonage.com/>
- **OVH SMS**: <https://www.ovhtelecom.fr/sms/>

**Location:** `server/auth.js` line ~85

```javascript
// TODO: Replace this simulation with real SMS API
async function sendSMS(phone, message) {
    // Example with Twilio:
    // const twilio = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
    // await twilio.messages.create({
    //     body: message,
    //     from: process.env.TWILIO_PHONE_NUMBER,
    //     to: phone
    // });
}
```

---

### 2. Environment Variables (Critical)

Add these to `.env` or server environment:

```bash
# JWT & Cookie secrets (generate random 64+ char strings)
JWT_SECRET="your_very_long_random_secret_here_at_least_64_characters"
COOKIE_SECRET="another_very_long_random_secret_here_at_least_64_characters"

# SMS Provider (example for Twilio)
TWILIO_SID="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
TWILIO_AUTH_TOKEN="your_auth_token"
TWILIO_PHONE_NUMBER="+15551234567"

# Production mode
NODE_ENV="production"
```

---

### 3. OTP Storage with Redis (Recommended for multi-instance)

Current implementation uses in-memory `Map()` which doesn't work across multiple server instances.

**Install Redis:**

```bash
npm install ioredis
```

**Replace in `server/auth.js`:**

```javascript
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);

// Store OTP
await redis.setex(`otp:${phone}`, 300, code); // 5 min expiry

// Verify OTP
const stored = await redis.get(`otp:${phone}`);
await redis.del(`otp:${phone}`); // consume
```

---

### 4. Rate Limiting (Security)

Prevent brute force attacks on login and OTP endpoints.

**Install:**

```bash
npm install @fastify/rate-limit
```

**Add to server:**

```javascript
await server.register(import('@fastify/rate-limit'), {
    max: 5, // 5 attempts
    timeWindow: '1 minute'
});
```

---

### 5. Phone Number Validation (Recommended)

Add proper phone number validation and formatting.

**Install:**

```bash
npm install libphonenumber-js
```

**Usage:**

```javascript
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';

if (!isValidPhoneNumber(phone)) {
    return reply.code(400).send({ error: 'Invalid phone number format' });
}
const formatted = parsePhoneNumber(phone).format('E.164');
```

---

### 6. Email Verification (Optional)

Add email as secondary verification method.

- [ ] Add email field to registration
- [ ] Send verification email on signup
- [ ] Add `/api/auth/verify-email` endpoint

---

### 7. Account Lockout (Security)

Lock account after X failed login attempts.

- [ ] Track failed attempts per phone number
- [ ] Lock for 15-30 minutes after 5 failed attempts
- [ ] Notify user via SMS when account is locked

---

### 8. Audit Logging (Compliance)

Log authentication events for security audit.

- [ ] Log successful/failed logins
- [ ] Log password changes
- [ ] Log OTP requests
- [ ] Include IP address and user agent

---

### 9. HTTPS Certificate (Production)

Ensure HTTPS is enabled in production:

```bash
export USE_HTTPS=true
```

Certificates should be in `scripts_utils/certs/` or `certs/`.

---

## 📋 Testing Checklist

- [ ] Register new user
- [ ] Login with correct credentials
- [ ] Login with wrong password (should fail)
- [ ] Session persistence after page reload
- [ ] Logout clears session
- [ ] OTP request sends SMS
- [ ] Password reset with valid OTP
- [ ] Password reset with invalid OTP (should fail)
- [ ] Duplicate phone registration (should fail)
- [ ] Remote server configuration works

---

## 📁 Related Files

- `server/auth.js` - Authentication module
- `server/server.js` - Server integration
- `src/application/examples/user_creation.js` - Frontend UI
- `database/db.js` - Database configuration
