import { test, expect } from 'vitest';
import { checkedDavUrl, handleWsPersonalImport } from '../../server/ws_personal_import.js';
import { readDavDelta, readDavInitial } from '../../atome/src/squirrel/shared/dav_collection_read.js';
import { parseMultiStatus, normalizeCarddavResponseItems } from '../../atome/src/squirrel/contacts/carddav_protocol.js';
const resolve = async () => [{ address: '17.253.144.10', family: 4 }];
const connection = () => ({ _wsApiUserId: crypto.randomUUID(), _wsApiAuthExpMs: Date.now() + 60000 });
test('DAV reader requires the authenticated connection and rejects write verbs or arbitrary hosts', async () => {
    expect((await handleWsPersonalImport({type:'personal-import', domain:'contact'},{})).error).toBe('auth_session_invalid');
    await expect(checkedDavUrl('http://contacts.icloud.com/',{resolve})).rejects.toThrow('dav_url_invalid');
    await expect(checkedDavUrl('https://other.example/',{resolve})).rejects.toThrow('dav_host_not_allowed');
    await expect(checkedDavUrl('https://contacts.icloud.com/',{resolve:async()=>[{address:'127.0.0.1'}]})).rejects.toThrow('dav_address_invalid');
});
test('all discovered collections are read without PUT, and checkpoints are returned only for complete batches', async () => {
    const seen = [];
    const props = '<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav">';
    const response = text => ({ok:true,status:207,body:(async function*(){yield new TextEncoder().encode(text);})()});
    const fetchResource = async (url, options) => {
        seen.push({url,method:options.method,body:options.body});
        if (options.body.includes('current-user-principal')) return response('<d:current-user-principal><d:href>/user/</d:href></d:current-user-principal>');
        if (options.body.includes('addressbook-home-set')) return response('<c:addressbook-home-set><d:href>/books/</d:href></c:addressbook-home-set>');
        if (options.body.includes('resourcetype')) return response(props + ['a','b'].map(id=>`<d:response><d:href>/books/${id}/</d:href><d:resourcetype><c:addressbook/></d:resourcetype><d:displayname>${id}</d:displayname></d:response>`).join('')+'</d:multistatus>');
        if (options.method==='PROPFIND') return response('<d:sync-token>before-query</d:sync-token>');
        const id = url.includes('/a/') ? 'a' : 'b';
        return response(props+`<d:response><d:href>/books/${id}/person.vcf</d:href><d:status>HTTP/1.1 200 OK</d:status><d:getetag>e1</d:getetag><c:address-data>BEGIN:VCARD\r\nVERSION:4.0\r\nUID:shared-uid\r\nFN:${id}\r\nEND:VCARD\r\n</c:address-data></d:response></d:multistatus>`);
    };
    const result=await handleWsPersonalImport({type:'personal-import',domain:'contact',url:'https://contacts.icloud.com/',auth:{username:'test',password:'secret'}},connection(),{resolve,fetchResource});
    expect(result.ok).toBe(true);expect(result.items).toHaveLength(2);
    expect(result.items.map(i=>i.source_collection)).toEqual(['https://contacts.icloud.com/books/a/','https://contacts.icloud.com/books/b/']);
    expect(Object.keys(result.cursor)).toHaveLength(2);
    expect(seen.every(r=>['PROPFIND','REPORT'].includes(r.method))).toBe(true);
    expect(JSON.stringify(result)).not.toContain('secret');
});
test('partial or unsafe XML never produces a usable cursor', async () => {
    const result=await handleWsPersonalImport({type:'personal-import',domain:'contact',url:'https://contacts.icloud.com/book/',auth:{username:'test',password:'secret'}},connection(),{resolve,
        fetchResource:async()=>({ok:true,status:207,body:(async function*(){yield new TextEncoder().encode('<!DOCTYPE unsafe>');})()})});
    expect(result.ok).toBe(false);expect(result.cursor).toBeUndefined();expect(result.error).toBe('dav_xml_unsafe');
});
const multi = (rows, token = '') => `<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:carddav">${rows}${token ? `<d:sync-token>${token}</d:sync-token>` : ''}</d:multistatus>`;
const row = (id, deleted = false) => `<d:response><d:href>/book/${id}.vcf</d:href><d:status>HTTP/1.1 ${deleted ? '404 Not Found' : '200 OK'}</d:status>${deleted ? '' : `<c:address-data>BEGIN:VCARD\r\nVERSION:4.0\r\nUID:${id}\r\nFN:${id}\r\nEND:VCARD\r\n</c:address-data>`}</d:response>`;
const truncated = '<d:response><d:href>/book/</d:href><d:status>HTTP/1.1 507 Insufficient Storage</d:status></d:response>';
const readers = { parse: parseMultiStatus, normalize: normalizeCarddavResponseItems };
test('DAV delta follows continuation tokens, merges removals and rejects stalled pagination', async () => {
    const cursors = [], pages = [multi(row('a') + truncated, 'middle'), multi(row('a',true)+row('b'),'end')];
    const result = await readDavDelta({ ...readers, cursor:'start', body: ({cursor})=>cursor,
        request: async ({body})=>{cursors.push(body);return pages.shift();} });
    expect(cursors).toEqual(['start','middle']); expect(result.cursor).toBe('end');
    expect(result.items.map(item=>item.id)).toEqual(['b']); expect(result.removed_hrefs).toEqual(['/book/a.vcf']);
    await expect(readDavDelta({...readers,cursor:'start',body:()=>'',request:async()=>multi(truncated,'start')})).rejects.toThrow('dav_continuation_missing');
});
test('expired DAV cursor falls back to a complete initial observation', async () => {
    const result=await readDavDelta({...readers,cursor:'expired',body:()=>'',
        request:async()=>{throw Object.assign(new Error('expired'),{status:403,body:'<d:valid-sync-token/>'});},
        initial:async()=>({items:[{id:'fresh'}],cursor:'fresh-token',complete:true})});
    expect(result).toMatchObject({cursor:'fresh-token',complete:true,items:[{id:'fresh'}]});
});
test('limited DAV initial query uses multiget and cannot checkpoint missing objects', async () => {
    const execute = async missing => {
        const requests=[];
        const result=await readDavInitial({...readers,url:'https://contacts.icloud.com/book/',domain:'contact',queryBody:'query',
            request:async request=>{requests.push(request);
                if(request.depth==='0')return '<d:sync-token>before</d:sync-token>';
                if(request.body==='query')return multi(truncated);
                if(request.method==='PROPFIND')return multi(row('a')+row('b'));
                return multi(row('a')+(missing?'':row('b')));}});
        expect(requests.at(-1).body).toContain('addressbook-multiget');return result;
    };
    expect(await execute(false)).toMatchObject({complete:true,cursor:'before'});
    await expect(execute(true)).rejects.toThrow('dav_multiget_incomplete');
});
