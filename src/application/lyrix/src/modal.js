// Modal Component for Squirrel Framework
// Skinnable modal component compatible with Tauri
import { UIManager } from './ui.js';

export function Modal(options = {}) {
    const {
        title = 'Modal',
        content = '',
        buttons = [{ text: 'OK', onClick: () => {} }],
        onClose = null,
        closable = true,
        css = {},
        overlay = true,
        animation = true,
        size = 'medium' // small, medium, large, fullscreen
    } = options;

    // Remove existing modals if any
    const existingModal = document.getElementById('squirrel-modal');
    if (existingModal) {
        existingModal.remove();
    }

    // Create overlay
    const modalOverlay = $('div', {
        id: 'squirrel-modal',
        css: {
            position: 'fixed',
            top: '0',
            left: '0',
            width: '100vw',
            height: '100vh',
            backgroundColor: overlay ? 'rgba(0, 0, 0, 0.5)' : 'transparent',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: '10000',
            opacity: animation ? '0' : '1',
            transition: animation ? 'opacity 0.3s ease' : 'none'
        }
    });

    // Size presets
    const sizePresets = {
        small: { width: '300px', minHeight: '200px' },
        medium: { width: '500px', minHeight: '300px' },
        large: { width: '700px', minHeight: '400px' },
        fullscreen: { width: '90vw', height: '90vh' }
    };

    const modalSize = sizePresets[size] || sizePresets.medium;

    // Create modal container
    const modalContainer = $('div', {
        css: {
            backgroundColor: '#ffffff',
            borderRadius: '8px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
            maxWidth: '90vw',
            maxHeight: '90vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            transform: animation ? 'scale(0.9)' : 'scale(1)',
            transition: animation ? 'transform 0.3s ease' : 'none',
            ...modalSize,
            ...css
        }
    });

    // Create header
    const modalHeader = $('div', {
        css: {
            padding: '20px 20px 10px 20px',
            borderBottom: '1px solid #e0e0e0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#f8f9fa'
        }
    });

    const modalTitle = $('h3', {
        text: title,
        css: {
            margin: '0',
            fontSize: '1.2em',
            color: '#333',
            fontWeight: '600'
        }
    });

    modalHeader.appendChild(modalTitle);

    // Close button if closable
    if (closable) {
        const closeButton = Button({
            text: '✕',
            onClick: () => {
                closeModal();
            },
            css: {
                backgroundColor: 'transparent',
                border: 'none',
                fontSize: '18px',
                color: '#666',
                cursor: 'pointer',
                padding: '5px',
                borderRadius: '50%',
                width: '30px',
                height: '30px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
            }
        });

        closeButton.addEventListener('mouseenter', () => {
            closeButton.style.backgroundColor = '#f0f0f0';
        });

        closeButton.addEventListener('mouseleave', () => {
            closeButton.style.backgroundColor = 'transparent';
        });

        modalHeader.appendChild(closeButton);
    }

    // Create content area
    const modalContent = $('div', {
        css: {
            padding: '20px',
            flex: '1',
            overflow: 'auto'
        }
    });

    // Add content
    if (typeof content === 'string') {
        modalContent.innerHTML = content;
    } else if (content instanceof HTMLElement) {
        modalContent.appendChild(content);
    }

    // Create footer with buttons
    const modalFooter = $('div', {
        css: {
            padding: '10px 20px 20px 20px',
            borderTop: '1px solid #e0e0e0',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '10px',
            backgroundColor: '#f8f9fa'
        }
    });

    // Add buttons
    buttons.forEach((buttonOptions, index) => {
        const button = Button({
            text: buttonOptions.text || `Button ${index + 1}`,
            onClick: () => {
                if (buttonOptions.onClick) {
                    buttonOptions.onClick();
                }
                if (buttonOptions.closeModal !== false) {
                    closeModal();
                }
            },
            css: {
                padding: '8px 16px',
                borderRadius: '4px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '14px',
                backgroundColor: index === buttons.length - 1 ? '#007bff' : '#6c757d',
                color: 'white',
                ...buttonOptions.css
            }
        });

        modalFooter.appendChild(button);
    });

    // Assemble modal
    modalContainer.appendChild(modalHeader);
    modalContainer.appendChild(modalContent);
    modalContainer.appendChild(modalFooter);
    modalOverlay.appendChild(modalContainer);

    // Close modal function
    function closeModal() {
        if (animation) {
            modalOverlay.style.opacity = '0';
            modalContainer.style.transform = 'scale(0.9)';
            setTimeout(() => {
                modalOverlay.remove();
            }, 300);
        } else {
            modalOverlay.remove();
        }

        if (onClose) {
            onClose();
        }
    }

    // Close on overlay click
    if (overlay && closable) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                closeModal();
            }
        });
    }

    // Close on escape key
    if (closable) {
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);
    }

    // Add to DOM
    document.body.appendChild(modalOverlay);

    // Animate in
    if (animation) {
        setTimeout(() => {
            modalOverlay.style.opacity = '1';
            modalContainer.style.transform = 'scale(1)';
        }, 10);
    }

    // Return modal object with methods
    return {
        element: modalOverlay,
        container: modalContainer,
        content: modalContent,
        close: closeModal,
        setTitle: (newTitle) => {
            modalTitle.textContent = newTitle;
        },
        setContent: (newContent) => {
            if (typeof newContent === 'string') {
                modalContent.innerHTML = newContent;
            } else if (newContent instanceof HTMLElement) {
                modalContent.innerHTML = '';
                modalContent.appendChild(newContent);
            }
        }
    };
}

// Specialized modals

// Confirmation modal
export function ConfirmModal(options = {}) {
    const {
        title = 'Confirmation',
        message = 'Are you sure?',
        onConfirm = () => {},
        onCancel = () => {},
        confirmText = 'Confirm',
        cancelText = 'Cancel'
    } = options;

    return Modal({
        title,
        content: `<p style="margin: 0; font-size: 16px; line-height: 1.5; color: #333;">${message}</p>`,
        buttons: [
            {
                text: cancelText,
                onClick: onCancel,
                css: { backgroundColor: '#6c757d' }
            },
            {
                text: confirmText,
                onClick: onConfirm,
                css: { backgroundColor: '#dc3545' }
            }
        ],
        size: 'small',
        ...options
    });
}

// Input modal
export function InputModal(options = {}) {
    const {
        title = 'Input',
        label = 'Enter value:',
        placeholder = '',
        defaultValue = '',
        onSubmit = () => {},
        onCancel = () => {},
        submitText = 'Submit',
        cancelText = 'Cancel',
        inputType = 'text',
        required = false
    } = options;

    // Create input element
    const inputContainer = $('div', {
        css: {
            marginBottom: '20px'
        }
    });

    const labelElement = $('label', {
        text: label,
        css: {
            display: 'block',
            marginBottom: '8px',
            fontSize: '14px',
            fontWeight: '500',
            color: '#333'
        }
    });

    const inputElement = $('input', {
        type: inputType,
        placeholder: placeholder,
        value: defaultValue,
        css: {
            width: '100%',
            padding: '10px',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '14px',
            boxSizing: 'border-box'
        }
    });

    inputContainer.appendChild(labelElement);
    inputContainer.appendChild(inputElement);

    const modal = Modal({
        title,
        content: inputContainer,
        buttons: [
            {
                text: cancelText,
                onClick: onCancel,
                css: { backgroundColor: '#6c757d' }
            },
            {
                text: submitText,
                onClick: () => {
                    const value = inputElement.value.trim();
                    if (required && !value) {
                        inputElement.style.borderColor = '#dc3545';
                        inputElement.focus();
                        return;
                    }
                    onSubmit(value);
                },
                css: { backgroundColor: '#28a745' }
            }
        ],
        size: 'small',
        onClose: onCancel,
        ...options
    });

    // Focus input after modal opens
    setTimeout(() => {
        inputElement.focus();
    }, 100);

    // Submit on Enter
    inputElement.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const value = inputElement.value.trim();
            if (required && !value) {
                inputElement.style.borderColor = '#dc3545';
                return;
            }
            onSubmit(value);
            modal.close();
        }
    });

    return modal;
}

// Form modal with multiple fields
export function FormModal(options = {}) {
    const {
        title = 'Form',
        fields = [],
        onSubmit = () => {},
        onCancel = () => {},
        submitText = 'Submit',
        cancelText = 'Cancel'
    } = options;

    // Create form
    const form = $('form', {
        css: {
            display: 'flex',
            flexDirection: 'column',
            gap: '15px'
        }
    });

    const inputs = {};

    fields.forEach(field => {
        const fieldContainer = $('div');

        const label = $('label', {
            text: field.label || field.name,
            css: {
                display: 'block',
                marginBottom: '5px',
                fontSize: '14px',
                fontWeight: '500',
                color: '#333'
            }
        });

        const input = $('input', {
            type: field.type || 'text',
            name: field.name,
            placeholder: field.placeholder || '',
            value: field.defaultValue || '',
            required: field.required || false,
            css: {
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                boxSizing: 'border-box'
            }
        });

        inputs[field.name] = input;

        fieldContainer.appendChild(label);
        fieldContainer.appendChild(input);
        form.appendChild(fieldContainer);
    });

    const modal = Modal({
        title,
        content: form,
        buttons: [
            {
                text: cancelText,
                onClick: onCancel,
                css: { backgroundColor: '#6c757d' }
            },
            {
                text: submitText,
                onClick: () => {
                    const values = {};
                    let isValid = true;

                    Object.keys(inputs).forEach(name => {
                        const input = inputs[name];
                        const value = input.value.trim();
                        const field = fields.find(f => f.name === name);

                        if (field.required && !value) {
                            input.style.borderColor = '#dc3545';
                            isValid = false;
                        } else {
                            input.style.borderColor = '#ddd';
                        }

                        values[name] = value;
                    });

                    if (isValid) {
                        onSubmit(values);
                    }
                },
                css: { backgroundColor: '#28a745' }
            }
        ],
        onClose: onCancel,
        ...options
    });

    // Focus first input
    setTimeout(() => {
        const firstInput = Object.values(inputs)[0];
        if (firstInput) {
            firstInput.focus();
        }
    }, 100);

    return modal;
}

// List selection modal
export function SelectModal(options = {}) {
    const {
        title = 'Select Item',
        items = [],
        onSelect = () => {},
        onCancel = () => {},
        onDelete = null, // New option for delete callback
        cancelText = 'Cancel',
        searchable = false
    } = options;

    // Create list container
    const container = $('div');

    let filteredItems = [...items];
    let listContainer;

    // Add search if enabled
    if (searchable) {
        const searchInput = $('input', {
            type: 'text',
            placeholder: 'Search...',
            css: {
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                marginBottom: '15px',
                fontSize: '14px',
                boxSizing: 'border-box'
            }
        });

        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            filteredItems = items.filter(item => 
                (typeof item === 'string' ? item : item.text || item.label || '').toLowerCase().includes(searchTerm)
            );
            updateList();
        });

        container.appendChild(searchInput);
    }

    // Create list
    listContainer = $('div', {
        css: {
            maxHeight: '300px',
            overflowY: 'auto',
            border: '1px solid #ddd',
            borderRadius: '4px'
        }
    });

    function updateList() {
        listContainer.innerHTML = '';
        
        filteredItems.forEach((item, index) => {
            const itemText = typeof item === 'string' ? item : item.text || item.label || `Item ${index + 1}`;
            const itemValue = typeof item === 'string' ? item : item.value || item;

            const itemElement = $('div', {
                css: {
                    padding: '12px 15px',
                    borderBottom: index < filteredItems.length - 1 ? '1px solid #e0e0e0' : 'none',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }
            });

            // Create text container
            const textElement = $('span', {
                text: itemText,
                css: {
                    flex: '1'
                }
            });
            
            itemElement.appendChild(textElement);

            // Add MIDI learn components if this is a song list modal
            if (onDelete && typeof onDelete === 'function') {
                // Create container for MIDI controls
                const midiContainer = $('div', {
                    css: {
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        marginLeft: '10px'
                    }
                });

                // MIDI note text box
                const midiNoteInput = $('input', {
                    type: 'text',
                    placeholder: 'MIDI Note',
                    css: {
                        width: '60px',
                        height: '20px',
                        fontSize: '11px',
                        textAlign: 'center',
                        border: '1px solid #ccc',
                        borderRadius: '3px',
                        padding: '2px'
                    }
                });

                // Load existing MIDI assignment if any
                const savedMidiNote = window.Lyrix?.midiUtilities?.getMidiAssignment?.(itemValue);
                if (savedMidiNote) {
                    midiNoteInput.value = savedMidiNote;
                }

                // MIDI learn button
                const midiLearnButton = UIManager.createInterfaceButton('🎹', {
                    css: {
                        width: '40px',      // Slightly smaller for modal context
                        height: '20px',
                        fontSize: '12px'
                    }
                });

                let isLearning = false;

                midiLearnButton.addEventListener('click', (e) => {
                    e.stopPropagation();
                    
                    if (isLearning) {
                        // Cancel learning
                        isLearning = false;
                        midiLearnButton.style.backgroundColor = '#007bff';
                        midiLearnButton.textContent = '🎹';
                        window.Lyrix?.midiUtilities?.stopMidiLearn?.();
                    } else {
                        // Start learning
                        isLearning = true;
                        midiLearnButton.style.backgroundColor = '#ff4757';
                        midiLearnButton.textContent = '⏹';
                        
                        // Start MIDI learn mode
                        if (window.Lyrix?.midiUtilities?.startMidiLearn) {
                            window.Lyrix.midiUtilities.startMidiLearn((midiNote) => {
                                // MIDI note learned
                                midiNoteInput.value = midiNote;
                                isLearning = false;
                                midiLearnButton.style.backgroundColor = '#007bff';
                                midiLearnButton.textContent = '🎹';
                                
                                // Save the assignment
                                window.Lyrix.midiUtilities.setMidiAssignment(itemValue, midiNote);
                                
                                console.log(`🎵 MIDI note ${midiNote} assigned to song: ${itemValue}`);
                            });
                        }
                    }
                });

                // Save MIDI assignment when input changes
                midiNoteInput.addEventListener('input', (e) => {
                    const midiNote = e.target.value.trim();
                    if (midiNote) {
                        window.Lyrix?.midiUtilities?.setMidiAssignment?.(itemValue, midiNote);
                    } else {
                        window.Lyrix?.midiUtilities?.removeMidiAssignment?.(itemValue);
                    }
                });

                midiContainer.appendChild(midiNoteInput);
                midiContainer.appendChild(midiLearnButton);
                itemElement.appendChild(midiContainer);
            }

            // Add delete button if onDelete callback is provided
            if (onDelete && typeof onDelete === 'function') {
                const deleteButton = UIManager.createInterfaceButton('🗑️', {
                    css: {
                        width: '40px',      // Slightly smaller for modal context
                        height: '20px',
                        backgroundColor: '#f44336',  // Red color for delete
                        fontSize: '14px'
                    }
                });

                deleteButton.addEventListener('mouseenter', () => {
                    deleteButton.style.backgroundColor = '#ff4757';
                });

                deleteButton.addEventListener('mouseleave', () => {
                    deleteButton.style.backgroundColor = 'transparent';
                });

                deleteButton.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent item selection
                    onDelete(itemValue, item);
                });

                itemElement.appendChild(deleteButton);
            }

            // Add hover effects for the entire item
            itemElement.addEventListener('mouseenter', () => {
                itemElement.style.backgroundColor = '#f8f9fa';
            });

            itemElement.addEventListener('mouseleave', () => {
                itemElement.style.backgroundColor = 'transparent';
            });

            // Click on text area selects the item
            textElement.addEventListener('click', () => {
                onSelect(itemValue, item);
                modal.close();
            });

            listContainer.appendChild(itemElement);
        });

        if (filteredItems.length === 0) {
            const noItems = $('div', {
                text: 'No items found',
                css: {
                    padding: '20px',
                    textAlign: 'center',
                    color: '#666',
                    fontStyle: 'italic'
                }
            });
            listContainer.appendChild(noItems);
        }
    }

    updateList();
    container.appendChild(listContainer);

    const modal = Modal({
        title,
        content: container,
        buttons: [
            {
                text: cancelText,
                onClick: onCancel,
                css: { backgroundColor: '#6c757d' }
            }
        ],
        onClose: onCancel,
        ...options
    });

    return modal;
}

export default Modal;
