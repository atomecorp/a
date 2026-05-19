$('div', {
  // pas besoin de 'tag'
  id: 'test1',
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    width: '90px',
    height: '90px',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block',
    position: 'relative' // pour positionner le SVG en relatif au conteneur
  },
});


dataFetcher('assets/images/icons/add.svg')
  .then(svgData => {
    // rattacher le SVG dans la div #test1, et le faire remplir le conteneur
    render_svg(svgData, 'my_nice_svg', 'test1', '0px', '0px', '100%', '100%', null, null);
  })
  .catch(err => { console.error('Erreur:', err); });