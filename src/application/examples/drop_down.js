

/////


// example usage of dropDown component
// This snippet shows creating a holder, mounting the dropdown, listening to
// changes and using getValue/setValue programmatically.
;(function _dropDownExample(){
  // create a small holder inside the existing intuition container
  const holder = $('div', {
    parent: '#view',
    id: 'dd-example-holder',
    css: {
      position: 'absolute',
      bottom: '60px',
      left: '8px',
      width: '96px',
      height: '18px'
    }
  });

  // instantiate the custom dropDown
  const dd = dropDown({
    parent: holder,
    id: 'dd-example',
    theme: 'light',
    options: [
      { label: 'Pixels', value: 'px' },
      { label: 'Percent', value: '%' },
      { label: 'EM', value: 'em' }
    ],
    value: 'px',
    openDirection: 'up',
  
    onChange: (val, label, idx) => {
          document.getElementById('dd-example-holder').style.border = '1px solid rgba(255,255,255,0.3)';

      console.log('dropDown onChange ->', val, label, idx);
      },
      onHover: (val, label, idx) => {
        // simple hover demo (avoid heavy side-effects for performance)
        // console.log kept minimal
        console.log('dropDown onHover ->', val, label, idx);
      }
  });


})();


