// Style definitions for Lyrix application UI
// Base theme system for consistent styling across all components

const default_theme = {
    button: {
        backgroundColor: '#00f',
        marginLeft: '0',
        padding: '10px',
        color: 'white',
        margin: '10px',
        display: 'inline-block',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '14px',
        transition: 'all 0.2s ease'
    },
    
    // Style uniforme pour tous les boutons d'interface avec icônes
    interfaceButton: {
        width: '60px',           // Largeur = 2 × hauteur
        height: '30px',          // Hauteur de base
        backgroundColor: '#4a6fa5', // Couleur primaire cohérente
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '16px',        // Taille des icônes
        transition: 'all 0.2s ease',
        margin: '2px',
        padding: '0',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        // Effet hover
        ':hover': {
            backgroundColor: '#5a7fb5',
            transform: 'translateY(-1px)',
            boxShadow: '0 4px 8px rgba(0,0,0,0.15)'
        },
        // Effet active
        ':active': {
            transform: 'translateY(0)',
            boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
        }
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
