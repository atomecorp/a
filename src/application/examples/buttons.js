
// // TEST 1: BASIC BUTTON  ON/OFF (Web Component)
// // ==========================================

// console.log('\n📝 TEST 1: Bouton basique ON/OFF');

const buttonBasic = new Button({
    attach: 'body',
    x: 50, y: 50,
    width: 120, height: 50,
    value: false,
    text: { on: 'ACTIVÉ', off: 'DÉSACTIVÉ' },
    styling: {
        backgroundColorOn: '#4CAF50',
        backgroundColorOff: '#f44336',
        borderRadius: '25px',
        fontSize: '14px',
        fontWeight: 'bold',
        boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
    },
    callbacks: {
        onChange: (value, button) => {
            console.log(`🔘 Bouton basique changé: ${value ? 'ACTIVÉ' : 'DÉSACTIVÉ'}`);
        },
        onToggle: (newValue, oldValue, button) => {
            console.log(`🔄 Toggle: ${oldValue} → ${newValue}`);
        }
    }
});

// ==========================================
// TEST 2: BOUTON STYLE iOS
// ==========================================

console.log('\n📱 TEST 2: Bouton style iOS');

const buttonIOS = new Button({
    attach: 'body',
    x: 200, y: 50,
    width: 80, height: 40,
    value: true,
    text: { on: '', off: '' }, // Pas de texte, juste le slider
    styling: {
        backgroundColorOn: '#007AFF',
        backgroundColorOff: '#e0e0e0',
        borderRadius: '20px',
        border: '2px solid #ddd'
    },
    callbacks: {
        onChange: (value) => {
            console.log(`📱 iOS Toggle: ${value ? 'ON' : 'OFF'}`);
        }
    }
});

// ==========================================
// TEST 3: BOUTON GAMING STYLE
// ==========================================



