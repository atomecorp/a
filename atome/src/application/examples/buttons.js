

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



/////


// === AJOUTER UNE NOUVELLE TEMPLATE ===
Button.addTemplate('neon_glow', {
    name: 'Neon Glow Effect',
    description: 'Bouton avec effet néon lumineux',
    css: {
        background: 'rgba(0, 0, 0, 0.8)',
        border: '2px solid #00ffff',
        borderRadius: '25px',
        color: '#00ffff',
        fontFamily: 'Courier New, monospace',
        fontWeight: 'bold',
        padding: '10px 20px',
        textShadow: '0 0 10px #00ffff',
        boxShadow: '0 0 20px rgba(0, 255, 255, 0.5), inset 0 0 20px rgba(0, 255, 255, 0.1)',
        transition: 'all 0.3s ease',
        textTransform: 'uppercase',
        letterSpacing: '2px',
        cursor: 'pointer'
    },
    onStyle: {
        background: 'rgba(0, 255, 255, 0.2)',
        color: '#ffffff',
        borderColor: '#ffffff',
        textShadow: '0 0 15px #ffffff',
        boxShadow: '0 0 30px rgba(255, 255, 255, 0.8), inset 0 0 30px rgba(255, 255, 255, 0.2)',
        transform: 'scale(1.1)'
    },
    offStyle: {
        background: 'rgba(255, 0, 100, 0.2)',
        color: '#ff0064',
        borderColor: '#ff0064',
        textShadow: '0 0 10px #ff0064',
        boxShadow: '0 0 20px rgba(255, 0, 100, 0.6), inset 0 0 20px rgba(255, 0, 100, 0.1)',
        transform: 'scale(0.95)'
    },
    hover: {
        transform: 'translateY(-3px) scale(1.05)',
        boxShadow: '0 5px 40px rgba(0, 255, 255, 0.7), inset 0 0 25px rgba(0, 255, 255, 0.2)'
    }
});


Button.addTemplate('pulse_wave', {
    name: 'Pulse Wave Animation',
    description: 'Bouton avec animation de pulsation',
    css: {
        background: 'linear-gradient(45deg, #FF6B6B, #4ECDC4, #45B7D1, #96CEB4)',
        backgroundSize: '400% 400%',
        border: 'none',
        borderRadius: '50px',
        color: 'white',
        fontFamily: 'Arial, sans-serif',
        fontWeight: '600',
        padding: '12px 24px',
        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
        transition: 'all 0.4s ease',
        position: 'relative',
        overflow: 'hidden',
        animation: 'gradientShift 3s ease infinite'
    },
    onStyle: {
        transform: 'scale(1.1)',
        boxShadow: '0 8px 25px rgba(76, 175, 80, 0.6)',
        animation: 'pulse 1s ease-in-out infinite'
    },
    offStyle: {
        transform: 'scale(0.9)',
        boxShadow: '0 2px 8px rgba(244, 67, 54, 0.4)',
        filter: 'grayscale(50%)'
    },
    hover: {
        transform: 'translateY(-2px) scale(1.05)',
        boxShadow: '0 12px 30px rgba(0, 0, 0, 0.3)'
    }
});


Button.addTemplate('minimal_flat', {
    name: 'Minimal Flat Design',
    description: 'Design plat et minimaliste',
    css: {
        background: '#f8f9fa',
        border: '1px solid #dee2e6',
        borderRadius: '4px',
        color: '#495057',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '14px',
        fontWeight: '500',
        padding: '8px 16px',
        transition: 'all 0.2s ease',
        cursor: 'pointer'
    },
    onStyle: {
        background: '#28a745',
        color: 'white',
        borderColor: '#28a745'
    },
    offStyle: {
        background: '#6c757d',
        color: 'white',
        borderColor: '#6c757d'
    },
    hover: {
        background: '#e9ecef',
        borderColor: '#adb5bd'
    }
});


Button.addTemplate('galaxy_theme', {
    name: 'Galaxy Theme',
    description: 'Thème galaxie avec effets spatiaux',
    css: {
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
        border: 'none',
        borderRadius: '30px',
        color: 'white',
        fontFamily: 'Roboto, sans-serif',
        fontWeight: '700',
        padding: '15px 30px',
        fontSize: '16px',
        textShadow: '0 2px 4px rgba(0, 0, 0, 0.5)',
        boxShadow: '0 10px 25px rgba(102, 126, 234, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative',
        overflow: 'hidden'
    },
    onStyle: {
        background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        transform: 'translateY(-2px) scale(1.02)',
        boxShadow: '0 15px 35px rgba(79, 172, 254, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.3)'
    },
    offStyle: {
        background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
        transform: 'translateY(1px) scale(0.98)',
        boxShadow: '0 5px 15px rgba(250, 112, 154, 0.4)'
    },
    hover: {
        transform: 'translateY(-3px)',
        boxShadow: '0 20px 40px rgba(102, 126, 234, 0.6)'
    }
});


// === UTILISER LES NOUVELLES TEMPLATES ===

// Bouton Neon
const neonButton = Button({
    template: 'neon_glow',
    onText: 'ACTIVATE',
    offText: 'STANDBY',
    onAction: fct_to_trig,
    offAction: fct_to_trig2,
    parent: '#view',
    css: {
        left: '50px',
        top: '200px',
        position: 'absolute'
    }
});

// Bouton Pulse Wave
const pulseButton = Button({
    template: 'pulse_wave',
    onText: '🚀 GO!',
    offText: '⏸ STOP',
    onAction: fct_to_trig,
    offAction: fct_to_trig2,
    parent: '#view',
    css: {
        left: '200px',
        top: '200px',
        position: 'absolute'
    }
});

// Bouton Galaxy
const galaxyButton = Button({
    template: 'galaxy_theme',
    onText: '✨ COSMIC',
    offText: '🌑 DARK',
    onAction: fct_to_trig,
    offAction: fct_to_trig2,
    parent: '#view',
    css: {
        left: '400px',
        top: '200px',
        position: 'absolute'
    }
});

// === VÉRIFIER QUE LES TEMPLATES SONT AJOUTÉES ===
console.log('🎨 Templates disponibles:', Button.getTemplateList());
Button.listTemplates(); // Affiche un tableau dans la console


Button.addTemplate('nom_template', {
    name: 'Nom Affiché',           // Nom lisible
    description: 'Description',    // Description de la template
    css: {
        // Styles CSS de base
    },
    onStyle: {
        // Styles quand le bouton est ON
    },
    offStyle: {
        // Styles quand le bouton est OFF
    },
    hover: {
        // Styles au survol (optionnel)
    },
    active: {
        // Styles au clic (optionnel)
    }
});