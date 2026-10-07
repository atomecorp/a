/** Canonical generic-slider gestures and projection; configuration stays live. */
import { quantizeSliderValue, formatSliderBound } from './slider_contract.js';

export function setupSliderBehavior({ container, track, handle, progression, label, bounds = [], type, isCircular,
    readConfig, onChange, onInput, sState, circularStyles }) {
  let progressCircle = null;
  const updatePosition = raw => {
    const { min, max, step, disabled, dragMin, dragMax, unit } = readConfig();
    const value = quantizeSliderValue(raw, { min, max, step });
    const fraction = max === min ? 0 : (value - min) / (max - min);
    const percentage = fraction * 100;
    if (isCircular) {
      const border = parseFloat(window.getComputedStyle(track).borderWidth) || 6;
      const radius = 50 - border / Math.max(1, container.offsetWidth) * 100 + sState.currentHandleOffset;
      const angle = (percentage * 3.6 - 90) * Math.PI / 180;
      handle.$({ css: { left: `${50 + radius * Math.cos(angle)}%`, top: `${50 + radius * Math.sin(angle)}%`,
        transform: 'translate(-50%, -50%)', zIndex: '15' } });
      if (!progressCircle) {
        // Existing canonical circular projection; structured styles replace CSS strings.
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 100 100');
        Object.assign(svg.style, { position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
          transform: 'rotate(-90deg)', pointerEvents: 'none', zIndex: '2' });
        const background = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        progressCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        [background, progressCircle].forEach(circle => {
          circle.setAttribute('cx', '50'); circle.setAttribute('cy', '50'); circle.setAttribute('r', '42'); svg.appendChild(circle);
        });
        Object.assign(background.style, { fill: 'none', stroke: '#e0e0e0', strokeWidth: '6', opacity: '0.3' });
        Object.assign(progressCircle.style, { fill: 'none', stroke: circularStyles.stroke, strokeWidth: circularStyles.strokeWidth,
          strokeLinecap: circularStyles.strokeLinecap, opacity: circularStyles.opacity });
        progressCircle.classList.add('progress-circle'); track.appendChild(svg);
      }
      const circumference = 2 * Math.PI * 42;
      const lower = dragMin ?? min, upper = dragMax ?? max;
      const start = max === min ? 0 : (lower - min) / (max - min);
      const extent = max === min ? 0 : (upper - lower) / (max - min);
      if (dragMin !== null || dragMax !== null) {
        const active = Math.max(0, Math.min(1, (value - lower) / Math.max(step, upper - lower)));
        const visible = active * extent * circumference;
        progressCircle.style.strokeDasharray = `${visible} ${circumference - visible}`;
        progressCircle.style.strokeDashoffset = String(-start * circumference);
      } else {
        progressCircle.style.strokeDasharray = String(circumference);
        progressCircle.style.strokeDashoffset = String(circumference * (1 - fraction));
      }
    } else if (type === 'vertical') {
      handle.$({ css: { top: `${100 - percentage}%`, transform: 'translate(-50%, -50%)' } });
      progression?.$({ css: { height: `${percentage}%` } });
    } else {
      handle.$({ css: { left: `${percentage}%`, transform: 'translate(-50%, -50%)' } });
      progression?.$({ css: { width: `${percentage}%` } });
    }
    label?.$({ text: formatSliderBound(value, unit) });
    bounds.forEach((entry, index) => entry.$({ text: formatSliderBound(index ? max : min, unit) }));
    sState.currentVal = value;
    container.setAttribute('aria-valuemin', String(min)); container.setAttribute('aria-valuemax', String(max));
    container.setAttribute('aria-valuenow', String(value)); container.setAttribute('aria-disabled', String(disabled));
  };
  const fromPoint = (x, y) => {
    const { min, max, dragMin, dragMax } = readConfig();
    let fraction;
    if (isCircular) {
      const rect = container.getBoundingClientRect();
      const angle = Math.atan2(y - rect.top - rect.height / 2, x - rect.left - rect.width / 2) * 180 / Math.PI;
      fraction = ((angle + 450) % 360) / 360;
    } else {
      const rect = track.getBoundingClientRect();
      fraction = type === 'vertical' ? 1 - (y - rect.top) / Math.max(1, rect.height) : (x - rect.left) / Math.max(1, rect.width);
    }
    const value = min + Math.max(0, Math.min(1, fraction)) * (max - min);
    return isCircular ? Math.max(dragMin ?? min, Math.min(dragMax ?? max, value)) : value;
  };
  const move = event => {
    if (!sState.isDragging || readConfig().disabled) return;
    updatePosition(fromPoint(event.clientX, event.clientY)); onInput?.(sState.currentVal); event.preventDefault();
  };
  const release = () => {
    if (!sState.isDragging) return;
    sState.isDragging = false; onChange?.(sState.currentVal);
    document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', release);
  };
  const press = event => {
    if (readConfig().disabled) return;
    sState.isDragging = true; move(event);
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', release);
  };
  const touchPress = event => press({ ...event.touches[0], clientX: event.touches[0].clientX, clientY: event.touches[0].clientY,
    preventDefault: () => event.preventDefault() });
  const touchMove = event => {
    if (event.touches.length) move({ clientX: event.touches[0].clientX, clientY: event.touches[0].clientY, preventDefault: () => event.preventDefault() });
  };
  handle.addEventListener('mousedown', press); track.addEventListener('mousedown', press);
  handle.addEventListener('touchstart', touchPress, { passive: false }); track.addEventListener('touchstart', touchPress, { passive: false });
  document.addEventListener('touchmove', touchMove, { passive: false }); document.addEventListener('touchend', release);
  document.addEventListener('touchcancel', release);
  updatePosition(sState.currentVal);
  return { updatePosition, destroy: () => {
    sState.isDragging = false;
    document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', release);
    document.removeEventListener('touchmove', touchMove); document.removeEventListener('touchend', release);
    document.removeEventListener('touchcancel', release);
    handle.removeEventListener('mousedown', press); track.removeEventListener('mousedown', press);
    handle.removeEventListener('touchstart', touchPress); track.removeEventListener('touchstart', touchPress);
  } };
}
