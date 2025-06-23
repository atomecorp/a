// // / === 🎉 Démonstrations ===
$('span', {
  // pas besoin de 'tag'
  id: 'test1',
  css: {
    backgroundColor: '#00f',
    marginLeft: '0',
    padding: '10px',
    color: 'white',
    margin: '10px',
    display: 'inline-block',
     position: 'absolute',
  },
  text: 'Je suis un SPAN ! 🎯'
});
 grab ('test1').style.left = '400px';
// document.getElementById('test1').style.left = '400px';


  // const toggle = Button({
  //   text: '',
  //   parent: '#view',//TODO correct parent attache is not working
  //   onClick: () => {
  //     // state = !state;
  //     updateVisualState();
  //     // console.log('Toggle:', state ? 'ON ✅' : 'OFF ❌');
  //   },
  //   style: {
  //     width: '150px',
  //     height: '24px',
  //     borderRadius: '12px',
  //     // backgroundColor: state ? '#4CAF50' : '#ccc',
  //     position: 'relative',
  //     border: 'none',
  //     cursor: 'pointer',
  //     transition: 'background-color 0.3s ease'
  //   }
  // });



// define('box', {
//   tag: 'div',
//   class: 'spanned_box',
//   css: {
//     width: '300px',
//     height: '100px',
//     backgroundColor: 'red',
//     transition: 'all 0.5s ease',
//     margin: '10px'
//   }
// });


// $('box', {
//   // pas besoin de 'tag'
//   id: 'test1',
//   css: {
//     marginLeft: '0',
//     padding: '10px',
//     color: 'white',
//     margin: '10px',
//     display: 'block',
//     position: 'absolute',
//   },
//   text: 'Je suis un SPAN ! 🎯'
// });


// // var a= grab ('test1') 
// document.getElementById('test1').style.left = '400px';
// // grab ('test1') .style.left = '400px';