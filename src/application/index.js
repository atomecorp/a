// const test=new A({
//     witdt: 555,
//     height: 666,
//     color: 'red',
//     name: 'test',
//     type: 'test',
//     data: {
//         a: 1,
//         b: 2,
//         c: 3,
//     },
//     onClick: function () {
//         console.log('test click');
//     },
//     onMouseOver: function () {
//         console.log('test mouse over');
//     },
//     onMouseOut: function () {
//         console.log('test mouse out');
//     },
//     onMouseMove: function () {
//         console.log('test mouse move');
//     },
//     onMouseDown: function () {
//         console.log('test mouse down');
//     },
//     onMouseUp: function () {
//         console.log('test mouse up');
//     },
//     onMouseWheel: function () {
//         console.log('test mouse wheel');
//     },})

const Atome=new A()
Atome.box({})


const html_container2 = new A({
    attach: 'body',
    id: 'main_html_container',
    markup: 'span',
    role: 'container',
    x: 150,
    y: 50,
    text: 'Hello, World!',
    fontSize: 30,
    width: 400,
    height: 400,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center',
    border: '1px solid black',
    background: 'linear-gradient(to right, #ff7e5f, #feb47b)',
    color: 'red',
    smooth: 10,
    shadow: [
        { blur: 3, x: 4, y: 8, color: { red: 0, green: 0, blue: 0, alpha: 0.6 }, invert: true },
        { blur: 12, x: 0, y: 0, color: { red: 0, green: 0.5, blue: 0, alpha: 0.6 }, invert: false }
    ],
    overflow: 'hidden',
    fasten: [] // will contain the IDs of children
});
