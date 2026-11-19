import { test, expect } from 'vitest';
import { readDavDelta, readDavInitial } from '../../atome/src/squirrel/shared/dav_collection_read.js';
import { parseMultiStatus, normalizeCarddavResponseItems } from '../../atome/src/squirrel/contacts/carddav_protocol.js';
// The browser's DAV reader. The server's side (the authenticated socket, the allowed hosts, the XML refused) is
// atome-server's (src/ws_api/sources/personal_import/).
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
