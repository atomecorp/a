// Extracted from slider_builder.js createSlider: position rendering (updatePosition — all 3 types
// incl. circular SVG), pointer→value mapping, and mouse/touch drag handlers + listener wiring.
// Shared mutable state passed in via `sState` (mutate-in-place).
import { $ } from '../squirrel.js';

export function setupSliderBehavior(deps) {
  const { container, track, handle, progression, label, type, isCircular, min, max, step, value, disabled, onChange, onInput, sState } = deps;

  const updatePosition = (newValue) => {
    const clampedValue = Math.max(min, Math.min(max, newValue));

    if (isCircular) {
      // POSITION DU HANDLE : Toujours basée sur la plage totale (min-max)
      const handlePercentage = ((clampedValue - min) / (max - min)) * 100;

      // PROGRESSION : Basée sur la zone de drag si définie
      let progressionPercentage = 0;
      if (dragMin !== null || dragMax !== null) {
        // Zone de drag définie : progression selon la zone de drag
        if (clampedValue >= effectiveDragMin && clampedValue <= effectiveDragMax) {
          progressionPercentage = ((clampedValue - effectiveDragMin) / (effectiveDragMax - effectiveDragMin)) * 100;
        } else if (clampedValue > effectiveDragMax) {
          progressionPercentage = 100;
        }
        // Si clampedValue < effectiveDragMin, progressionPercentage reste 0
      } else {
        // Pas de zone de drag : progression suit le handle
        progressionPercentage = handlePercentage;
      }

      // Slider circulaire : position sur le cercle (handle)
      // Convertir le pourcentage en angle (0-360°)
      const handleAngleInDegrees = (handlePercentage / 100) * 360;

      // Convertir en radians et ajuster pour commencer en haut (-90°)
      const handleAngleInRadians = ((handleAngleInDegrees - 90) * Math.PI) / 180;

      // Obtenir la largeur du border pour calculer le bon rayon
      const trackStyle = window.getComputedStyle(track);
      const borderWidth = parseFloat(trackStyle.borderWidth) || parseFloat(trackStyle.borderTopWidth) || 6;

      // Calculer le rayon pour que le handle soit SUR le track
      // Le track a un border, on veut que le handle soit au milieu de ce border
      // Si le conteneur fait 100%, le track intérieur fait 100% - 2*borderWidth
      // Le milieu du border est donc à (100% - borderWidth) / 2
      const borderPercent = (borderWidth / container.offsetWidth) * 100;

      // Appliquer l'offset personnalisé
      // handleOffset positif = vers l'extérieur, négatif = vers l'intérieur
      const radiusPercent = 50 - borderPercent + sState.currentHandleOffset;

      const x = 50 + radiusPercent * Math.cos(handleAngleInRadians);
      const y = 50 + radiusPercent * Math.sin(handleAngleInRadians);

      handle.$({
        css: {
          left: `${x}%`,
          top: `${y}%`,
          transform: 'translate(-50%, -50%)',
          zIndex: '15'  // S'assurer que le handle est au-dessus du track
        }
      });

      // Mise à jour du stroke pour l'effet circulaire
      if (track.querySelector('svg')) {
        const progressCircle = track.querySelector('.progress-circle');
        if (progressCircle) {
          const svgRadius = 42; // Radius dans le viewBox SVG
          const circumference = 2 * Math.PI * svgRadius;

          if (dragMin !== null || dragMax !== null) {
            // Zone de drag limitée : arc qui grandit depuis dragMin
            const dragRangePercent = (effectiveDragMax - effectiveDragMin) / (max - min);
            const maxDragArcLength = circumference * dragRangePercent;
            const progressArcLength = (progressionPercentage / 100) * maxDragArcLength;

            // Décaler le cercle pour que l'arc commence à dragMin
            const dragStartPercent = (effectiveDragMin - min) / (max - min);
            const startAngleOffset = circumference * dragStartPercent;

            // L'arc commence à dragMin et grandit selon la progression
            progressCircle.style.strokeDasharray = `${progressArcLength} ${circumference - progressArcLength}`;
            progressCircle.style.strokeDashoffset = -startAngleOffset;
          } else {
            // Pas de zone de drag : comportement normal
            const offset = circumference - (progressionPercentage / 100) * circumference;
            progressCircle.style.strokeDasharray = circumference;
            progressCircle.style.strokeDashoffset = offset;
          }
        }
      } else {
        // Créer le SVG pour l'effet circulaire si pas encore fait
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.style.cssText = `
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          transform: rotate(-90deg);
          pointer-events: none;
          z-index: 2;
        `;

        // Cercle de fond (fixe)
        const svgRadius = 42;
        const circumference = 2 * Math.PI * svgRadius;
        const backgroundCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        backgroundCircle.style.cssText = `
          fill: none;
          stroke: #e0e0e0;
          stroke-width: 6;
          opacity: 0.3;
        `;
        backgroundCircle.setAttribute('cx', '50');
        backgroundCircle.setAttribute('cy', '50');
        backgroundCircle.setAttribute('r', svgRadius.toString());

        // Cercle de progression - différent selon zone de drag
        const circularProgressionStyles = skin.progression || {};
        const progressCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        progressCircle.classList.add('progress-circle');

        if (dragMin !== null || dragMax !== null) {
          // Zone de drag limitée : arc qui grandit depuis dragMin
          const dragRangePercent = (effectiveDragMax - effectiveDragMin) / (max - min);
          const maxDragArcLength = circumference * dragRangePercent;
          const progressArcLength = (progressionPercentage / 100) * maxDragArcLength;

          // Décaler le cercle pour que l'arc commence à dragMin
          const dragStartPercent = (effectiveDragMin - min) / (max - min);
          const startAngleOffset = circumference * dragStartPercent;

          progressCircle.style.cssText = `
            fill: none;
            stroke: ${circularProgressionStyles.stroke || progressionStyles.backgroundColor || '#007bff'};
            stroke-width: ${circularProgressionStyles.strokeWidth || '6'};
            stroke-dasharray: ${progressArcLength} ${circumference - progressArcLength};
            stroke-dashoffset: ${-startAngleOffset};
            stroke-linecap: ${circularProgressionStyles.strokeLinecap || 'butt'};
            opacity: ${circularProgressionStyles.opacity || '1'};
          `;
        } else {
          // Pas de zone de drag : comportement normal (cercle complet)
          progressCircle.style.cssText = `
            fill: none;
            stroke: ${circularProgressionStyles.stroke || progressionStyles.backgroundColor || '#007bff'};
            stroke-width: ${circularProgressionStyles.strokeWidth || '6'};
            stroke-dasharray: ${circumference};
            stroke-dashoffset: ${circumference - (progressionPercentage / 100) * circumference};
            stroke-linecap: ${circularProgressionStyles.strokeLinecap || 'butt'};
            opacity: ${circularProgressionStyles.opacity || '1'};
          `;
        }

        progressCircle.setAttribute('cx', '50');
        progressCircle.setAttribute('cy', '50');
        progressCircle.setAttribute('r', svgRadius.toString());

        svg.appendChild(backgroundCircle);
        svg.appendChild(progressCircle);
        track.appendChild(svg);
      }

    } else {
      // Sliders horizontaux et verticaux - utiliser la plage totale
      const handlePercentage = ((clampedValue - min) / (max - min)) * 100;

      if (type === 'vertical') {
        // Slider vertical
        handle.$({
          css: {
            top: `${100 - handlePercentage}%`,
            transform: 'translate(-50%, -50%)'
          }
        });

        if (progression) {
          progression.$({
            css: {
              height: `${handlePercentage}%`
            }
          });
        }

      } else {
        // Slider horizontal (défaut)
        handle.$({
          css: {
            left: `${handlePercentage}%`,
            transform: 'translate(-50%, -50%)'
          }
        });

        if (progression) {
          progression.$({
            css: {
              width: `${handlePercentage}%`
            }
          });
        }
      }
    }

    // Mise à jour du label
    if (label) {
      label.$({ text: Math.round(clampedValue).toString() });
    }

    sState.currentVal = clampedValue;
  };

  // Fonction de calcul de valeur depuis position
  const getValueFromPosition = (clientX, clientY) => {
    if (isCircular) {
      // Utiliser getBoundingClientRect pour obtenir la position absolue
      const containerRect = container.getBoundingClientRect();

      // Centre du conteneur en coordonnées absolues
      const centerX = containerRect.left + containerRect.width / 2;
      const centerY = containerRect.top + containerRect.height / 2;

      // Vecteur du centre vers la souris
      const deltaX = clientX - centerX;
      const deltaY = clientY - centerY;

      // Calcul de l'angle en utilisant atan2
      // atan2(y, x) retourne l'angle en radians entre -PI et PI
      // avec 0 pointant vers la droite (3h sur une horloge)
      let angleRadians = Math.atan2(deltaY, deltaX);

      // Convertir en degrés
      let angleDegrees = angleRadians * (180 / Math.PI);

      // Ajuster pour que 0° soit en haut (12h) au lieu de droite (3h)
      // On ajoute 90° pour faire la rotation
      angleDegrees = angleDegrees + 90;

      // Normaliser entre 0 et 360
      if (angleDegrees < 0) {
        angleDegrees += 360;
      }

      // Convertir l'angle en pourcentage (0-1)
      const percentage = angleDegrees / 360;

      // Convertir en valeur selon min/max
      const value = min + percentage * (max - min);

      // Pour les sliders circulaires, appliquer les limites de drag
      if (isCircular) {
        return Math.max(effectiveDragMin, Math.min(effectiveDragMax, value));
      }

      return value;

    } else if (type === 'vertical') {
      // Slider vertical - utiliser le rect du track
      const rect = track.getBoundingClientRect();
      const relativeY = clientY - rect.top;
      const percentage = 1 - (relativeY / rect.height);
      return min + Math.max(0, Math.min(1, percentage)) * (max - min);

    } else {
      // Slider horizontal - utiliser le rect du track
      const rect = track.getBoundingClientRect();
      const relativeX = clientX - rect.left;
      const percentage = relativeX / rect.width;
      return min + Math.max(0, Math.min(1, percentage)) * (max - min);
    }
  };

  // Calcul des zones de drag effectives
  const effectiveDragMin = dragMin !== null ? dragMin : min;
  const effectiveDragMax = dragMax !== null ? dragMax : max;

  // Validation des zones de drag
  if (effectiveDragMin < min) {
  }
  if (effectiveDragMax > max) {
  }

  // Gestionnaires d'événements
  const handleMouseDown = (e) => {
    if (disabled) return;

    sState.isDragging = true;
    const newValue = getValueFromPosition(e.clientX, e.clientY);
    const steppedValue = Math.round(newValue / step) * step;

    updatePosition(steppedValue);

    if (onInput) onInput(sState.currentVal);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    e.preventDefault();
  };

  const handleMouseMove = (e) => {
    if (!sState.isDragging) return;

    const newValue = getValueFromPosition(e.clientX, e.clientY);
    const steppedValue = Math.round(newValue / step) * step;

    updatePosition(steppedValue);

    if (onInput) onInput(sState.currentVal);

    e.preventDefault();
  };

  const handleMouseUp = () => {
    if (!sState.isDragging) return;

    sState.isDragging = false;

    if (onChange) onChange(sState.currentVal);

    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  // Support tactile
  const handleTouchStart = (e) => {
    if (disabled) return;

    const touch = e.touches[0];
    handleMouseDown({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => e.preventDefault() });
  };

  const handleTouchMove = (e) => {
    if (!sState.isDragging) return;

    const touch = e.touches[0];
    handleMouseMove({ clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => e.preventDefault() });
  };

  const handleTouchEnd = () => {
    handleMouseUp();
  };

  // Ajout des événements
  handle.addEventListener('mousedown', handleMouseDown);
  track.addEventListener('mousedown', handleMouseDown);

  handle.addEventListener('touchstart', handleTouchStart, { passive: false });
  track.addEventListener('touchstart', handleTouchStart, { passive: false });
  document.addEventListener('touchmove', handleTouchMove, { passive: false });
  document.addEventListener('touchend', handleTouchEnd);

  // Position initiale
  updatePosition(currentValue);

  // Méthodes utilitaires spécifiques au slider

  return { updatePosition };
}
