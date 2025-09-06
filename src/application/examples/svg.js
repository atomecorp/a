
// const atomeSvg = $('svg', {
//   id: 'svg-vie-from-file',
//   attrs: {
//     width: '200',
//     height: '200',
//     viewBox: '0 0 237 237',
//     xmlns: 'http://www.w3.org/2000/svg'
//   },
//   svgSrc: '../../assets/images/logos/vie.svg',
//   parent: '#view',  
//   css: {
//     width: '200px',    
//     height: '200px',
//   }
// });

// // Exemple avec innerHTML pour comparaison
// const atomeSvgInline = $('svg', {
//   id: 'svg-atome-inline',
//   attrs: {
//     width: '200',
//     height: '200',
//     viewBox: '0 0 237 237',
//     xmlns: 'http://www.w3.org/2000/svg'
//   },
//   innerHTML: `
//     <g transform="matrix(0.0267056,0,0,0.0267056,18.6376,20.2376)">
//       <g id="shapePath1" transform="matrix(4.16667,0,0,4.16667,-377.307,105.632)">
//         <path d="M629.175,81.832C740.508,190.188 742.921,368.28 634.565,479.613C526.209,590.945 348.116,593.358 236.784,485.002C125.451,376.646 123.038,198.554 231.394,87.221C339.75,-24.111 517.843,-26.524 629.175,81.832Z" style="fill:rgb(201,12,125);"/>
//       </g>
//       <g id="shapePath2" transform="matrix(4.16667,0,0,4.16667,-377.307,105.632)">
//         <path d="M1679.33,410.731C1503.98,413.882 1402.52,565.418 1402.72,691.803C1402.91,818.107 1486.13,846.234 1498.35,1056.78C1501.76,1313.32 1173.12,1490.47 987.025,1492.89C257.861,1502.39 73.275,904.061 71.639,735.381C70.841,653.675 1.164,647.648 2.788,737.449C12.787,1291.4 456.109,1712.79 989.247,1706.24C1570.67,1699.09 1982.31,1234 1965.76,683.236C1961.3,534.95 1835.31,407.931 1679.33,410.731Z" style="fill:rgb(201,12,125);"/>
//       </g>
//     </g>
//   `,
//   parent: '#view',  
//   css: {
//     width: '200px',    
//     height: '200px',
//     marginLeft: '10px'
//   }
// });

// // Example of fetching and rendering an SVG with custom size and colors

// fetch_and_render_svg('../../assets/images/icons/communication.svg','12px', '99px', '120px', '120px' , 'white', 'red', 'my_nice_svg', 'view');


// // Example of resizing an existing SVG by id after a delay

// setTimeout(() => {
//   fillColor('my_nice_svg', 'green');
//   strokeColor('my_nice_svg', 'orange');
//   resize('my_nice_svg', 33, 66, 0.5, 'elastic');
// }, 1500);

fetch_and_render_svg('../../assets/images/icons/activate.svg',      '12px', '0px', '120px', '120px' , 'white', 'red', 'my_nice_svg_small', 'view');
fetch_and_render_svg('../../assets/images/icons/communication.svg', '133px', '99px', '120px', '120px' , 'white', 'red', 'my_nice_svg', 'view');
