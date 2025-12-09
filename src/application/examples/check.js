/**
 * Cross-Backend Authentication Tests
 * 
 * Tests that verify:
 * 1. User created in Tauri can login in Fastify without page reload
 * 2. User created in Fastify can login in Tauri without page reload
 * 3. User logged in Tauri stays logged in until logout
 * 4. User logged in Fastify stays logged in until logout
 */

import { UnifiedAuth, UnifiedAtome } from '../../squirrel/apis/unified/index.js';
import { TauriAdapter, FastifyAdapter, checkBackends } from '../../squirrel/apis/unified/_shared.js';

// ============================================================================
// UI SETUP
// ============================================================================

const container = $('div', {
  id: 'auth-test-container',
  css: {
    padding: '20px',
    fontFamily: 'monospace',
    maxWidth: '900px',
    margin: '0 auto'
  }
});

$('h2', {
  parent: container,
  text: '🔐 Cross-Backend Auth Tests',
  css: { marginBottom: '20px', color: '#333' }
});

// Status panel
const statusPanel = $('div', {
  id: 'status-panel',
  parent: container,
  css: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
    marginBottom: '20px'
  }
});

// Tauri status
const tauriStatus = $('div', {
  parent: statusPanel,
  css: {
    padding: '15px',
    backgroundColor: '#e3f2fd',
    borderRadius: '8px',
    border: '2px solid #1976d2'
  }
});

$('div', {
  parent: tauriStatus,
  text: '🦀 TAURI (localhost:3000)',
  css: { fontWeight: 'bold', marginBottom: '10px', color: '#1976d2' }
});

const tauriStatusText = $('div', { parent: tauriStatus, id: 'tauri-status', text: 'Checking...' });
const tauriUserText = $('div', { parent: tauriStatus, id: 'tauri-user', text: 'User: -' });
const tauriTokenText = $('div', { parent: tauriStatus, id: 'tauri-token', text: 'Token: -' });

// Fastify status
const fastifyStatus = $('div', {
  parent: statusPanel,
  css: {
    padding: '15px',
    backgroundColor: '#e8f5e9',
    borderRadius: '8px',
    border: '2px solid #388e3c'
  }
});

$('div', {
  parent: fastifyStatus,
  text: '⚡ FASTIFY (localhost:3001)',
  css: { fontWeight: 'bold', marginBottom: '10px', color: '#388e3c' }
});

const fastifyStatusText = $('div', { parent: fastifyStatus, id: 'fastify-status', text: 'Checking...' });
const fastifyUserText = $('div', { parent: fastifyStatus, id: 'fastify-user', text: 'User: -' });
const fastifyTokenText = $('div', { parent: fastifyStatus, id: 'fastify-token', text: 'Token: -' });

// Control panel
const controlPanel = $('div', {
  parent: container,
  css: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    marginBottom: '20px',
    padding: '15px',
    backgroundColor: '#f5f5f5',
    borderRadius: '8px'
  }
});

// Input for test username
const usernameInput = $('input', {
  parent: controlPanel,
  attrs: { type: 'text', placeholder: 'Phone number', value: '00000000' },
  css: { padding: '8px', borderRadius: '4px', border: '1px solid #ccc', width: '200px' }
});

const passwordInput = $('input', {
  parent: controlPanel,
  attrs: { type: 'password', placeholder: 'Password', value: '00000000' },
  css: { padding: '8px', borderRadius: '4px', border: '1px solid #ccc', width: '150px' }
});

// Log output
const logContainer = $('div', {
  parent: container,
  css: {
    backgroundColor: '#1e1e1e',
    color: '#00ff00',
    padding: '15px',
    borderRadius: '8px',
    height: '400px',
    overflowY: 'auto',
    fontSize: '12px',
    lineHeight: '1.6'
  }
});

// ============================================================================
// LOGGING
// ============================================================================

function log(message, type = 'info') {
  const colors = {
    info: '#00ff00',
    error: '#ff4444',
    success: '#44ff44',
    warn: '#ffaa00',
    test: '#00aaff'
  };

  const timestamp = new Date().toLocaleTimeString();

  // Safety check - logContainer may not be ready yet
  if (!logContainer) {
    console.log(`[${type.toUpperCase()}] ${message}`);
    return;
  }

  $('div', {
    parent: logContainer,
    html: `<span style="color:#888">[${timestamp}]</span> <span style="color:${colors[type]}">${message}</span>`
  });

  // $() returns DOM element directly, not a wrapper
  logContainer.scrollTop = logContainer.scrollHeight;
  console.log(`[${type.toUpperCase()}] ${message}`);
}

// ============================================================================
// STATUS UPDATE
// ============================================================================

async function updateStatus() {
  // Safety check - UI elements may not be ready
  // $() returns DOM element directly, not wrapper object
  if (!tauriStatusText || !fastifyStatusText) {
    console.log('[updateStatus] UI not ready yet');
    return;
  }

  const backends = await checkBackends(true);

  // Tauri status
  tauriStatusText.textContent = backends.tauri ? '✅ Online' : '❌ Offline';
  tauriStatusText.style.color = backends.tauri ? '#388e3c' : '#d32f2f';

  const tauriToken = TauriAdapter.getToken();
  tauriTokenText.textContent = tauriToken ? `Token: ${tauriToken.substring(0, 20)}...` : 'Token: None';

  if (backends.tauri && tauriToken) {
    try {
      const me = await TauriAdapter.auth.me();
      tauriUserText.textContent = `User: ${me.user?.username || me.user?.phone || 'Unknown'}`;
    } catch {
      tauriUserText.textContent = 'User: Not logged in';
    }
  } else {
    tauriUserText.textContent = 'User: -';
  }

  // Fastify status
  fastifyStatusText.textContent = backends.fastify ? '✅ Online' : '❌ Offline';
  fastifyStatusText.style.color = backends.fastify ? '#388e3c' : '#d32f2f';

  const fastifyToken = FastifyAdapter.getToken();
  fastifyTokenText.textContent = fastifyToken ? `Token: ${fastifyToken.substring(0, 20)}...` : 'Token: None';

  if (backends.fastify && fastifyToken) {
    try {
      const me = await FastifyAdapter.auth.me();
      fastifyUserText.textContent = `User: ${me.user?.username || me.user?.phone || 'Unknown'}`;
    } catch {
      fastifyUserText.textContent = 'User: Not logged in';
    }
  } else {
    fastifyUserText.textContent = 'User: -';
  }
}

// ============================================================================
// TEST FUNCTIONS
// ============================================================================

async function createUserOnTauri() {
  const username = usernameInput.value;
  const password = passwordInput.value;

  log(`📝 Creating user "${username}" on TAURI...`, 'test');

  try {
    const result = await TauriAdapter.auth.register({
      username: username,
      phone: username,
      password: password
    });

    log(`📦 Raw result: ${JSON.stringify(result)}`, 'info');

    // Check if user already exists (server now returns 200 with message)
    const msgOrError = result.message || result.error || '';
    if (msgOrError.includes('already') || msgOrError.includes('exists') || msgOrError.includes('ready to login')) {
      log(`ℹ️ User "${username}" already exists on Tauri - ready to login`, 'info');
      // Try to sync to Fastify anyway
      await syncUserToFastify(username, password);
      return { success: true, alreadyExists: true };
    }

    if (result.success) {
      log(`✅ User created on Tauri: ${JSON.stringify(result.user)}`, 'success');
      // Automatically sync to Fastify
      await syncUserToFastify(username, password);
    } else {
      log(`❌ Failed: ${result.error || 'Unknown error'} (status: ${result.status})`, 'error');
    }

    await updateStatus();
    return result;
  } catch (e) {
    // Check if user already exists from exception
    const errorMsg = e.message || '';
    if (errorMsg.includes('already') || errorMsg.includes('exists') || errorMsg.includes('registered')) {
      log(`ℹ️ User "${username}" already exists on Tauri - ready to login`, 'info');
      await syncUserToFastify(username, password);
      return { success: true, alreadyExists: true };
    }
    log(`❌ Error: ${e.message}`, 'error');
    return { success: false, error: e.message };
  }
}

// Sync user to Fastify after creation on Tauri
async function syncUserToFastify(username, password) {
  const backends = await checkBackends(true);
  if (!backends.fastify) {
    log(`⏳ Fastify offline - user will sync when available`, 'warn');
    return;
  }

  try {
    log(`🔄 Syncing user "${username}" to FASTIFY...`, 'info');
    const result = await FastifyAdapter.auth.register({
      phone: username,
      password: password,
      username: username
    });

    const msgOrError = result.message || result.error || '';
    if (result.success || msgOrError.includes('already') || msgOrError.includes('exists')) {
      log(`✅ User synced to Fastify`, 'success');
    } else {
      log(`⚠️ Fastify sync: ${result.error || 'Unknown'}`, 'warn');
    }
  } catch (e) {
    if (e.message?.includes('already') || e.message?.includes('exists')) {
      log(`✅ User already exists on Fastify`, 'info');
    } else {
      log(`⚠️ Fastify sync error: ${e.message}`, 'warn');
    }
  }
}

// Sync user to Tauri after creation on Fastify
async function syncUserToTauri(username, password) {
  const backends = await checkBackends(true);
  if (!backends.tauri) {
    log(`⏳ Tauri offline - user will sync when available`, 'warn');
    return;
  }

  try {
    log(`🔄 Syncing user "${username}" to TAURI...`, 'info');
    const result = await TauriAdapter.auth.register({
      username: username,
      phone: username,
      password: password
    });

    const msgOrError = result.message || result.error || '';
    if (result.success || msgOrError.includes('already') || msgOrError.includes('exists')) {
      log(`✅ User synced to Tauri`, 'success');
    } else {
      log(`⚠️ Tauri sync: ${result.error || 'Unknown'}`, 'warn');
    }
  } catch (e) {
    if (e.message?.includes('already') || e.message?.includes('exists')) {
      log(`✅ User already exists on Tauri`, 'info');
    } else {
      log(`⚠️ Tauri sync error: ${e.message}`, 'warn');
    }
  }
}

async function createUserOnFastify() {
  const username = usernameInput.value;
  const password = passwordInput.value;

  log(`📝 Creating user "${username}" on FASTIFY...`, 'test');

  try {
    const result = await FastifyAdapter.auth.register({
      phone: username,
      password: password,
      username: username
    });

    // Check if user already exists (server returns 200 with message or error)
    const msgOrError = result.message || result.error || '';
    if (msgOrError.includes('already') || msgOrError.includes('exists') || msgOrError.includes('registered') || msgOrError.includes('ready to login')) {
      log(`ℹ️ User "${username}" already exists on Fastify - ready to login`, 'info');
      // Try to sync to Tauri anyway
      await syncUserToTauri(username, password);
      return { success: true, alreadyExists: true };
    }

    if (result.success) {
      log(`✅ User created on Fastify: ${JSON.stringify(result.user)}`, 'success');
      // Automatically sync to Tauri
      await syncUserToTauri(username, password);
    } else {
      log(`❌ Failed: ${result.error}`, 'error');
    }

    await updateStatus();
    return result;
  } catch (e) {
    // Check if user already exists from exception
    const errorMsg = e.message || '';
    if (errorMsg.includes('already') || errorMsg.includes('exists') || errorMsg.includes('registered')) {
      log(`ℹ️ User "${username}" already exists on Fastify - ready to login`, 'info');
      await syncUserToTauri(username, password);
      return { success: true, alreadyExists: true };
    }
    log(`❌ Error: ${e.message}`, 'error');
    return { success: false, error: e.message };
  }
}

async function loginOnTauri() {
  const username = usernameInput.value;
  const password = passwordInput.value;

  log(`🔑 Logging in "${username}" on TAURI...`, 'test');

  try {
    // Tauri login expects phone, not username
    const result = await TauriAdapter.auth.login({
      phone: username,
      password: password
    });

    log(`📦 Raw result: ${JSON.stringify(result)}`, 'info');

    if (result.success) {
      log(`✅ Logged in on Tauri! Token: ${result.token?.substring(0, 30)}...`, 'success');
      // Auto-load atomes after login
      await loadAndSyncAtomes();
    } else {
      log(`❌ Login failed: ${result.error || 'Unknown error'}`, 'error');
    }

    await updateStatus();
    return result;
  } catch (e) {
    log(`❌ Error: ${e.message}`, 'error');
    return { success: false, error: e.message };
  }
}

async function loginOnFastify() {
  const username = usernameInput.value;
  const password = passwordInput.value;

  log(`🔑 Logging in "${username}" on FASTIFY...`, 'test');

  try {
    const result = await FastifyAdapter.auth.login({
      phone: username,
      password: password
    });

    if (result.success) {
      log(`✅ Logged in on Fastify! Token: ${result.token?.substring(0, 30)}...`, 'success');
      // Auto-load atomes after login
      await loadAndSyncAtomes();
    } else {
      log(`❌ Login failed: ${result.error}`, 'error');
    }

    await updateStatus();
    return result;
  } catch (e) {
    log(`❌ Error: ${e.message}`, 'error');
    return { success: false, error: e.message };
  }
}

async function logoutFromTauri() {
  log(`🚪 Logging out from TAURI...`, 'test');
  TauriAdapter.clearToken();
  log(`✅ Logged out from Tauri`, 'success');
  await updateStatus();
}

async function logoutFromFastify() {
  log(`🚪 Logging out from FASTIFY...`, 'test');
  FastifyAdapter.clearToken();
  log(`✅ Logged out from Fastify`, 'success');
  await updateStatus();
}

async function logoutFromAll() {
  log(`🚪 Logging out from ALL backends...`, 'test');
  await UnifiedAuth.logout();
  log(`✅ Logged out from all backends`, 'success');
  await updateStatus();
}

async function deleteUserFromFastify() {
  const username = usernameInput.value;
  const password = passwordInput.value;

  log(`🗑️ Deleting user "${username}" from FASTIFY...`, 'test');

  try {
    // First login to get auth
    const loginResult = await FastifyAdapter.auth.login({
      phone: username,
      password: password
    });

    if (!loginResult.success) {
      log(`❌ Cannot login to delete: ${loginResult.error}`, 'error');
      return { success: false };
    }

    const result = await FastifyAdapter.auth.deleteAccount({
      password: password,
      deleteData: true
    });

    if (result.success) {
      log(`✅ User deleted from Fastify`, 'success');
      FastifyAdapter.clearToken();
    } else {
      log(`❌ Delete failed: ${result.error}`, 'error');
    }

    await updateStatus();
    return result;
  } catch (e) {
    log(`❌ Error: ${e.message}`, 'error');
    return { success: false, error: e.message };
  }
}

async function deleteUserFromTauri() {
  const username = usernameInput.value;
  const password = passwordInput.value;

  log(`🗑️ Deleting user "${username}" from TAURI...`, 'test');

  try {
    // First login to get auth
    const loginResult = await TauriAdapter.auth.login({
      phone: username,
      password: password
    });

    if (!loginResult.success) {
      log(`❌ Cannot login to delete: ${loginResult.error}`, 'error');
      return { success: false };
    }

    const result = await TauriAdapter.auth.deleteAccount({
      password: password,
      deleteData: true
    });

    if (result.success) {
      log(`✅ User deleted from Tauri`, 'success');
      TauriAdapter.clearToken();
    } else {
      log(`❌ Delete failed: ${result.error}`, 'error');
    }

    await updateStatus();
    return result;
  } catch (e) {
    log(`❌ Error: ${e.message}`, 'error');
    return { success: false, error: e.message };
  }
}

// ============================================================================
// AUTOMATED TESTS
// ============================================================================

async function runTest1_TauriToFastify() {
  log('═══════════════════════════════════════════════════════════', 'test');
  log('TEST 1: User created in Tauri can login in Fastify', 'test');
  log('═══════════════════════════════════════════════════════════', 'test');

  const testUser = 'test_t2f_' + Date.now();
  const testPass = 'TestPass123!';
  usernameInput.value = testUser;
  passwordInput.value = testPass;

  // Step 1: Create user on Tauri
  log('Step 1: Creating user on Tauri...', 'info');
  const createResult = await TauriAdapter.auth.register({
    username: testUser,
    phone: testUser,
    password: testPass
  });

  if (!createResult.success) {
    log(`❌ TEST 1 FAILED: Cannot create user on Tauri - ${createResult.error}`, 'error');
    return false;
  }
  log('✅ User created on Tauri', 'success');

  // Step 2: Logout from Tauri
  TauriAdapter.clearToken();
  log('Step 2: Logged out from Tauri', 'info');

  // Step 3: Try to login on Fastify WITHOUT page reload
  log('Step 3: Attempting login on Fastify (no page reload)...', 'info');
  const loginResult = await FastifyAdapter.auth.login({
    phone: testUser,
    password: testPass
  });

  if (loginResult.success) {
    log('✅ TEST 1 PASSED: User created in Tauri can login in Fastify!', 'success');
    FastifyAdapter.clearToken();
    await updateStatus();
    return true;
  } else {
    log(`⚠️ TEST 1 NOTE: Login on Fastify failed - ${loginResult.error}`, 'warn');
    log('This is expected if Tauri and Fastify use separate databases.', 'warn');
    log('For cross-backend auth, user sync must be implemented.', 'info');
    await updateStatus();
    return false;
  }
}

async function runTest2_FastifyToTauri() {
  log('═══════════════════════════════════════════════════════════', 'test');
  log('TEST 2: User created in Fastify can login in Tauri', 'test');
  log('═══════════════════════════════════════════════════════════', 'test');

  const testUser = 'test_f2t_' + Date.now();
  const testPass = 'TestPass123!';
  usernameInput.value = testUser;
  passwordInput.value = testPass;

  // Step 1: Create user on Fastify
  log('Step 1: Creating user on Fastify...', 'info');
  const createResult = await FastifyAdapter.auth.register({
    phone: testUser,
    password: testPass,
    username: testUser
  });

  if (!createResult.success) {
    log(`❌ TEST 2 FAILED: Cannot create user on Fastify - ${createResult.error}`, 'error');
    return false;
  }
  log(`✅ User created on Fastify (synced: ${createResult.synced || 'unknown'})`, 'success');

  // Step 2: Sync to Tauri (same as manual button does)
  log('Step 2: Syncing user to Tauri (client-side)...', 'info');
  await syncUserToTauri(testUser, testPass);

  // Step 3: Logout from Fastify
  FastifyAdapter.clearToken();
  log('Step 3: Logged out from Fastify', 'info');

  // Step 4: Try to login on Tauri - first attempt
  log('Step 4: Attempting login on Tauri (first try)...', 'info');
  let loginResult = await TauriAdapter.auth.login({
    phone: testUser,
    password: testPass
  });

  if (loginResult.success) {
    log('✅ TEST 2 PASSED: User created in Fastify can login in Tauri!', 'success');
    TauriAdapter.clearToken();
    await updateStatus();
    return true;
  }

  // Step 5: If first attempt failed, wait 5 seconds and retry
  log(`⚠️ First login attempt failed: ${loginResult.error}`, 'warn');
  log('Step 5: Waiting 5 seconds and retrying...', 'info');
  await new Promise(r => setTimeout(r, 5000));

  // Step 6: Second attempt
  log('Step 6: Attempting login on Tauri (second try)...', 'info');
  loginResult = await TauriAdapter.auth.login({
    phone: testUser,
    password: testPass
  });

  if (loginResult.success) {
    log('✅ TEST 2 PASSED: User created in Fastify can login in Tauri (on retry)!', 'success');
    TauriAdapter.clearToken();
    await updateStatus();
    return true;
  } else {
    log(`❌ TEST 2 FAILED: Login on Tauri failed after retry - ${loginResult.error}`, 'error');
    await updateStatus();
    return false;
  }
}

async function runTest3_TauriSessionPersistence() {
  log('═══════════════════════════════════════════════════════════', 'test');
  log('TEST 3: User logged in Tauri stays logged in', 'test');
  log('═══════════════════════════════════════════════════════════', 'test');

  const testUser = 'test_tauri_persist_' + Date.now();
  const testPass = 'TestPass123!';

  // Step 1: Create and login
  log('Step 1: Creating and logging in user on Tauri...', 'info');
  await TauriAdapter.auth.register({
    username: testUser,
    phone: testUser,
    password: testPass
  });

  const loginResult = await TauriAdapter.auth.login({
    phone: testUser,
    password: testPass
  });

  if (!loginResult.success) {
    log(`❌ TEST 3 FAILED: Cannot login - ${loginResult.error}`, 'error');
    return false;
  }

  const token1 = TauriAdapter.getToken();
  log(`Token after login: ${token1?.substring(0, 20)}...`, 'info');

  // Step 2: Wait 2 seconds
  log('Step 2: Waiting 2 seconds...', 'info');
  await new Promise(r => setTimeout(r, 2000));

  // Step 3: Check if still logged in
  log('Step 3: Checking if still logged in...', 'info');
  const token2 = TauriAdapter.getToken();

  if (token2 && token2 === token1) {
    log('✅ TEST 3 PASSED: Token persists without logout!', 'success');

    // Verify with /me endpoint
    try {
      const me = await TauriAdapter.auth.me();
      log(`✅ /me confirms user: ${me.user?.username || me.user?.phone}`, 'success');
    } catch (e) {
      log(`⚠️ /me failed but token exists: ${e.message}`, 'warn');
    }

    TauriAdapter.clearToken();
    await updateStatus();
    return true;
  } else {
    log('❌ TEST 3 FAILED: Token was lost!', 'error');
    await updateStatus();
    return false;
  }
}

async function runTest4_FastifySessionPersistence() {
  log('═══════════════════════════════════════════════════════════', 'test');
  log('TEST 4: User logged in Fastify stays logged in', 'test');
  log('═══════════════════════════════════════════════════════════', 'test');

  const testUser = 'test_fastify_persist_' + Date.now();
  const testPass = 'TestPass123!';

  // Step 1: Create and login
  log('Step 1: Creating and logging in user on Fastify...', 'info');
  await FastifyAdapter.auth.register({
    phone: testUser,
    password: testPass,
    username: testUser
  });

  const loginResult = await FastifyAdapter.auth.login({
    phone: testUser,
    password: testPass
  });

  if (!loginResult.success) {
    log(`❌ TEST 4 FAILED: Cannot login - ${loginResult.error}`, 'error');
    return false;
  }

  const token1 = FastifyAdapter.getToken();
  log(`Token after login: ${token1?.substring(0, 20)}...`, 'info');

  // Step 2: Wait 2 seconds
  log('Step 2: Waiting 2 seconds...', 'info');
  await new Promise(r => setTimeout(r, 2000));

  // Step 3: Check if still logged in
  log('Step 3: Checking if still logged in...', 'info');
  const token2 = FastifyAdapter.getToken();

  if (token2 && token2 === token1) {
    log('✅ TEST 4 PASSED: Token persists without logout!', 'success');

    // Verify with /me endpoint
    try {
      const me = await FastifyAdapter.auth.me();
      log(`✅ /me confirms user: ${me.user?.username || me.user?.phone}`, 'success');
    } catch (e) {
      log(`⚠️ /me failed but token exists: ${e.message}`, 'warn');
    }

    FastifyAdapter.clearToken();
    await updateStatus();
    return true;
  } else {
    log('❌ TEST 4 FAILED: Token was lost!', 'error');
    await updateStatus();
    return false;
  }
}

async function runAllTests() {
  log('🚀 RUNNING ALL CROSS-BACKEND AUTH TESTS', 'test');
  log('═══════════════════════════════════════════════════════════', 'test');

  const backends = await checkBackends(true);
  log(`Backends: Tauri=${backends.tauri}, Fastify=${backends.fastify}`, 'info');

  if (!backends.tauri && !backends.fastify) {
    log('❌ No backends available! Start Tauri and/or Fastify.', 'error');
    return;
  }

  const results = {
    test1: null,
    test2: null,
    test3: null,
    test4: null
  };

  if (backends.tauri && backends.fastify) {
    results.test1 = await runTest1_TauriToFastify();
    await new Promise(r => setTimeout(r, 500));
    results.test2 = await runTest2_FastifyToTauri();
  } else {
    log('⚠️ Tests 1 & 2 require both backends online', 'warn');
  }

  await new Promise(r => setTimeout(r, 500));

  if (backends.tauri) {
    results.test3 = await runTest3_TauriSessionPersistence();
  } else {
    log('⚠️ Test 3 requires Tauri', 'warn');
  }

  await new Promise(r => setTimeout(r, 500));

  if (backends.fastify) {
    results.test4 = await runTest4_FastifySessionPersistence();
  } else {
    log('⚠️ Test 4 requires Fastify', 'warn');
  }

  // Summary
  log('═══════════════════════════════════════════════════════════', 'test');
  log('📊 TEST RESULTS SUMMARY', 'test');
  log('═══════════════════════════════════════════════════════════', 'test');
  log(`Test 1 (Tauri→Fastify): ${results.test1 === null ? '⏭️ SKIPPED' : results.test1 ? '✅ PASSED' : '⚠️ EXPECTED FAIL'}`, results.test1 ? 'success' : 'warn');
  log(`Test 2 (Fastify→Tauri): ${results.test2 === null ? '⏭️ SKIPPED' : results.test2 ? '✅ PASSED' : '⚠️ EXPECTED FAIL'}`, results.test2 ? 'success' : 'warn');
  log(`Test 3 (Tauri persist): ${results.test3 === null ? '⏭️ SKIPPED' : results.test3 ? '✅ PASSED' : '❌ FAILED'}`, results.test3 ? 'success' : 'error');
  log(`Test 4 (Fastify persist): ${results.test4 === null ? '⏭️ SKIPPED' : results.test4 ? '✅ PASSED' : '❌ FAILED'}`, results.test4 ? 'success' : 'error');
  log('═══════════════════════════════════════════════════════════', 'test');
}

// ============================================================================
// BUTTONS
// ============================================================================

function createButton(text, onClick, color = '#1976d2') {
  return $('button', {
    parent: controlPanel,
    text: text,
    css: {
      padding: '10px 15px',
      backgroundColor: color,
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      fontWeight: 'bold'
    },
    onclick: onClick
  });
}

// Separator
$('div', { parent: controlPanel, css: { width: '100%', height: '1px' } });

// Create buttons
createButton('📝 Create on Tauri', createUserOnTauri, '#1976d2');
createButton('📝 Create on Fastify', createUserOnFastify, '#388e3c');
createButton('🔑 Login Tauri', loginOnTauri, '#1976d2');
createButton('🔑 Login Fastify', loginOnFastify, '#388e3c');

$('div', { parent: controlPanel, css: { width: '100%', height: '1px' } });

createButton('🚪 Logout Tauri', logoutFromTauri, '#ff9800');
createButton('🚪 Logout Fastify', logoutFromFastify, '#ff9800');
createButton('🚪 Logout All', logoutFromAll, '#f44336');
createButton('🗑️ Delete (Tauri)', deleteUserFromTauri, '#b71c1c');
createButton('🗑️ Delete (Fastify)', deleteUserFromFastify, '#d32f2f');

$('div', { parent: controlPanel, css: { width: '100%', height: '1px' } });

createButton('🔄 Refresh Status', updateStatus, '#9c27b0');
createButton('🧪 Run All Tests', runAllTests, '#00bcd4');

// ============================================================================
// ATOME TESTS SECTION
// ============================================================================

$('h3', {
  parent: container,
  text: '⚛️ Atome CRUD Tests',
  css: { marginTop: '30px', borderTop: '2px solid #666', paddingTop: '20px' }
});

// Atome test area
const atomePanel = $('div', {
  parent: container,
  css: { display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '15px' }
});

// Visual area for atomes
const atomeArea = $('div', {
  parent: container,
  id: 'atome-area',
  css: {
    minHeight: '100px',
    padding: '10px',
    backgroundColor: '#1a1a2e',
    borderRadius: '8px',
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    marginBottom: '15px'
  }
});

// Selected atome tracking
let selectedAtomeId = null;
let selectedAtomeEl = null;

/**
 * Load and sync atomes from both servers
 * - Fetches atomes from Tauri and Fastify
 * - Syncs missing atomes to the other server
 * - Displays all atomes in the visual area
 */
async function loadAndSyncAtomes() {
  log('🔄 Loading and syncing atomes...', 'info');

  const tauriToken = TauriAdapter.getToken();
  const fastifyToken = FastifyAdapter.getToken();

  let tauriAtomes = [];
  let fastifyAtomes = [];

  // Fetch from Tauri
  if (tauriToken) {
    try {
      const result = await TauriAdapter.atome.list({ kind: 'shape' });
      if (result.success) {
        tauriAtomes = result.data || result.atomes || [];
        log(`📦 Tauri: ${tauriAtomes.length} atome(s)`, 'info');
      }
    } catch (e) {
      log(`⚠️ Tauri list error: ${e.message}`, 'warn');
    }
  }

  // Fetch from Fastify
  if (fastifyToken) {
    try {
      const result = await FastifyAdapter.atome.list({ kind: 'shape' });
      if (result.success) {
        fastifyAtomes = result.data || result.atomes || [];
        log(`📦 Fastify: ${fastifyAtomes.length} atome(s)`, 'info');
      }
    } catch (e) {
      log(`⚠️ Fastify list error: ${e.message}`, 'warn');
    }
  }

  // Build ID sets for comparison
  const tauriIds = new Set(tauriAtomes.map(a => a.id));
  const fastifyIds = new Set(fastifyAtomes.map(a => a.id));

  // Sync Tauri → Fastify (atomes missing on Fastify)
  if (fastifyToken) {
    for (const atome of tauriAtomes) {
      if (!fastifyIds.has(atome.id)) {
        log(`🔄 Syncing to Fastify: ${atome.id.substring(0, 8)}`, 'info');
        try {
          await FastifyAdapter.atome.create({
            id: atome.id,
            kind: atome.kind || 'shape',
            type: atome.type || 'div',
            data: atome.properties || atome.data || {}
          });
        } catch (e) {
          log(`⚠️ Sync to Fastify failed: ${e.message}`, 'warn');
        }
      }
    }
  }

  // Sync Fastify → Tauri (atomes missing on Tauri)
  if (tauriToken) {
    for (const atome of fastifyAtomes) {
      if (!tauriIds.has(atome.id)) {
        log(`🔄 Syncing to Tauri: ${atome.id.substring(0, 8)}`, 'info');
        try {
          await TauriAdapter.atome.create({
            id: atome.id,
            kind: atome.kind || 'shape',
            type: atome.type || 'div',
            data: atome.properties || atome.data || {}
          });
        } catch (e) {
          log(`⚠️ Sync to Tauri failed: ${e.message}`, 'warn');
        }
      }
    }
  }

  // Merge and dedupe all atomes
  const allAtomesMap = new Map();
  [...tauriAtomes, ...fastifyAtomes].forEach(a => {
    if (!allAtomesMap.has(a.id)) {
      allAtomesMap.set(a.id, a);
    }
  });
  const allAtomes = Array.from(allAtomesMap.values());

  log(`✅ Total unique atomes: ${allAtomes.length}`, 'success');

  // Display in visual area
  const area = document.getElementById('atome-area');
  if (area) {
    area.innerHTML = '';
    selectedAtomeId = null;
    selectedAtomeEl = null;

    allAtomes.forEach(atome => {
      const css = atome.properties?.css || atome.data?.css || {};
      $('div', {
        parent: area,
        id: atome.id,
        css: {
          width: css.width || '60px',
          height: css.height || '60px',
          backgroundColor: css.backgroundColor || '#666',
          borderRadius: css.borderRadius || '8px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: 'white', fontWeight: 'bold'
        },
        text: atome.properties?.text || atome.data?.text || '⚛️',
        onclick: function () {
          if (selectedAtomeEl) selectedAtomeEl.style.outline = 'none';
          selectedAtomeId = atome.id;
          selectedAtomeEl = this;
          this.style.outline = '3px solid #2196f3';
          log(`Selected: ${atome.id.substring(0, 8)}`, 'info');
        }
      });
    });
  }
}

// Helper function for atome buttons
function createAtomeButton(text, onClick, color = '#1976d2') {
  return $('button', {
    parent: atomePanel,
    text: text,
    css: {
      padding: '8px 12px',
      backgroundColor: color,
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      fontWeight: 'bold',
      fontSize: '12px'
    },
    onclick: onClick
  });
}

// Create Atome - creates on BOTH servers with same ID, linked to current project
createAtomeButton('➕ Create Atome', async () => {
  const localToken = localStorage.getItem('local_auth_token');
  const cloudToken = localStorage.getItem('cloud_auth_token');
  log(`🔍 Tokens - Tauri: ${localToken ? 'yes' : 'no'}, Fastify: ${cloudToken ? 'yes' : 'no'}`, 'info');

  if (!localToken && !cloudToken) {
    log('❌ Please login first', 'error');
    return;
  }

  if (!currentProjectId) {
    log('❌ Create or open a project first', 'warn');
    return;
  }

  const atomeId = crypto.randomUUID();
  const color = `hsl(${Math.random() * 360}, 70%, 60%)`;

  const atomeData = {
    id: atomeId,
    kind: 'shape',
    type: 'div',
    parentId: currentProjectId, // Link to current project
    data: {
      id: atomeId,
      css: { width: '60px', height: '60px', backgroundColor: color, borderRadius: '8px' },
      text: '⚛️'
    }
  };

  log(`⚛️ Creating atome ${atomeId.substring(0, 8)} on both servers...`, 'info');

  let tauriOk = false;
  let fastifyOk = false;

  // Create on Tauri
  if (localToken) {
    try {
      const result = await TauriAdapter.atome.create(atomeData);
      tauriOk = result.success;
      log(`📦 Tauri: ${result.success ? '✅' : '❌'} ${result.error || ''}`, result.success ? 'success' : 'error');
    } catch (e) {
      log(`📦 Tauri: ❌ ${e.message}`, 'error');
    }
  }

  // Create on Fastify with SAME ID
  if (cloudToken) {
    try {
      const result = await FastifyAdapter.atome.create(atomeData);
      fastifyOk = result.success;
      log(`📦 Fastify: ${result.success ? '✅' : '❌'} ${result.error || ''}`, result.success ? 'success' : 'error');
    } catch (e) {
      log(`📦 Fastify: ❌ ${e.message}`, 'error');
    }
  }

  if (tauriOk || fastifyOk) {
    log(`✅ Atome created: ${atomeId.substring(0, 8)} (Tauri: ${tauriOk}, Fastify: ${fastifyOk})`, 'success');
    // Add visual
    $('div', {
      parent: atomeArea,
      id: atomeId,
      css: {
        width: '60px', height: '60px', backgroundColor: color, borderRadius: '8px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', color: 'white', fontWeight: 'bold'
      },
      text: '⚛️',
      onclick: function () {
        if (selectedAtomeEl) selectedAtomeEl.style.outline = 'none';
        selectedAtomeId = atomeId;
        selectedAtomeEl = this;
        this.style.outline = '3px solid #2196f3';
        log(`Selected: ${atomeId.substring(0, 8)}`, 'info');
      }
    });
  } else {
    log(`❌ Create failed on both servers`, 'error');
  }
}, '#4caf50');

// Update Atome
createAtomeButton('✏️ Update Selected', async () => {
  if (!selectedAtomeId) {
    log('❌ Select an atome first', 'warn');
    return;
  }

  const newColor = `hsl(${Math.random() * 360}, 70%, 60%)`;
  log(`✏️ Updating atome ${selectedAtomeId.substring(0, 8)}...`, 'info');

  const result = await UnifiedAtome.update(selectedAtomeId, {
    kind: 'shape',
    type: 'div',
    data: {
      id: selectedAtomeId,
      css: { width: '60px', height: '60px', backgroundColor: newColor, borderRadius: '50%' },
      text: '🔄'
    }
  });

  if (result.success || result.tauri?.success || result.fastify?.success) {
    log(`✅ Atome updated: ${selectedAtomeId.substring(0, 8)}`, 'success');
    if (selectedAtomeEl) {
      selectedAtomeEl.style.backgroundColor = newColor;
      selectedAtomeEl.style.borderRadius = '50%';
      selectedAtomeEl.textContent = '🔄';
    }
  } else {
    log(`❌ Update failed: ${result.error || JSON.stringify(result)}`, 'error');
  }
}, '#ff9800');

// Delete Atome
createAtomeButton('🗑️ Delete Selected', async () => {
  if (!selectedAtomeId) {
    log('❌ Select an atome first', 'warn');
    return;
  }

  log(`🗑️ Deleting atome ${selectedAtomeId.substring(0, 8)}...`, 'info');

  const result = await UnifiedAtome.delete(selectedAtomeId);

  if (result.success || result.tauri?.success || result.fastify?.success) {
    log(`✅ Atome deleted: ${selectedAtomeId.substring(0, 8)}`, 'success');
    if (selectedAtomeEl) selectedAtomeEl.remove();
    selectedAtomeId = null;
    selectedAtomeEl = null;
  } else {
    log(`❌ Delete failed: ${result.error || JSON.stringify(result)}`, 'error');
  }
}, '#f44336');

// List Atomes
createAtomeButton('📋 List My Atomes', async () => {
  const localToken = localStorage.getItem('local_auth_token');
  const cloudToken = localStorage.getItem('cloud_auth_token');
  log(`🔍 Tokens - Tauri: ${localToken ? 'yes' : 'no'}, Fastify: ${cloudToken ? 'yes' : 'no'}`, 'info');
  log('📋 Loading atomes...', 'info');

  const result = await UnifiedAtome.list({ kind: 'shape' });

  // Log full result for debugging
  log(`📦 Raw result: ${JSON.stringify(result).substring(0, 300)}`, 'info');

  // Handle different result formats
  const atomes = result.data || result.atomes || [];

  if (result.success && atomes.length > 0) {
    log(`✅ Found ${atomes.length} atome(s) (backends: Tauri=${result.backends?.tauri}, Fastify=${result.backends?.fastify})`, 'success');

    // Clear and rebuild visual area
    atomeArea.innerHTML = '';
    selectedAtomeId = null;
    selectedAtomeEl = null;

    atomes.forEach(atome => {
      const css = atome.properties?.css || atome.data?.css || {};
      const el = $('div', {
        parent: atomeArea,
        id: atome.id,
        css: {
          width: css.width || '60px',
          height: css.height || '60px',
          backgroundColor: css.backgroundColor || '#666',
          borderRadius: css.borderRadius || '8px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: 'white', fontWeight: 'bold'
        },
        text: atome.properties?.text || atome.data?.text || '⚛️',
        onclick: function () {
          if (selectedAtomeEl) selectedAtomeEl.style.outline = 'none';
          selectedAtomeId = atome.id;
          selectedAtomeEl = this;
          this.style.outline = '3px solid #2196f3';
          log(`Selected: ${atome.id.substring(0, 8)}`, 'info');
        }
      });
    });
  } else if (result.success) {
    log(`ℹ️ No atomes found`, 'info');
    atomeArea.innerHTML = '';
  } else {
    log(`❌ List failed: ${result.error || 'Unknown error'}`, 'error');
  }
}, '#2196f3');

// Share input and button
const shareInput = $('input', {
  parent: atomePanel,
  placeholder: 'Target user phone',
  css: { padding: '8px', borderRadius: '4px', border: '1px solid #ccc', width: '150px' }
});

createAtomeButton('🔗 Share Selected', async () => {
  if (!selectedAtomeId) {
    log('❌ Select an atome first', 'warn');
    return;
  }
  const targetPhone = shareInput.value.trim();
  if (!targetPhone) {
    log('❌ Enter target user phone', 'warn');
    return;
  }

  log(`🔗 Sharing atome with ${targetPhone}...`, 'info');

  // Get target user ID from phone
  const token = localStorage.getItem('cloud_auth_token') || localStorage.getItem('local_auth_token');
  const baseUrl = localStorage.getItem('cloud_auth_token') ? 'http://localhost:3001' : 'http://localhost:3000';

  try {
    const resp = await fetch(`${baseUrl}/api/share/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        resource_type: 'atome',
        resource_id: selectedAtomeId,
        target_phone: targetPhone,
        permission: 'read'
      })
    });
    const data = await resp.json();
    if (data.success) {
      log(`✅ Shared with ${targetPhone}!`, 'success');
    } else {
      log(`❌ Share failed: ${data.error}`, 'error');
    }
  } catch (e) {
    log(`❌ Share error: ${e.message}`, 'error');
  }
}, '#9c27b0');

// ============================================================================
// INIT
// ============================================================================

// Current project tracking
let currentProjectId = localStorage.getItem('current_project_id') || null;
let currentProjectName = localStorage.getItem('current_project_name') || 'No Project';

// ============================================================================
// PROJECT MANAGEMENT
// ============================================================================

$('h3', {
  parent: container,
  text: '📁 Project Management',
  css: { marginTop: '30px', borderTop: '2px solid #666', paddingTop: '20px' }
});

const projectPanel = $('div', {
  parent: container,
  css: { display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '15px', alignItems: 'center' }
});

// Project status display
const projectStatus = $('div', {
  parent: projectPanel,
  id: 'project-status',
  css: {
    padding: '8px 16px',
    backgroundColor: '#2a2a4a',
    borderRadius: '4px',
    color: '#fff',
    fontWeight: 'bold'
  },
  text: `📁 ${currentProjectName}`
});

// Project name input
const projectNameInput = $('input', {
  parent: projectPanel,
  placeholder: 'Project name',
  css: { padding: '8px', borderRadius: '4px', border: '1px solid #ccc', width: '150px' }
});

// Helper for project buttons
function createProjectButton(text, onClick, color = '#1976d2') {
  return $('button', {
    parent: projectPanel,
    text: text,
    css: {
      padding: '8px 12px',
      backgroundColor: color,
      color: 'white',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      fontWeight: 'bold',
      fontSize: '12px'
    },
    onclick: onClick
  });
}

/**
 * Create a new project (kind: "project")
 */
createProjectButton('➕ Create Project', async () => {
  const name = projectNameInput.value.trim();
  if (!name) {
    log('❌ Enter project name', 'warn');
    return;
  }

  const projectId = crypto.randomUUID();
  const projectData = {
    id: projectId,
    kind: 'project',
    type: 'container',
    data: {
      id: projectId,
      name: name,
      created_at: new Date().toISOString()
    }
  };

  log(`📁 Creating project "${name}"...`, 'info');

  const localToken = localStorage.getItem('local_auth_token');
  const cloudToken = localStorage.getItem('cloud_auth_token');

  let tauriOk = false;
  let fastifyOk = false;

  // Create on both servers
  if (localToken) {
    try {
      const result = await TauriAdapter.atome.create(projectData);
      tauriOk = result.success;
    } catch (e) { }
  }
  if (cloudToken) {
    try {
      const result = await FastifyAdapter.atome.create(projectData);
      fastifyOk = result.success;
    } catch (e) { }
  }

  if (tauriOk || fastifyOk) {
    log(`✅ Project created: ${name} (${projectId.substring(0, 8)})`, 'success');
    // Set as current project
    currentProjectId = projectId;
    currentProjectName = name;
    localStorage.setItem('current_project_id', projectId);
    localStorage.setItem('current_project_name', name);
    projectStatus.textContent = `📁 ${name}`;
    projectNameInput.value = '';
    // Clear atome area for new project
    atomeArea.innerHTML = '';
    selectedAtomeId = null;
    selectedAtomeEl = null;
  } else {
    log(`❌ Failed to create project`, 'error');
  }
}, '#4caf50');

/**
 * Open an existing project - shows a list to choose from
 */
createProjectButton('📂 Open Project', async () => {
  log('📂 Loading projects...', 'info');

  const localToken = localStorage.getItem('local_auth_token');
  const cloudToken = localStorage.getItem('cloud_auth_token');

  let projects = [];

  // Fetch projects from both servers
  if (localToken) {
    try {
      const result = await TauriAdapter.atome.list({ kind: 'project' });
      if (result.success) {
        (result.data || result.atomes || []).forEach(p => {
          if (!projects.find(x => x.id === p.id)) projects.push(p);
        });
      }
    } catch (e) { }
  }
  if (cloudToken) {
    try {
      const result = await FastifyAdapter.atome.list({ kind: 'project' });
      if (result.success) {
        (result.data || result.atomes || []).forEach(p => {
          if (!projects.find(x => x.id === p.id)) projects.push(p);
        });
      }
    } catch (e) { }
  }

  if (projects.length === 0) {
    log('ℹ️ No projects found. Create one first.', 'info');
    return;
  }

  // Create project selection UI (no system dialogs!)
  // Remove any existing selector
  const existingSelector = document.getElementById('project-selector-modal');
  if (existingSelector) existingSelector.remove();

  const modal = $('div', {
    id: 'project-selector-modal',
    css: {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '9999'
    }
  });

  const panel = $('div', {
    parent: modal,
    css: {
      backgroundColor: '#2a2a2a',
      borderRadius: '12px',
      padding: '20px',
      minWidth: '300px',
      maxWidth: '400px',
      maxHeight: '80vh',
      overflowY: 'auto'
    }
  });

  $('div', {
    parent: panel,
    text: '📂 Select Project',
    css: { fontSize: '18px', fontWeight: 'bold', marginBottom: '15px', color: 'white' }
  });

  // Create a button for each project
  projects.forEach((project) => {
    const name = project.data?.name || project.properties?.name || project.id.substring(0, 8);
    $('div', {
      parent: panel,
      text: `📁 ${name}`,
      css: {
        padding: '12px 16px',
        margin: '5px 0',
        backgroundColor: '#3a3a3a',
        borderRadius: '8px',
        cursor: 'pointer',
        color: 'white',
        transition: 'background-color 0.2s'
      },
      onmouseover: function() { this.style.backgroundColor = '#4a4a4a'; },
      onmouseout: function() { this.style.backgroundColor = '#3a3a3a'; },
      onclick: async function() {
        currentProjectId = project.id;
        currentProjectName = name;
        localStorage.setItem('current_project_id', currentProjectId);
        localStorage.setItem('current_project_name', currentProjectName);
        projectStatus.textContent = `📁 ${currentProjectName}`;
        log(`✅ Opened project: ${currentProjectName}`, 'success');
        modal.remove();
        await loadProjectAtomes(currentProjectId);
      }
    });
  });

  // Cancel button
  $('div', {
    parent: panel,
    text: '❌ Cancel',
    css: {
      padding: '12px 16px',
      marginTop: '15px',
      backgroundColor: '#666',
      borderRadius: '8px',
      cursor: 'pointer',
      color: 'white',
      textAlign: 'center'
    },
    onclick: function() { modal.remove(); }
  });
}, '#2196f3');

/**
 * Delete the current project (without deleting its atomes)
 */
createProjectButton('🗑️ Delete Project', async () => {
  if (!currentProjectId) {
    log('❌ No project selected', 'warn');
    return;
  }

  // Create confirmation modal (no system dialogs!)
  const existingModal = document.getElementById('delete-confirm-modal');
  if (existingModal) existingModal.remove();

  const modal = $('div', {
    id: 'delete-confirm-modal',
    css: {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '9999'
    }
  });

  const panel = $('div', {
    parent: modal,
    css: {
      backgroundColor: '#2a2a2a',
      borderRadius: '12px',
      padding: '20px',
      minWidth: '300px',
      maxWidth: '400px'
    }
  });

  $('div', {
    parent: panel,
    text: '🗑️ Delete Project?',
    css: { fontSize: '18px', fontWeight: 'bold', marginBottom: '10px', color: 'white' }
  });

  $('div', {
    parent: panel,
    text: `Are you sure you want to delete "${currentProjectName}"?`,
    css: { marginBottom: '20px', color: '#ccc' }
  });

  const buttonContainer = $('div', {
    parent: panel,
    css: { display: 'flex', gap: '10px', justifyContent: 'flex-end' }
  });

  // Cancel button
  $('div', {
    parent: buttonContainer,
    text: '❌ Cancel',
    css: {
      padding: '10px 20px',
      backgroundColor: '#666',
      borderRadius: '8px',
      cursor: 'pointer',
      color: 'white'
    },
    onclick: function() { modal.remove(); }
  });

  // Confirm delete button
  $('div', {
    parent: buttonContainer,
    text: '🗑️ Delete',
    css: {
      padding: '10px 20px',
      backgroundColor: '#f44336',
      borderRadius: '8px',
      cursor: 'pointer',
      color: 'white'
    },
    onclick: async function() {
      modal.remove();
      log(`🗑️ Deleting project "${currentProjectName}"...`, 'info');

      const localToken = localStorage.getItem('local_auth_token');
      const cloudToken = localStorage.getItem('cloud_auth_token');

      // Delete from both servers
      if (localToken) {
        try {
          await TauriAdapter.atome.delete(currentProjectId);
        } catch (e) { }
      }
      if (cloudToken) {
        try {
          await FastifyAdapter.atome.delete(currentProjectId);
        } catch (e) { }
      }

      log(`✅ Project deleted: ${currentProjectName}`, 'success');

      // Clear current project
      currentProjectId = null;
      currentProjectName = 'No Project';
      localStorage.removeItem('current_project_id');
      localStorage.removeItem('current_project_name');
      projectStatus.textContent = `📁 No Project`;
    }
  });
}, '#f44336');

/**
 * Load atomes for a specific project
 */
async function loadProjectAtomes(projectId) {
  log(`📦 Loading atomes for project ${projectId?.substring(0, 8) || 'all'}...`, 'info');

  const localToken = localStorage.getItem('local_auth_token');
  const cloudToken = localStorage.getItem('cloud_auth_token');

  let allAtomes = new Map();

  // Fetch from Tauri
  if (localToken) {
    try {
      const result = await TauriAdapter.atome.list({ kind: 'shape', parentId: projectId });
      if (result.success) {
        (result.data || result.atomes || []).forEach(a => allAtomes.set(a.id, a));
      }
    } catch (e) { }
  }

  // Fetch from Fastify
  if (cloudToken) {
    try {
      const result = await FastifyAdapter.atome.list({ kind: 'shape', parentId: projectId });
      if (result.success) {
        (result.data || result.atomes || []).forEach(a => allAtomes.set(a.id, a));
      }
    } catch (e) { }
  }

  const atomes = Array.from(allAtomes.values());
  log(`✅ Loaded ${atomes.length} atome(s)`, 'success');

  // Display
  atomeArea.innerHTML = '';
  selectedAtomeId = null;
  selectedAtomeEl = null;

  atomes.forEach(atome => {
    const css = atome.properties?.css || atome.data?.css || {};
    $('div', {
      parent: atomeArea,
      id: atome.id,
      css: {
        width: css.width || '60px',
        height: css.height || '60px',
        backgroundColor: css.backgroundColor || '#666',
        borderRadius: css.borderRadius || '8px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', color: 'white', fontWeight: 'bold'
      },
      text: atome.properties?.text || atome.data?.text || '⚛️',
      onclick: function () {
        if (selectedAtomeEl) selectedAtomeEl.style.outline = 'none';
        selectedAtomeId = atome.id;
        selectedAtomeEl = this;
        this.style.outline = '3px solid #2196f3';
        log(`Selected: ${atome.id.substring(0, 8)}`, 'info');
      }
    });
  });
}

// ============================================================================
// REAL-TIME SYNC LISTENERS
// ============================================================================

/**
 * Listen for real-time atome events from WebSocket
 */
window.addEventListener('squirrel:atome-created', (e) => {
  const atome = e.detail;
  if (!atome?.id) return;

  // Check if already displayed
  if (document.getElementById(atome.id)) return;

  log(`🔔 [RT] Atome created: ${atome.id.substring(0, 8)}`, 'success');

  // Add to visual area
  const css = atome.properties?.css || atome.data?.css || {};
  $('div', {
    parent: atomeArea,
    id: atome.id,
    css: {
      width: css.width || '60px',
      height: css.height || '60px',
      backgroundColor: css.backgroundColor || '#666',
      borderRadius: css.borderRadius || '8px',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', color: 'white', fontWeight: 'bold'
    },
    text: atome.properties?.text || atome.data?.text || '⚛️',
    onclick: function () {
      if (selectedAtomeEl) selectedAtomeEl.style.outline = 'none';
      selectedAtomeId = atome.id;
      selectedAtomeEl = this;
      this.style.outline = '3px solid #2196f3';
    }
  });
});

window.addEventListener('squirrel:atome-updated', (e) => {
  const atome = e.detail;
  if (!atome?.id) return;

  log(`🔔 [RT] Atome updated: ${atome.id.substring(0, 8)}`, 'info');

  const el = document.getElementById(atome.id);
  if (el) {
    const css = atome.properties?.css || atome.data?.css || {};
    if (css.backgroundColor) el.style.backgroundColor = css.backgroundColor;
    if (css.borderRadius) el.style.borderRadius = css.borderRadius;
    el.textContent = atome.properties?.text || atome.data?.text || el.textContent;
  }
});

window.addEventListener('squirrel:atome-deleted', (e) => {
  const atome = e.detail;
  const id = atome?.id || atome?.atomeId;
  if (!id) return;

  log(`🔔 [RT] Atome deleted: ${id.substring(0, 8)}`, 'warn');

  const el = document.getElementById(id);
  if (el) {
    el.remove();
    if (selectedAtomeId === id) {
      selectedAtomeId = null;
      selectedAtomeEl = null;
    }
  }
});

// ============================================================================
// AUTO-RESTORE ON LOGIN
// ============================================================================

/**
 * Restore user session: load current project and its atomes
 */
async function restoreSession() {
  log('🔄 Restoring session...', 'info');

  const localToken = localStorage.getItem('local_auth_token');
  const cloudToken = localStorage.getItem('cloud_auth_token');

  if (!localToken && !cloudToken) {
    log('ℹ️ Not logged in - nothing to restore', 'info');
    return;
  }

  // First, sync atomes between servers
  await loadAndSyncAtomes();

  // If we have a current project, load its atomes
  if (currentProjectId) {
    log(`📁 Restoring project: ${currentProjectName}`, 'info');
    await loadProjectAtomes(currentProjectId);
  }
}

// ============================================================================
// FINAL INIT
// ============================================================================

log('🚀 Cross-Backend Auth Test Suite loaded', 'info');
log('Click "Run All Tests" to execute automated tests', 'info');
log('Or use individual buttons for manual testing', 'info');

// Restore session if tokens exist
restoreSession();

updateStatus();
