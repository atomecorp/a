// ============================================
// ADOLE MESSAGING SYSTEM
// ============================================
// Persistent messaging with real-time notifications
// Based on ADOLE atomes: contact, message, request
// ============================================

import { AdoleAPI } from '../../squirrel/apis/unified/adole_apis.js';
// Use absolute path to ensure same module instance as check.js
import { RemoteCommands } from '/squirrel/apis/remote_commands.js';

// ============================================
// HELPER: Get current logged user
// ============================================
async function getCurrentUser() {
    try {
        if (!window.AdoleAPI?.auth?.current) {
            return null;
        }
        const result = await window.AdoleAPI.auth.current();
        if (result.logged && result.user) {
            // Normalize user object to have consistent id property
            return {
                id: result.user.user_id || result.user.atome_id || result.user.id,
                user_id: result.user.user_id,
                username: result.user.username,
                phone: result.user.phone,
                ...result.user
            };
        }
        return null;
    } catch (e) {
        console.error('[MessagingAPI] Error getting current user:', e);
        return null;
    }
}

// ============================================
// CONSTANTS
// ============================================

const MESSAGE_STATES = {
    REQUEST: 'request',     // From unknown contact, pending acceptance
    UNREAD: 'unread',       // Delivered but not read
    READ: 'read',           // Read by recipient
    ARCHIVED: 'archived',   // Archived by user
    DELETED: 'deleted'      // Soft deleted
};

const CONTACT_STATUS = {
    ACTIVE: 'active',       // Normal contact
    BLOCKED: 'blocked',     // Blocked by user
    PENDING: 'pending'      // Request sent, awaiting response
};

// ============================================
// CONTACTS API
// ============================================

const ContactsAPI = {

    /**
     * Add a contact to current user's contact list
     * @param {string} targetPhone - Phone number of the contact
     * @param {string} [targetName] - Display name for the contact
     * @returns {Promise<{success: boolean, contactId?: string, error?: string}>}
     */
    async add(targetPhone, targetName = null) {
        const currentUser = await getCurrentUser();
        if (!currentUser?.id) {
            return { success: false, error: 'No user logged in' };
        }

        // Generate deterministic contact ID
        const contactId = `contact_${currentUser.id}_${targetPhone}`.replace(/[^a-zA-Z0-9_]/g, '_');

        // Check if contact already exists
        const existing = await AdoleAPI.atomes.get(contactId);
        if (existing?.tauri?.success || existing?.fastify?.success) {
            return { success: true, contactId, message: 'Contact already exists' };
        }

        // Try to find target user info
        let targetUserId = null;
        let targetUserName = targetName;

        // Look up user by phone (will only find public users or users we already know)
        try {
            const users = await AdoleAPI.auth.list();
            const allUsers = users.tauri?.users || users.fastify?.users || [];
            const targetUser = allUsers.find(u => u.phone === targetPhone);
            if (targetUser) {
                targetUserId = targetUser.user_id;
                targetUserName = targetUserName || targetUser.username;
            }
        } catch (e) {
            console.warn('[Messaging] Could not look up user:', e.message);
        }

        // Create contact atome
        const result = await AdoleAPI.atomes.create({
            id: contactId,
            type: 'contact',
            ownerId: currentUser.id,
            particles: {
                target_phone: targetPhone,
                target_user_id: targetUserId,
                target_name: targetUserName || targetPhone,
                status: CONTACT_STATUS.ACTIVE,
                added_at: new Date().toISOString()
            }
        });

        if (result.tauri?.success || result.fastify?.success) {
            console.log(`[Messaging] Contact added: ${targetUserName || targetPhone}`);
            return { success: true, contactId };
        }

        return { success: false, error: result.tauri?.error || result.fastify?.error };
    },

    /**
     * Remove a contact from the list
     * @param {string} targetPhone - Phone number of the contact
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async remove(targetPhone) {
        const currentUser = await getCurrentUser();
        if (!currentUser?.id) {
            return { success: false, error: 'No user logged in' };
        }

        const contactId = `contact_${currentUser.id}_${targetPhone}`.replace(/[^a-zA-Z0-9_]/g, '_');
        const result = await AdoleAPI.atomes.delete(contactId);

        if (result.tauri?.success || result.fastify?.success) {
            console.log(`[Messaging] Contact removed: ${targetPhone}`);
            return { success: true };
        }

        return { success: false, error: result.tauri?.error || result.fastify?.error };
    },

    /**
     * Block a contact (no more messages allowed)
     * @param {string} targetPhone - Phone number to block
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async block(targetPhone) {
        const currentUser = await getCurrentUser();
        if (!currentUser?.id) {
            return { success: false, error: 'No user logged in' };
        }

        const contactId = `contact_${currentUser.id}_${targetPhone}`.replace(/[^a-zA-Z0-9_]/g, '_');

        // Check if contact exists, create if not
        const existing = await AdoleAPI.atomes.get(contactId);
        if (!(existing?.tauri?.success || existing?.fastify?.success)) {
            // Create blocked contact
            await AdoleAPI.atomes.create({
                id: contactId,
                type: 'contact',
                ownerId: currentUser.id,
                particles: {
                    target_phone: targetPhone,
                    status: CONTACT_STATUS.BLOCKED,
                    blocked_at: new Date().toISOString()
                }
            });
        } else {
            // Update existing contact to blocked
            await AdoleAPI.atomes.alter({
                atomeId: contactId,
                particles: {
                    status: CONTACT_STATUS.BLOCKED,
                    blocked_at: new Date().toISOString()
                }
            });
        }

        console.log(`[Messaging] Contact blocked: ${targetPhone}`);
        return { success: true };
    },

    /**
     * Unblock a contact
     * @param {string} targetPhone - Phone number to unblock
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async unblock(targetPhone) {
        const currentUser = await getCurrentUser();
        if (!currentUser?.id) {
            return { success: false, error: 'No user logged in' };
        }

        const contactId = `contact_${currentUser.id}_${targetPhone}`.replace(/[^a-zA-Z0-9_]/g, '_');

        const result = await AdoleAPI.atomes.alter({
            atomeId: contactId,
            particles: {
                status: CONTACT_STATUS.ACTIVE,
                unblocked_at: new Date().toISOString()
            }
        });

        if (result.tauri?.success || result.fastify?.success) {
            console.log(`[Messaging] Contact unblocked: ${targetPhone}`);
            return { success: true };
        }

        return { success: false, error: result.tauri?.error || result.fastify?.error };
    },

    /**
     * List all contacts for current user
     * @param {Object} [options] - Filter options
     * @param {string} [options.status] - Filter by status (active, blocked, pending)
     * @returns {Promise<{success: boolean, contacts?: Array, error?: string}>}
     */
    async list(options = {}) {
        const currentUser = await getCurrentUser();
        if (!currentUser?.id) {
            return { success: false, error: 'No user logged in' };
        }

        const result = await AdoleAPI.atomes.list({
            type: 'contact',
            ownerId: currentUser.id
        });

        let contacts = [];
        if (result.tauri?.success) {
            contacts = result.tauri.atomes || [];
        } else if (result.fastify?.success) {
            contacts = result.fastify.atomes || [];
        }

        // Filter by status if specified
        if (options.status) {
            contacts = contacts.filter(c => {
                const particles = c.particles || {};
                return particles.status === options.status;
            });
        }

        return { success: true, contacts };
    },

    /**
     * Check if a phone number is in current user's contacts
     * @param {string} targetPhone - Phone number to check
     * @returns {Promise<{isContact: boolean, status?: string}>}
     */
    async isContact(targetPhone) {
        const currentUser = await getCurrentUser();
        if (!currentUser?.id) {
            return { isContact: false };
        }

        const contactId = `contact_${currentUser.id}_${targetPhone}`.replace(/[^a-zA-Z0-9_]/g, '_');
        const result = await AdoleAPI.atomes.get(contactId);

        if (result.tauri?.success || result.fastify?.success) {
            const atome = result.tauri?.atome || result.fastify?.atome;
            const particles = atome?.particles || {};
            return {
                isContact: true,
                status: particles.status || CONTACT_STATUS.ACTIVE,
                isBlocked: particles.status === CONTACT_STATUS.BLOCKED
            };
        }

        return { isContact: false };
    }
};

// ============================================
// MESSAGES API
// ============================================

const MessagesAPI = {

    /**
     * Send a message to a user
     * Message is ALWAYS stored in database first, then notification is sent
     * @param {string} toPhone - Recipient phone number
     * @param {string} content - Message content
     * @param {Object} [options] - Additional options
     * @param {string} [options.subject] - Optional subject line
     * @param {Array} [options.tags] - Optional tags for categorization
     * @param {number} [options.priority] - Priority level (1-5, 5 is highest)
     * @returns {Promise<{success: boolean, messageId?: string, isRequest?: boolean, error?: string}>}
     */
    async send(toPhone, content, options = {}) {
        const currentUser = await getCurrentUser();
        if (!currentUser?.id) {
            return { success: false, error: 'No user logged in' };
        }

        if (!toPhone || !content) {
            return { success: false, error: 'Phone and content are required' };
        }

        // Check if sender is blocked by recipient
        // (This would require checking recipient's contacts, which we can't do directly)
        // The recipient's system will handle this

        // Check if recipient is in our contacts
        const contactCheck = await ContactsAPI.isContact(toPhone);

        // Generate unique message ID
        const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Find recipient user ID
        let toUserId = null;
        try {
            const users = await AdoleAPI.auth.list();
            console.log('[Messaging] Users list result:', users);

            // Get users from tauri or fastify - they are atomes with data.particles
            const tauriUsers = users.tauri?.users || [];
            const fastifyUsers = users.fastify?.users || [];
            const allUsers = [...tauriUsers, ...fastifyUsers];

            // Log the structure of first user to understand the format
            if (allUsers.length > 0) {
                console.log('[Messaging] Sample user structure:', JSON.stringify(allUsers[0], null, 2));
            }

            // Extract user info from atome structure
            // User atomes have: atome_id (=user_id), data.particles.phone, data.particles.username
            const normalizedUsers = allUsers.map(u => {
                const particles = u.data?.particles || u.particles || u.data || {};
                return {
                    user_id: u.atome_id || u.user_id || u.id,
                    phone: particles.phone || u.phone,
                    username: particles.username || u.username
                };
            });

            console.log('[Messaging] Normalized users:', normalizedUsers.map(u => ({ phone: u.phone, user_id: u.user_id })));

            const targetUser = normalizedUsers.find(u => u.phone === toPhone);
            if (targetUser) {
                toUserId = targetUser.user_id;
                console.log(`[Messaging] Found recipient: ${toPhone} -> ${toUserId}`);
            } else {
                console.log(`[Messaging] Recipient not found for phone: ${toPhone}`);
            }
        } catch (e) {
            console.warn('[Messaging] Could not look up recipient:', e.message);
        }

        // Determine initial state: if recipient doesn't know sender, it's a request
        // We'll set state to 'unread' and add is_request flag
        // The recipient's system will check if sender is in contacts
        const now = new Date().toISOString();

        // Create message atome (owned by recipient for their inbox)
        // We also store a copy for the sender (for sent messages)
        const messageData = {
            from_user_id: currentUser.id,
            from_phone: currentUser.phone,
            from_name: currentUser.name,
            to_user_id: toUserId,
            to_phone: toPhone,
            content: content,
            subject: options.subject || null,
            state: MESSAGE_STATES.UNREAD,
            is_request: false, // Recipient will determine this
            sent_at: now,
            displayed_at: null,
            read_at: null,
            archived_at: null,
            deleted_at: null,
            tags: options.tags || [],
            priority: options.priority || 3,
            flags: []
        };

        // Store message for recipient (their inbox)
        const recipientMessageId = `${messageId}_to`;
        const recipientResult = await AdoleAPI.atomes.create({
            id: recipientMessageId,
            type: 'message',
            ownerId: toUserId || toPhone, // Use phone as fallback owner
            particles: {
                ...messageData,
                inbox_type: 'received'
            }
        });

        // Store message for sender (sent folder)
        const senderMessageId = `${messageId}_from`;
        const senderResult = await AdoleAPI.atomes.create({
            id: senderMessageId,
            type: 'message',
            ownerId: currentUser.id,
            particles: {
                ...messageData,
                inbox_type: 'sent',
                state: 'sent' // Sender's copy is always 'sent'
            }
        });

        console.log('[MessagesAPI.send] Sender message created:', {
            id: senderMessageId,
            inbox_type: 'sent',
            tauri: senderResult.tauri?.success,
            fastify: senderResult.fastify?.success
        });

        if (!(recipientResult.tauri?.success || recipientResult.fastify?.success)) {
            return {
                success: false,
                error: recipientResult.tauri?.error || recipientResult.fastify?.error
            };
        }

        console.log(`[Messaging] Message stored: ${messageId}`);

        // Send real-time notification if recipient is online
        // Use RemoteCommands to notify - MUST use user ID, not phone
        if (toUserId) {
            try {
                await RemoteCommands.sendCommand(toUserId, 'new-message', {
                    messageId: recipientMessageId,
                    from: currentUser.phone,
                    fromId: currentUser.id,
                    fromName: currentUser.username || currentUser.name,
                    preview: content.substring(0, 100),
                    subject: options.subject,
                    sentAt: now
                });
                console.log(`[Messaging] Real-time notification sent to ${toUserId} (phone: ${toPhone})`);
            } catch (e) {
                // Notification failed, but message is stored - that's OK
                console.log(`[Messaging] Could not send real-time notification: ${e.message}`);
            }
        } else {
            console.log(`[Messaging] Could not send real-time notification: recipient user ID not found for phone ${toPhone}`);
        }

        return {
            success: true,
            messageId,
            recipientMessageId,
            senderMessageId
        };
    },

    /**
     * Mark a message as displayed (shown in notification)
     * @param {string} messageId - Message atome ID
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async markAsDisplayed(messageId) {
        const result = await AdoleAPI.atomes.alter({
            atomeId: messageId,
            particles: {
                displayed_at: new Date().toISOString()
            }
        });

        if (result.tauri?.success || result.fastify?.success) {
            return { success: true };
        }
        return { success: false, error: result.tauri?.error || result.fastify?.error };
    },

    /**
     * Mark a message as read
     * @param {string} messageId - Message atome ID
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async markAsRead(messageId) {
        const now = new Date().toISOString();
        const result = await AdoleAPI.atomes.alter({
            atomeId: messageId,
            particles: {
                state: MESSAGE_STATES.READ,
                read_at: now
            }
        });

        if (result.tauri?.success || result.fastify?.success) {
            console.log(`[Messaging] Message marked as read: ${messageId}`);

            // Notify sender that message was read (read receipt)
            try {
                const msgResult = await AdoleAPI.atomes.get(messageId);
                const atome = msgResult.tauri?.atome || msgResult.fastify?.atome;
                const particles = atome?.particles || {};

                if (particles.from_phone) {
                    await RemoteCommands.sendCommand(particles.from_phone, 'message-read', {
                        messageId,
                        readAt: now
                    });
                }
            } catch (e) {
                // Read receipt notification failed, not critical
            }

            return { success: true };
        }
        return { success: false, error: result.tauri?.error || result.fastify?.error };
    },

    /**
     * Archive a message
     * @param {string} messageId - Message atome ID
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async archive(messageId) {
        const result = await AdoleAPI.atomes.alter({
            atomeId: messageId,
            particles: {
                state: MESSAGE_STATES.ARCHIVED,
                archived_at: new Date().toISOString()
            }
        });

        if (result.tauri?.success || result.fastify?.success) {
            console.log(`[Messaging] Message archived: ${messageId}`);
            return { success: true };
        }
        return { success: false, error: result.tauri?.error || result.fastify?.error };
    },

    /**
     * Delete a message (soft delete)
     * @param {string} messageId - Message atome ID
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async delete(messageId) {
        const result = await AdoleAPI.atomes.alter({
            atomeId: messageId,
            particles: {
                state: MESSAGE_STATES.DELETED,
                deleted_at: new Date().toISOString()
            }
        });

        if (result.tauri?.success || result.fastify?.success) {
            console.log(`[Messaging] Message deleted: ${messageId}`);
            return { success: true };
        }
        return { success: false, error: result.tauri?.error || result.fastify?.error };
    },

    /**
     * Add a flag to a message
     * @param {string} messageId - Message atome ID
     * @param {string} flag - Flag name (e.g., 'important', 'starred', 'follow-up')
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async addFlag(messageId, flag) {
        const msgResult = await AdoleAPI.atomes.get(messageId);
        const atome = msgResult.tauri?.atome || msgResult.fastify?.atome;
        const particles = atome?.particles || {};
        const flags = particles.flags || [];

        if (!flags.includes(flag)) {
            flags.push(flag);
            const result = await AdoleAPI.atomes.alter({
                atomeId: messageId,
                particles: { flags }
            });

            if (result.tauri?.success || result.fastify?.success) {
                return { success: true };
            }
            return { success: false, error: result.tauri?.error || result.fastify?.error };
        }

        return { success: true, message: 'Flag already exists' };
    },

    /**
     * Remove a flag from a message
     * @param {string} messageId - Message atome ID
     * @param {string} flag - Flag name to remove
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async removeFlag(messageId, flag) {
        const msgResult = await AdoleAPI.atomes.get(messageId);
        const atome = msgResult.tauri?.atome || msgResult.fastify?.atome;
        const particles = atome?.particles || {};
        const flags = (particles.flags || []).filter(f => f !== flag);

        const result = await AdoleAPI.atomes.alter({
            atomeId: messageId,
            particles: { flags }
        });

        if (result.tauri?.success || result.fastify?.success) {
            return { success: true };
        }
        return { success: false, error: result.tauri?.error || result.fastify?.error };
    },

    /**
     * Add tags to a message
     * @param {string} messageId - Message atome ID
     * @param {Array<string>} tags - Tags to add
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async addTags(messageId, tags) {
        const msgResult = await AdoleAPI.atomes.get(messageId);
        const atome = msgResult.tauri?.atome || msgResult.fastify?.atome;
        const particles = atome?.particles || {};
        const existingTags = particles.tags || [];
        const newTags = [...new Set([...existingTags, ...tags])];

        const result = await AdoleAPI.atomes.alter({
            atomeId: messageId,
            particles: { tags: newTags }
        });

        if (result.tauri?.success || result.fastify?.success) {
            return { success: true };
        }
        return { success: false, error: result.tauri?.error || result.fastify?.error };
    },

    /**
     * List messages in inbox with filters
     * @param {Object} [options] - Filter options
     * @param {string} [options.state] - Filter by state (unread, read, archived, deleted, request)
     * @param {string} [options.inboxType] - Filter by inbox type (received, sent)
     * @param {string} [options.fromPhone] - Filter by sender phone
     * @param {string} [options.flag] - Filter by flag
     * @param {string} [options.tag] - Filter by tag
     * @param {string} [options.sortBy] - Sort field (sent_at, priority, from_name)
     * @param {string} [options.sortOrder] - Sort order (asc, desc)
     * @param {number} [options.limit] - Max results
     * @returns {Promise<{success: boolean, messages?: Array, error?: string}>}
     */
    async list(options = {}) {
        const currentUser = await getCurrentUser();
        if (!currentUser?.id) {
            return { success: false, error: 'No user logged in' };
        }

        const result = await AdoleAPI.atomes.list({
            type: 'message',
            ownerId: currentUser.id
        });

        console.log('[MessagesAPI.list] Raw result:', result);

        // Combine messages from both sources, deduplicating by ID
        // Prefer Tauri (local) over Fastify (server) as local is more up-to-date
        const tauriMessages = result.tauri?.atomes || [];
        const fastifyMessages = result.fastify?.atomes || [];

        // Create a map to deduplicate by atome_id
        const messageMap = new Map();

        // Add Tauri messages first (they take priority)
        for (const msg of tauriMessages) {
            const id = msg.atome_id || msg.id;
            if (id) {
                messageMap.set(id, msg);
            }
        }

        // Add Fastify messages only if not already present
        for (const msg of fastifyMessages) {
            const id = msg.atome_id || msg.id;
            if (id && !messageMap.has(id)) {
                messageMap.set(id, msg);
            }
        }

        let messages = Array.from(messageMap.values());

        console.log('[MessagesAPI.list] Tauri:', tauriMessages.length, 'Fastify:', fastifyMessages.length, 'Deduplicated:', messages.length);

        // Log first message structure for debugging
        if (messages.length > 0) {
            console.log('[MessagesAPI.list] Sample message structure:', JSON.stringify(messages[0], null, 2));
        }

        // Normalize particles access (atomes have data.particles or data directly)
        messages = messages.map(m => {
            // The particles could be in: m.data (direct), m.data.particles, or m.particles
            let particles = {};
            if (m.data && typeof m.data === 'object') {
                // Check if data has nested particles or is particles directly
                if (m.data.inbox_type !== undefined || m.data.from_phone !== undefined) {
                    // data IS the particles
                    particles = m.data;
                } else if (m.data.particles) {
                    particles = m.data.particles;
                } else {
                    particles = m.data;
                }
            } else if (m.particles) {
                particles = m.particles;
            }

            return {
                ...m,
                particles, // Expose particles at top level for filtering
                atome_id: m.atome_id
            };
        });

        // Log normalized first message
        if (messages.length > 0) {
            console.log('[MessagesAPI.list] Normalized first message inbox_type:', messages[0].particles?.inbox_type);
            // Log all inbox_types to debug
            const inboxTypes = messages.map(m => ({
                id: m.atome_id || m.id,
                inbox_type: m.particles?.inbox_type,
                from: m.particles?.from_phone,
                to: m.particles?.to_phone
            }));
            console.log('[MessagesAPI.list] All message inbox_types:', JSON.stringify(inboxTypes, null, 2));
        }

        // Apply filters
        if (options.state) {
            messages = messages.filter(m => m.particles?.state === options.state);
        }

        if (options.inboxType) {
            console.log('[MessagesAPI.list] Filtering by inboxType:', options.inboxType);
            const beforeFilter = messages.length;
            messages = messages.filter(m => m.particles?.inbox_type === options.inboxType);
            console.log('[MessagesAPI.list] After inboxType filter:', beforeFilter, '->', messages.length);
        }

        if (options.fromPhone) {
            messages = messages.filter(m => m.particles?.from_phone === options.fromPhone);
        }

        if (options.flag) {
            messages = messages.filter(m => (m.particles?.flags || []).includes(options.flag));
        }

        if (options.tag) {
            messages = messages.filter(m => (m.particles?.tags || []).includes(options.tag));
        }

        // Exclude deleted by default unless explicitly requested
        if (options.state !== MESSAGE_STATES.DELETED) {
            messages = messages.filter(m => m.particles?.state !== MESSAGE_STATES.DELETED);
        }

        // Sort
        const sortBy = options.sortBy || 'sent_at';
        const sortOrder = options.sortOrder || 'desc';
        messages.sort((a, b) => {
            const aVal = a.particles?.[sortBy];
            const bVal = b.particles?.[sortBy];
            if (sortOrder === 'asc') {
                return aVal > bVal ? 1 : -1;
            }
            return aVal < bVal ? 1 : -1;
        });

        // Limit
        if (options.limit && messages.length > options.limit) {
            messages = messages.slice(0, options.limit);
        }

        return { success: true, messages };
    },

    /**
     * Get message by ID
     * @param {string} messageId - Message atome ID
     * @returns {Promise<{success: boolean, message?: Object, error?: string}>}
     */
    async get(messageId) {
        const result = await AdoleAPI.atomes.get(messageId);

        if (result.tauri?.success || result.fastify?.success) {
            return {
                success: true,
                message: result.tauri?.atome || result.fastify?.atome
            };
        }
        return { success: false, error: result.tauri?.error || result.fastify?.error };
    },

    /**
     * Get unread message count
     * @returns {Promise<{success: boolean, count?: number, error?: string}>}
     */
    async getUnreadCount() {
        const result = await this.list({
            state: MESSAGE_STATES.UNREAD,
            inboxType: 'received'
        });

        if (result.success) {
            return { success: true, count: result.messages.length };
        }
        return { success: false, error: result.error };
    },

    /**
     * Get messages grouped by conversation (sender)
     * @returns {Promise<{success: boolean, conversations?: Object, error?: string}>}
     */
    async getConversations() {
        const result = await this.list({ inboxType: 'received' });

        if (!result.success) {
            return result;
        }

        // Group by sender
        const conversations = {};
        for (const msg of result.messages) {
            const fromPhone = msg.particles?.from_phone || 'unknown';
            if (!conversations[fromPhone]) {
                conversations[fromPhone] = {
                    fromPhone,
                    fromName: msg.particles?.from_name || fromPhone,
                    messages: [],
                    unreadCount: 0,
                    lastMessage: null
                };
            }
            conversations[fromPhone].messages.push(msg);
            if (msg.particles?.state === MESSAGE_STATES.UNREAD) {
                conversations[fromPhone].unreadCount++;
            }
            if (!conversations[fromPhone].lastMessage ||
                msg.particles?.sent_at > conversations[fromPhone].lastMessage.particles?.sent_at) {
                conversations[fromPhone].lastMessage = msg;
            }
        }

        return { success: true, conversations };
    }
};

// ============================================
// REQUESTS API (Connection Requests)
// ============================================

const RequestsAPI = {

    /**
     * Accept a connection request
     * Adds sender to contacts and converts request to normal message
     * @param {string} messageId - Request message ID
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async accept(messageId) {
        const currentUser = await getCurrentUser();
        if (!currentUser?.id) {
            return { success: false, error: 'No user logged in' };
        }

        // Get the message
        const msgResult = await AdoleAPI.atomes.get(messageId);
        const atome = msgResult.tauri?.atome || msgResult.fastify?.atome;

        if (!atome) {
            return { success: false, error: 'Message not found' };
        }

        const particles = atome.particles || {};

        // Add sender to contacts
        await ContactsAPI.add(particles.from_phone, particles.from_name);

        // Update message state from request to unread
        const result = await AdoleAPI.atomes.alter({
            atomeId: messageId,
            particles: {
                state: MESSAGE_STATES.UNREAD,
                is_request: false,
                request_accepted_at: new Date().toISOString()
            }
        });

        if (result.tauri?.success || result.fastify?.success) {
            console.log(`[Messaging] Request accepted from ${particles.from_phone}`);

            // Notify sender that request was accepted
            try {
                await RemoteCommands.sendCommand(particles.from_phone, 'request-accepted', {
                    by: currentUser.phone,
                    byName: currentUser.name
                });
            } catch (e) {
                // Notification failed, not critical
            }

            return { success: true };
        }

        return { success: false, error: result.tauri?.error || result.fastify?.error };
    },

    /**
     * Reject a connection request
     * @param {string} messageId - Request message ID
     * @param {boolean} [block=false] - Also block the sender
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async reject(messageId, block = false) {
        const currentUser = await getCurrentUser();
        if (!currentUser?.id) {
            return { success: false, error: 'No user logged in' };
        }

        // Get the message
        const msgResult = await AdoleAPI.atomes.get(messageId);
        const atome = msgResult.tauri?.atome || msgResult.fastify?.atome;

        if (!atome) {
            return { success: false, error: 'Message not found' };
        }

        const particles = atome.particles || {};

        // Block sender if requested
        if (block) {
            await ContactsAPI.block(particles.from_phone);
        }

        // Delete the request message
        const result = await AdoleAPI.atomes.alter({
            atomeId: messageId,
            particles: {
                state: MESSAGE_STATES.DELETED,
                is_request: false,
                request_rejected_at: new Date().toISOString(),
                deleted_at: new Date().toISOString()
            }
        });

        if (result.tauri?.success || result.fastify?.success) {
            console.log(`[Messaging] Request rejected from ${particles.from_phone}`);
            return { success: true };
        }

        return { success: false, error: result.tauri?.error || result.fastify?.error };
    },

    /**
     * List pending connection requests
     * @returns {Promise<{success: boolean, requests?: Array, error?: string}>}
     */
    async list() {
        const result = await MessagesAPI.list({
            state: MESSAGE_STATES.REQUEST,
            inboxType: 'received'
        });

        if (result.success) {
            return { success: true, requests: result.messages };
        }
        return { success: false, error: result.error };
    },

    /**
     * Get pending request count
     * @returns {Promise<{success: boolean, count?: number, error?: string}>}
     */
    async getCount() {
        const result = await this.list();

        if (result.success) {
            return { success: true, count: result.requests.length };
        }
        return { success: false, error: result.error };
    }
};

// ============================================
// INBOX API (Convenience methods)
// ============================================

const InboxAPI = {

    /**
     * Get inbox summary (counts for each state)
     * @returns {Promise<{success: boolean, summary?: Object, error?: string}>}
     */
    async getSummary() {
        const currentUser = await getCurrentUser();
        if (!currentUser?.id) {
            return { success: false, error: 'No user logged in' };
        }

        const result = await AdoleAPI.atomes.list({
            type: 'message',
            ownerId: currentUser.id
        });

        let messages = [];
        if (result.tauri?.success) {
            messages = result.tauri.atomes || [];
        } else if (result.fastify?.success) {
            messages = result.fastify.atomes || [];
        }

        // Filter to received messages only
        messages = messages.filter(m => m.particles?.inbox_type === 'received');

        const summary = {
            requests: 0,
            unread: 0,
            read: 0,
            archived: 0,
            deleted: 0,
            total: messages.length
        };

        for (const msg of messages) {
            const state = msg.particles?.state || MESSAGE_STATES.UNREAD;
            if (summary[state] !== undefined) {
                summary[state]++;
            }
        }

        return { success: true, summary };
    },

    /**
     * Get all unread items (messages + requests)
     * @returns {Promise<{success: boolean, items?: Array, error?: string}>}
     */
    async getUnread() {
        const [messagesResult, requestsResult] = await Promise.all([
            MessagesAPI.list({ state: MESSAGE_STATES.UNREAD, inboxType: 'received' }),
            RequestsAPI.list()
        ]);

        const items = [
            ...(messagesResult.messages || []),
            ...(requestsResult.requests || [])
        ];

        // Sort by date
        items.sort((a, b) => {
            const aDate = a.particles?.sent_at || '';
            const bDate = b.particles?.sent_at || '';
            return bDate.localeCompare(aDate);
        });

        return { success: true, items };
    },

    /**
     * Mark all messages as read
     * @returns {Promise<{success: boolean, count?: number, error?: string}>}
     */
    async markAllAsRead() {
        const result = await MessagesAPI.list({
            state: MESSAGE_STATES.UNREAD,
            inboxType: 'received'
        });

        if (!result.success) {
            return result;
        }

        let count = 0;
        for (const msg of result.messages) {
            const readResult = await MessagesAPI.markAsRead(msg.atome_id || msg.id);
            if (readResult.success) count++;
        }

        return { success: true, count };
    },

    /**
     * Sync inbox on login (fetch all unread messages)
     * Call this when user logs in
     * @returns {Promise<{success: boolean, unreadCount?: number, requestCount?: number, error?: string}>}
     */
    async syncOnLogin() {
        const currentUser = await getCurrentUser();
        if (!currentUser?.id) {
            return { success: false, error: 'No user logged in' };
        }

        console.log('[Messaging] Syncing inbox on login...');

        const summary = await this.getSummary();

        if (summary.success) {
            console.log(`[Messaging] Inbox synced: ${summary.summary.unread} unread, ${summary.summary.requests} requests`);
            return {
                success: true,
                unreadCount: summary.summary.unread,
                requestCount: summary.summary.requests
            };
        }

        return { success: false, error: summary.error };
    }
};

// ============================================
// REAL-TIME HANDLERS
// ============================================

// Guard to prevent multiple handler registrations
let handlersRegistered = false;

/**
 * Register handlers for incoming real-time messages
 * Call this at app startup
 */
function registerMessageHandlers() {
    // Prevent registering handlers multiple times
    if (handlersRegistered) {
        console.log('[Messaging] Handlers already registered, skipping');
        return;
    }
    handlersRegistered = true;

    // Handler for new incoming message notification
    RemoteCommands.register('new-message', async (data) => {
        console.log(`[Messaging] New message notification from ${data.fromName || data.from}`, data);

        const currentUser = await getCurrentUser();
        if (!currentUser?.id) {
            console.log('[Messaging] Cannot process message: no user logged in');
            return { success: false, reason: 'no_user' };
        }

        // Check if sender is in contacts
        const contactCheck = await ContactsAPI.isContact(data.from);

        if (contactCheck.isBlocked) {
            console.log(`[Messaging] Message blocked from ${data.from}`);
            return { success: false, reason: 'blocked' };
        }

        // Check if message already exists (it may have been created server-side)
        const existingCheck = await AdoleAPI.atomes.get(data.messageId);
        const messageExists = existingCheck.tauri?.success || existingCheck.fastify?.success;

        if (messageExists) {
            console.log(`[Messaging] Message already exists: ${data.messageId}`);
        } else {
            // Create the message locally in recipient's database (for offline support)
            const isRequest = !contactCheck.isContact;
            const messageState = isRequest ? MESSAGE_STATES.REQUEST : MESSAGE_STATES.UNREAD;

            console.log(`[Messaging] Creating message locally: ${data.messageId}`);

            const createResult = await AdoleAPI.atomes.create({
                id: data.messageId,
                type: 'message',
                ownerId: currentUser.id,
                particles: {
                    from_user_id: data.fromId,
                    from_phone: data.from,
                    from_name: data.fromName,
                    to_user_id: currentUser.id,
                    to_phone: currentUser.phone,
                    content: data.preview, // Full content should be passed
                    subject: data.subject || null,
                    state: messageState,
                    is_request: isRequest,
                    inbox_type: 'received',
                    sent_at: data.sentAt,
                    displayed_at: new Date().toISOString(),
                    read_at: null,
                    archived_at: null,
                    deleted_at: null,
                    tags: [],
                    priority: 3,
                    flags: []
                }
            });

            if (createResult.tauri?.success || createResult.fastify?.success) {
                console.log(`[Messaging] Message stored locally: ${data.messageId}`);
            } else {
                console.error('[Messaging] Failed to store message locally:', createResult);
            }
        }

        const isRequest = !contactCheck.isContact;

        // Emit event for UI to handle (refresh inbox, show notification, etc.)
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('adole-new-message', {
                detail: {
                    ...data,
                    isRequest
                }
            }));
        }

        return { success: true };
    });

    // Handler for read receipt
    RemoteCommands.register('message-read', (data) => {
        console.log(`[Messaging] Message ${data.messageId} read at ${data.readAt}`);

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('adole-message-read', { detail: data }));
        }

        return { success: true };
    });

    // Handler for connection request accepted
    RemoteCommands.register('request-accepted', async (data) => {
        console.log(`[Messaging] Connection request accepted by ${data.byName || data.by}`);

        // Add them to our contacts too
        await ContactsAPI.add(data.by, data.byName);

        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('adole-request-accepted', { detail: data }));
        }

        return { success: true };
    });

    // Handler for typing indicator
    RemoteCommands.register('typing', (data) => {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('adole-typing', { detail: data }));
        }
        return { success: true };
    });

    console.log('[Messaging] Real-time handlers registered');
}

/**
 * Send typing indicator to a user
 * @param {string} toPhone - Recipient phone
 * @param {boolean} [isTyping=true] - Whether user is typing
 */
async function sendTypingIndicator(toPhone, isTyping = true) {
    const currentUser = await getCurrentUser();
    if (!currentUser?.id) return;

    try {
        await RemoteCommands.sendCommand(toPhone, 'typing', {
            from: currentUser.phone,
            fromName: currentUser.name,
            isTyping
        });
    } catch (e) {
        // Typing indicator is not critical
    }
}

// ============================================
// MESSAGING API EXPORT
// ============================================

export const MessagingAPI = {
    contacts: ContactsAPI,
    messages: MessagesAPI,
    requests: RequestsAPI,
    inbox: InboxAPI,

    // Real-time
    registerHandlers: registerMessageHandlers,
    sendTypingIndicator,

    // Constants
    MESSAGE_STATES,
    CONTACT_STATUS
};

// Auto-register handlers when module loads
// Wait for RemoteCommands to be ready
setTimeout(() => {
    if (typeof RemoteCommands !== 'undefined' && RemoteCommands.isActive?.()) {
        registerMessageHandlers();
        console.log('[MessagingAPI] Handlers registered automatically');
    } else {
        // Retry after connection is established
        const checkInterval = setInterval(() => {
            if (typeof RemoteCommands !== 'undefined' && RemoteCommands.isActive?.()) {
                registerMessageHandlers();
                console.log('[MessagingAPI] Handlers registered after connection');
                clearInterval(checkInterval);
            }
        }, 1000);
        // Stop trying after 30 seconds
        setTimeout(() => clearInterval(checkInterval), 30000);
    }
}, 500);

export default MessagingAPI;