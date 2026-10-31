import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { UserVaultProvider } from '../../server/userVaultProvider.js';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const until = async predicate => {
    const deadline = Date.now() + 5000;
    while (!predicate()) { assert.ok(Date.now() < deadline, 'worker lifecycle timed out'); await wait(10); }
};
const fixture = t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-idle-'));
    const provider = new UserVaultProvider({root, socketRoot:root, idleMs:60});
    t.after(async () => { await provider.stopAll(); fs.rmSync(root,{recursive:true,force:true}); });
    return provider;
};

test('idle vault workers release their processes and reopen the same durable data', async t => {
    const provider = fixture(t);
    const first = await provider.request('idle-fixture','health');
    await provider.request('idle-fixture','event:commit',{event:{id:'idle-event',kind:'set',atome_id:'idle-object',
        actor:{type:'user',id:'idle-fixture'},payload:{props:{name:'kept'}}}});
    await until(() => provider.children.size === 0);
    assert.throws(() => process.kill(first.pid,0), {code:'ESRCH'});
    const [a,b] = await Promise.all([provider.request('idle-fixture','health'),provider.request('idle-fixture','health')]);
    assert.equal(a.pid,b.pid); assert.notEqual(a.pid,first.pid);
    const state = await provider.request('idle-fixture','state:get',{atome_id:'idle-object'});
    assert.equal(state.properties.name,'kept');
});

test('an in-flight IPC request outlives the idle limit without losing its worker', async t => {
    const provider = fixture(t);
    const record = await provider.ensure('busy-fixture');
    const actualSocket = record.socketPath;
    const socket = path.join(provider.socketRoot,'delayed.sock');
    let received = false;
    const server = net.createServer(connection => connection.once('data',() => {
        received = true; setTimeout(() => connection.end('{"ok":true,"result":"complete"}\n'),180);
    }));
    await new Promise(resolve => server.listen(socket,resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    record.socketPath = socket;
    const pending = provider.request('busy-fixture','health');
    await until(() => received);
    await wait(110);
    assert.equal(record.child.exitCode,null); assert.equal(provider.children.size,1);
    assert.equal(await pending,'complete');
    record.socketPath = actualSocket;
    await until(() => provider.children.size === 0);
});

test('a request during shutdown waits for disposal before reopening the socket', async t => {
    const provider = fixture(t);
    const first = await provider.request('restart-fixture','health');
    const stopped = provider.stop('restart-fixture');
    const next = provider.request('restart-fixture','health');
    await stopped;
    assert.notEqual((await next).pid,first.pid);
});
