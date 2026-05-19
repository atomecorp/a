
  dataFetcher('assets/images/icons/menu.svg')
    .then(svgData => { render_svg(svgData,'my_nice_svg', 'view','0px', '0px', '33px', '33px' , null, null);  })
    .catch(err => { span.textContent = 'Erreur: ' + err.message; });


     setTimeout(() => {
  resize('my_nice_svg', 233, 333, 0.5, 'elastic');
  }, 2500);
