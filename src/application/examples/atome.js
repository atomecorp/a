


const demoAtome = new Atome({
    geometry: {
        width: 100,
        height: 100,
        units: {
            width: 'px',
            height: 'px'
        }
    },
    spatial: {
        left: 20,
        top: 20,
        units: {
            left: 'px',
            top: 'px'
        }
    },
    visual: {
        color: '#1c1cc9ff', // Background color
        radius: '12px' //smooth is borderRadius
    },
    layout: {
        display: 'flex',
        align: 'center', // align is   alignItems
        justify: 'center', // justify is justifyContent
        position: 'relative'
    },
    tag: 'red'
});

const demo2 = new Atome({
    geometry: {
        width: 300,
        height: 100,
        units: {
            width: 'px',
            height: '%'
        }
    },
    spatial: {
        left: 120,
        top: 0,
        units: {
            left: 'px',
            top: 'px'
        }
    },
    visual: {
        color: '#5c12a2ff',
        smooth: '12px',
        shadow: '0 10px 24px rgba(0,0,0,0.18)' //shadow is boxShadow
    },
    layout: {
        display: 'flex',
        position: 'relative',
        align: 'center',
        justify: 'center'
    },
    tag: 'blue',
    events: {
        draggable: {
            on: {
                start: (event, atome) => {
                    puts(`Drag started on Atome with tag: ${atome.tag}`);
                },
                drag: (event, atome) => {
                    puts(`Dragging Atome with tag: ${atome.tag}`);
                }
            }
        },
        touchable: {
            modifiers: ['once', 'passive'],
            on: {
                start: (event, atome) => {
                    puts(`Touch started on Atome with tag: ${atome.tag}`);
                }
            }
        },
        resizable: {
            on: {
                resize: (event, atome) => {
                    puts(`Resize started on Atome with tag: ${atome.tag}`);
                }
            }
        }
    },

});

const demo4 = new Atome({
    geometry: {
        width: 300,
        height: 100,
        units: {
            width: 'px',
            height: '%'
        }
    },
    spatial: {
        left: 120,
        top: 0,
        units: {
            left: 'px',
            top: 'px'
        }
    },
    visual: {
        color: '#1ecc8cff',
        smooth: '12px',
        shadow: '0 10px 24px rgba(0,0,0,0.18)'
    },
    layout: {
        display: 'flex',
        position: 'relative',
        align: 'center',
        justify: 'center'
    },
    tag: 'blue'
});

const demo3 = Atome.box({
    geometry: {
        width: 150,
        height: 150
    },
    spatial: {
        left: 250,
        top: 150
    },
    visual: {
        color: 'orange',
        smooth: '12px',
        shadow: '0 10px 24px rgba(0,0,0,0.99)'
    },
    layout: {
        display: 'flex',
        position: 'relative',
        align: 'center',
        justif: 'center'
    }
});


setTimeout(() => {


    demo2.spatial.top = 200;
    demo2.spatial.left = 200;
    demo2.visual.color = 'rgba(255, 0, 170, 1)';
}, 3000);