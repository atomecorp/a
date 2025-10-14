

const demoAtome = new Atome({
    width: 100,
    height: 100,
    units: { width: 'px', height: 'px', left: 'px', top: 'px' },
    left: 20,
    top: 20,
    background: '#ff6f61',
    color: '#1d1d1f',
    display: 'flex',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '12px',
    tag: 'red',
    text: 'super'
});

const demo2 = new Atome({
    width: 300,
    height: 100,
    units: { width: 'px', height: '%', left: 'px', top: 'px' },
    left: 120,
    top: 0,
    background: '#2d9cdb',
    color: '#fefefe',
    display: 'flex',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '12px',
    boxShadow: '0 10px 24px rgba(0,0,0,0.18)',
    tag: 'blue',
    text: 'we are cool'
});





const demo3 = Atome.box({
    left: 250,
    top: 150,
    width: 150,
    height: 150,
    background: 'green',
    color: 'white',
    display: 'flex',
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '12px',
    boxShadow: '0 10px 24px rgba(0,0,0,0.99)'
});


setTimeout(() => {
    demoAtome.set({ left: 30, top: 30 });

}, 1000);