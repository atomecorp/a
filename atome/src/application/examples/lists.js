/**
 * 📋 EXEMPLES DE LISTES AVEC LOOKS DIFFÉRENTS
 * Démonstration de la personnalisation complète du composant List
 */
import List from '../../squirrel/components/List_builder.js';

// Object externe pour tester les callbacks
const globalState = {
    selectedCount: 0,
    lastClicked: null,
    totalClicks: 0
};

// 🎨 LISTE 1 : Style Card Moderne - Espacement généreux
const modernCardList = new List({
    id: "modern-cards",
    position: { x: 50, y: 50 },
    size: { width: 320, height: 450 },
    attach: "#view",
    
    // Espacement généreux type cards
    spacing: {
        vertical: 12,        // Beaucoup d'espace entre les éléments
        itemPadding: 20,     // Padding large
        marginTop: 5,
        marginBottom: 5
    },
    
    // Style moderne et lisible
    itemStyle: {
        fontSize: '16px',
        fontWeight: '500',
        lineHeight: '1.6',
        textColor: '#2c3e50',
        backgroundColor: '#ffffff',
        borderRadius: '12px'
    },
    
    items: [
        { content: '📊 Dashboard', style: { backgroundColor: '#e3f2fd', color: '#1565c0' }},
        { content: '👤 Profile', style: { backgroundColor: '#f3e5f5', color: '#7b1fa2' }},
        { content: '⚙️ Settings', style: { backgroundColor: '#fff3e0', color: '#ef6c00' }},
        { content: '📈 Analytics', style: { backgroundColor: '#e8f5e8', color: '#2e7d32' }}
    ],
    
    states: {
        hover: { 
            backgroundColor: '#f8f9fa',
            boxShadow: '0 8px 16px rgba(0,0,0,0.15)',
            transform: 'translateY(-3px) scale(1.02)'
        },
        selected: { 
            backgroundColor: '#1976d2',
            color: 'white',
            boxShadow: '0 12px 24px rgba(25,118,210,0.4)',
            transform: 'translateY(-2px)'
        }
    },
    
    elevation: 3,
    
    onItemClick: (item) => {
        globalState.totalClicks++;
        globalState.lastClicked = item.content;
        console.log(`🖱️ Modern Card: ${item.content} (Total clicks: ${globalState.totalClicks})`);
    },
    
    onItemSelect: (item, selected) => {
        if (selected) globalState.selectedCount++;
        else globalState.selectedCount--;
        console.log(`📊 Selected count: ${globalState.selectedCount}`);
    }
});

// 💾 LISTE 2 : Style Terminal/Code - Compact et monospace
const terminalList = new List({
    id: "terminal-style",
    position: { x: 400, y: 50 },
    size: { width: 280, height: 320 },
    attach: "#view",
    
    // Espacement minimal type terminal
    spacing: {
        vertical: 2,         // Espacement minimal
        itemPadding: 8,      // Padding serré
        marginTop: 0,
        marginBottom: 0
    },
    
    // Style terminal monospace
    itemStyle: {
        fontSize: '12px',
        fontWeight: '400',
        lineHeight: '1.2',
        textColor: '#00ff00',
        backgroundColor: '#1a1a1a',
        borderRadius: '2px'
    },
    
    containerStyle: {
        background: '#0d1117',
        border: '1px solid #30363d',
        borderRadius: '6px'
    },
    
    items: [
        { content: '> npm install', style: { fontFamily: 'Monaco, monospace' }},
        { content: '> git status', style: { fontFamily: 'Monaco, monospace' }},
        { content: '> npm run dev', style: { fontFamily: 'Monaco, monospace', color: '#ffa500' }},
        { content: '> git commit', style: { fontFamily: 'Monaco, monospace' }},
        { content: '> npm test', style: { fontFamily: 'Monaco, monospace', color: '#ff6b6b' }}
    ],
    
    states: {
        hover: { 
            backgroundColor: '#21262d',
            color: '#ffffff'
        },
        selected: { 
            backgroundColor: '#238636',
            color: '#ffffff'
        }
    },
    
    elevation: 1,
    
    onItemClick: (item) => {
        console.log(`💻 Terminal: Executing ${item.content}`);
        globalState.lastClicked = `Terminal: ${item.content}`;
    }
});

// 🌈 LISTE 3 : Style Coloré - Gros texte et couleurs vives
const colorfulList = new List({
    id: "colorful-big",
    position: { x: 50, y: 520 },
    size: { width: 350, height: 300 },
    attach: "#view",
    
    // Espacement moyen avec variety
    spacing: {
        vertical: 8,
        itemPadding: 16,
        marginTop: 3,
        marginBottom: 3
    },
    
    // Gros texte coloré
    itemStyle: {
        fontSize: '18px',
        fontWeight: '600',
        lineHeight: '1.4',
        textColor: '#ffffff',
        backgroundColor: '#ff6b6b',
        borderRadius: '25px'
    },
    
    items: [
        { content: '🔥 Hot Items', style: { backgroundColor: '#ff6b6b' }},
        { content: '🌊 Cool Stuff', style: { backgroundColor: '#4ecdc4' }},
        { content: '⚡ Fast Track', style: { backgroundColor: '#ffe66d' }},
        { content: '🎯 Targets', style: { backgroundColor: '#95e1d3' }}
    ],
    
    states: {
        hover: { 
            transform: 'scale(1.05) rotate(1deg)',
            boxShadow: '0 10px 20px rgba(0,0,0,0.2)'
        },
        selected: { 
            transform: 'scale(1.1)',
            boxShadow: '0 15px 30px rgba(0,0,0,0.3)',
            border: '3px solid #fff'
        }
    },
    
    elevation: 2,
    
    onItemClick: (item) => {
        console.log(`🌈 Colorful: ${item.content} clicked!`);
        // Modifier un objet externe
        globalState.totalClicks++;
        document.title = `Squirrel - ${globalState.totalClicks} clicks`;
    }
});

// 📱 LISTE 4 : Style Mobile/App - Très fin et élégant
const mobileAppList = new List({
    id: "mobile-app",
    position: { x: 420, y: 400 },
    size: { width: 260, height: 420 },
    attach: "#view",
    
    // Espacement ultra-fin type mobile
    spacing: {
        vertical: 1,         // Quasi aucun espace
        itemPadding: 14,     // Padding équilibré
        marginTop: 0,
        marginBottom: 0
    },
    
    // Style app mobile
    itemStyle: {
        fontSize: '14px',
        fontWeight: '400',
        lineHeight: '1.3',
        textColor: '#333333',
        backgroundColor: '#f8f9fa',
        borderRadius: '0px'
    },
    
    containerStyle: {
        background: '#ffffff',
        border: '1px solid #e9ecef',
        borderRadius: '20px'
    },
    
    items: [
        { content: '📧 Messages (12)' },
        { content: '📞 Calls' },
        { content: '📷 Camera' },
        { content: '🎵 Music' },
        { content: '📱 Contacts' },
        { content: '⚙️ Settings' },
        { content: '🌐 Safari' },
        { content: '📺 Videos' }
    ],
    
    states: {
        hover: { 
            backgroundColor: '#e9ecef'
        },
        selected: { 
            backgroundColor: '#007aff',
            color: '#ffffff'
        }
    },
    
    elevation: 4,
    
    onItemSelect: (item, selected) => {
        // Modifier l'objet externe
        globalState.selectedCount = selected ? globalState.selectedCount + 1 : globalState.selectedCount - 1;
        
        // Modifier le DOM externe
        let counter = document.getElementById('selection-counter');
        if (!counter) {
            counter = document.createElement('div');
            counter.id = 'selection-counter';
            counter.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #007aff;
                color: white;
                padding: 10px;
                border-radius: 5px;
                font-size: 14px;
            `;
            document.body.appendChild(counter);
        }
        counter.textContent = `Selected: ${globalState.selectedCount}`;
    }
});

// 🏷️ LISTE 5 : Style Tags/Pills - Horizontal feeling
const tagsStyleList = new List({
    id: "tags-style",
    position: { x: 50, y: 850 },
    size: { width: 400, height: 200 },
    attach: "#view",
    
    // Espacement pour effet tags
    spacing: {
        vertical: 6,
        itemPadding: 10,
        marginTop: 2,
        marginBottom: 2
    },
    
    // Style pills/tags
    itemStyle: {
        fontSize: '13px',
        fontWeight: '500',
        lineHeight: '1.2',
        textColor: '#6c757d',
        backgroundColor: '#e9ecef',
        borderRadius: '15px'
    },
    
    items: [
        { content: '#javascript', style: { backgroundColor: '#fff3cd', color: '#856404' }},
        { content: '#react', style: { backgroundColor: '#d1ecf1', color: '#0c5460' }},
        { content: '#nodejs', style: { backgroundColor: '#d4edda', color: '#155724' }},
        { content: '#css', style: { backgroundColor: '#f8d7da', color: '#721c24' }},
        { content: '#html', style: { backgroundColor: '#e2e3e5', color: '#383d41' }}
    ],
    
    states: {
        hover: { 
            transform: 'scale(1.1)',
            fontWeight: '600'
        },
        selected: { 
            backgroundColor: '#495057',
            color: '#ffffff',
            transform: 'scale(1.05)'
        }
    },
    
    onItemClick: (item) => {
        console.log(`🏷️ Tag clicked: ${item.content}`);
        globalState.lastClicked = item.content;
    }
});

// 📊 Affichage de l'état global
setTimeout(() => {
    console.log('🌍 État global après initialisation:', globalState);
}, 1000);

console.log('✨ 5 listes avec des styles différents créées !');
console.log('🎨 Styles disponibles: Modern Cards, Terminal, Colorful, Mobile App, Tags');