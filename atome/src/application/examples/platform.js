$('span', {
  id: 'test1',
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'platform: '
});




grab('test1').textContent = 'platform: ' + current_platform();
