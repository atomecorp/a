const volumeSlider = new Slider({
    attach: '#main_html_container',
    id: 'volume_slider',
    type: 'horizontal',
    x: 50,
    y: 100,
    zIndex: 10,
    width: 400,
    height: 30,
    trackWidth: 360,
    position: 'absolute',
    display: 'block',
    value: 30,
    callbacks: {
        onChange: (value) => console.log(`Volume: ${value}%`),
        onStart: () => console.log('Volume adjustment started'),
        onEnd: () => console.log('Volume adjustment ended')
    }
});




const html_container = new A({
    attach: 'body',
    id: 'main_html_container',
    markup: 'span',
    role: 'container',
    position: 'absolute',
    y: 50,
    width: 400,
    height: 300,
    color: 'orange',
    display: 'block',
    smooth: 10,
    shadow: [
        {blur: 3, x: 4, y: 8, color: {red: 0, green: 0, blue: 0, alpha: 0.6}, invert: true},
        {blur: 12, x: 0, y: 0, color: {red: 0, green: 0.5, blue: 0, alpha: 0.6}, invert: false}
    ],
    overflow: 'hidden',
    fasten: [] // will contain the IDs of children
});



