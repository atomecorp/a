import('./values.js').then(() => {


  const vieViewer = $('div', {
    id: 'vieViewer',
    css: {
      backgroundColor: vieBackColor,
      marginLeft: '0',
      color: 'white',
      bottom: barsHeight + 'px',
      top: barsHeight + 'px',
      left: '0',
      position: 'fixed',
      width: '100%',
      textAlign: 'center',
      fontSize: '20px',
      fontWeight: 'bold',
      borderBottom: '2px solid rgb(68, 142, 220)',
      display: 'block'
    },

  });


  const topBar = $('div', {
    id: 'top-bar',
    css: {
      backgroundColor: vieBackColor,
      marginLeft: '0',
      color: 'white',
      top: '0',
      left: '0',
      position: 'fixed',
      height: barsHeight + 'px',
      width: '100%',
      // textAlign: 'center',
      fontSize: '20px',
      fontWeight: 'bold',
      // borderBottom: '2px solid rgb(68, 142, 220)',
      boxShadow: '-2px 0px 6px rgb(6, 5, 5)',
      display: 'block'
    },
  });






  const bottomBar = $('div', {
    id: 'bottom-bar',
    css: {
      backgroundColor: vieBackColor,
      boxShadow: '2px 0px 6px rgba(0,0,0,1)',
      smooth: 10,
      marginLeft: '0',
      color: 'white',
      bottom: '0',
      left: '0',
      position: 'fixed',
      height: barsHeight + 'px',
      width: '100%',
      textAlign: 'center',
      fontSize: '20px',
      fontWeight: 'bold',
      display: 'block'
    },
  });



  const vieLogo = $('svg', {
    id: 'svg-vie-from-file',
    attrs: {

      viewBox: '0 0 237 237',
      xmlns: 'http://www.w3.org/2000/svg'
    },
    svgSrc: './assets/images/logos/vie.svg',
    parent: topBar,
    css: {
      top: Math.floor((barsHeight - (barsHeight - 10)) / 2) + 'px',
      width: barsHeight - 10 + 'px',
      height: barsHeight - 10 + 'px',
      position: 'absolute',
      right: '10px',
    }
  });







  /// tools 


  function fct_to_trig(state) {
    console.log('trig: ' + state);
    grab('save_button').$({
      css: {      
        width: '56px',
        backgroundColor:  'rgb(255, 255, 255)',
      //   color: state ? 'white' : 'black',
      //   transform: state ? 'scale(1.05)' : 'scale(0.95)',
      //   boxShadow: state ? '0 6px 20px rgba(72, 198, 239, 0.6)' : '0 2px 10px rgba(252, 70, 107, 0.4)'
      },
     text: 'saved' 
    });

    setTimeout(() => {
      grab('save_button').$({
        css: {      
          width: '33px',
          backgroundColor:'rgb(198, 198, 198)',
        //   color: state ? 'white' : 'black',
        //   transform: state ? 'scale(1.05)' : 'scale(0.95)',
        //   boxShadow: state ? '0 6px 20px rgba(72, 198, 239, 0.6)' : '0 2px 10px rgba(252, 70, 107, 0.4)'
        },
        text: 'save'
      });
    }, 300);
    // grab('save_button').$({

    //   grab('save_button').$({
    //   css: {      
    //     width: '25px',
    //   //   backgroundColor: state ? 'rgb(72, 198, 239)' : 'rgb(252, 70, 107)',
    //   //   color: state ? 'white' : 'black',
    //   //   transform: state ? 'scale(1.05)' : 'scale(0.95)',
    //   //   boxShadow: state ? '0 6px 20px rgba(72, 198, 239, 0.6)' : '0 2px 10px rgba(252, 70, 107, 0.4)'
    //   }
    // });
  }


  const toggle = Button({
    id: 'save_button',
     onStyle: {
      },
      offStyle: {
      },
    hover: {
        transform: 'translateY(-2px)',
    },
    onText: 'saved',
    offText: 'save',
    onAction: fct_to_trig,
    offAction: fct_to_trig,
    parent: topBar,
    // template:    'lyrix_custom',

    css: {
      top: '6px',
      width: '25px',
      height: '20px',
      left: '59px',
      fontFamily: 'Arial, sans-serif',
          backgroundColor:'rgb(198, 198, 198)',
      boxShadow: '0 4px 15px rgba(102, 126, 234, 0.4)',
      transition: 'all 0.3s ease',
    },
  });
  import('./menu.js')
  // import('./unit_test.js')

});