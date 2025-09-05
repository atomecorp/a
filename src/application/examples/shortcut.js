
    $('span', {
  css: {
    // backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'press cmd-b ! 🎯'
});



  const myFct = function atest(key){
    $('span', {
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'Je suis un SPAN'
});

     console.log('you press: ' + key);
     };
  shortcut('cmd-b', myFct);