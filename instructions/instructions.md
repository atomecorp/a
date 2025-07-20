you must alway use js when you create code , and never create or alter any .html or css files.
when creating html you must always use squireel syntaxe here is an example :
$('div', {
  id: 'myDiv',
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block'
  },
  text: 'Je suis une div ! 🎯'
});

when using button or slider any other html components you must use squirel component, and take a look at all the examples availlable in sr/application/examples to understand how to use those components