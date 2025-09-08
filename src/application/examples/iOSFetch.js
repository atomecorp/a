// Player principal (src défini ensuite)
    const audioPlayer = $('audio', {
      id: 'audioPlayer',
      attrs: {
        controls: true,
        preload: 'none'
      },
      css: {
        margin: '4px 0 6px 0',
        width: '300px',
        outline: 'none',
        borderRadius: '6px',
        background: '#000'
      }
    });

$('span', {
  // pas besoin de 'tag'
  id: 'verif',
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'Je suis un SPAN ! 🎯'
});


function fct_to_trig(state) {
  console.log('trig: ' + state);
  const span = grab('verif');
//   if (!span) return;
  span.style.backgroundColor = state ? 'rgba(26, 61, 26, 1)' : '#f00';
  dataFetcher('texts/lorem.txt')
    .then(txt => { span.textContent = txt; })
    .catch(err => { span.textContent = 'Erreur: ' + err.message; });



      setTimeout(() => {
  dataFetcher('images/logos/arp.svg')
    .then(txt => { span.textContent = txt; })
    .catch(err => { span.textContent = 'Erreur: ' + err.message; });

  }, 1000   );

      setTimeout(() => {
  dataFetcher('images/icons/activate.svg')
    .then(svgData => { render_svg(svgData,'my_nice_svg', 'view','133px', '99px', '120px', '120px' , 'green', 'red');  })
    .catch(err => { span.textContent = 'Erreur: ' + err.message; });
  }, 2000   );


      setTimeout(() => {
  // Aperçu (preview) des 120 premiers caractères ou header hex si binaire
  dataFetcher('audios/riff.m4a', { mode: 'preview', preview: 120 })
     .then(txt => { span.textContent = '[AUDIO PREVIEW] ' + txt; })
    .catch(err => { span.textContent = 'Erreur: ' + err.message; });

  }, 3000   );

  // Nouveau: récupérer l'URL réelle (stream) puis jouer dans la balise audio
  setTimeout(() => {
    dataFetcher('audios/riff.m4a', { mode: 'url' })
      .then(url => {
        const audioEl = grab('audioPlayer');
        if (audioEl) {
          audioEl.src = url;
          // tenter lecture (peut nécessiter interaction utilisateur; fct_to_trig est déclenchée par bouton donc OK)
          const p = audioEl.play();
          if (p && typeof p.catch === 'function') {
            p.catch(e => console.log('lecture refusée:', e.message));
          }
          span.textContent = '[AUDIO PLAY] ' + url.split('/').pop();
        } else {
          span.textContent = 'Audio element introuvable';
        }
      })
      .catch(err => { span.textContent = 'Erreur audio: ' + err.message; });
  }, 3600);
}





const toggle = Button({
    onText: 'ON',
    offText: 'OFF',
    onAction: fct_to_trig,
    offAction: fct_to_trig,
    parent: '#view', // parent direct
    onStyle: { backgroundColor: '#28a745', color: 'white' },
    offStyle: { backgroundColor: '#dc3545', color: 'white' },
    css: {
        position: 'absolute',
        width: '50px',
        height: '24px',
        left: '120px',
        top: '120px',
        borderRadius: '6px',
        backgroundColor: 'orange',
        border: 'none',
        cursor: 'pointer',
        transition: 'background-color 0.3s ease',
        border: '3px solid rgba(255,255,255,0.3)',
        boxShadow: '0 2px 4px rgba(255,255,1,1)',
    }
});





  // dataFetcher('images/icons/copy.svg')
  //   .then(svgData => { render_svg(svgData,'my_nice_svg', 'view','133px', '333px', '120px', '120px' , 'green', 'red');  })
  //   .catch(err => { span.textContent = 'Erreur: ' + err.message; });



  //    setTimeout(() => {
  // dataFetcher('images/icons/activate.svg')
  //   .then(svgData => { render_svg(svgData,'my_nice_svg2', 'view','133px', '199px', '120px', '120px' , 'green', 'red');  })
  //   .catch(err => { span.textContent = 'Erreur: ' + err.message; });
  // }, 2000   );