// ============================================
// EventCalendar UI (demo)
// ============================================

import { CalendarAPI } from './calendar.js';

const DEFAULT_CALENDAR_ID = 'calendar_default';

let calendarInstance = null;
let currentViewDate = new Date();
let currentDayDate = new Date();
let selectedEventId = null;
let cachedEvents = [];
let isSelectingSlot = false;
let selectionOverlay = null;
let selectionStartY = 0;
let selectionStartMinutes = 0;
let dayGridRefs = null;

function ensureViewRoot() {
    let view = document.getElementById('view');
    if (!view) {
        view = document.createElement('div');
        view.id = 'view';
        document.body.appendChild(view);
    }
    return view;
}

function ensureStyles() {
    if (document.getElementById('calendar-demo-styles')) return;
    const style = document.createElement('style');
    style.id = 'calendar-demo-styles';
    style.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600&family=Space+Grotesk:wght@400;500;600&display=swap');

#calendar-demo {
  --ink: #1b2a32;
  --ink-soft: #445864;
  --accent: #1f7a73;
  --accent-soft: #cceee7;
  --accent-dark: #12524e;
  --card: #ffffff;
  --shadow: 0 24px 60px rgba(17, 30, 36, 0.16);
  --border: rgba(26, 45, 56, 0.12);
  min-height: 100vh;
  padding: 32px clamp(18px, 4vw, 48px);
  display: grid;
  grid-template-columns: minmax(280px, 340px) minmax(0, 1fr);
  gap: 24px;
  background:
    radial-gradient(circle at 10% 10%, rgba(38, 132, 120, 0.14), transparent 45%),
    radial-gradient(circle at 80% 0%, rgba(247, 212, 162, 0.18), transparent 55%),
    linear-gradient(120deg, #f8f3eb 0%, #f3f7f6 100%);
  color: var(--ink);
  font-family: 'Space Grotesk', 'Segoe UI', sans-serif;
  box-sizing: border-box;
}

#calendar-demo * {
  box-sizing: border-box;
}

.calendar-panel {
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 20px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  box-shadow: var(--shadow);
  animation: fadeUp 0.45s ease;
}

.calendar-panel h1 {
  font-family: 'Fraunces', serif;
  font-size: 22px;
  margin: 0;
  color: var(--accent-dark);
}

.calendar-panel p {
  margin: 0;
  font-size: 13px;
  color: var(--ink-soft);
}

.calendar-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  background: rgba(31, 122, 115, 0.06);
  border-radius: 14px;
  border: 1px solid rgba(31, 122, 115, 0.12);
}

.calendar-section h2 {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0;
  color: var(--accent-dark);
}

.calendar-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--ink-soft);
}

.calendar-field label {
  font-weight: 500;
}

.calendar-field input,
.calendar-field select,
.calendar-field textarea {
  width: 100%;
  border-radius: 10px;
  border: 1px solid rgba(26, 45, 56, 0.2);
  padding: 8px 10px;
  font-size: 13px;
  font-family: 'Space Grotesk', 'Segoe UI', sans-serif;
  color: var(--ink);
  background: #fffaf5;
}

.calendar-field textarea {
  min-height: 70px;
  resize: vertical;
}

.calendar-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
}

.calendar-actions button {
  border: none;
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.btn-primary {
  background: var(--accent);
  color: #f5fffd;
  box-shadow: 0 12px 24px rgba(31, 122, 115, 0.25);
}

.btn-secondary {
  background: #f3d6a8;
  color: #4f3b1b;
}

.btn-danger {
  background: #e96b58;
  color: #fff;
}

.btn-muted {
  background: #e3e8e8;
  color: #2d3c44;
}

.calendar-actions button:hover {
  transform: translateY(-1px);
}

.calendar-status {
  font-size: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f3f7f6;
  color: var(--ink-soft);
}

.calendar-main {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.calendar-day {
  background: #ffffff;
  border-radius: 18px;
  border: 1px solid var(--border);
  padding: 16px;
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.calendar-day__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.calendar-day__title {
  font-weight: 600;
  color: var(--accent-dark);
}

.calendar-day__grid {
  display: grid;
  grid-template-columns: 60px 1fr;
  gap: 10px;
  align-items: start;
}

.calendar-day__hours {
  display: grid;
  grid-template-rows: repeat(24, 44px);
  font-size: 11px;
  color: var(--ink-soft);
  text-align: right;
  padding-right: 6px;
}

.calendar-day__hours span {
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
}

.calendar-day__slots {
  position: relative;
  height: calc(24 * 44px);
  background: linear-gradient(to bottom, rgba(26, 45, 56, 0.06) 1px, transparent 1px);
  background-size: 100% 44px;
  border-radius: 14px;
  border: 1px solid rgba(31, 122, 115, 0.12);
  overflow: hidden;
}

.calendar-day__event {
  position: absolute;
  left: 10px;
  right: 10px;
  border-radius: 10px;
  padding: 6px 8px;
  background: rgba(31, 122, 115, 0.18);
  border: 1px solid rgba(31, 122, 115, 0.4);
  font-size: 12px;
  color: var(--accent-dark);
}

.calendar-day__selection {
  position: absolute;
  left: 10px;
  right: 10px;
  border-radius: 10px;
  background: rgba(241, 118, 65, 0.25);
  border: 1px dashed rgba(241, 118, 65, 0.8);
  pointer-events: none;
}

.calendar-view {
  background: #ffffff;
  border-radius: 20px;
  border: 1px solid var(--border);
  padding: 16px;
  box-shadow: var(--shadow);
  min-height: 380px;
  animation: fadeUp 0.6s ease;
}

.calendar-list {
  background: #ffffff;
  border-radius: 18px;
  border: 1px solid var(--border);
  padding: 16px;
  box-shadow: var(--shadow);
}

.calendar-list h3 {
  margin: 0 0 10px;
  font-size: 14px;
  color: var(--accent-dark);
}

.calendar-event-item {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(31, 122, 115, 0.12);
  margin-bottom: 8px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.calendar-event-item.active {
  background: var(--accent-soft);
  border-color: rgba(31, 122, 115, 0.4);
}

.calendar-event-item small {
  display: block;
  color: var(--ink-soft);
  margin-top: 4px;
}

.calendar-inline {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.weekday-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
}

.weekday-grid label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  justify-content: center;
  padding: 6px 4px;
  border-radius: 8px;
  border: 1px solid rgba(26, 45, 56, 0.15);
  background: #fffaf5;
}

.calendar-note {
  font-size: 11px;
  color: var(--ink-soft);
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 980px) {
  #calendar-demo {
    grid-template-columns: 1fr;
  }
}
`;
    document.head.appendChild(style);
}

function toLocalInputValue(date) {
    if (!date) return '';
    const pad = (n) => String(n).padStart(2, '0');
    const d = new Date(date.getTime());
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function buildMonthRange(date) {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
}

function createField({ label, type = 'text', parent, options, rows, placeholder }) {
    const wrapper = document.createElement('div');
    wrapper.className = 'calendar-field';
    const labelEl = document.createElement('label');
    labelEl.textContent = label;
    wrapper.appendChild(labelEl);

    let input;
    if (type === 'select') {
        input = document.createElement('select');
        (options || []).forEach((opt) => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            input.appendChild(option);
        });
    } else if (type === 'textarea') {
        input = document.createElement('textarea');
        if (rows) input.rows = rows;
    } else if (type === 'checkbox') {
        input = document.createElement('input');
        input.type = 'checkbox';
    } else {
        input = document.createElement('input');
        input.type = type;
    }

    if (placeholder) input.placeholder = placeholder;
    wrapper.appendChild(input);
    parent.appendChild(wrapper);
    return input;
}

function setStatus(statusEl, message, type = 'info') {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.color = type === 'error' ? '#c0392b' : type === 'success' ? '#1b7f7a' : '#445864';
}

function renderEventList(listEl, events) {
    listEl.innerHTML = '';
    if (!events.length) {
        const empty = document.createElement('div');
        empty.className = 'calendar-note';
        empty.textContent = 'No events stored yet.';
        listEl.appendChild(empty);
        return;
    }

    const sorted = [...events].sort((a, b) => (a.start?.getTime?.() || 0) - (b.start?.getTime?.() || 0));
    sorted.forEach((event) => {
        const item = document.createElement('div');
        item.className = 'calendar-event-item';
        if (event.id === selectedEventId) item.classList.add('active');
        item.dataset.eventId = event.id;
        item.innerHTML = `
            <strong>${event.title}</strong>
            <small>${event.start ? event.start.toLocaleString() : 'No date'}</small>
        `;
        item.addEventListener('click', () => {
            selectedEventId = event.id;
            fillForm(event);
            renderEventList(listEl, cachedEvents);
        });
        listEl.appendChild(item);
    });
}

function buildCalendarEvents(events, range) {
    return events.flatMap((event) => {
        const occurrences = CalendarAPI.expandOccurrences(event, range.start, range.end);
        return occurrences.map((occurrence) => ({
            id: occurrence.id,
            name: occurrence.title,
            date: occurrence.start,
            link: occurrence.link || ''
        }));
    });
}

function updateCalendarView(range) {
    if (!calendarInstance) return;
    const events = buildCalendarEvents(cachedEvents, range);
    calendarInstance.setState({
        currentTime: range.start,
        events
    });
}

let formRefs = null;

function fillForm(event) {
    if (!formRefs) return;
    formRefs.title.value = event.title || '';
    formRefs.start.value = toLocalInputValue(event.start);
    formRefs.end.value = toLocalInputValue(event.end);
    formRefs.location.value = event.location || '';
    formRefs.description.value = event.description || '';
    formRefs.allDay.checked = !!event.allDay;

    const recurrence = event.recurrence || null;
    formRefs.recurrence.value = recurrence?.freq || 'none';
    formRefs.interval.value = recurrence?.interval || 1;
    const weekdays = new Set(recurrence?.byWeekday || []);
    formRefs.weekdayInputs.forEach((input, idx) => {
        input.checked = weekdays.has(idx);
    });

    const alarm = Array.isArray(event.alarms) ? event.alarms[0] : null;
    formRefs.enableAlarm.checked = !!alarm;
    formRefs.alarmOffset.value = alarm?.offsetMinutes ?? -30;
    formRefs.alarmAction.value = alarm?.action || 'notify';
    formRefs.alarmMessage.value = alarm?.message || '';
    formRefs.alarmScript.value = alarm?.script || '';
}

function resetForm() {
    if (!formRefs) return;
    formRefs.title.value = '';
    formRefs.start.value = '';
    formRefs.end.value = '';
    formRefs.location.value = '';
    formRefs.description.value = '';
    formRefs.allDay.checked = false;
    formRefs.recurrence.value = 'none';
    formRefs.interval.value = 1;
    formRefs.weekdayInputs.forEach((input) => { input.checked = false; });
    formRefs.enableAlarm.checked = true;
    formRefs.alarmOffset.value = -30;
    formRefs.alarmAction.value = 'notify';
    formRefs.alarmMessage.value = '';
    formRefs.alarmScript.value = '';
    selectedEventId = null;
}

function setSelectedDay(date) {
    if (!date) return;
    currentDayDate = new Date(date.getTime());
    if (dayGridRefs?.title) {
        dayGridRefs.title.textContent = currentDayDate.toDateString();
    }
    renderDayEvents();
}

function getDayRange(date) {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
    const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
    return { start, end };
}

function renderDayEvents() {
    if (!dayGridRefs?.slots) return;
    dayGridRefs.slots.innerHTML = '';
    const range = getDayRange(currentDayDate);
    const occurrences = cachedEvents.flatMap((event) => {
        return CalendarAPI.expandOccurrences(event, range.start, range.end)
            .filter((occurrence) => occurrence.start && occurrence.start >= range.start && occurrence.start <= range.end);
    });

    occurrences.forEach((occurrence) => {
        const startMinutes = occurrence.start.getHours() * 60 + occurrence.start.getMinutes();
        const endMinutes = occurrence.end ? occurrence.end.getHours() * 60 + occurrence.end.getMinutes() : startMinutes + 30;
        const top = (startMinutes / 60) * 44;
        const height = Math.max(28, ((endMinutes - startMinutes) / 60) * 44);

        const block = document.createElement('div');
        block.className = 'calendar-day__event';
        block.style.top = `${top}px`;
        block.style.height = `${height}px`;
        block.dataset.eventId = occurrence.id || '';
        block.textContent = occurrence.title;
        block.addEventListener('click', () => {
            if (!occurrence.id) return;
            const match = cachedEvents.find((evt) => evt.id === occurrence.id);
            if (match) {
                selectedEventId = match.id;
                fillForm(match);
            }
        });
        dayGridRefs.slots.appendChild(block);
    });
}

function updateSelectionOverlay(yStart, yEnd) {
    if (!selectionOverlay || !dayGridRefs?.slots) return;
    const top = Math.min(yStart, yEnd);
    const height = Math.max(20, Math.abs(yEnd - yStart));
    selectionOverlay.style.top = `${top}px`;
    selectionOverlay.style.height = `${height}px`;
}

function minutesFromOffset(offset, maxHeight) {
    const clamped = Math.max(0, Math.min(offset, maxHeight));
    const minutes = Math.round((clamped / maxHeight) * 24 * 60 / 15) * 15;
    return Math.max(0, Math.min(minutes, 24 * 60));
}

function handleSlotPointerDown(event) {
    if (!dayGridRefs?.slots) return;
    isSelectingSlot = true;
    const rect = dayGridRefs.slots.getBoundingClientRect();
    selectionStartY = event.clientY - rect.top;
    selectionStartMinutes = minutesFromOffset(selectionStartY, rect.height);

    selectionOverlay = document.createElement('div');
    selectionOverlay.className = 'calendar-day__selection';
    dayGridRefs.slots.appendChild(selectionOverlay);
    updateSelectionOverlay(selectionStartY, selectionStartY + 24);
}

function handleSlotPointerMove(event) {
    if (!isSelectingSlot || !dayGridRefs?.slots || !selectionOverlay) return;
    const rect = dayGridRefs.slots.getBoundingClientRect();
    const currentY = event.clientY - rect.top;
    updateSelectionOverlay(selectionStartY, currentY);
}

function handleSlotPointerUp(event) {
    if (!isSelectingSlot || !dayGridRefs?.slots) return;
    const rect = dayGridRefs.slots.getBoundingClientRect();
    const endY = event.clientY - rect.top;
    const endMinutes = minutesFromOffset(endY, rect.height);
    const startMinutes = Math.min(selectionStartMinutes, endMinutes);
    const finalEndMinutes = Math.max(selectionStartMinutes, endMinutes + 15);

    const startDate = new Date(currentDayDate.getTime());
    startDate.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
    const endDate = new Date(currentDayDate.getTime());
    endDate.setHours(Math.floor(finalEndMinutes / 60), finalEndMinutes % 60, 0, 0);

    formRefs.start.value = toLocalInputValue(startDate);
    formRefs.end.value = toLocalInputValue(endDate);
    formRefs.title.focus();

    if (selectionOverlay) {
        selectionOverlay.remove();
        selectionOverlay = null;
    }
    isSelectingSlot = false;
}

function buildCalendarEventTemplate(event) {
    const time = event.date
        ? new Date(event.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '';
    const name = event.name || 'Event';
    return (
        `<span class="evt-calendar__cell__event" data-event-id="${event.id || ''}">
            <span class="event-time">${time}</span>
            <span class="event-name">${name}</span>
            <span class="event-dot"></span>
        </span>`
    );
}

function buildCalendarCellTemplate({ day, events }) {
    const active = events.length ? 'evt-calendar__cell--active' : '';
    const passive = day.isOtherMonth ? 'evt-calendar__cell--passive' : '';
    const links = events.map(buildCalendarEventTemplate).join('');
    return (
        `<td class="evt-calendar__cell ${active} ${passive}" data-date="${day.timestamp}">
            ${links}
            <span class="evt-calendar__cell__date">${day.dayOfMonth}</span>
        </td>`
    );
}

function handleCalendarClick(event, statusEl) {
    const eventEl = event.target.closest('.evt-calendar__cell__event');
    if (eventEl?.dataset?.eventId) {
        const found = cachedEvents.find((evt) => evt.id === eventEl.dataset.eventId);
        if (found) {
            selectedEventId = found.id;
            fillForm(found);
            setSelectedDay(found.start);
            setStatus(statusEl, 'Event selected from calendar.', 'info');
            renderEventList(formRefs.eventList, cachedEvents);
        }
        return;
    }

    const cell = event.target.closest('.evt-calendar__cell');
    if (!cell?.dataset?.date) return;
    const date = new Date(Number(cell.dataset.date));
    if (Number.isNaN(date.getTime())) return;

    const start = new Date(date.getTime());
    start.setHours(9, 0, 0, 0);
    const end = new Date(date.getTime());
    end.setHours(10, 0, 0, 0);
    formRefs.start.value = toLocalInputValue(start);
    formRefs.end.value = toLocalInputValue(end);
    formRefs.title.focus();
    selectedEventId = null;
    setSelectedDay(date);
    setStatus(statusEl, `Date selected: ${date.toDateString()}`, 'info');
}

async function refreshEvents(statusEl) {
    const result = await CalendarAPI.listEvents();
    cachedEvents = result.items || [];
    renderEventList(formRefs.eventList, cachedEvents);
    updateCalendarView(buildMonthRange(currentViewDate));
    renderDayEvents();
    setStatus(statusEl, `Loaded ${cachedEvents.length} events`, 'success');
}

function getFormData() {
    const title = formRefs.title.value.trim();
    const start = fromLocalInputValue(formRefs.start.value);
    const end = fromLocalInputValue(formRefs.end.value);
    const recurrenceValue = formRefs.recurrence.value;
    const interval = Math.max(1, Number(formRefs.interval.value || 1));
    const byWeekday = formRefs.weekdayInputs
        .map((input, idx) => (input.checked ? idx : null))
        .filter((val) => val !== null);

    const recurrence = recurrenceValue === 'none'
        ? null
        : {
            freq: recurrenceValue,
            interval,
            byWeekday: byWeekday.length ? byWeekday : undefined
        };

    const alarms = formRefs.enableAlarm.checked
        ? [{
            offsetMinutes: Number(formRefs.alarmOffset.value || -30),
            action: formRefs.alarmAction.value,
            message: formRefs.alarmMessage.value || `Reminder: ${title || 'event'}`,
            script: formRefs.alarmScript.value || ''
        }]
        : [];

    return {
        title,
        start,
        end,
        location: formRefs.location.value.trim(),
        description: formRefs.description.value.trim(),
        allDay: formRefs.allDay.checked,
        recurrence,
        alarms,
        calendarId: DEFAULT_CALENDAR_ID
    };
}

function initCalendarUI() {
    ensureStyles();
    const view = ensureViewRoot();
    view.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.id = 'calendar-demo';
    view.appendChild(wrapper);

    const panel = document.createElement('div');
    panel.className = 'calendar-panel';
    wrapper.appendChild(panel);

    const title = document.createElement('h1');
    title.textContent = 'EventCalendar Lab';
    panel.appendChild(title);

    const intro = document.createElement('p');
    intro.textContent = 'Create, update and sync events using the Squirrel calendar API.';
    panel.appendChild(intro);

    const formSection = document.createElement('div');
    formSection.className = 'calendar-section';
    panel.appendChild(formSection);

    const formTitle = document.createElement('h2');
    formTitle.textContent = 'Event details';
    formSection.appendChild(formTitle);

    const titleInput = createField({ label: 'Title', parent: formSection });
    const startInput = createField({ label: 'Start', parent: formSection, type: 'datetime-local' });
    const endInput = createField({ label: 'End', parent: formSection, type: 'datetime-local' });
    const allDayInput = createField({ label: 'All day', parent: formSection, type: 'checkbox' });
    const locationInput = createField({ label: 'Location', parent: formSection });
    const descriptionInput = createField({ label: 'Description', parent: formSection, type: 'textarea', rows: 3 });

    const recurrenceSection = document.createElement('div');
    recurrenceSection.className = 'calendar-section';
    panel.appendChild(recurrenceSection);
    const recurrenceTitle = document.createElement('h2');
    recurrenceTitle.textContent = 'Recurrence';
    recurrenceSection.appendChild(recurrenceTitle);
    const recurrenceSelect = createField({
        label: 'Frequency',
        parent: recurrenceSection,
        type: 'select',
        options: [
            { value: 'none', label: 'None' },
            { value: 'daily', label: 'Daily' },
            { value: 'weekly', label: 'Weekly' },
            { value: 'monthly', label: 'Monthly' },
            { value: 'yearly', label: 'Yearly' }
        ]
    });
    const intervalInput = createField({ label: 'Interval', parent: recurrenceSection, type: 'number' });
    intervalInput.value = 1;

    const weekdayWrapper = document.createElement('div');
    weekdayWrapper.className = 'weekday-grid';
    const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekdayInputs = weekdayLabels.map((label, idx) => {
        const labelEl = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = String(idx);
        labelEl.appendChild(checkbox);
        labelEl.appendChild(document.createTextNode(label));
        weekdayWrapper.appendChild(labelEl);
        return checkbox;
    });
    recurrenceSection.appendChild(weekdayWrapper);

    const alarmSection = document.createElement('div');
    alarmSection.className = 'calendar-section';
    panel.appendChild(alarmSection);
    const alarmTitle = document.createElement('h2');
    alarmTitle.textContent = 'Alarm';
    alarmSection.appendChild(alarmTitle);
    const enableAlarm = createField({ label: 'Enable alarm', parent: alarmSection, type: 'checkbox' });
    enableAlarm.checked = true;
    const alarmOffset = createField({ label: 'Offset minutes (- = before)', parent: alarmSection, type: 'number' });
    alarmOffset.value = -30;
    const alarmAction = createField({
        label: 'Action',
        parent: alarmSection,
        type: 'select',
        options: [
            { value: 'notify', label: 'Notification' },
            { value: 'script', label: 'Run script' }
        ]
    });
    const alarmMessage = createField({ label: 'Message', parent: alarmSection });
    const alarmScript = createField({ label: 'Script (JS)', parent: alarmSection, type: 'textarea', rows: 3 });

    const shareSection = document.createElement('div');
    shareSection.className = 'calendar-section';
    panel.appendChild(shareSection);
    const shareTitle = document.createElement('h2');
    shareTitle.textContent = 'Share calendar';
    shareSection.appendChild(shareTitle);
    const sharePhone = createField({ label: 'Target phone', parent: shareSection, placeholder: '+33600000000' });
    const shareRead = createField({ label: 'Allow read', parent: shareSection, type: 'checkbox' });
    shareRead.checked = true;
    const shareEdit = createField({ label: 'Allow edit', parent: shareSection, type: 'checkbox' });

    const webcalSection = document.createElement('div');
    webcalSection.className = 'calendar-section';
    panel.appendChild(webcalSection);
    const webcalTitle = document.createElement('h2');
    webcalTitle.textContent = 'Webcal sync';
    webcalSection.appendChild(webcalTitle);
    const baseUrlInput = createField({ label: 'Base URL', parent: webcalSection, placeholder: 'https://example.com' });
    baseUrlInput.value = window.location.origin;
    const webcalOutput = document.createElement('div');
    webcalOutput.className = 'calendar-note';
    webcalOutput.textContent = 'Generate a webcal link or copy the ICS feed.';
    webcalSection.appendChild(webcalOutput);

    const actionSection = document.createElement('div');
    actionSection.className = 'calendar-actions';
    panel.appendChild(actionSection);

    const createBtn = document.createElement('button');
    createBtn.className = 'btn-primary';
    createBtn.textContent = 'Create event';
    actionSection.appendChild(createBtn);

    const updateBtn = document.createElement('button');
    updateBtn.className = 'btn-secondary';
    updateBtn.textContent = 'Update event';
    actionSection.appendChild(updateBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-danger';
    deleteBtn.textContent = 'Delete event';
    actionSection.appendChild(deleteBtn);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn-muted';
    clearBtn.textContent = 'Clear form';
    actionSection.appendChild(clearBtn);

    const shareBtn = document.createElement('button');
    shareBtn.className = 'btn-primary';
    shareBtn.textContent = 'Share calendar';
    actionSection.appendChild(shareBtn);

    const webcalBtn = document.createElement('button');
    webcalBtn.className = 'btn-secondary';
    webcalBtn.textContent = 'Generate webcal';
    actionSection.appendChild(webcalBtn);

    const statusEl = document.createElement('div');
    statusEl.className = 'calendar-status';
    statusEl.textContent = 'Ready.';
    panel.appendChild(statusEl);

    const main = document.createElement('div');
    main.className = 'calendar-main';
    wrapper.appendChild(main);

    const calendarCard = document.createElement('div');
    calendarCard.className = 'calendar-view';
    main.appendChild(calendarCard);
    const calendarHost = document.createElement('div');
    calendarHost.className = 'js-evt-cal';
    calendarCard.appendChild(calendarHost);

    const dayCard = document.createElement('div');
    dayCard.className = 'calendar-day';
    main.appendChild(dayCard);

    const dayHeader = document.createElement('div');
    dayHeader.className = 'calendar-day__header';
    dayCard.appendChild(dayHeader);

    const dayTitle = document.createElement('div');
    dayTitle.className = 'calendar-day__title';
    dayTitle.textContent = currentDayDate.toDateString();
    dayHeader.appendChild(dayTitle);

    const dayControls = document.createElement('div');
    dayControls.className = 'calendar-inline';
    dayHeader.appendChild(dayControls);

    const dayPrev = document.createElement('button');
    dayPrev.className = 'btn-muted';
    dayPrev.textContent = 'Prev day';
    dayControls.appendChild(dayPrev);

    const dayNext = document.createElement('button');
    dayNext.className = 'btn-muted';
    dayNext.textContent = 'Next day';
    dayControls.appendChild(dayNext);

    const dayToday = document.createElement('button');
    dayToday.className = 'btn-secondary';
    dayToday.textContent = 'Today';
    dayControls.appendChild(dayToday);

    const dayGrid = document.createElement('div');
    dayGrid.className = 'calendar-day__grid';
    dayCard.appendChild(dayGrid);

    const dayHours = document.createElement('div');
    dayHours.className = 'calendar-day__hours';
    dayGrid.appendChild(dayHours);
    for (let i = 0; i < 24; i += 1) {
        const hour = document.createElement('span');
        const label = String(i).padStart(2, '0') + ':00';
        hour.textContent = label;
        dayHours.appendChild(hour);
    }

    const daySlots = document.createElement('div');
    daySlots.className = 'calendar-day__slots';
    dayGrid.appendChild(daySlots);

    const listCard = document.createElement('div');
    listCard.className = 'calendar-list';
    main.appendChild(listCard);
    const listTitle = document.createElement('h3');
    listTitle.textContent = 'Stored events';
    listCard.appendChild(listTitle);
    const eventList = document.createElement('div');
    listCard.appendChild(eventList);

    formRefs = {
        title: titleInput,
        start: startInput,
        end: endInput,
        allDay: allDayInput,
        location: locationInput,
        description: descriptionInput,
        recurrence: recurrenceSelect,
        interval: intervalInput,
        weekdayInputs,
        enableAlarm,
        alarmOffset,
        alarmAction,
        alarmMessage,
        alarmScript,
        eventList
    };

    dayGridRefs = {
        title: dayTitle,
        slots: daySlots
    };

    if (typeof eventCalendar !== 'function') {
        setStatus(statusEl, 'EventCalendar library is missing.', 'error');
        return;
    }

    calendarInstance = eventCalendar({
        selector: '.js-evt-cal',
        locale: 'en',
        tdTemplate: buildCalendarCellTemplate,
        state: {
            events: [],
            currentTime: currentViewDate
        }
    });

    calendarInstance.on('did-change-month', (monthNumber) => {
        const newMonth = monthNumber - 1;
        const prevMonth = currentViewDate.getMonth();
        if (prevMonth === 11 && newMonth === 0) currentViewDate.setFullYear(currentViewDate.getFullYear() + 1);
        if (prevMonth === 0 && newMonth === 11) currentViewDate.setFullYear(currentViewDate.getFullYear() - 1);
        currentViewDate.setMonth(newMonth);
        updateCalendarView(buildMonthRange(currentViewDate));
    });

    calendarHost.addEventListener('click', (event) => handleCalendarClick(event, statusEl));

    daySlots.addEventListener('mousedown', handleSlotPointerDown);
    document.addEventListener('mousemove', handleSlotPointerMove);
    document.addEventListener('mouseup', handleSlotPointerUp);

    dayPrev.addEventListener('click', () => {
        const prev = new Date(currentDayDate.getTime());
        prev.setDate(prev.getDate() - 1);
        setSelectedDay(prev);
    });

    dayNext.addEventListener('click', () => {
        const next = new Date(currentDayDate.getTime());
        next.setDate(next.getDate() + 1);
        setSelectedDay(next);
    });

    dayToday.addEventListener('click', () => {
        setSelectedDay(new Date());
    });

    createBtn.addEventListener('click', async () => {
        const payload = getFormData();
        const result = await CalendarAPI.createEvent(payload);
        if (result.ok) {
            setStatus(statusEl, 'Event created.', 'success');
            await refreshEvents(statusEl);
            resetForm();
        } else {
            setStatus(statusEl, result.error || 'Failed to create event', 'error');
        }
    });

    updateBtn.addEventListener('click', async () => {
        if (!selectedEventId) {
            setStatus(statusEl, 'Select an event to update.', 'error');
            return;
        }
        const payload = getFormData();
        const result = await CalendarAPI.updateEvent(selectedEventId, payload);
        if (result.ok) {
            setStatus(statusEl, 'Event updated.', 'success');
            await refreshEvents(statusEl);
        } else {
            setStatus(statusEl, result.error || 'Failed to update event', 'error');
        }
    });

    deleteBtn.addEventListener('click', async () => {
        if (!selectedEventId) {
            setStatus(statusEl, 'Select an event to delete.', 'error');
            return;
        }
        const result = await CalendarAPI.deleteEvent(selectedEventId);
        if (result.ok) {
            setStatus(statusEl, 'Event deleted.', 'success');
            await refreshEvents(statusEl);
            resetForm();
        } else {
            setStatus(statusEl, result.error || 'Failed to delete event', 'error');
        }
    });

    clearBtn.addEventListener('click', () => {
        resetForm();
        setStatus(statusEl, 'Form cleared.', 'info');
        renderEventList(eventList, cachedEvents);
    });

    shareBtn.addEventListener('click', async () => {
        const phone = sharePhone.value.trim();
        if (!phone) {
            setStatus(statusEl, 'Enter a phone number to share.', 'error');
            return;
        }
        const result = await CalendarAPI.shareCalendar({
            calendarId: DEFAULT_CALENDAR_ID,
            phone,
            permissions: {
                read: shareRead.checked,
                alter: shareEdit.checked,
                delete: false,
                create: shareEdit.checked
            }
        });
        if (result.ok) {
            setStatus(statusEl, `Calendar shared with ${phone}`, 'success');
        } else {
            setStatus(statusEl, result.error || 'Share failed', 'error');
        }
    });

    webcalBtn.addEventListener('click', async () => {
        const res = await CalendarAPI.exportWebcal({
            calendarId: DEFAULT_CALENDAR_ID,
            baseUrl: baseUrlInput.value.trim()
        });
        if (res.ok) {
            const url = res.url ? `Webcal URL: ${res.url}` : 'Provide a base URL to build a webcal link.';
            webcalOutput.textContent = url;
            setStatus(statusEl, 'ICS feed generated.', 'success');
        } else {
            setStatus(statusEl, res.error || 'Webcal export failed', 'error');
        }
    });

    CalendarAPI.on(() => refreshEvents(statusEl));
    CalendarAPI.ensureCalendar(DEFAULT_CALENDAR_ID).then(() => refreshEvents(statusEl));
    setSelectedDay(currentDayDate);
}

initCalendarUI();

export { initCalendarUI };
