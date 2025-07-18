

function fct_to_trig(state) {
    console.log('trig: ' + state);
}

function fct_to_trig2(state) {
    console.log('trigger 2 : ' + state);
}
// console.log(Button.templates)
// const toggle = Button({
//     onText: 'ON',
//     offText: 'OFF',
//         template: 'bootstrap_primary',
//     // onAction: fct_to_trig,
//     // offAction: fct_to_trig2,
//     //   onStyle: {
//     //     backgroundColor: 'rgba(99,99,99,1)',
//     //   boxShadow: '0 4px 8px rgba(0,0,0,0.6)',
//     //      color: 'pink',
//     // },
//     // offStyle: { backgroundColor: '#dc3545', color: 'white' },
//     parent: '#view', // parent direct
  
// });

const toggle = Button({
    left: '10px',
    top: '10px',
    position: 'absolute',
    onText: 'ON',
    offText: 'OFF',
    // template: 'squirrel_design',
    onAction: fct_to_trig,     
    offAction: fct_to_trig2,   
    parent: '#view'
});







