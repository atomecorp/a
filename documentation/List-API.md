# 📋 List API - Interactive List Component

## 🚀 NEW: Web Component Version (2.0)

> **Note:** Cette documentation couvre la nouvelle version Web Component du composant List, qui remplace la version basée sur les classes traditionnelles.

### Quick Start - Web Component

```javascript
// 1. Création d'une liste simple
const list = new List({
    id: 'my-list',
    items: [
        { id: 1, text: 'Premier élément' },
        { id: 2, text: 'Deuxième élément' },
        { id: 3, text: 'Troisième élément' }
    ],
    style: {
        position: 'absolute',
        left: '50px',
        top: '50px',
        width: '300px',
        backgroundColor: '#ffffff',
        border: '1px solid #e0e0e0',
        borderRadius: '8px'
    }
});

// 2. Event listeners avec CustomEvents
list.addEventListener('list-item-click', (event) => {
    const { item, itemId } = event.detail;
    console.log(`Clicked: ${item.text} (ID: ${itemId})`);
});

// 3. Attachement au DOM
await list.attachTo('body');
```

### Advanced Styling with CSS Properties

```javascript
const modernList = new List({
    id: 'modern-list',
    items: [
        { 
            id: 1, 
            text: 'Item with custom style',
            style: { fontWeight: 'bold' },
            hoverStyle: { color: '#2196f3' },
            selectedStyle: { backgroundColor: '#e3f2fd' }
        }
    ],
    style: {
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        borderRadius: '15px',
        boxShadow: [
            '0 10px 25px rgba(0,0,0,0.2)',
            '0 0 0 1px rgba(255,255,255,0.1) inset'
        ],
        backdropFilter: 'blur(10px)'
    },
    itemStyle: {
        padding: '16px 20px',
        color: '#ffffff',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
    },
    itemHoverStyle: {
        transform: 'scale(1.02)',
        filter: 'brightness(1.1)'
    }
});
```

### Web Component Features

#### 🌟 Enhanced CSS Support
- **Complete CSS Properties**: Support for all CSS properties including gradients, shadows, transforms
- **Array Values**: Support for multiple values (e.g., multiple box-shadows)
- **Individual Item Styling**: Each item can have its own `style`, `hoverStyle`, and `selectedStyle`

#### 🎯 Shadow DOM Architecture
- **Encapsulation**: Styles are isolated within Shadow DOM
- **Performance**: Improved rendering performance
- **Maintainability**: Clean separation of concerns

#### 🚀 Modern Events System
- **CustomEvents**: Modern event system with detailed event objects
- **Event Types**: `list-ready`, `list-item-click`, `list-selection-change`, `list-item-hover`

#### 🔗 Fluent API
- **Method Chaining**: `list.attachTo().then()` for clean async operations
- **Promise-based**: All async operations return promises

### Web Component Configuration

```javascript
const config = {
    // Identification
    id: 'unique-list-id',
    
    // Data
    items: [
        {
            id: 1,
            text: 'Item text',
            icon: '🎯',           // Optional icon
            subtext: 'Subtitle',  // Optional subtitle
            data: { /* custom data */ },
            
            // Individual styling
            style: { /* base styles */ },
            hoverStyle: { /* hover styles */ },
            selectedStyle: { /* selected styles */ }
        }
    ],
    
    // Behavior
    searchable: true,
    selectable: true,
    sortable: true,
    
    // Styling
    style: {
        // Complete CSS support
        backgroundColor: '#ffffff',
        background: 'linear-gradient(...)',
        boxShadow: ['shadow1', 'shadow2'], // Array support
        borderRadius: '8px',
        transform: 'scale(1.02)',
        filter: 'blur(2px)',
        backdropFilter: 'blur(10px)',
        // ... all CSS properties
    },
    
    // Item styling
    itemStyle: { /* base item styles */ },
    itemHoverStyle: { /* item hover styles */ },
    itemSelectedStyle: { /* item selected styles */ }
};
```

---

## 🚀 Legacy API (Version 1.0)

> **Deprecated:** La documentation ci-dessous concerne l'ancienne version basée sur les classes. Utilisez la version Web Component ci-dessus pour les nouveaux projets.

# 📋 List API - Interactive List Component

## 🚀 Basic Usage

### Simple List
```javascript
const basicList = new List({
    attach: 'body',
    id: 'my_list',
    x: 50, y: 50,
    width: 300,
    type: 'simple',
    items: [
        { id: 1, text: 'First item' },
        { id: 2, text: 'Second item' },
        { id: 3, text: 'Third item' }
    ],
    callbacks: {
        onItemClick: (item, id, event) => {
            console.log(`Clicked: ${item.text}`);
        }
    }
});
```

## ⚙️ Configuration Options

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| `type` | string | List type: 'simple', 'icon', 'avatar', 'menu', 'todo', 'nested' | `'simple'` |
| `items` | array | List items data | `[]` |
| `selectable` | boolean | Enable item selection | `true` |
| `multiSelect` | boolean | Allow multiple selection | `false` |
| `searchable` | boolean | Enable search functionality | `false` |
| `sortable` | boolean | Enable sorting | `false` |
| `draggable` | boolean | Enable drag & drop | `false` |

## 🎨 List Types

### Icon List
```javascript
const iconList = new List({
    attach: 'body',
    type: 'icon',
    width: 350,
    items: [
        { 
            id: 1, 
            icon: '📧', 
            text: 'Messages', 
            subtitle: '3 unread',
            badge: '3',
            badgeColor: '#ff4444'
        },
        { 
            id: 2, 
            icon: '📅', 
            text: 'Calendar', 
            subtitle: 'Next: Meeting at 3pm'
        },
        { 
            id: 3, 
            icon: '⚙️', 
            text: 'Settings', 
            subtitle: 'Preferences and config'
        }
    ],
    
    iconSettings: {
        size: 24,
        marginRight: 16,
        color: '#666'
    }
});
```

### Avatar List
```javascript
const avatarList = new List({
    attach: 'body',
    type: 'avatar',
    width: 400,
    items: [
        {
            id: 1,
            avatar: 'user1.jpg',
            text: 'John Doe',
            subtitle: 'Software Engineer',
            badge: 'Online',
            badgeColor: '#4caf50'
        },
        {
            id: 2,
            avatarText: 'AB',
            avatarColor: '#2196f3',
            text: 'Alice Brown',
            subtitle: 'Product Manager',
            badge: 'Away',
            badgeColor: '#ff9800'
        },
        {
            id: 3,
            avatarText: 'CD',
            avatarColor: '#e91e63',
            text: 'Charlie Davis',
            subtitle: 'UX Designer'
        }
    ],
    
    avatarSettings: {
        size: 40,
        marginRight: 12,
        borderRadius: '50%'
    }
});
```

### Todo List
```javascript
const todoList = new List({
    attach: 'body',
    type: 'todo',
    width: 350,
    items: [
        {
            id: 1,
            text: 'Complete project documentation',
            completed: false,
            priority: 'high'
        },
        {
            id: 2,
            text: 'Review pull requests',
            completed: true,
            priority: 'medium'
        },
        {
            id: 3,
            text: 'Update dependencies',
            completed: false,
            priority: 'low'
        }
    ],
    
    callbacks: {
        onItemClick: (item, id, event) => {
            // Toggle completion on click
            if (event.target.type === 'checkbox') {
                item.completed = event.target.checked;
                todoList.refresh();
            }
        }
    }
});
```

### Menu List
```javascript
const menuList = new List({
    attach: 'body',
    type: 'menu',
    width: 250,
    items: [
        {
            id: 1,
            icon: '🏠',
            text: 'Dashboard'
        },
        {
            id: 2,
            icon: '👥',
            text: 'Users',
            submenu: true
        },
        {
            id: 3,
            icon: '📊',
            text: 'Analytics'
        },
        {
            id: 4,
            icon: '⚙️',
            text: 'Settings',
            submenu: true
        }
    ],
    
    style: {
        backgroundColor: '#2c3e50',
        color: 'white',
        border: 'none'
    },
    
    itemStyle: {
        padding: '16px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.1)'
    },
    
    itemHoverStyle: {
        backgroundColor: '#34495e'
    }
});
```

### Nested List
```javascript
const nestedList = new List({
    attach: 'body',
    type: 'nested',
    width: 300,
    items: [
        {
            id: 1,
            text: 'Documents',
            icon: '📁',
            expanded: true,
            children: [
                { id: 11, text: 'Project.docx', icon: '📄' },
                { id: 12, text: 'Presentation.pptx', icon: '📊' }
            ]
        },
        {
            id: 2,
            text: 'Images',
            icon: '🖼️',
            expanded: false,
            children: [
                { id: 21, text: 'photo1.jpg', icon: '🖼️' },
                { id: 22, text: 'logo.png', icon: '🖼️' }
            ]
        }
    ]
});
```

## 🔍 Search and Filter

### Searchable List
```javascript
const searchableList = new List({
    attach: 'body',
    width: 400,
    searchable: true,
    items: [
        { id: 1, text: 'Apple iPhone', category: 'Electronics' },
        { id: 2, text: 'Samsung Galaxy', category: 'Electronics' },
        { id: 3, text: 'Nike Shoes', category: 'Fashion' },
        { id: 4, text: 'Adidas Jacket', category: 'Fashion' }
    ],
    
    searchSettings: {
        placeholder: 'Search products...',
        caseSensitive: false,
        searchFields: ['text', 'category']
    },
    
    callbacks: {
        onSearch: (query, filteredItems) => {
            console.log(`Search: "${query}" - ${filteredItems.length} results`);
        }
    }
});
```

## 🎨 Advanced Styling

### Custom Styled List
```javascript
const styledList = new List({
    attach: 'body',
    type: 'icon',
    width: 350,
    
    style: {
        backgroundColor: '#f8f9fa',
        border: '2px solid #e9ecef',
        borderRadius: '12px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.1)'
    },
    
    itemStyle: {
        padding: '16px 20px',
        borderBottom: '1px solid #dee2e6',
        borderRadius: '8px',
        margin: '4px 8px',
        backgroundColor: 'white',
        transition: 'all 0.3s ease'
    },
    
    itemHoverStyle: {
        backgroundColor: '#e3f2fd',
        transform: 'translateX(4px)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
    },
    
    itemSelectedStyle: {
        backgroundColor: '#1976d2',
        color: 'white',
        borderLeft: '4px solid #0d47a1'
    },
    
    headerStyle: {
        backgroundColor: '#1976d2',
        color: 'white',
        borderRadius: '12px 12px 0 0'
    },
    
    items: [
        { id: 1, icon: '🎵', text: 'Music Player', subtitle: 'Play your favorite songs' },
        { id: 2, icon: '🎮', text: 'Games', subtitle: 'Fun and entertainment' },
        { id: 3, icon: '📱', text: 'Apps', subtitle: 'Productivity tools' }
    ]
});
```

## 🔄 Dynamic Operations

### Adding and Removing Items
```javascript
const dynamicList = new List({
    attach: 'body',
    width: 300,
    selectable: true,
    items: []
});

// Add single item
dynamicList.addItem({
    id: Date.now(),
    text: 'New item',
    icon: '✨'
});

// Update item
dynamicList.updateItem(1, {
    text: 'Updated item',
    completed: true
});

// Remove item
dynamicList.removeItem(1);

// Get selected items
const selected = dynamicList.getSelectedItems();
console.log('Selected:', selected);

// Clear selection
dynamicList.clearSelection();
```

## 📱 Responsive List

```javascript
const responsiveList = new List({
    attach: 'body',
    type: 'avatar',
    width: '100%',
    
    style: {
        maxWidth: '600px',
        margin: '0 auto'
    },
    
    itemStyle: {
        padding: '12px 16px',
        '@media (max-width: 768px)': {
            padding: '8px 12px'
        }
    },
    
    avatarSettings: {
        size: 48,
        '@media (max-width: 768px)': {
            size: 32
        }
    }
});
```

## 🎯 Complete Examples

### Contact List
```javascript
class ContactList {
    constructor() {
        this.contacts = [
            {
                id: 1,
                name: 'John Smith',
                email: 'john@example.com',
                phone: '+1234567890',
                avatar: 'john.jpg',
                status: 'online'
            },
            {
                id: 2,
                name: 'Sarah Johnson',
                email: 'sarah@example.com',
                phone: '+0987654321',
                avatarText: 'SJ',
                avatarColor: '#e91e63',
                status: 'offline'
            }
        ];
        
        this.list = new List({
            attach: 'body',
            id: 'contact_list',
            type: 'avatar',
            width: 400,
            height: 500,
            searchable: true,
            selectable: true,
            
            items: this.contacts.map(contact => ({
                id: contact.id,
                avatar: contact.avatar,
                avatarText: contact.avatarText,
                avatarColor: contact.avatarColor,
                text: contact.name,
                subtitle: contact.email,
                badge: contact.status,
                badgeColor: contact.status === 'online' ? '#4caf50' : '#999'
            })),
            
            callbacks: {
                onItemClick: (item, id) => {
                    this.showContactDetails(id);
                },
                onItemDoubleClick: (item, id) => {
                    this.callContact(id);
                }
            }
        });
    }
    
    showContactDetails(contactId) {
        const contact = this.contacts.find(c => c.id === contactId);
        console.log('Show details for:', contact);
    }
    
    callContact(contactId) {
        const contact = this.contacts.find(c => c.id === contactId);
        console.log('Calling:', contact.phone);
    }
    
    addContact(contactData) {
        this.contacts.push(contactData);
        this.list.addItem({
            id: contactData.id,
            avatar: contactData.avatar,
            text: contactData.name,
            subtitle: contactData.email
        });
    }
}

// Create contact list
const contactList = new ContactList();
```

### Music Playlist
```javascript
const playlist = new List({
    attach: 'body',
    id: 'music_playlist',
    type: 'icon',
    width: 450,
    height: 400,
    
    style: {
        backgroundColor: '#1a1a1a',
        color: 'white',
        borderRadius: '12px'
    },
    
    itemStyle: {
        padding: '12px 16px',
        borderBottom: '1px solid #333',
        backgroundColor: 'transparent'
    },
    
    itemHoverStyle: {
        backgroundColor: '#333'
    },
    
    itemSelectedStyle: {
        backgroundColor: '#1976d2'
    },
    
    items: [
        {
            id: 1,
            icon: '🎵',
            text: 'Bohemian Rhapsody',
            subtitle: 'Queen • 5:55',
            badge: 'Playing',
            badgeColor: '#4caf50'
        },
        {
            id: 2,
            icon: '🎵',
            text: 'Hotel California',
            subtitle: 'Eagles • 6:30'
        },
        {
            id: 3,
            icon: '🎵',
            text: 'Stairway to Heaven',
            subtitle: 'Led Zeppelin • 8:02'
        }
    ],
    
    callbacks: {
        onItemClick: (item, id) => {
            console.log(`Playing: ${item.text}`);
        },
        onItemDoubleClick: (item, id) => {
            console.log(`Added to queue: ${item.text}`);
        }
    }
});
```

### File Explorer
```javascript
const fileExplorer = new List({
    attach: 'body',
    id: 'file_explorer',
    type: 'nested',
    width: 350,
    height: 500,
    searchable: true,
    
    style: {
        backgroundColor: '#f5f5f5',
        border: '1px solid #ddd'
    },
    
    items: [
        {
            id: 1,
            text: 'Documents',
            icon: '📁',
            expanded: true,
            children: [
                { id: 11, text: 'Report.pdf', icon: '📄', size: '2.5 MB' },
                { id: 12, text: 'Presentation.pptx', icon: '📊', size: '8.1 MB' },
                {
                    id: 13,
                    text: 'Projects',
                    icon: '📁',
                    expanded: false,
                    children: [
                        { id: 131, text: 'Project A', icon: '📁' },
                        { id: 132, text: 'Project B', icon: '📁' }
                    ]
                }
            ]
        },
        {
            id: 2,
            text: 'Pictures',
            icon: '🖼️',
            expanded: false,
            children: [
                { id: 21, text: 'vacation.jpg', icon: '🖼️', size: '4.2 MB' },
                { id: 22, text: 'family.png', icon: '🖼️', size: '1.8 MB' }
            ]
        }
    ],
    
    callbacks: {
        onItemClick: (item, id) => {
            if (item.children) {
                // Toggle folder
                item.expanded = !item.expanded;
                fileExplorer.refresh();
            } else {
                // Open file
                console.log(`Opening: ${item.text}`);
            }
        }
    }
});
```
