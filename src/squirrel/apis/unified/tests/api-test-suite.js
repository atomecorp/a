/**
 * Unified API Test Suite
 * 
 * Comprehensive tests for all Auth, CRUD, ADOLE, and User-Data APIs
 * Tests both Tauri (Axum on port 3000) and Fastify (port 3001) backends
 * 
 * Usage:
 *   - In browser: import and call runAllTests()
 *   - Results are logged to console and returned as object
 */

const TEST_USER = {
    phone: '+33612345678',
    password: 'TestPassword123!',
    username: 'testuser_api'
};

// Test results tracker
const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
    tests: []
};

/**
 * Log a test result
 */
function logTest(name, passed, error = null) {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status}: ${name}${error ? ` - ${error}` : ''}`);

    results.tests.push({ name, passed, error });
    if (passed) {
        results.passed++;
    } else {
        results.failed++;
    }
}

/**
 * Skip a test with reason
 */
function skipTest(name, reason) {
    console.log(`⏭️ SKIP: ${name} - ${reason}`);
    results.tests.push({ name, passed: null, skipped: true, reason });
    results.skipped++;
}

/**
 * Make HTTP request with proper error handling
 */
async function request(url, options = {}) {
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json'
        }
    };

    const mergedOptions = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...options.headers
        }
    };

    if (options.body && typeof options.body === 'object') {
        mergedOptions.body = JSON.stringify(options.body);
    }

    try {
        const response = await fetch(url, mergedOptions);
        const text = await response.text();

        let data;
        try {
            data = JSON.parse(text);
        } catch {
            data = { raw: text };
        }

        // Debug logging for failures
        if (!response.ok) {
            console.log(`  ⚠️ ${mergedOptions.method || 'GET'} ${url} → ${response.status}: ${JSON.stringify(data).substring(0, 100)}`);
        }

        return {
            ok: response.ok,
            status: response.status,
            data
        };
    } catch (error) {
        console.log(`  ⚠️ ${mergedOptions.method || 'GET'} ${url} → Error: ${error.message}`);
        return {
            ok: false,
            status: 0,
            error: error.message
        };
    }
}

/**
 * Test Authentication APIs
 */
async function testAuthAPIs(baseUrl, platform) {
    console.log(`\n🔐 Testing Auth APIs on ${platform} (${baseUrl})`);
    let token = null;

    // 1. Register
    try {
        const res = await request(`${baseUrl}/api/auth/register`, {
            method: 'POST',
            body: {
                phone: TEST_USER.phone,
                password: TEST_USER.password,
                username: TEST_USER.username
            }
        });

        // Registration might fail if user exists, that's OK
        if (res.ok && res.data.success) {
            logTest(`[${platform}] Register new user`, true);
        } else if (res.data.error && res.data.error.includes('exists')) {
            logTest(`[${platform}] Register (user exists - OK)`, true);
        } else {
            logTest(`[${platform}] Register`, res.ok, res.data.error);
        }
    } catch (e) {
        logTest(`[${platform}] Register`, false, e.message);
    }

    // 2. Login
    try {
        const res = await request(`${baseUrl}/api/auth/login`, {
            method: 'POST',
            body: {
                phone: TEST_USER.phone,
                password: TEST_USER.password
            },
            credentials: 'include'
        });

        if (res.ok && res.data.success && res.data.token) {
            token = res.data.token;
            logTest(`[${platform}] Login`, true);
        } else {
            logTest(`[${platform}] Login`, false, res.data.error || 'No token returned');
        }
    } catch (e) {
        logTest(`[${platform}] Login`, false, e.message);
    }

    if (!token) {
        skipTest(`[${platform}] Me endpoint`, 'No auth token');
        skipTest(`[${platform}] Refresh token`, 'No auth token');
        skipTest(`[${platform}] Change password`, 'No auth token');
        return { token: null };
    }

    // 3. Me endpoint
    try {
        const res = await request(`${baseUrl}/api/auth/me`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Cookie': `access_token=${token}`
            },
            credentials: 'include'
        });

        logTest(`[${platform}] Me endpoint`, res.ok && res.data.success);
    } catch (e) {
        logTest(`[${platform}] Me endpoint`, false, e.message);
    }

    // 4. Refresh token
    try {
        const refreshUrl = platform === 'Tauri'
            ? `${baseUrl}/api/auth/local/refresh`
            : `${baseUrl}/api/auth/refresh`;

        const res = await request(refreshUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Cookie': `access_token=${token}`
            },
            body: {} // Empty body to avoid Fastify error
        });

        if (res.ok && res.data.success && res.data.token) {
            token = res.data.token; // Use refreshed token
            logTest(`[${platform}] Refresh token`, true);
        } else {
            logTest(`[${platform}] Refresh token`, false, res.data.error);
        }
    } catch (e) {
        logTest(`[${platform}] Refresh token`, false, e.message);
    }

    // 5. Change password (test but revert)
    try {
        const changeUrl = platform === 'Tauri'
            ? `${baseUrl}/api/auth/local/change-password`
            : `${baseUrl}/api/auth/change-password`;

        const res = await request(changeUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: {
                currentPassword: TEST_USER.password,
                newPassword: 'NewTestPassword456!'
            }
        });

        if (res.ok && res.data.success) {
            // Revert password back
            await request(changeUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: {
                    currentPassword: 'NewTestPassword456!',
                    newPassword: TEST_USER.password
                }
            });
            logTest(`[${platform}] Change password`, true);
        } else {
            logTest(`[${platform}] Change password`, false, res.data.error);
        }
    } catch (e) {
        logTest(`[${platform}] Change password`, false, e.message);
    }

    return { token };
}

/**
 * Test CRUD + ADOLE APIs for Atomes
 */
async function testAtomeAPIs(baseUrl, platform, token) {
    console.log(`\n📦 Testing Atome CRUD + ADOLE APIs on ${platform}`);

    if (!token) {
        skipTest(`[${platform}] All Atome tests`, 'No auth token');
        return { atomeId: null };
    }

    const headers = {
        'Authorization': `Bearer ${token}`
    };

    let atomeId = null;

    // 1. Create atome
    try {
        const res = await request(`${baseUrl}/api/atome/create`, {
            method: 'POST',
            headers,
            body: {
                atome_type: 'test_document',
                properties: {
                    name: 'Test Document',
                    content: 'Initial content',
                    version: 1
                }
            }
        });

        if (res.ok && res.data.success && res.data.data) {
            atomeId = res.data.data.atome_id || res.data.data.id;
            logTest(`[${platform}] Create atome`, true);
        } else {
            logTest(`[${platform}] Create atome`, false, res.data.error);
        }
    } catch (e) {
        logTest(`[${platform}] Create atome`, false, e.message);
    }

    if (!atomeId) {
        skipTest(`[${platform}] Remaining atome tests`, 'No atome created');
        return { atomeId: null };
    }

    // 2. Get atome
    try {
        const res = await request(`${baseUrl}/api/atome/${atomeId}`, {
            method: 'GET',
            headers
        });

        logTest(`[${platform}] Get atome`, res.ok && res.data.success);
    } catch (e) {
        logTest(`[${platform}] Get atome`, false, e.message);
    }

    // 3. Update atome (standard PUT)
    try {
        const res = await request(`${baseUrl}/api/atome/${atomeId}`, {
            method: 'PUT',
            headers,
            body: {
                properties: {
                    content: 'Updated content via PUT',
                    version: 2
                }
            }
        });

        logTest(`[${platform}] Update atome (PUT)`, res.ok && res.data.success);
    } catch (e) {
        logTest(`[${platform}] Update atome (PUT)`, false, e.message);
    }

    // 4. Alter atome (ADOLE append-only)
    try {
        const res = await request(`${baseUrl}/api/atome/${atomeId}/alter`, {
            method: 'POST',
            headers,
            body: {
                alterations: [
                    { key: 'content', value: 'Altered content via ADOLE', operation: 'set' },
                    { key: 'tags', value: ['test', 'adole'], operation: 'set' },
                    { key: 'version', value: 3, operation: 'set' }
                ]
            }
        });

        logTest(`[${platform}] Alter atome (ADOLE)`, res.ok && res.data.success);
    } catch (e) {
        logTest(`[${platform}] Alter atome (ADOLE)`, false, e.message);
    }

    // 5. Rename atome
    try {
        const res = await request(`${baseUrl}/api/atome/${atomeId}/rename`, {
            method: 'POST',
            headers,
            body: {
                new_name: 'Renamed Test Document'
            }
        });

        logTest(`[${platform}] Rename atome`, res.ok && res.data.success);
    } catch (e) {
        logTest(`[${platform}] Rename atome`, false, e.message);
    }

    // 6. Get history
    try {
        const res = await request(`${baseUrl}/api/atome/${atomeId}/history`, {
            method: 'GET',
            headers
        });

        const hasHistory = res.ok && res.data.success &&
            (res.data.data || res.data.history) &&
            (res.data.data?.length > 0 || res.data.history?.length > 0);
        logTest(`[${platform}] Get history`, hasHistory);
    } catch (e) {
        logTest(`[${platform}] Get history`, false, e.message);
    }

    // 7. Restore (revert name to original)
    try {
        const res = await request(`${baseUrl}/api/atome/${atomeId}/restore`, {
            method: 'POST',
            headers,
            body: {
                key: 'name',
                version_index: 1 // Previous version
            }
        });

        // Restore might fail if not enough history, which is acceptable
        if (res.ok && res.data.success) {
            logTest(`[${platform}] Restore property`, true);
        } else if (res.data.error && res.data.error.includes('out of range')) {
            logTest(`[${platform}] Restore property (not enough history - OK)`, true);
        } else {
            logTest(`[${platform}] Restore property`, false, res.data.error);
        }
    } catch (e) {
        logTest(`[${platform}] Restore property`, false, e.message);
    }

    // 8. List atomes
    try {
        const res = await request(`${baseUrl}/api/atome/list`, {
            method: 'GET',
            headers
        });

        const hasList = res.ok && res.data.success && Array.isArray(res.data.data);
        logTest(`[${platform}] List atomes`, hasList);
    } catch (e) {
        logTest(`[${platform}] List atomes`, false, e.message);
    }

    // 9. Delete atome (cleanup)
    try {
        const res = await request(`${baseUrl}/api/atome/${atomeId}`, {
            method: 'DELETE',
            headers,
            body: {} // Empty body required for Fastify JSON parser
        });

        logTest(`[${platform}] Delete atome`, res.ok && res.data.success);
    } catch (e) {
        logTest(`[${platform}] Delete atome`, false, e.message);
    }

    return { atomeId };
}

/**
 * Test User Data APIs
 */
async function testUserDataAPIs(baseUrl, platform, token) {
    console.log(`\n👤 Testing User Data APIs on ${platform}`);

    if (!token) {
        skipTest(`[${platform}] All User Data tests`, 'No auth token');
        return;
    }

    const headers = {
        'Authorization': `Bearer ${token}`
    };

    // 1. Export user data
    try {
        const res = await request(`${baseUrl}/api/user-data/export`, {
            method: 'GET',
            headers
        });

        logTest(`[${platform}] Export user data`, res.ok && res.data.success);
    } catch (e) {
        logTest(`[${platform}] Export user data`, false, e.message);
    }

    // Note: We don't test delete-all as it would wipe test data
    skipTest(`[${platform}] Delete all user data`, 'Skipped to preserve test data');
}

/**
 * Test connection to server
 */
async function testConnection(baseUrl, platform) {
    try {
        const res = await fetch(`${baseUrl}/health`, { method: 'GET' });
        return res.ok;
    } catch {
        // Try a different endpoint
        try {
            const res = await fetch(`${baseUrl}/api/auth/me`, { method: 'GET' });
            return res.status === 401; // Unauthorized means server is up
        } catch {
            return false;
        }
    }
}

/**
 * Run all tests for a specific platform
 */
async function runPlatformTests(baseUrl, platform) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🧪 Testing ${platform} at ${baseUrl}`);
    console.log(`${'='.repeat(60)}`);

    // Check connection first
    const isConnected = await testConnection(baseUrl, platform);
    if (!isConnected) {
        console.log(`❌ Cannot connect to ${platform} at ${baseUrl}`);
        skipTest(`[${platform}] All tests`, `Server not reachable at ${baseUrl}`);
        return;
    }

    console.log(`✅ Connected to ${platform}`);

    // Run Auth tests
    const { token } = await testAuthAPIs(baseUrl, platform);

    // Run Atome CRUD + ADOLE tests
    await testAtomeAPIs(baseUrl, platform, token);

    // Run User Data tests
    await testUserDataAPIs(baseUrl, platform, token);
}

/**
 * Run complete test suite for both platforms
 */
async function runAllTests() {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║           UNIFIED API TEST SUITE                            ║
║     Testing Auth, CRUD, ADOLE, User-Data APIs               ║
╚════════════════════════════════════════════════════════════╝
    `);

    // Reset results
    results.passed = 0;
    results.failed = 0;
    results.skipped = 0;
    results.tests = [];

    const startTime = Date.now();

    // Test Tauri (Axum) backend
    await runPlatformTests('http://localhost:3000', 'Tauri');

    // Test Fastify backend
    await runPlatformTests('http://localhost:3001', 'Fastify');

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Summary
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📊 TEST SUMMARY`);
    console.log(`${'='.repeat(60)}`);
    console.log(`✅ Passed:  ${results.passed}`);
    console.log(`❌ Failed:  ${results.failed}`);
    console.log(`⏭️ Skipped: ${results.skipped}`);
    console.log(`⏱️ Duration: ${duration}s`);
    console.log(`${'='.repeat(60)}`);

    if (results.failed > 0) {
        console.log(`\n❌ FAILED TESTS:`);
        results.tests
            .filter(t => t.passed === false)
            .forEach(t => console.log(`  - ${t.name}: ${t.error || 'Unknown error'}`));
    }

    return results;
}

// Export for use in browser or Node.js
if (typeof window !== 'undefined') {
    window.runAPITests = runAllTests;
    window.testAuthAPIs = testAuthAPIs;
    window.testAtomeAPIs = testAtomeAPIs;
    window.testUserDataAPIs = testUserDataAPIs;
}

export {
    runAllTests,
    testAuthAPIs,
    testAtomeAPIs,
    testUserDataAPIs,
    results
};

export default runAllTests;
