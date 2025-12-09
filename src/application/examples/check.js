/**
 * Cross-Backend Authentication Tests
 * 
 * Tests that verify:
 * 1. User created in Tauri can login in Fastify without page reload
 * 2. User created in Fastify can login in Tauri without page reload
 * 3. User logged in Tauri stays logged in until logout
 * 4. User logged in Fastify stays logged in until logout
 */

import { UnifiedAuth } from '../../squirrel/apis/unified/index.js';
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
  log('✅ User created on Fastify', 'success');

  // Step 2: Logout from Fastify
  FastifyAdapter.clearToken();
  log('Step 2: Logged out from Fastify', 'info');

  // Step 3: Try to login on Tauri WITHOUT page reload
  log('Step 3: Attempting login on Tauri (no page reload)...', 'info');
  const loginResult = await TauriAdapter.auth.login({
    phone: testUser,
    password: testPass
  });

  if (loginResult.success) {
    log('✅ TEST 2 PASSED: User created in Fastify can login in Tauri!', 'success');
    TauriAdapter.clearToken();
    await updateStatus();
    return true;
  } else {
    log(`⚠️ TEST 2 NOTE: Login on Tauri failed - ${loginResult.error}`, 'warn');
    log('This is expected if Tauri and Fastify use separate databases.', 'warn');
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
// INIT
// ============================================================================

log('🚀 Cross-Backend Auth Test Suite loaded', 'info');
log('Click "Run All Tests" to execute automated tests', 'info');
log('Or use individual buttons for manual testing', 'info');

updateStatus();
