const container = new A({
    attach: 'body',
    id: 'main_container',
    markup: 'div',
    type: 'container',
    x: 50,
    y: 50,
    width: 400,
    height: 300,
    backgroundColor: '#f5f5f5',
    smooth: 10,
    boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
    overflow: 'hidden',
    fasten: [] // Contiendra les IDs des enfants
});

// 2. Création d'un en-tête dans le conteneur
const header = new A({
    attach: '#main_container', // Attache au conteneur principal
    id: 'header',
    markup: 'div',
    type: 'shape',
    x: 0,
    y: 0,
    width: '100%',
    height: 60,
    backgroundColor: '#4285f4',
    center: false,
    position: 'absolute',
    color: 'white',
    textAlign: 'center',
    lineHeight: '60px',
    fontWeight: 'bold',
    fontSize: 20,
    text: 'Démo A avec Enfants'
});

// Mise à jour de fasten pour le conteneur
container._fastened.push('header');
container.element.dataset.fasten = container._fastened.join(',');

// 3. Création du contenu principal avec des enfants à l'aide de la propriété children
const content = new A({
    attach: '#main_container',
    id: 'content',
    markup: 'div',
    type: 'content',
    x: 0,
    y: 60,
    width: '100%',
    height: 240,
    padding: 15,
    position: 'relative',
    children: [
        // Enfant 1: Boîte rouge
        {
            id: 'red_box',
            markup: 'div',
            type: 'shape',
            x: 20,
            y: 20,
            width: 100,
            height: 100,
            backgroundColor: 'red',
            smooth: 15,
            events: {
                click: (e) => {
                    console.log('Boîte rouge cliquée!');
                }
            }
        },
        // Enfant 2: Boîte bleue
        {
            id: 'blue_box',
            markup: 'div',
            type: 'shape',
            x: 150,
            y: 20,
            width: 100,
            height: 100,
            backgroundColor: 'blue',
            smooth: 15,
            color: 'white',
            textAlign: 'center',
            lineHeight: '100px',
            text: 'Bleu'
        },
        // Enfant 3: Cercle vert
        {
            id: 'green_circle',
            markup: 'div',
            type: 'shape',
            x: 280,
            y: 20,
            width: 100,
            height: 100,
            backgroundColor: 'green',
            smooth: '50%', // Cercle parfait
            color: 'white',
            textAlign: 'center',
            lineHeight: '100px',
            text: 'Cercle'
        }
    ],
    fasten: [] // Sera automatiquement rempli par les IDs des enfants
});

// Mise à jour de fasten pour le conteneur principal
container._fastened.push('content');
container.element.dataset.fasten = container._fastened.join(',');

// 4. Créer et ajouter dynamiquement un nouvel enfant au contenu
const infoButton = content.addChild({
    id: 'info_button',
    markup: 'div',
    type: 'button',
    x: 140,
    y: 150,
    width: 120,
    height: 40,
    backgroundColor: '#ffa000',
    smooth: 20,
    textAlign: 'center',
    lineHeight: '40px',
    color: 'white',
    fontWeight: 'bold',
    text: 'Info',
    cursor: 'pointer',
    events: {
        click: () => {
            // Récupérer tous les enfants du content
            const children = content.getFastened();
            console.log(`Il y a ${children.length} enfants dans le contenu`);
        }
    }
});

// Vérification du résultat
console.log('Container fasten:', container._fastened); // Devrait afficher ['header', 'content']
console.log('Content fasten:', content._fastened);    // Devrait afficher ['red_box', 'blue_box', 'green_circle', 'info_button']

// 5. Exemple d'animation sur un élément avec mise à jour de fasten
const greenCircle = A.getById('green_circle');
if (greenCircle) {
    greenCircle.element.addEventListener('click', function() {
        const popup = new A({
            attach: '#content',
            id: 'popup',
            markup: 'div',
            type: 'popup',
            x: 80,
            y: 80,
            width: 0,
            height: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            smooth: 10,
            color: 'white',
            textAlign: 'center',
            lineHeight: '140px',
            opacity: 0,
            text: 'Animation en cours !',
            zIndex: 100,
            animate: {
                duration: 0.5,
                easing: 'ease-out',
                properties: {
                    width: 240,
                    height: 140,
                    opacity: 1
                }
            },
            events: {
                click: function() {
                    // Animation de sortie
                    this.style.transition = 'all 0.3s ease-in';
                    this.style.opacity = '0';
                    this.style.transform = 'scale(0.5)';
                    setTimeout(() => {
                        this.parentNode.removeChild(this);
                        // Mise à jour de fasten
                        content._fastened = content._fastened.filter(id => id !== 'popup');
                        content.element.dataset.fasten = content._fastened.join(',');
                    }, 300);
                }
            }
        });

        // Mise à jour de fasten pour le content
        content._fastened.push('popup');
        content.element.dataset.fasten = content._fastened.join(',');
    });
}

// Exemple simple d'utilisation de la propriété fasten
const simpleExample = new A({
    attach: 'body',
    id: 'parent_box',
    markup: 'div',
    type: 'container',
    x: 500,
    y: 50,
    width: 200,
    height: 200,
    backgroundColor: '#333',
    smooth: 10,
    // Définir directement les IDs des enfants à attacher
    fasten: ['child_box1', 'child_box2']
});

// Création des enfants correspondants
const child1 = new A({
    attach: '#parent_box',
    id: 'child_box1',
    markup: 'div',
    type: 'shape',
    x: 20,
    y: 20,
    width: 80,
    height: 80,
    backgroundColor: 'yellow',
    smooth: 10
});