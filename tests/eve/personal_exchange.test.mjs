import { test, expect } from 'vitest';
import ICAL from 'ical.js';
import { parseCalendarData, buildIcs, expandCalendarOccurrences, canonicalCalendarDate, calendarDate, calendarOccurrenceEnd } from '../../atome/src/squirrel/calendar/icalendar.js';
import { parseVcards, buildWritableVcard } from '../../atome/src/squirrel/contacts/carddav_vcard.js';
import { normalizeContactProperties } from '../../atome/src/squirrel/contacts/local_source.js';
import { normalizeImportedEvent } from '../../atome/src/squirrel/calendar/import_source.js';
import { registerCoreAtomeTypes, CORE_ATOME_TYPE_DEFINITIONS } from '../../atome/src/shared/core_atome_types.js';
import { sanitizeAtomeProperties } from '../../atome/src/shared/atome_contract.js';
import { PERSONAL_IMPORT_TOOLS, personalImportToolResult } from '../../atome/src/shared/personal_import_tools.js';
import { resolveAccessPolicy } from '../../atome/src/squirrel/atome/mcp_security_policy.js';
import { persistContactPhoto } from '../../atome/src/squirrel/contacts/photo_media.js';
import { CommandBusV2 } from '../../eVe/intuition/runtime/command_bus.js';
const ics = lines => ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Test//EN',...lines,'END:VCALENDAR',''].join('\r\n');
const event = lines => ['BEGIN:VEVENT','UID:series',...lines,'END:VEVENT'];
const card = lines => ['BEGIN:VCARD','VERSION:4.0','UID:contact-a',...lines,'END:VCARD',''].join('\r\n');

test('VCF is read independently, folds UTF-8, preserves structured fields and exports edited values', () => {
    const source = card(['FN:Élodie '+ '長'.repeat(45), 'N:Godard;Élodie;Marie;Dr.;Jr.', 'TEL;TYPE=home,voice:0123',
        'TEL;TYPE=work:0456','EMAIL;PREF=1:elodie@example.org','ADR;TYPE=home:;;1 rue\\; autre;Paris;;75000;France',
        'NOTE:first\\nsecond\\, third','BDAY:19900101','X-ABLABEL:Private\\, label','X-ATOME-TOKEN:never-export']);
    const parsed = parseVcards(source)[0];
    const canonical = normalizeContactProperties({ ...parsed, phone: '999', raw: { ...parsed, phone: '0123' } });
    const vcf = buildWritableVcard({ ...canonical, id: 'canonical', exchange_uid: 'contact-a', raw: canonical }, { version: '4.0' });
    const component = new ICAL.Component(ICAL.parse(vcf));
    expect(component.name).toBe('vcard');
    expect(component.getFirstPropertyValue('uid')).toBe('contact-a');
    expect(component.getAllProperties('tel').map(p => p.getFirstValue())).toEqual(['999','0456']);
    expect(component.getFirstPropertyValue('note')).toBe('first\nsecond, third');
    expect(vcf).not.toContain('ATOME-TOKEN');
    for (const line of vcf.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    const removed = normalizeContactProperties({ ...canonical, phone: '', raw: canonical });
    const replay = normalizeContactProperties({ ...removed, raw: removed });
    expect(replay.phones.map(p => p.value)).toEqual(['0456']);
    expect(buildWritableVcard({ ...replay, id: 'canonical', exchange_uid: 'contact-a', raw: replay })).not.toContain('999');
});

test('all-day end is exclusive and RFC text escaping round-trips through an independent reader', () => {
    const events = parseCalendarData(ics(event(['DTSTART;VALUE=DATE:20261001','DTEND;VALUE=DATE:20261003',
        'SUMMARY:Hello\\, world\\; today','DESCRIPTION:first\\nsecond','DTSTAMP:20260101T120000Z'])));
    events[0].title = 'Edited, title; line\n2';
    const content = buildIcs(events);
    const component = new ICAL.Component(ICAL.parse(content)).getFirstSubcomponent('vevent');
    expect(component.getFirstPropertyValue('dtstart').isDate).toBe(true);
    expect(component.getFirstPropertyValue('dtend').toString()).toBe('2026-10-03');
    expect(component.getFirstPropertyValue('summary')).toBe(events[0].title);
    expect(component.getFirstPropertyValue('uid')).toBe('series');
});

test('monthly ordinal rules, COUNT, EXDATE, RDATE and cancelled exceptions remain distinct', () => {
    const events = parseCalendarData(ics([...event(['DTSTART:20261005T090000Z','DTEND:20261005T100000Z',
        'RRULE:FREQ=MONTHLY;COUNT=3;BYDAY=1MO','EXDATE:20261102T090000Z','RDATE:20261012T090000Z']),
        ...event(['RECURRENCE-ID:20261207T090000Z','STATUS:CANCELLED','SEQUENCE:2'])]));
    const occurrences = expandCalendarOccurrences(events[0], new Date('2026-10-01'),new Date('2027-01-01'));
    expect(occurrences.map(d => d.toISOString())).toEqual(['2026-10-05T09:00:00.000Z','2026-10-12T09:00:00.000Z','2026-12-07T09:00:00.000Z']);
    const output = new ICAL.Component(ICAL.parse(buildIcs(events))).getAllSubcomponents('vevent');
    expect(output).toHaveLength(2);
    expect(output[1].getFirstPropertyValue('status')).toBe('CANCELLED');
    expect(output[1].getFirstPropertyValue('recurrence-id').toString()).toBe('2026-12-07T09:00:00Z');
});

test('IANA zones cross daylight saving boundaries without changing source wall times', () => {
    const data = parseCalendarData(ics(event(['DTSTART;TZID=Europe/Paris:20261024T090000','DTEND;TZID=Europe/Paris:20261024T100000','RRULE:FREQ=DAILY;COUNT=3'])));
    expect(data[0].start.toISOString()).toBe('2026-10-24T07:00:00.000Z');
    expect(buildIcs(data)).toContain('DTSTART;TZID=Europe/Paris:20261024T090000');
    expect(expandCalendarOccurrences(data[0],new Date('2026-10-23'),new Date('2026-10-28'))
        .map(date => date.toISOString())).toEqual(['2026-10-24T07:00:00.000Z','2026-10-25T08:00:00.000Z','2026-10-26T08:00:00.000Z']);
});

test('DST folds, gaps and nominal day versus exact hour durations follow RFC calendar semantics',()=>{
    const date = value => calendarDate({value,params:{TZID:'Europe/Paris'}});
    expect(date('20261025T023000').toISOString()).toBe('2026-10-25T00:30:00.000Z');
    expect(date('20260329T023000').toISOString()).toBe('2026-03-29T01:30:00.000Z');
    const nominal = parseCalendarData(ics(event(['DTSTART;TZID=Europe/Paris:20261024T090000','DURATION:P1D','RRULE:FREQ=DAILY;COUNT=2'])))[0];
    const exact = parseCalendarData(ics(event(['DTSTART;TZID=Europe/Paris:20261024T090000','DURATION:PT24H'])))[0];
    expect(nominal.end.toISOString()).toBe('2026-10-25T08:00:00.000Z');
    expect(exact.end.toISOString()).toBe('2026-10-25T07:00:00.000Z');
    expect(calendarOccurrenceEnd(nominal,date('20261025T090000')).toISOString()).toBe('2026-10-26T08:00:00.000Z');
    nominal.end = new Date('2026-10-24T08:00:00Z');
    expect(calendarOccurrenceEnd(nominal,date('20261025T090000')).toISOString()).toBe('2026-10-25T09:00:00.000Z');
});

test('UTC UNTIL and exclusions compare actual instants against IANA wall recurrences',()=>{
    const data = parseCalendarData(ics(event(['DTSTART;TZID=Europe/Paris:20261024T090000',
        'RRULE:FREQ=DAILY;UNTIL=20261026T083000Z','EXDATE:20261025T080000Z'])))[0];
    expect(expandCalendarOccurrences(data,new Date('2026-10-23'),new Date('2026-10-28')).map(date=>date.toISOString()))
        .toEqual(['2026-10-24T07:00:00.000Z','2026-10-26T08:00:00.000Z']);
});

test('canonical schemas accept domain objects and reject executable or unrelated fields', () => {
    registerCoreAtomeTypes();
    const schemaFor = type => CORE_ATOME_TYPE_DEFINITIONS.find(def => def.type === type).schema;
    const source = parseCalendarData(ics(event(['DTSTART:20261001T090000Z','BEGIN:VALARM','ACTION:EMAIL','TRIGGER:-PT15M','DESCRIPTION:test','END:VALARM'])))[0];
    const imported = normalizeImportedEvent({ ...source, calendarId: 'cal' });
    expect(() => sanitizeAtomeProperties(imported,{schema:schemaFor('calendar_event'),allowUnknownProperties:false})).not.toThrow();
    expect(JSON.parse(imported.alarms)[0].enabled).toBe(false);
    expect(() => sanitizeAtomeProperties({ ...imported, command: {} },{schema:schemaFor('calendar_event'),allowUnknownProperties:false})).toThrow();
});

test('malformed files fail completely instead of advancing a partial import', () => {
    expect(() => parseVcards('BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Missing end')).toThrow();
    expect(() => parseCalendarData(ics(['BEGIN:VEVENT','UID:a','DTSTART:bad','END:VEVENT']))).toThrow();
    expect(() => parseCalendarData(ics(event(['DTSTART:20261001T090000Z'])).replace('UID:series','UID:'))).toThrow();
    expect(() => parseCalendarData(ics(event(['DTSTART:20260231T090000Z'])))).toThrow();
    expect(() => normalizeImportedEvent({start:'2026-02-31',allDay:true})).toThrow('calendar_import_date_invalid');
});
test('MCP import methods require the same domain write capability as canonical mutations',()=>{
    for(const tool of PERSONAL_IMPORT_TOOLS){
        const policy=resolveAccessPolicy(tool.name);
        expect(policy.required_capabilities).toContain(`${tool.name.split('.')[0]}.${tool.write?'write':'read'}`);
        expect(resolveAccessPolicy('runtime.tools.call',{tool_id:tool.name}).required_capabilities)
            .toEqual(policy.required_capabilities);
    }
});
test('embedded photos reuse canonical media and remote photo references never trigger a fetch',async()=>{
    const ids=[],context={owner:'owner',check(){},store:{async getStateCurrent(id){ids.push(id);return {owner_id:'owner',properties:{media_url:'/api/uploads/private-photo.jpg'}};}}};
    const photo='data:image/jpeg;base64,/9j/';
    const first=await persistContactPhoto({photo},context);
    const second=await persistContactPhoto({photo},context);
    expect(second.photo_asset_id).toBe(first.photo_asset_id);expect(first.photo).toBe('/api/uploads/private-photo.jpg');
    expect(await persistContactPhoto({photo:'https://example.org/photo.jpg'},context)).toEqual({photo:'https://example.org/photo.jpg'});
    expect(ids).toHaveLength(2);
    const vcf=buildWritableVcard({id:'photo',name:'Photo',photo},{version:'3.0'});
    expect(parseVcards(vcf)[0].photo).toBe(photo);
});
test('runtime audit never stores import content, private export output or payload-derived idempotency keys',()=>{
    const bus=new CommandBusV2();
    bus.append({kind:'command',envelope:{meta:{tool_id:'contacts.import_vcf'},patch:{content:'PRIVATE PHONE'},idempotency_key:'PRIVATE PHONE'}});
    bus.append({kind:'tool_execution_result',tool_id:'calendar.export_ics',result:{content:'PRIVATE EVENT'},ok:true});
    const log=JSON.stringify(bus.events);
    expect(log).not.toContain('PRIVATE');expect(bus.events.every(entry=>entry.redacted)).toBe(true);
    expect(bus.events[1].ok).toBe(true);
});
test('custom VTIMEZONE, DURATION and all-day UNTIL retain valid exchange semantics after editing',()=>{
    const zones=['BEGIN:VTIMEZONE','TZID:Custom/Paris','BEGIN:STANDARD','DTSTART:19701025T030000',
        'TZOFFSETFROM:+0200','TZOFFSETTO:+0100','RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU','END:STANDARD',
        'BEGIN:DAYLIGHT','DTSTART:19700329T020000','TZOFFSETFROM:+0100','TZOFFSETTO:+0200',
        'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU','END:DAYLIGHT','END:VTIMEZONE'];
    const data=parseCalendarData(ics([...zones,...event(['DTSTART;TZID=Custom/Paris:20261024T090000','DURATION:PT1H'])]));
    expect(data[0].start.toISOString()).toBe('2026-10-24T07:00:00.000Z');
    expect(data[0].end.toISOString()).toBe('2026-10-24T08:00:00.000Z');
    expect(buildIcs(data)).toContain('DURATION:PT1H');
    data[0].end=new Date('2026-10-24T09:00:00Z');
    const edited=buildIcs(data);expect(edited).not.toContain('DURATION:PT1H');
    expect(parseCalendarData(edited)[0].end.toISOString()).toBe('2026-10-24T09:00:00.000Z');
    const allDay=parseCalendarData(ics(event(['DTSTART;VALUE=DATE:20261001','DURATION:P1D','RRULE:FREQ=DAILY;UNTIL=20261003'])));
    expect(new ICAL.Component(ICAL.parse(buildIcs(allDay))).getFirstSubcomponent('vevent')
        .getFirstPropertyValue('rrule').until.isDate).toBe(true);
    expect(expandCalendarOccurrences(allDay[0],new Date(2026,9,1),new Date(2026,9,4))).toHaveLength(3);
});
test('write-only import results expose counts without reading the existing private address book',()=>{
    expect(personalImportToolResult(PERSONAL_IMPORT_TOOLS.find(tool=>tool.name==='contacts.import_vcf'),
        {ok:true,imported:1,items:[{phone:'Private'}],correspondences:[{external_id:'Private'}]})).toEqual({ok:true,imported:1});
});
test('canonical all-day and floating dates retain wall dates across device timezones, and edited timezone is exported',()=>{
    const oldZone=process.env.TZ;
    try {
        process.env.TZ='Europe/Paris';
        const source=parseCalendarData(ics(event(['DTSTART;VALUE=DATE:20261001','DTEND;VALUE=DATE:20261003'])))[0];
        const canonical=normalizeImportedEvent({...source,calendarId:'cal'});
        expect(canonical.start).toBe('2026-10-01');expect(canonical.end).toBe('2026-10-03');
        const floating=normalizeImportedEvent({...parseCalendarData(ics(event(['DTSTART:20261001T090000','DTEND:20261001T100000'])))[0],calendarId:'cal'});
        expect(floating.start).toBe('2026-10-01T09:00:00');
        process.env.TZ='America/Los_Angeles';
        expect(canonicalCalendarDate(canonical.start).getDate()).toBe(1);
        expect(buildIcs([{...canonical,allDay:true}])).toContain('DTSTART;VALUE=DATE:20261001');
        expect(buildIcs([floating])).toContain('DTSTART:20261001T090000');
        const changed=parseCalendarData(ics(event(['DTSTART;TZID=Europe/Paris:20261024T090000'])))[0];
        changed.timezone='America/New_York';
        expect(buildIcs([changed])).toContain('DTSTART;TZID=America/New_York:20261024T030000');
    } finally { if(oldZone===undefined)delete process.env.TZ;else process.env.TZ=oldZone; }
});
