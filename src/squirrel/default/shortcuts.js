
  function createBasicConsole() {
  const console1 = Console({
    title: 'Debug Console',
    position: { x: 50, y: 50 },
    size: { width: 500, height: 350 },
    template: 'dark_theme'
  });
  
  console1.show();
  return console1;
}




  const myFct = function atest(key){
createBasicConsole();
     };
  shortcut('alt-c', myFct);