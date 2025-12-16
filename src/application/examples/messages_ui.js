// ============================================
// MESSAGING DEBUG UI
// ============================================
// Simple UI for testing the MessagingAPI
// NOT the final UI - just for debugging
// ============================================

import { MessagingAPI } from './messages.js';

// High z-index to stay on top of other elements
const BASE_Z_INDEX = 50000;

// State
let debugPanel = null;
let messagesList = null;
let contactsList = null;
let logArea = null;

/**
 * Log to debug area
 */
function debugLog(message, type = 'info') {
    if (!logArea) return;
    const time = new Date().toLocaleTimeString();
    const color = type === 'error' ? '#f66' : type === 'success' ? '#6f6' : '#aaa';
    const line = $('div', {
        parent: logArea,
        text: `[${time}] ${message}`,
        css: { color, fontSize: '11px', fontFamily: 'monospace', marginBottom: '2px' }
    });
    logArea.scrollTop = logArea.scrollHeight;
}

/**
 * Create the main debug panel
 */
function createDebugPanel() {
    if (debugPanel) {
        debugPanel.style.display = debugPanel.style.display === 'none' ? 'flex' : 'none';
        return;
    }

    // Main container
    debugPanel = $('div', {
        id: 'messaging-debug-panel',
        parent: '#intuition',
        css: {
            position: 'fixed',
            bottom: '80px',
            left: '20px',
            width: '400px',
            height: '600px',
            backgroundColor: '#1a1a2e',
            border: '2px solid #4a4a6a',
            borderRadius: '12px',
            zIndex: BASE_Z_INDEX,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            overflow: 'hidden',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            pointerEvents: 'auto'
        }
    });

    // Header
    const header = $('div', {
        parent: debugPanel,
        css: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            backgroundColor: '#2a2a4e',
            borderBottom: '1px solid #4a4a6a',
            cursor: 'move'
        }
    });

    $('div', {
        parent: header,
        text: '📬 Messaging Debug',
        css: { color: '#fff', fontWeight: 'bold', fontSize: '14px' }
    });

    // Close button
    Button({
        parent: header,
        onText: '✕',
        offText: '✕',
        onAction: () => { debugPanel.style.display = 'none'; },
        offAction: () => { debugPanel.style.display = 'none'; },
        css: {
            width: '28px',
            height: '28px',
            backgroundColor: '#c33',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px'
        }
    });

    // Make draggable
    makeDraggable(debugPanel, header);

    // Tabs
    const tabs = $('div', {
        parent: debugPanel,
        css: {
            display: 'flex',
            backgroundColor: '#222244',
            borderBottom: '1px solid #4a4a6a'
        }
    });

    const tabContents = {};
    let activeTab = null;

    function createTab(name, label) {
        const tab = $('div', {
            parent: tabs,
            text: label,
            css: {
                flex: '1',
                padding: '10px',
                textAlign: 'center',
                color: '#888',
                cursor: 'pointer',
                fontSize: '12px',
                borderBottom: '2px solid transparent',
                transition: 'all 0.2s'
            }
        });

        const content = $('div', {
            parent: debugPanel,
            css: {
                flex: '1',
                display: 'none',
                flexDirection: 'column',
                overflow: 'hidden'
            }
        });

        tab.onclick = () => {
            // Deactivate all tabs
            Object.values(tabContents).forEach(t => {
                t.tab.style.color = '#888';
                t.tab.style.borderBottom = '2px solid transparent';
                t.content.style.display = 'none';
            });
            // Activate this tab
            tab.style.color = '#fff';
            tab.style.borderBottom = '2px solid #6a6aff';
            content.style.display = 'flex';
            activeTab = name;
        };

        tabContents[name] = { tab, content };
        return content;
    }

    // Create tabs
    const sendTab = createTab('send', '📤 Send');
    const inboxTab = createTab('inbox', '📥 Inbox');
    const contactsTab = createTab('contacts', '👥 Contacts');
    const logTab = createTab('log', '📋 Log');

    // === SEND TAB ===
    createSendTab(sendTab);

    // === INBOX TAB ===
    createInboxTab(inboxTab);

    // === CONTACTS TAB ===
    createContactsTab(contactsTab);

    // === LOG TAB ===
    createLogTab(logTab);

    // Activate first tab
    tabContents['send'].tab.click();

    // Register real-time handlers
    registerEventHandlers();

    debugLog('Debug UI initialized', 'success');
}

/**
 * Create Send tab content
 */
function createSendTab(container) {
    const padding = $('div', {
        parent: container,
        css: { padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', flex: '1' }
    });

    // To phone input
    $('div', { parent: padding, text: 'To (phone):', css: { color: '#aaa', fontSize: '12px' } });
    const toInput = $('input', {
        parent: padding,
        attrs: { type: 'text', placeholder: '0612345678' },
        css: {
            height: '36px',
            padding: '0 12px',
            borderRadius: '8px',
            border: '1px solid #4a4a6a',
            backgroundColor: '#2a2a4e',
            color: '#fff',
            fontSize: '14px',
            outline: 'none'
        }
    });

    // Subject input
    $('div', { parent: padding, text: 'Subject (optional):', css: { color: '#aaa', fontSize: '12px' } });
    const subjectInput = $('input', {
        parent: padding,
        attrs: { type: 'text', placeholder: 'Subject...' },
        css: {
            height: '36px',
            padding: '0 12px',
            borderRadius: '8px',
            border: '1px solid #4a4a6a',
            backgroundColor: '#2a2a4e',
            color: '#fff',
            fontSize: '14px',
            outline: 'none'
        }
    });

    // Message textarea
    $('div', { parent: padding, text: 'Message:', css: { color: '#aaa', fontSize: '12px' } });
    const messageInput = $('textarea', {
        parent: padding,
        attrs: { placeholder: 'Type your message here...' },
        css: {
            flex: '1',
            padding: '12px',
            borderRadius: '8px',
            border: '1px solid #4a4a6a',
            backgroundColor: '#2a2a4e',
            color: '#fff',
            fontSize: '14px',
            resize: 'none',
            outline: 'none',
            minHeight: '100px'
        }
    });

    // Send button
    Button({
        parent: padding,
        onText: '📤 Send Message',
        offText: '📤 Send Message',
        onAction: async () => {
            const to = toInput.value.trim();
            const subject = subjectInput.value.trim();
            const content = messageInput.value.trim();

            if (!to || !content) {
                debugLog('Phone and message are required', 'error');
                return;
            }

            debugLog(`Sending to ${to}...`);
            const result = await MessagingAPI.messages.send(to, content, { subject: subject || undefined });

            if (result.success) {
                debugLog(`Message sent! ID: ${result.messageId}`, 'success');
                messageInput.value = '';
                subjectInput.value = '';
            } else {
                debugLog(`Send failed: ${result.error}`, 'error');
            }
        },
        offAction: () => { },
        css: {
            height: '44px',
            backgroundColor: '#4a7fff',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold'
        }
    });

    // Current user info
    const userInfo = $('div', {
        parent: padding,
        css: { color: '#999', fontSize: '11px', textAlign: 'center' },
        text: 'Checking login...'
    });

    // Update user info using AdoleAPI - poll until user is found
    let checkAttempts = 0;
    const maxAttempts = 30; // 30 attempts = ~30 seconds max wait
    
    const checkUserInterval = setInterval(async () => {
        checkAttempts++;
        try {
            if (!window.AdoleAPI?.auth?.current) {
                userInfo.textContent = 'Waiting for API...';
                return;
            }
            const result = await window.AdoleAPI.auth.current();
            // Use result.logged (not result.success) as per adole_apis.js
            if (result.logged && result.user) {
                const user = result.user;
                userInfo.textContent = `Logged as: ${user.username || user.phone || user.user_id?.substring(0, 8)}`;
                userInfo.style.color = '#6f6';
                clearInterval(checkUserInterval); // Stop polling once user is found
                console.log('[MessagingUI] User detected:', user.username || user.user_id);
            } else if (checkAttempts >= maxAttempts) {
                userInfo.textContent = 'Not logged in';
                userInfo.style.color = '#f66';
                clearInterval(checkUserInterval);
            } else {
                userInfo.textContent = `Checking login... (${checkAttempts})`;
            }
        } catch (e) {
            if (checkAttempts >= maxAttempts) {
                userInfo.textContent = 'Not logged in';
                userInfo.style.color = '#f66';
                clearInterval(checkUserInterval);
            }
        }
    }, 1000);
}

/**
 * Create Inbox tab content
 */
function createInboxTab(container) {
    const padding = $('div', {
        parent: container,
        css: { padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', flex: '1' }
    });

    // Header with refresh button
    const header = $('div', {
        parent: padding,
        css: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
    });

    $('div', { parent: header, text: 'Messages:', css: { color: '#aaa', fontSize: '12px' } });

    Button({
        parent: header,
        onText: '🔄 Refresh',
        offText: '🔄 Refresh',
        onAction: refreshInbox,
        offAction: refreshInbox,
        css: {
            height: '28px',
            padding: '0 12px',
            backgroundColor: '#3a3a5e',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '11px'
        }
    });

    // Summary
    const summary = $('div', {
        id: 'inbox-summary',
        parent: padding,
        css: { color: '#888', fontSize: '11px', padding: '8px', backgroundColor: '#2a2a4e', borderRadius: '6px' }
    });

    // Messages list
    messagesList = $('div', {
        parent: padding,
        css: {
            flex: '1',
            overflowY: 'auto',
            backgroundColor: '#222244',
            borderRadius: '8px',
            padding: '8px'
        }
    });

    // Initial refresh
    setTimeout(refreshInbox, 500);
}

/**
 * Refresh inbox
 */
async function refreshInbox() {
    if (!messagesList) return;

    debugLog('Refreshing inbox...');

    // Get summary
    const summaryResult = await MessagingAPI.inbox.getSummary();
    const summaryEl = document.getElementById('inbox-summary');
    if (summaryResult.success && summaryEl) {
        const s = summaryResult.summary;
        summaryEl.textContent = `📬 Unread: ${s.unread} | 📨 Requests: ${s.requests} | 📖 Read: ${s.read} | 📦 Archived: ${s.archived}`;
    }

    // Clear list
    messagesList.innerHTML = '';

    // Get messages
    const result = await MessagingAPI.messages.list({ inboxType: 'received', limit: 20 });

    if (!result.success) {
        debugLog(`Failed to load inbox: ${result.error}`, 'error');
        return;
    }

    if (result.messages.length === 0) {
        $('div', {
            parent: messagesList,
            text: 'No messages',
            css: { color: '#666', textAlign: 'center', padding: '20px' }
        });
        return;
    }

    // Render messages
    for (const msg of result.messages) {
        const particles = msg.particles || {};
        const isRequest = particles.state === 'request';
        const isUnread = particles.state === 'unread';

        const item = $('div', {
            parent: messagesList,
            css: {
                padding: '10px',
                marginBottom: '6px',
                backgroundColor: isRequest ? '#3a2a2a' : isUnread ? '#2a2a5e' : '#2a2a3e',
                borderRadius: '8px',
                borderLeft: `3px solid ${isRequest ? '#f66' : isUnread ? '#6af' : '#666'}`,
                cursor: 'pointer'
            }
        });

        // From
        $('div', {
            parent: item,
            text: `${isRequest ? '🔔 REQUEST: ' : ''}${particles.from_name || particles.from_phone || 'Unknown'}`,
            css: { color: '#fff', fontSize: '13px', fontWeight: isUnread ? 'bold' : 'normal' }
        });

        // Subject
        if (particles.subject) {
            $('div', {
                parent: item,
                text: particles.subject,
                css: { color: '#aaa', fontSize: '12px', marginTop: '2px' }
            });
        }

        // Preview
        $('div', {
            parent: item,
            text: (particles.content || '').substring(0, 60) + ((particles.content?.length > 60) ? '...' : ''),
            css: { color: '#888', fontSize: '11px', marginTop: '4px' }
        });

        // Time
        $('div', {
            parent: item,
            text: new Date(particles.sent_at).toLocaleString(),
            css: { color: '#666', fontSize: '10px', marginTop: '4px' }
        });

        // Actions
        const actions = $('div', {
            parent: item,
            css: { display: 'flex', gap: '6px', marginTop: '8px' }
        });

        if (isRequest) {
            // Accept/Reject buttons
            Button({
                parent: actions,
                onText: '✓ Accept',
                offText: '✓ Accept',
                onAction: async () => {
                    const r = await MessagingAPI.requests.accept(msg.atome_id || msg.id);
                    debugLog(r.success ? 'Request accepted' : `Accept failed: ${r.error}`, r.success ? 'success' : 'error');
                    refreshInbox();
                },
                offAction: () => { },
                css: { height: '24px', padding: '0 8px', backgroundColor: '#4a7', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }
            });

            Button({
                parent: actions,
                onText: '✕ Reject',
                offText: '✕ Reject',
                onAction: async () => {
                    const r = await MessagingAPI.requests.reject(msg.atome_id || msg.id);
                    debugLog(r.success ? 'Request rejected' : `Reject failed: ${r.error}`, r.success ? 'success' : 'error');
                    refreshInbox();
                },
                offAction: () => { },
                css: { height: '24px', padding: '0 8px', backgroundColor: '#a44', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }
            });
        } else if (isUnread) {
            Button({
                parent: actions,
                onText: '✓ Mark Read',
                offText: '✓ Mark Read',
                onAction: async () => {
                    const r = await MessagingAPI.messages.markAsRead(msg.atome_id || msg.id);
                    debugLog(r.success ? 'Marked as read' : `Failed: ${r.error}`, r.success ? 'success' : 'error');
                    refreshInbox();
                },
                offAction: () => { },
                css: { height: '24px', padding: '0 8px', backgroundColor: '#47a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }
            });
        }

        Button({
            parent: actions,
            onText: '🗑️',
            offText: '🗑️',
            onAction: async () => {
                const r = await MessagingAPI.messages.delete(msg.atome_id || msg.id);
                debugLog(r.success ? 'Message deleted' : `Delete failed: ${r.error}`, r.success ? 'success' : 'error');
                refreshInbox();
            },
            offAction: () => { },
            css: { height: '24px', width: '28px', backgroundColor: '#633', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }
        });
    }

    debugLog(`Loaded ${result.messages.length} messages`, 'success');
}

/**
 * Create Contacts tab content
 */
function createContactsTab(container) {
    const padding = $('div', {
        parent: container,
        css: { padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', flex: '1' }
    });

    // Add contact form
    const addForm = $('div', {
        parent: padding,
        css: { display: 'flex', gap: '8px' }
    });

    const phoneInput = $('input', {
        parent: addForm,
        attrs: { type: 'text', placeholder: 'Phone number' },
        css: {
            flex: '1',
            height: '32px',
            padding: '0 10px',
            borderRadius: '6px',
            border: '1px solid #4a4a6a',
            backgroundColor: '#2a2a4e',
            color: '#fff',
            fontSize: '12px',
            outline: 'none'
        }
    });

    const nameInput = $('input', {
        parent: addForm,
        attrs: { type: 'text', placeholder: 'Name (opt)' },
        css: {
            width: '100px',
            height: '32px',
            padding: '0 10px',
            borderRadius: '6px',
            border: '1px solid #4a4a6a',
            backgroundColor: '#2a2a4e',
            color: '#fff',
            fontSize: '12px',
            outline: 'none'
        }
    });

    Button({
        parent: addForm,
        onText: '+ Add',
        offText: '+ Add',
        onAction: async () => {
            const phone = phoneInput.value.trim();
            const name = nameInput.value.trim();
            if (!phone) {
                debugLog('Phone is required', 'error');
                return;
            }
            const r = await MessagingAPI.contacts.add(phone, name || undefined);
            debugLog(r.success ? `Contact added: ${phone}` : `Failed: ${r.error}`, r.success ? 'success' : 'error');
            phoneInput.value = '';
            nameInput.value = '';
            refreshContacts();
        },
        offAction: () => { },
        css: {
            height: '32px',
            padding: '0 12px',
            backgroundColor: '#4a7',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '12px'
        }
    });

    // Contacts list
    contactsList = $('div', {
        parent: padding,
        css: {
            flex: '1',
            overflowY: 'auto',
            backgroundColor: '#222244',
            borderRadius: '8px',
            padding: '8px'
        }
    });

    // Refresh button
    Button({
        parent: padding,
        onText: '🔄 Refresh Contacts',
        offText: '🔄 Refresh Contacts',
        onAction: refreshContacts,
        offAction: refreshContacts,
        css: {
            height: '32px',
            backgroundColor: '#3a3a5e',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '12px'
        }
    });

    // Initial refresh
    setTimeout(refreshContacts, 600);
}

/**
 * Refresh contacts list
 */
async function refreshContacts() {
    if (!contactsList) return;

    debugLog('Refreshing contacts...');
    contactsList.innerHTML = '';

    const result = await MessagingAPI.contacts.list();

    if (!result.success) {
        debugLog(`Failed to load contacts: ${result.error}`, 'error');
        return;
    }

    if (result.contacts.length === 0) {
        $('div', {
            parent: contactsList,
            text: 'No contacts',
            css: { color: '#666', textAlign: 'center', padding: '20px' }
        });
        return;
    }

    for (const contact of result.contacts) {
        const particles = contact.particles || {};
        const isBlocked = particles.status === 'blocked';

        const item = $('div', {
            parent: contactsList,
            css: {
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px',
                marginBottom: '6px',
                backgroundColor: isBlocked ? '#3a2a2a' : '#2a2a4e',
                borderRadius: '8px'
            }
        });

        const info = $('div', { parent: item });

        $('div', {
            parent: info,
            text: `${isBlocked ? '🚫 ' : ''}${particles.target_name || particles.target_phone}`,
            css: { color: isBlocked ? '#a66' : '#fff', fontSize: '13px' }
        });

        $('div', {
            parent: info,
            text: particles.target_phone,
            css: { color: '#888', fontSize: '11px' }
        });

        const actions = $('div', {
            parent: item,
            css: { display: 'flex', gap: '4px' }
        });

        if (isBlocked) {
            Button({
                parent: actions,
                onText: 'Unblock',
                offText: 'Unblock',
                onAction: async () => {
                    const r = await MessagingAPI.contacts.unblock(particles.target_phone);
                    debugLog(r.success ? 'Unblocked' : `Failed: ${r.error}`, r.success ? 'success' : 'error');
                    refreshContacts();
                },
                offAction: () => { },
                css: { height: '24px', padding: '0 8px', backgroundColor: '#47a', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }
            });
        } else {
            Button({
                parent: actions,
                onText: 'Block',
                offText: 'Block',
                onAction: async () => {
                    const r = await MessagingAPI.contacts.block(particles.target_phone);
                    debugLog(r.success ? 'Blocked' : `Failed: ${r.error}`, r.success ? 'success' : 'error');
                    refreshContacts();
                },
                offAction: () => { },
                css: { height: '24px', padding: '0 8px', backgroundColor: '#a44', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }
            });
        }

        Button({
            parent: actions,
            onText: '🗑️',
            offText: '🗑️',
            onAction: async () => {
                const r = await MessagingAPI.contacts.remove(particles.target_phone);
                debugLog(r.success ? 'Removed' : `Failed: ${r.error}`, r.success ? 'success' : 'error');
                refreshContacts();
            },
            offAction: () => { },
            css: { height: '24px', width: '24px', backgroundColor: '#633', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '10px' }
        });
    }

    debugLog(`Loaded ${result.contacts.length} contacts`, 'success');
}

/**
 * Create Log tab content
 */
function createLogTab(container) {
    logArea = $('div', {
        parent: container,
        css: {
            flex: '1',
            overflowY: 'auto',
            backgroundColor: '#0a0a1a',
            padding: '12px',
            fontFamily: 'monospace',
            fontSize: '11px'
        }
    });

    // Clear button
    Button({
        parent: container,
        onText: '🗑️ Clear Log',
        offText: '🗑️ Clear Log',
        onAction: () => { logArea.innerHTML = ''; debugLog('Log cleared'); },
        offAction: () => { },
        css: {
            height: '32px',
            margin: '8px',
            backgroundColor: '#3a3a5e',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '12px'
        }
    });
}

/**
 * Make element draggable
 */
function makeDraggable(element, handle) {
    let offsetX = 0, offsetY = 0, isDragging = false;

    handle.onmousedown = (e) => {
        isDragging = true;
        offsetX = e.clientX - element.offsetLeft;
        offsetY = e.clientY - element.offsetTop;
        document.onmousemove = onDrag;
        document.onmouseup = stopDrag;
    };

    function onDrag(e) {
        if (!isDragging) return;
        element.style.left = (e.clientX - offsetX) + 'px';
        element.style.top = (e.clientY - offsetY) + 'px';
        element.style.right = 'auto';
    }

    function stopDrag() {
        isDragging = false;
        document.onmousemove = null;
        document.onmouseup = null;
    }
}

/**
 * Register event handlers for real-time updates
 */
function registerEventHandlers() {
    window.addEventListener('adole-new-message', (e) => {
        const data = e.detail;
        debugLog(`📬 New message from ${data.fromName || data.from}${data.isRequest ? ' (REQUEST)' : ''}`, 'success');
        refreshInbox();
    });

    window.addEventListener('adole-message-read', (e) => {
        debugLog(`✓ Message read: ${e.detail.messageId.substring(0, 20)}...`);
    });

    window.addEventListener('adole-request-accepted', (e) => {
        debugLog(`🤝 Request accepted by ${e.detail.byName || e.detail.by}`, 'success');
        refreshContacts();
    });

    window.addEventListener('adole-typing', (e) => {
        const data = e.detail;
        if (data.isTyping) {
            debugLog(`✏️ ${data.fromName || data.from} is typing...`);
        }
    });
}

/**
 * Toggle debug panel visibility
 */
function toggleDebugPanel() {
    createDebugPanel();
}

// Export
export { toggleDebugPanel, createDebugPanel };

// Also expose globally for easy access
if (typeof window !== 'undefined') {
    window.MessagingDebugUI = {
        toggle: toggleDebugPanel,
        show: createDebugPanel,
        refreshInbox,
        refreshContacts
    };

    // Create toggle button in corner
    // Use longer delay and fallback to document.body if #intuition not found
    setTimeout(() => {
        try {
            // Check if #intuition exists, otherwise use body
            const parentElement = document.getElementById('intuition') || document.body;

            const toggleBtn = document.createElement('div');
            toggleBtn.id = 'messaging-debug-toggle';
            toggleBtn.textContent = '📬';
            toggleBtn.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 20px;
                width: 50px;
                height: 50px;
                background-color: #4a7fff;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
                cursor: pointer;
                z-index: ${BASE_Z_INDEX + 1};
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                transition: transform 0.2s;
                pointer-events: auto;
            `;

            parentElement.appendChild(toggleBtn);

            toggleBtn.onmouseenter = () => { toggleBtn.style.transform = 'scale(1.1)'; };
            toggleBtn.onmouseleave = () => { toggleBtn.style.transform = 'scale(1)'; };
            toggleBtn.onclick = toggleDebugPanel;

            console.log('[MessagingUI] Toggle button created');
        } catch (e) {
            console.error('[MessagingUI] Failed to create toggle button:', e);
        }
    }, 500);
}
