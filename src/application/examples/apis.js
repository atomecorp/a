// /**
//  * Unified API Usage Examples
//  * 
//  * This file demonstrates how to use the Squirrel Framework's unified APIs
//  * for authentication, CRUD operations, and ADOLE (versioned) document management.
//  * 
//  * @module src/application/examples/apis
//  */

// // =============================================================================
// // IMPORTS - Use the unified API layer
// // =============================================================================

// // The unified APIs handle both Tauri (local) and Fastify (cloud) backends
// import {
//     UnifiedAuth,
//     UnifiedAtome,
//     UnifiedUserData,
//     UnifiedSync
// } from '../../squirrel/apis/unified/index.js';

// // =============================================================================
// // CONFIGURATION
// // =============================================================================

// // The unified APIs are singleton objects, not classes
// // They auto-detect available backends (Tauri on port 3000, Fastify on port 3001)
// const auth = UnifiedAuth;
// const atome = UnifiedAtome;
// const userData = UnifiedUserData;
// const sync = UnifiedSync;

// // =============================================================================
// // AUTHENTICATION EXAMPLES
// // =============================================================================

// /**
//  * Example: Complete authentication flow
//  */
// async function authenticationExample() {
//     console.log('🔐 Authentication Examples\n');

//     // 1. Check which servers are available
//     const servers = await auth.checkAvailability();
//     console.log('Available servers:', servers);
//     // { tauri: true, fastify: true }

//     // 2. Register a new user
//     try {
//         const registerResult = await auth.register({
//             phone: '+33612345678',
//             password: 'SecurePassword123!',
//             username: 'john_doe'
//         });
//         console.log('✅ Registered:', registerResult);
//     } catch (error) {
//         if (error.message && error.message.includes('exists')) {
//             console.log('ℹ️ User already exists, proceeding to login');
//         } else {
//             console.log('ℹ️ Registration note:', error.message || error);
//         }
//     }

//     // 3. Login
//     const loginResult = await auth.login({
//         phone: '+33612345678',
//         password: 'SecurePassword123!'
//     });
//     console.log('✅ Logged in:', loginResult.user);

//     // 4. Get current user info
//     const me = await auth.me();
//     console.log('👤 Current user:', me);

//     // 5. Refresh the token (extends expiry)
//     const refreshResult = await auth.refreshToken();
//     console.log('🔄 Token refreshed:', refreshResult.success);

//     // 6. Change password
//     try {
//         await auth.changePassword({
//             currentPassword: 'SecurePassword123!',
//             newPassword: 'NewPassword456!'
//         });
//         console.log('🔑 Password changed');

//         // Change it back for next time
//         await auth.changePassword({
//             currentPassword: 'NewPassword456!',
//             newPassword: 'SecurePassword123!'
//         });
//     } catch (e) {
//         console.log('⚠️ Password change skipped:', e.message);
//     }

//     // 7. Logout
//     await auth.logout();
//     console.log('👋 Logged out');

//     // Re-login for following examples
//     await auth.login({
//         phone: '+33612345678',
//         password: 'SecurePassword123!'
//     });
// }

// // =============================================================================
// // CRUD EXAMPLES - Basic Create, Read, Update, Delete
// // =============================================================================

// /**
//  * Example: Basic CRUD operations
//  */
// async function crudExample() {
//     console.log('\n📦 CRUD Examples\n');

//     // Ensure we're authenticated
//     if (!isAuthenticated()) {
//         await auth.login({
//             username: '+33612345678',
//             password: 'SecurePassword123!'
//         });
//     }

//     // 1. CREATE - Create a new document
//     const doc = await atome.create({
//         kind: 'document',
//         data: {
//             name: 'My First Document',
//             content: 'Hello, this is the initial content.',
//             tags: ['example', 'demo'],
//             priority: 'high'
//         }
//     });
//     console.log('✅ Created:', doc);

//     const docId = doc.atome_id || doc.id;

//     if (!docId) {
//         console.log('⚠️ No document ID returned, skipping remaining CRUD tests');
//         return;
//     }

//     // 2. READ - Get the document by ID
//     const retrieved = await atome.get(docId);
//     console.log('📖 Retrieved:', retrieved);

//     // 3. UPDATE - Update the document (full replacement)
//     const updated = await atome.update(docId, {
//         name: 'My First Document (Updated)',
//         content: 'This content has been updated via PUT.',
//         tags: ['example', 'demo', 'updated'],
//         priority: 'medium'
//     });
//     console.log('✏️ Updated:', updated);

//     // 4. LIST - Get all documents
//     const allDocs = await atome.list();
//     console.log('📋 All documents:', allDocs?.length || 0, 'found');

//     // List with filter
//     const filteredDocs = await atome.list({ kind: 'document' });
//     console.log('🔍 Filtered documents:', filteredDocs?.length || 0, 'found');

//     // 5. DELETE - Delete the document
//     const deleteResult = await atome.delete(docId);
//     console.log('🗑️ Deleted:', deleteResult?.success);
// }

// // =============================================================================
// // ADOLE EXAMPLES - Append-only versioned operations
// // =============================================================================

// /**
//  * Example: ADOLE (Append-only Document Object Lifecycle Engine)
//  * This demonstrates versioned, auditable document management
//  */
// async function adoleExample() {
//     console.log('\n📚 ADOLE Examples (Versioned Operations)\n');

//     // Ensure we're authenticated
//     if (!isAuthenticated()) {
//         await auth.login({
//             username: '+33612345678',
//             password: 'SecurePassword123!'
//         });
//     }

//     // 1. Create a document to work with
//     const doc = await atome.create({
//         kind: 'note',
//         data: {
//             name: 'Meeting Notes',
//             content: 'Version 1: Initial notes',
//             attendees: ['Alice', 'Bob'],
//             status: 'draft'
//         }
//     });
//     console.log('✅ Created note:', doc?.atome_id || doc?.id || doc);

//     const noteId = doc?.atome_id || doc?.id;

//     if (!noteId) {
//         console.log('⚠️ No note ID returned, skipping ADOLE tests');
//         return;
//     }

//     // 2. ALTER - Make incremental changes (each is versioned)
//     // Unlike PUT which replaces everything, ALTER only changes specified properties
//     try {
//         const alterResult = await atome.alter(noteId, [
//             { key: 'content', value: 'Version 2: Added action items', operation: 'set' },
//             { key: 'status', value: 'in-progress', operation: 'set' }
//         ]);
//         console.log('📝 Altered:', alterResult?.alterations_applied || 0, 'properties');

//         // Make more changes to build up history
//         await atome.alter(noteId, [
//             { key: 'content', value: 'Version 3: Finalized notes', operation: 'set' },
//             { key: 'attendees', value: ['Alice', 'Bob', 'Charlie'], operation: 'set' },
//             { key: 'status', value: 'completed', operation: 'set' }
//         ]);
//         console.log('📝 Made more alterations');
//     } catch (e) {
//         console.log('⚠️ Alter not available:', e.message);
//     }

//     // 3. RENAME - Change the document name (special alter operation)
//     try {
//         const renameResult = await atome.rename(noteId, 'Q1 Meeting Notes - Final');
//         console.log('✏️ Renamed:', renameResult?.old_name, '→', renameResult?.new_name);
//     } catch (e) {
//         console.log('⚠️ Rename not available:', e.message);
//     }

//     // 4. HISTORY - Get the complete history of changes
//     try {
//         const fullHistory = await atome.getHistory(noteId);
//         console.log('📜 Full history:', fullHistory?.length || 0, 'changes');

//         // Get history for a specific property
//         const contentHistory = await atome.getHistory(noteId, 'content');
//         console.log('📜 Content history:', contentHistory?.length || 0, 'versions');
//         if (contentHistory && contentHistory.length > 0) {
//             contentHistory.forEach((entry, index) => {
//                 console.log(`   v${index}: "${entry.value}" (${entry.changed_at})`);
//             });

//             // 5. RESTORE - Revert a property to a previous version
//             if (contentHistory.length >= 2) {
//                 const restoreResult = await atome.restore(noteId, 'content', 1);
//                 console.log('⏪ Restored content:', restoreResult?.restored_value);
//             }
//         }
//     } catch (e) {
//         console.log('⚠️ History not available:', e.message);
//     }

//     // Verify the restoration
//     try {
//         const restored = await atome.get(noteId);
//         console.log('✅ Current content after restore:', restored?.properties?.content || restored?.data?.content);
//     } catch (e) {
//         console.log('⚠️ Could not verify restore:', e.message);
//     }

//     // 6. Cleanup - delete the test document
//     try {
//         await atome.delete(noteId);
//         console.log('🗑️ Cleaned up test document');
//     } catch (e) {
//         console.log('⚠️ Cleanup failed:', e.message);
//     }
// }

// // =============================================================================
// // USER DATA MANAGEMENT EXAMPLES
// // =============================================================================

// /**
//  * Example: Export and manage user data (GDPR compliance)
//  */
// async function userDataExample() {
//     console.log('\n👤 User Data Management Examples\n');

//     // Ensure we're authenticated
//     if (!isAuthenticated()) {
//         await auth.login({
//             username: '+33612345678',
//             password: 'SecurePassword123!'
//         });
//     }

//     // 1. Create some test data
//     try {
//         await atome.create({ kind: 'test', data: { name: 'Test 1', value: 42 } });
//         await atome.create({ kind: 'test', data: { name: 'Test 2', value: 100 } });
//     } catch (e) {
//         console.log('⚠️ Could not create test data:', e.message);
//     }

//     // 2. EXPORT - Get all user data (for backup or GDPR requests)
//     try {
//         const exportData = await userData.export();
//         console.log('📦 Exported data:');
//         console.log('   - Export date:', exportData?.exported_at);
//         console.log('   - User ID:', exportData?.user_id);
//         console.log('   - Atomes:', exportData?.atomes?.length || 0);

//         // The export includes full history for each atome
//         if (exportData?.atomes?.length > 0) {
//             console.log('   - First atome:', exportData.atomes[0].atome_id);
//             console.log('   - Properties:', Object.keys(exportData.atomes[0].properties || {}));
//         }
//     } catch (e) {
//         console.log('⚠️ Export not available:', e.message);
//     }

//     // 3. DELETE ALL - Remove all user data (use with caution!)
//     // This is commented out to prevent accidental data loss
//     console.log('ℹ️ deleteAll() is available but commented out for safety');
// }

// // =============================================================================
// // SYNC EXAMPLES
// // =============================================================================

// /**
//  * Example: Synchronization between local and cloud
//  */
// async function syncExample() {
//     console.log('\n🔄 Sync Examples\n');

//     // Ensure we're authenticated
//     if (!isAuthenticated()) {
//         await auth.login({
//             username: '+33612345678',
//             password: 'SecurePassword123!'
//         });
//     }

//     // 1. Check sync status
//     try {
//         const status = await sync.getStatus();
//         console.log('📊 Sync status:');
//         console.log('   - Local atomes:', status?.local_count || 'N/A');
//         console.log('   - Cloud atomes:', status?.cloud_count || 'N/A');
//         console.log('   - Pending upload:', status?.pending_upload || 0);
//         console.log('   - Pending download:', status?.pending_download || 0);
//         console.log('   - Conflicts:', status?.conflicts?.length || 0);
//         console.log('   - Last sync:', status?.last_sync || 'Never');

//         // 2. Trigger manual sync
//         const syncResult = await sync.syncNow();
//         console.log('✅ Sync completed:', syncResult?.success);
//         console.log('   - Uploaded:', syncResult?.uploaded || 0);
//         console.log('   - Downloaded:', syncResult?.downloaded || 0);

//         // 3. Handle conflicts (if any)
//         if (status?.conflicts?.length > 0) {
//             console.log('⚠️ Resolving conflicts...');
//             for (const conflict of status.conflicts) {
//                 // Options: 'keep_local', 'keep_cloud', 'merge'
//                 await sync.resolveConflict(conflict.atome_id, 'keep_local');
//                 console.log('   Resolved:', conflict.atome_id);
//             }
//         }
//     } catch (e) {
//         console.log('⚠️ Sync not available:', e.message);
//     }
// }

// // =============================================================================
// // USING THE LEGACY API (unifiedAtomeSync.js)
// // =============================================================================

// /**
//  * Example: Using the existing UnifiedAtomeSync API
//  * This is the API currently used by the editor and other components
//  */
// async function legacyApiExample() {
//     console.log('\n🔧 Legacy API Examples (UnifiedAtomeSync)\n');

//     // The UnifiedAtomeSync API provides similar functionality
//     // with automatic server detection and fallback

//     // 1. Check server availability
//     const servers = await getServerAvailability();
//     console.log('Available servers:', servers);

//     // 2. Check authentication
//     const authed = isAuthenticated();
//     console.log('Is authenticated:', authed);

//     try {
//         // 3. Create an atome
//         const doc = await UnifiedAtomeSync.create('document', {
//             name: 'Legacy API Test',
//             content: 'Created via UnifiedAtomeSync'
//         });
//         console.log('Created:', doc);

//         const docId = doc?.atome_id || doc?.id;
//         if (!docId) {
//             console.log('⚠️ No document ID, skipping rest of legacy tests');
//             return;
//         }

//         // 4. Update
//         await UnifiedAtomeSync.update(docId, {
//             name: 'Legacy API Test (Updated)',
//             content: 'Updated via UnifiedAtomeSync'
//         });

//         // 5. Get
//         const retrieved = await UnifiedAtomeSync.get(docId);
//         console.log('Retrieved:', retrieved);

//         // 6. List
//         const all = await UnifiedAtomeSync.list();
//         console.log('All atomes:', all?.length || 0);

//         // 7. Delete
//         await UnifiedAtomeSync.delete(docId);
//         console.log('Deleted');
//     } catch (e) {
//         console.log('⚠️ Legacy API error:', e.message);
//     }
// }

// // =============================================================================
// // SQUIRREL UI INTEGRATION
// // =============================================================================

// /**
//  * Example: Creating a simple UI for document management using Squirrel syntax
//  */
// function createDocumentManagerUI() {
//     console.log('\n🎨 Squirrel UI Integration\n');

//     // Create the main container
//     $('div', {
//         id: 'documentManager',
//         css: {
//             padding: '20px',
//             backgroundColor: '#1e1e1e',
//             borderRadius: '12px',
//             margin: '20px'
//         },
//         children: [
//             // Header
//             $('div', {
//                 css: { marginBottom: '20px' },
//                 children: [
//                     $('span', {
//                         text: '📄 Document Manager',
//                         css: { fontSize: '24px', color: '#fff', fontWeight: 'bold' }
//                     })
//                 ]
//             }),

//             // Create new document button
//             $('button', {
//                 text: '+ New Document',
//                 css: {
//                     padding: '10px 20px',
//                     backgroundColor: '#4CAF50',
//                     color: 'white',
//                     border: 'none',
//                     borderRadius: '6px',
//                     cursor: 'pointer',
//                     marginBottom: '20px'
//                 },
//                 events: {
//                     click: async () => {
//                         const doc = await atome.create('document', {
//                             name: 'New Document',
//                             content: '',
//                             created: new Date().toISOString()
//                         });
//                         console.log('Created new document:', doc.atome_id);
//                         refreshDocumentList();
//                     }
//                 }
//             }),

//             // Document list container
//             $('div', {
//                 id: 'documentList',
//                 css: {
//                     display: 'flex',
//                     flexDirection: 'column',
//                     gap: '10px'
//                 }
//             })
//         ]
//     });

//     console.log('✅ Document Manager UI created');
// }

// /**
//  * Helper: Refresh the document list in the UI
//  */
// async function refreshDocumentList() {
//     const listContainer = document.getElementById('documentList');
//     if (!listContainer) return;

//     // Clear existing content
//     listContainer.innerHTML = '';

//     // Fetch documents
//     const docs = await atome.list({ type: 'document' });

//     // Create a card for each document
//     for (const doc of docs) {
//         const card = $('div', {
//             css: {
//                 padding: '15px',
//                 backgroundColor: '#2d2d2d',
//                 borderRadius: '8px',
//                 display: 'flex',
//                 justifyContent: 'space-between',
//                 alignItems: 'center'
//             },
//             children: [
//                 $('span', {
//                     text: doc.properties?.name || 'Untitled',
//                     css: { color: '#fff' }
//                 }),
//                 $('div', {
//                     children: [
//                         $('button', {
//                             text: '✏️',
//                             css: { marginRight: '5px', cursor: 'pointer' },
//                             events: {
//                                 click: () => editDocument(doc.atome_id)
//                             }
//                         }),
//                         $('button', {
//                             text: '🗑️',
//                             css: { cursor: 'pointer' },
//                             events: {
//                                 click: async () => {
//                                     await atome.delete(doc.atome_id);
//                                     refreshDocumentList();
//                                 }
//                             }
//                         })
//                     ]
//                 })
//             ]
//         });
//         listContainer.appendChild(card);
//     }
// }

// // =============================================================================
// // RUN ALL EXAMPLES
// // =============================================================================

// /**
//  * Run all examples in sequence
//  */
// async function runAllExamples() {
//     console.log('═'.repeat(60));
//     console.log('   UNIFIED API EXAMPLES');
//     console.log('═'.repeat(60));

//     try {
//         await authenticationExample();
//         await crudExample();
//         await adoleExample();
//         await userDataExample();
//         await syncExample();
//         // await legacyApiExample(); // Uncomment to test legacy API
//         // createDocumentManagerUI(); // Uncomment to create UI

//         console.log('\n═'.repeat(60));
//         console.log('   ✅ ALL EXAMPLES COMPLETED SUCCESSFULLY');
//         console.log('═'.repeat(60));

//     } catch (error) {
//         console.error('\n❌ Example failed:', error.message);
//         console.error(error);
//     }
// }

// // Export for use
// export {
//     authenticationExample,
//     crudExample,
//     adoleExample,
//     userDataExample,
//     syncExample,
//     legacyApiExample,
//     createDocumentManagerUI,
//     runAllExamples
// };

// // Make available globally for console testing
// if (typeof window !== 'undefined') {
//     window.apiExamples = {
//         auth: authenticationExample,
//         crud: crudExample,
//         adole: adoleExample,
//         userData: userDataExample,
//         sync: syncExample,
//         legacy: legacyApiExample,
//         ui: createDocumentManagerUI,
//         runAll: runAllExamples
//     };

//     console.log('📚 API Examples loaded. Run window.apiExamples.runAll() to test.');
// }

// export default runAllExamples;
