import ICAL from '../../assets/vendor/ical/ical.bundle.js';

/** Supply Intl offsets to ICAL's recurrence comparisons when no VTIMEZONE exists. */
export function installIanaZones(component, resolveWall) {
    const installed = [];
    const definitions = new Set(component.getAllSubcomponents('vtimezone').map(zone => zone.getFirstPropertyValue('tzid')));
    const ids = new Set(component.getAllSubcomponents('vevent').flatMap(event => event.getAllProperties()
        .map(property => property.getParameter('tzid')).filter(Boolean)));
    try {
        for (const id of ids) {
            if (definitions.has(id) || ICAL.TimezoneService.has(id)) continue;
            new Intl.DateTimeFormat('en-US', { timeZone: id }).format();
            const zone = new ICAL.Timezone({ tzid: id });
            zone.utcOffset = time => {
                const part = number => String(number).padStart(2, '0');
                const value = `${String(time.year).padStart(4, '0')}${part(time.month)}${part(time.day)}T${part(time.hour)}${part(time.minute)}${part(time.second)}`;
                const wall = Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute, time.second);
                return (wall - resolveWall({ value, params: { TZID: id } }).getTime()) / 1000;
            };
            ICAL.TimezoneService.register(zone); installed.push(id);
        }
    } catch (error) {
        installed.forEach(id => ICAL.TimezoneService.remove(id)); throw error;
    }
    return () => installed.forEach(id => ICAL.TimezoneService.remove(id));
}
