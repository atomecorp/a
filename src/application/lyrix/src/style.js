// Style definitions for Lyrix application UI
// Base theme system for consistent styling across all components

const default_theme = {
    // Couleurs du thème (optionnelles - si non définies, utilise button.backgroundColor)
    // primaryColor: '#27ae60',     // Vert pour boutons primaires
    // secondaryColor: '#3498db',   // Bleu pour boutons secondaires
    // dangerColor: '#e74c3c',      // Rouge pour boutons danger
    // warningColor: '#f39c12',     // Orange pour boutons warning
    
    // Couleurs pour les modes spéciaux
    editModeActiveColor: '#4CAF50',    // Vert pour mode édition actif
    recordModeActiveColor: '#f44336',  // Rouge pour mode enregistrement actif
    
    button: {
        backgroundColor: 'transparent',
        top: '0px',
        color: 'white',
        border: '0px solid rgba(255,255,255,0.3)', // Bordure uniforme pour tous les boutons
        borderRadius: '3px',
        cursor: 'pointer',
        fontSize: '14px',
        transition: 'all 0.2s ease',
        boxShadow: '0 4px 8px rgba(0,0,0,0.2)', // Ombre uniforme pour tous les boutons
        // Layout uniforme pour tous les boutons
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Espacement uniforme
        // margin: '2px',
        // padding: '8px',
        // Tailles par défaut (appliquées à tous les boutons)
        width: '30px',
        height: '30px',
        minWidth: '30px'
    },
    
    defaultColor: {
        backgroundColor: '#lightgray',
        color: '#333',
        border: '1px solid #ccc'
    }
};

// Export the theme for use in other modules
export { default_theme };
export default default_theme;
