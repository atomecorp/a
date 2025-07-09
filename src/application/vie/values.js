const barsHeight = 39;
const basicWidth = 69
const vieBackColor = 'rgb(14, 61, 86)';
const itemskColor = 'rgb(30, 172, 250)';

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






// ✅ EXPOSER GLOBALEMENT
window.vieBackColor = vieBackColor;
window.barsHeight = barsHeight;
window.basicWidth = basicWidth;
window.itemskColor = itemskColor;