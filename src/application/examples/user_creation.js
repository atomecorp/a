const rootId = 'userAccountExampleRoot';

const AccountState = {
    UNKNOWN: 'unknown',
    PROFILE: 'profile',
    LOGIN: 'login',
    SIGNUP: 'signup'
};

const accountStore = {
    currentUser: null,
    isLoggedIn: false,
    optionalFieldsVisible: false
};

function ensureRootContainer() {
    if (document.getElementById(rootId)) return;
    $('div', {
        id: rootId,
        css: {
            backgroundColor: '#181818',
            color: '#f4f4f4',
            padding: '16px',
            margin: '12px',
            borderRadius: '8px',
            width: '380px'
        }
    });
}

function buildRow({ label, inputId, type = 'text', value = '', placeholder = '', onInput }) {
    const rowId = `${inputId}_row`;
    if (!document.getElementById(rowId)) {
        $('div', {
            id: rowId,
            parent: `#${rootId}`,
            css: {
                marginBottom: '12px'
            },
            children: [
                $('div', {
                    css: {
                        fontSize: '13px',
                        marginBottom: '4px',
                        color: '#bbb'
                    },
                    text: label
                }),
                $('input', {
                    id: inputId,
                    type,
                    value,
                    placeholder,
                    css: {
                        width: '100%',
                        padding: '8px',
                        borderRadius: '4px',
                        border: '1px solid #333',
                        backgroundColor: '#222',
                        color: '#fff'
                    },
                    onInput
                })
            ]
        });
    } else {
        const input = document.getElementById(inputId);
        if (input) input.value = value;
    }
}

function removeChildren() {
    const root = document.getElementById(rootId);
    if (!root) return;
    while (root.firstChild) {
        root.removeChild(root.firstChild);
    }
}

function simulateLocalAccountLookup() {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve({ found: Boolean(accountStore.currentUser), user: accountStore.currentUser });
        }, 300);
    });
}

function simulateOnlineProbe(username) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve({ onlineReachable: true, existsOnline: username === 'demo-user' });
        }, 600);
    });
}

function renderOptionalFieldsSection() {
    const toggleId = 'user_optional_toggle';
    const containerId = 'user_optional_fields';
    if (!document.getElementById(toggleId)) {
        $('div', {
            id: toggleId,
            parent: `#${rootId}`,
            text: accountStore.optionalFieldsVisible ? 'Hide optional details' : 'Show optional details',
            css: {
                cursor: 'pointer',
                color: '#4db6ff',
                marginBottom: '8px'
            },
            onClick: () => {
                accountStore.optionalFieldsVisible = !accountStore.optionalFieldsVisible;
                renderAccountPanel(AccountState.PROFILE);
            }
        });
    } else {
        document.getElementById(toggleId).textContent = accountStore.optionalFieldsVisible ? 'Hide optional details' : 'Show optional details';
    }

    let optionalContainer = document.getElementById(containerId);
    if (!optionalContainer) {
        optionalContainer = $('div', {
            id: containerId,
            parent: `#${rootId}`,
            css: {
                display: accountStore.optionalFieldsVisible ? 'block' : 'none',
                backgroundColor: '#1f1f1f',
                padding: '10px',
                borderRadius: '6px',
                marginBottom: '12px'
            }
        });
    } else {
        optionalContainer.style.display = accountStore.optionalFieldsVisible ? 'block' : 'none';
    }

    if (accountStore.optionalFieldsVisible) {
        optionalContainer.innerHTML = '';
        const fields = [
            { key: 'email', label: 'Email', type: 'email' },
            { key: 'age', label: 'Age', type: 'number' },
            { key: 'weight', label: 'Weight (kg)', type: 'number' },
            { key: 'address', label: 'Address' },
            { key: 'parents', label: 'Parents' },
            { key: 'children', label: 'Children' },
            { key: 'skills', label: 'Skills' },
            { key: 'preferences', label: 'Preferences' }
        ];
        fields.forEach((field) => {
            const value = accountStore.currentUser?.optional?.[field.key] || '';
            $('div', {
                parent: `#${containerId}`,
                css: {
                    marginBottom: '10px'
                },
                children: [
                    $('div', {
                        css: {
                            fontSize: '12px',
                            marginBottom: '4px',
                            color: '#888'
                        },
                        text: field.label
                    }),
                    $('input', {
                        value,
                        type: field.type || 'text',
                        css: {
                            width: '100%',
                            padding: '6px',
                            borderRadius: '4px',
                            border: '1px solid #333',
                            backgroundColor: '#262626',
                            color: '#fff'
                        },
                        onInput: (event) => {
                            const nextOptional = accountStore.currentUser?.optional || {};
                            nextOptional[field.key] = event.target.value;
                            accountStore.currentUser = {
                                ...accountStore.currentUser,
                                optional: nextOptional
                            };
                        }
                    })
                ]
            });
        });
    }
}

function renderProfileEditor() {
    removeChildren();
    $('div', {
        parent: `#${rootId}`,
        text: 'Account overview',
        css: {
            fontSize: '18px',
            fontWeight: 'bold',
            marginBottom: '12px'
        }
    });

    buildRow({
        label: 'Username',
        inputId: 'profile_username',
        value: accountStore.currentUser?.username || '',
        onInput: (event) => {
            accountStore.currentUser = {
                ...accountStore.currentUser,
                username: event.target.value
            };
        }
    });

    buildRow({
        label: 'Phone number',
        inputId: 'profile_phone',
        value: accountStore.currentUser?.phone || '',
        onInput: (event) => {
            accountStore.currentUser = {
                ...accountStore.currentUser,
                phone: event.target.value
            };
        }
    });

    const passwordFieldId = 'profile_password';
    buildRow({
        label: 'Password (hidden)',
        inputId: passwordFieldId,
        value: '********',
        type: 'password',
        onInput: () => {
            puts('[account] Password update requested');
        }
    });

    renderOptionalFieldsSection();

    $('div', {
        parent: `#${rootId}`,
        css: {
            display: 'flex',
            justifyContent: 'space-between'
        },
        children: [
            $('button', {
                text: 'Save changes',
                css: {
                    padding: '8px 12px',
                    backgroundColor: '#2e7d32',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                },
                onClick: () => {
                    puts('[account] Saving profile...', accountStore.currentUser);
                }
            }),
            $('button', {
                text: 'Log out',
                css: {
                    padding: '8px 12px',
                    backgroundColor: '#c62828',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                },
                onClick: () => {
                    accountStore.isLoggedIn = false;
                    renderAccountPanel(AccountState.LOGIN);
                }
            })
        ]
    });
}

function renderLoginForm() {
    removeChildren();
    $('div', {
        parent: `#${rootId}`,
        text: 'User login',
        css: {
            fontSize: '18px',
            fontWeight: 'bold',
            marginBottom: '12px'
        }
    });

    buildRow({
        label: 'Username',
        inputId: 'login_username',
        value: accountStore.currentUser?.username || '',
        onInput: (event) => {
            accountStore.currentUser = {
                ...(accountStore.currentUser || {}),
                username: event.target.value
            };
        }
    });

    buildRow({
        label: 'Password',
        inputId: 'login_password',
        type: 'password'
    });

    $('button', {
        parent: `#${rootId}`,
        text: 'Sign in',
        css: {
            padding: '8px 12px',
            backgroundColor: '#1565c0',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
        },
        onClick: async () => {
            puts('[account] Attempting login...');
            accountStore.isLoggedIn = true;
            const optional = accountStore.currentUser?.optional || {};
            accountStore.currentUser = {
                ...(accountStore.currentUser || {}),
                optional
            };
            renderAccountPanel(AccountState.PROFILE);
        }
    });

    $('div', {
        parent: `#${rootId}`,
        text: 'Need an account? Create one',
        css: {
            marginTop: '10px',
            color: '#4db6ff',
            cursor: 'pointer'
        },
        onClick: () => {
            renderAccountPanel(AccountState.SIGNUP);
        }
    });
}

function renderSignupForm() {
    removeChildren();
    $('div', {
        parent: `#${rootId}`,
        text: 'Create local account',
        css: {
            fontSize: '18px',
            fontWeight: 'bold',
            marginBottom: '12px'
        }
    });

    const defaults = accountStore.currentUser || {};

    buildRow({
        label: 'Username',
        inputId: 'signup_username',
        value: defaults.username || '',
        onInput: (event) => {
            accountStore.currentUser = {
                ...(accountStore.currentUser || {}),
                username: event.target.value
            };
        }
    });

    buildRow({
        label: 'Phone number',
        inputId: 'signup_phone',
        value: defaults.phone || '',
        onInput: (event) => {
            accountStore.currentUser = {
                ...(accountStore.currentUser || {}),
                phone: event.target.value
            };
        }
    });

    buildRow({
        label: 'Password',
        inputId: 'signup_password',
        type: 'password'
    });

    renderOptionalFieldsSection();

    $('button', {
        parent: `#${rootId}`,
        text: 'Create account',
        css: {
            padding: '8px 12px',
            backgroundColor: '#2e7d32',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
        },
        onClick: () => {
            if (!accountStore.currentUser?.username || !accountStore.currentUser?.phone) {
                puts('[account] Missing mandatory signup fields');
                return;
            }
            puts('[account] Account created locally', accountStore.currentUser);
            accountStore.isLoggedIn = true;
            renderAccountPanel(AccountState.PROFILE);
        }
    });

    $('div', {
        parent: `#${rootId}`,
        text: 'Already have an account? Login',
        css: {
            marginTop: '10px',
            color: '#4db6ff',
            cursor: 'pointer'
        },
        onClick: () => {
            renderAccountPanel(AccountState.LOGIN);
        }
    });
}

function renderAccountPanel(state) {
    ensureRootContainer();
    switch (state) {
        case AccountState.PROFILE:
            renderProfileEditor();
            break;
        case AccountState.LOGIN:
            renderLoginForm();
            break;
        case AccountState.SIGNUP:
            renderSignupForm();
            break;
        default:
            removeChildren();
            $('div', {
                parent: `#${rootId}`,
                text: 'Select an action to continue',
                css: {
                    color: '#ccc',
                    fontStyle: 'italic'
                }
            });
    }
}

function buildEntryButton() {
    $('button', {
        id: 'account_entry_btn',
        text: 'user',
        css: {
            padding: '10px 14px',
            backgroundColor: '#1976d2',
            color: '#fff',
            border: 'none',
            width: '60px',
            height: '60px',
            borderRadius: '4px',
            cursor: 'pointer',
            margin: '12px'
        },
        onClick: async () => {
            ensureRootContainer();
            $('div', {
                parent: `#${rootId}`,
                text: 'Checking local account...',
                css: {
                    color: '#aaa',
                    marginBottom: '8px'
                }
            });

            const localResult = await simulateLocalAccountLookup();
            if (localResult.found) {
                accountStore.currentUser = {
                    username: localResult.user.username,
                    phone: localResult.user.phone,
                    optional: localResult.user.optional || {}
                };
                if (accountStore.isLoggedIn) {
                    renderAccountPanel(AccountState.PROFILE);
                    return;
                }
                renderAccountPanel(AccountState.LOGIN);
                return;
            }

            renderAccountPanel(AccountState.SIGNUP);

            const tentativeUsername = accountStore.currentUser?.username || 'pending-user';
            const remote = await simulateOnlineProbe(tentativeUsername);
            if (remote.onlineReachable) {
                puts(`[account] Remote check complete. Exists online: ${remote.existsOnline}`);
            } else {
                puts('[account] Remote auth server unreachable; will retry later');
            }
        }
    });
}

buildEntryButton();
renderAccountPanel(AccountState.UNKNOWN);
