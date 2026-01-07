
const atomeSvg = $('svg', {
  id: 'svg-vie-from-file',
  attrs: {
    width: '200',
    height: '200',
    viewBox: '0 0 237 237',
    xmlns: 'http://www.w3.org/2000/svg'
  },
  svgSrc: './assets/images/logos/vie.svg',
  parent: '#view',
  css: {
    width: '200px',
    height: '200px',
  }
});
setTimeout(() => {
  // resize('svg-vie-from-file', 100, 100, 1.0, 'elastic');
}, 1500);
// Exemple avec innerHTML pour comparaison
const atomeSvgInline = $('svg', {
  id: 'svg-atome-inline',
  attrs: {
    width: '200',
    height: '200',
    viewBox: '0 0 237 237',
    xmlns: 'http://www.w3.org/2000/svg'
  },
  innerHTML: `
    <g transform="matrix(0.0267056,0,0,0.0267056,18.6376,20.2376)">
      <g id="shapePath1" transform="matrix(4.16667,0,0,4.16667,-377.307,105.632)">
        <path d="M629.175,81.832C740.508,190.188 742.921,368.28 634.565,479.613C526.209,590.945 348.116,593.358 236.784,485.002C125.451,376.646 123.038,198.554 231.394,87.221C339.75,-24.111 517.843,-26.524 629.175,81.832Z" style="fill:rgb(201,12,125);"/>
      </g>
      <g id="shapePath2" transform="matrix(4.16667,0,0,4.16667,-377.307,105.632)">
        <path d="M1679.33,410.731C1503.98,413.882 1402.52,565.418 1402.72,691.803C1402.91,818.107 1486.13,846.234 1498.35,1056.78C1501.76,1313.32 1173.12,1490.47 987.025,1492.89C257.861,1502.39 73.275,904.061 71.639,735.381C70.841,653.675 1.164,647.648 2.788,737.449C12.787,1291.4 456.109,1712.79 989.247,1706.24C1570.67,1699.09 1982.31,1234 1965.76,683.236C1961.3,534.95 1835.31,407.931 1679.33,410.731Z" style="fill:rgb(201,12,125);"/>
      </g>
    </g>
  `,
  parent: '#view',
  css: {
    width: '200px',
    height: '200px',
    marginLeft: '10px'
  }
});

// Example of fetching and rendering an SVG with custom size and colors

dataFetcher('assets/images/icons/add.svg')
  .then(svgData => { render_svg(svgData, 'my_nice_svg', 'view', '133px', '333px', '120px', '120px', null, null); })
  .catch(err => { span.textContent = 'Erreur: ' + err.message; });

// Example of resizing an existing SVG by id after a delay

setTimeout(() => {
  fillColor('my_nice_svg', 'purple');
  strokeColor('my_nice_svg', 'orange');
}, 1500);

setTimeout(() => {
  resize('my_nice_svg', 33, 33, 0.5, 'elastic');
}, 2500);



const base64data = 'data:image/svg+xml;base64,' + "PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz48IURPQ1RZUEUgc3ZnIFBVQkxJQyAiLS8vVzNDLy9EVEQgU1ZHIDEuMS8vRU4iICJodHRwOi8vd3d3LnczLm9yZy9HcmFwaGljcy9TVkcvMS4xL0RURC9zdmcxMS5kdGQiPjxzdmcgdmVyc2lvbj0iMS4xIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4IiAgeG1sOnNwYWNlPSJwcmVzZXJ2ZSIgaWQ9Im1lbnVDYW52YXMiPgk8ZyBpZD0ibWVudUNhbnZhcy1ncm91cCI+CQk8ZyBpZD0ibWVudUNhbnZhcy1ncm91cDIiPgkJCTxnIGlkPSJtZW51Q2FudmFzLWdyb3VwMyI+CQkJPHBhdGggaWQ9Im1lbnVDYW52YXMtYmV6aWVyMyIgc3Ryb2tlPSJyZ2IoMjM4LCAyMzgsIDIzOCkiIHN0cm9rZS13aWR0aD0iMzMiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgZmlsbD0ibm9uZSIgZD0iTSAxNy42NywxMTAuNjcgTCAxMTEuMzMsMTEwLjY3IiAvPgkJCQk8cGF0aCBpZD0ibWVudUNhbnZhcy1iZXppZXIxIiBzdHJva2U9InJnYigyMzgsIDIzOCwgMjM4KSIgc3Ryb2tlLXdpZHRoPSIzMyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBmaWxsPSJub25lIiBkPSJNIDE3LjY3LDE4LjMzIEwgMTExLjMzLDE4LjMzIiAvPgkJCQk8cGF0aCBpZD0ibWVudUNhbnZhcy1iZXppZXIyIiBzdHJva2U9InJnYigyMzgsIDIzOCwgMjM4KSIgc3Ryb2tlLXdpZHRoPSIzMyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBmaWxsPSJub25lIiBkPSJNIDE3LjY3LDY0LjUgTCAxMTEuMzMsNjQuNSIgLz4JCQk8L2c+CQk8L2c+CTwvZz48L3N2Zz4=";


const base64Test = $('svg', {
  id: 'svg-b64-from-data',
  attrs: {
    width: '200',
    height: '200',
    viewBox: '0 0 237 237',
    xmlns: 'http://www.w3.org/2000/svg'
  },
  svgSrc: base64data,
  parent: '#view',
  css: {
    width: '200px',
    height: '200px',
    position: 'absolute',
    top: 200,
    left: 30
  }
});