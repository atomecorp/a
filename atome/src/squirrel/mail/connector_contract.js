export const MAIL_V1_ARCHITECTURE_DECISION = Object.freeze({
    provider: 'icloud_imap_smtp',
    read_path: {
        protocol: 'imap',
        host: 'imap.mail.me.com',
        port: 993,
        security: 'tls'
    },
    send_path: {
        protocol: 'smtp',
        host: 'smtp.mail.me.com',
        port: 587,
        security: 'starttls'
    },
    execution_model: {
        sync_source_of_truth: 'icloud_mailbox',
        local_index: 'normalized_mail_index',
        draft_policy: 'draft_before_send',
        delivery_policy: 'explicit_confirmation_before_send'
    },
    voice_capabilities: [
        'mail_list',
        'mail_read',
        'mail_mark_read',
        'mail_search',
        'mail_next_unread',
        'mail_archive',
        'mail_delete',
        'mail_reply_draft',
        'mail_send'
    ]
});

export const createMailConnectorContract = ({
    provider = MAIL_V1_ARCHITECTURE_DECISION.provider,
    read_capabilities = ['mail_list', 'mail_read', 'mail_mark_read', 'mail_search', 'mail_next_unread'],
    write_capabilities = ['mail_archive', 'mail_delete', 'mail_reply_draft', 'mail_send']
} = {}) => ({
    provider: String(provider || MAIL_V1_ARCHITECTURE_DECISION.provider),
    read_capabilities: Array.isArray(read_capabilities) ? read_capabilities.map((entry) => String(entry)) : [],
    write_capabilities: Array.isArray(write_capabilities) ? write_capabilities.map((entry) => String(entry)) : []
});
