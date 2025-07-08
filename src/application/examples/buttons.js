

function fct_to_trig(state) {
    console.log('trig: ' + state);
}

function fct_to_trig2(state) {
    console.log('trigger 2 : ' + state);
}

// === EXEMPLE 1: Votre bouton existant ===
const toggle = Button({
    onText: 'ON',
    offText: 'OFF',
    onAction: fct_to_trig,
    offAction: fct_to_trig2,
    parent: '#view', // parent direct
    onStyle: { backgroundColor: '#28a745', color: 'white' },
    offStyle: { backgroundColor: '#dc3545', color: 'white' },
    css: {
        width: '50px',
        height: '24px',
        left: '120px',
        top: '120px',
        borderRadius: '6px',
        backgroundColor: 'orange',
        position: 'relative',
        border: 'none',
        cursor: 'pointer',
        transition: 'background-color 0.3s ease',
        border: '3px solid rgba(255,255,255,0.3)',
        boxShadow: '0 2px 4px rgba(255,255,1,1)',
    }
});

// === EXEMPLE 2: Même bouton avec template Material Design ===
const toggleMaterial = Button({
    template: 'material_design_blue',
    onText: 'ON',
    offText: 'OFF',
    onAction: fct_to_trig,
    offAction: fct_to_trig2,
    parent: '#view',
    css: {
        left: '200px',
        top: '120px',
        position: 'absolute'
    }
});

// === EXEMPLE 3: Template Glass Blur ===
const toggleGlass = Button({
    template: 'glass_blur',
    onText: '✨ ON',
    offText: '💫 OFF',
    onAction: fct_to_trig,
    offAction: fct_to_trig2,
    parent: '#view',
    css: {
        left: '300px',
        top: '120px',
        position: 'absolute'
    }
});

// === EXPLORER LES TEMPLATES ===
console.log('📋 Liste des templates:', Button.getTemplateList());
console.log('🎨 Tous les templates:', Button.templates);

// Afficher un tableau des templates disponibles
Button.listTemplates();

// Infos sur les templates utilisés
console.log('Template toggle material:', toggleMaterial.getTemplate());
console.log('Template toggle glass:', toggleGlass.getTemplate());

// === AJOUTER UN TEMPLATE PERSONNALISÉ ===
Button.addTemplate('lyrix_custom', {
    name: 'Lyrix Custom Style',
    description: 'Template personnalisé pour Lyrix',
    css: {
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        border: 'none',
        borderRadius: '20px',
        color: 'white',
        fontFamily: 'Arial, sans-serif',
        fontWeight: 'bold',
        padding: '8px 16px',
        boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
        transition: 'all 0.3s ease',
        textTransform: 'uppercase',
        letterSpacing: '1px'
    },
    onStyle: {
        background: 'linear-gradient(135deg, #48c6ef 0%, #6f86d6 100%)',
        transform: 'scale(1.05)',
        boxShadow: '0 6px 20px rgba(72, 198, 239, 0.6)'
    },
    offStyle: {
        background: 'linear-gradient(135deg, #fc466b 0%, #3f5efb 100%)',
        transform: 'scale(0.95)',
        boxShadow: '0 2px 10px rgba(252, 70, 107, 0.4)'
    },
    hover: {
        transform: 'translateY(-2px)',
        boxShadow: '0 8px 25px rgba(102, 126, 234, 0.6)'
    }
});

// === EXEMPLE 4: Template personnalisé ===
const toggleCustom = Button({
    template: 'lyrix_custom',
    onText: 'YEAH!',
    offText: 'NOPE',
    onAction: fct_to_trig,
    offAction: fct_to_trig2,
    parent: '#view',
    css: {
        left: '420px',
        top: '120px',
        position: 'absolute'
    }
});

console.log('🎨 Template personnalisé créé:', toggleCustom.getTemplate());