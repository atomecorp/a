// Exemple de démo compatible Squirrel

// 1. Titre principal
$('h1', {
  parent: '#view',
  id: 'demo-title',
  css: {
    backgroundColor: '#222',
    color: '#fff',
    padding: '16px',
    margin: '16px 0',
    borderRadius: '8px',
    textAlign: 'center'
  },
  text: 'Démo Squirrel 🎉'
});

// 2. Zone d'affichage dynamique
const output = $('div', {
  parent: '#view',
  id: 'demo-output',
  css: {
    backgroundColor: '#f9f9f9',
    border: '1px solid #ccc',
    borderRadius: '8px',
    padding: '16px',
    margin: '16px 0',
    minHeight: '40px'
  },
  text: 'Cliquez sur un bouton pour voir une action.'
});

// 3. Bouton Squirrel avec composant Button
const messageButton = Button({
  text: 'Afficher un message',
  parent: '#view',
  css: {
    margin: '8px',
    padding: '10px 20px',
    backgroundColor: '#007bff',
    color: '#fff',
    borderRadius: '5px',
    cursor: 'pointer',
    position: 'relative'
  },
  onAction: () => {
    console.log('Message button clicked');
    output.$({ text: 'Bravo, vous avez cliqué le bouton ! 🚀' });
  }
});

// 4. Slider Squirrel
const demoSlider = Slider({
  min: 0,
  max: 100,
  value: 50,
  step: 1,
  parent: '#view',
  css: {
    margin: '8px',
    width: '200px'
  },
  onInput: (value) => {
    console.log('Slider value:', value);
    output.$({ text: `Valeur du slider : ${value}` });
  }
});

// 5. Exemple d'animation Squirrel
const animBox = $('div', {
  parent: '#view',
  id: 'anim-box',
  css: {
    width: '80px',
    height: '80px',
    backgroundColor: '#4caf50',
    margin: '16px auto',
    borderRadius: '8px',
    transition: 'all 0.5s'
  }
});

const animButton = Button({
  text: 'Animer la boîte',
  parent: '#view',
  css: {
    margin: '8px',
    padding: '10px 20px',
    backgroundColor: '#ff9800',
    color: '#fff',
    borderRadius: '5px',
    cursor: 'pointer',
    position: 'relative'
  },
  onAction: () => {
    console.log('Animation button clicked');
    animBox.$({
      css: {
        width: '160px',
        height: '160px',
        backgroundColor: '#e91e63'
      }
    });
    setTimeout(() => {
      animBox.$({
        css: {
          width: '80px',
          height: '80px',
          backgroundColor: '#4caf50'
        }
      });
    }, 700);
  }
});

// 6. Input text Squirrel
$('input', {
  parent: '#view',
  attrs: {
    type: 'text',
    placeholder: 'Tapez quelque chose...'
  },
  css: {
    margin: '8px',
    padding: '8px',
    borderRadius: '4px',
    border: '1px solid #ccc',
    width: '200px'
  },
  oninput: (e) => {
    console.log('Input value:', e.target.value);
    output.$({ text: `Vous tapez : "${e.target.value}"` });
  }
});

// 7. Liste de couleurs
const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f7d794', '#c44569'];
$('div', {
  parent: '#view',
  css: {
    margin: '16px 0',
    textAlign: 'center'
  },
  text: 'Choisissez une couleur :'
});

colors.forEach((color, index) => {
  Button({
    text: `Couleur ${index + 1}`,
    parent: '#view',
    css: {
      margin: '4px',
      padding: '8px 16px',
      backgroundColor: color,
      color: '#fff',
      borderRadius: '4px',
      cursor: 'pointer',
      position: 'relative'
    },
    onAction: () => {
      console.log('Color button clicked:', color);
      document.body.style.backgroundColor = color;
      output.$({ text: `Couleur de fond changée en ${color}` });
    }
  });
});

// Export pour ES6 modules
export default {};

//media examples

// 8. Section média
$('h2', {
  parent: '#view',
  css: {
    color: '#333',
    margin: '32px 0 16px 0',
    textAlign: 'center',
    borderBottom: '2px solid #007bff',
    paddingBottom: '8px'
  },
  text: 'Exemples Média 🎵📷🎬'
});

// 9. Balise audio Squirrel avec syntaxe correcte
const audioElement = $('audio', {
  parent: '#view',
  id: 'demo-audio',
  attrs: {
    src: './assets/audios/riff.m4a',
    controls: true
  },
  css: {
    width: '100%',
    maxWidth: '400px',
    margin: '16px auto',
    display: 'block',
    borderRadius: '8px'
  },
  onplay: () => {
    console.log('Audio play event triggered');
    output.$({ text: '🎵 Audio en cours de lecture...' });
  },
  onpause: () => {
    console.log('Audio pause event triggered');
    output.$({ text: '⏸️ Audio en pause' });
  },
  onended: () => {
    console.log('Audio ended event triggered');
    output.$({ text: '✅ Lecture audio terminée' });
  },
  onerror: (e) => {
    console.log('Audio error:', e);
    output.$({ text: '❌ Erreur de chargement audio' });
  }
});

// 10. Galerie d'images Squirrel
$('div', {
  parent: '#view',
  css: {
    textAlign: 'center',
    margin: '16px 0'
  },
  text: 'Galerie d\'images :'
});

const imageElement1 = $('img', {
  parent: '#view',
  id: 'img1',
  attrs: {
    src: './assets/images/green_planet.png',
    alt: 'Planète verte'
  },
  css: {
    width: '150px',
    height: '150px',
    objectFit: 'cover',
    borderRadius: '50%',
    margin: '8px',
    display: 'inline-block',
    border: '4px solid #4caf50',
    cursor: 'pointer',
    transition: 'transform 0.3s ease'
  },
  onclick: () => {
    console.log('Image 1 clicked');
    output.$({ text: '🌍 Image cliquée : Planète verte!' });
  },
  onmouseover: function() {
    this.style.transform = 'scale(1.1)';
  },
  onmouseout: function() {
    this.style.transform = 'scale(1)';
  }
});

const imageElement2 = $('img', {
  parent: '#view',
  id: 'img2',
  attrs: {
    src: './assets/images/puydesancy.jpg',
    alt: 'Puy de Sancy'
  },
  css: {
    width: '150px',
    height: '150px',
    objectFit: 'cover',
    borderRadius: '8px',
    margin: '8px',
    display: 'inline-block',
    border: '4px solid #ff9800',
    cursor: 'pointer',
    transition: 'transform 0.3s ease'
  },
  onclick: () => {
    console.log('Image 2 clicked');
    output.$({ text: '🏔️ Image cliquée : Puy de Sancy!' });
  },
  onmouseover: function() {
    this.style.transform = 'scale(1.1) rotate(5deg)';
  },
  onmouseout: function() {
    this.style.transform = 'scale(1) rotate(0deg)';
  }
});

// 11. Balise vidéo Squirrel
const videoElement = $('video', {
  parent: '#view',
  id: 'demo-video',
  attrs: {
    src: './assets/videos/avengers.mp4',
    controls: true,
    width: 400,
    height: 225
  },
  css: {
    margin: '16px auto',
    display: 'block',
    borderRadius: '8px',
    boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
  },
  onplay: () => {
    console.log('Video play event triggered');
    output.$({ text: '🎬 Vidéo en cours de lecture...' });
  },
  onpause: () => {
    console.log('Video pause event triggered');
    output.$({ text: '⏸️ Vidéo en pause' });
  },
  onended: () => {
    console.log('Video ended event triggered');
    output.$({ text: '🎭 Lecture vidéo terminée' });
  },
  onerror: (e) => {
    console.log('Video error:', e);
    output.$({ text: '❌ Erreur lors du chargement de la vidéo' });
  }
});

