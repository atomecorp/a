      function createBasicConsole() {
  const console1 = Console({
    title: 'Debug Console',
    position: { x: 50, y: 50 },
    size: { width: 500, height: 350 },
    template: 'dark_theme'
  });
  
  console1.show();
  return console1;
}$
    
    createBasicConsole()
   
   
   $('audio', {
      id: 'riffPlayer',
      attrs: {
        src: 'assets/audios/riff.m4a',
        controls: true
      },
      css: {
        margin: '20px',
        width: '300px',
        outline: 'none',
        borderRadius: '6px'
      }
    });