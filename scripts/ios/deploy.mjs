#!/usr/bin/env node
// Narrow OTA deployment: preserve production sources and data, patch only the
// composition/logging hooks, test Nginx, restart the existing service and probe it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { configuration } from './release.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const files = ['server/http_ios_ota_routes.js', 'scripts/ios/ota-store.mjs', 'scripts/ios/ota-contract.mjs',
    'atome/src/ios-install.html', 'atome/src/squirrel/distribution/ios-install.js'];
const run = (cmd, args, options = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'], ...options });

try {
    if (process.argv[2] === '--dry-run') process.stdout.write(JSON.stringify({ files, patches: ['server/server.js', 'server/http_server_hooks.js', 'Nginx OTA access logging'], restart: 'squirrel.service' }, null, 2) + '\n');
    else if (process.argv[2] === '--apply') {
        const { host } = configuration();
        const archive = path.join(root, 'temp/ios-ota/server-module.tar');
        fs.mkdirSync(path.dirname(archive), { recursive: true });
        run('tar', ['-cf', archive, '-C', root, ...files]);
        const id = randomUUID();
        const incoming = `/var/lib/atome/ios-ota-deploy-${id}`;
        const sshArgs = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', host];
        run('ssh', [...sshArgs, `install -d -m 700 ${incoming}`]);
        run('scp', ['-q', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', archive, `${host}:${incoming}/module.tar`]);
        const program = `
import fs from 'node:fs'; import path from 'node:path'; import {execFileSync} from 'node:child_process';
const incoming=${JSON.stringify(incoming)}, files=${JSON.stringify(files)}, base='/opt/a';
const backup='/var/backups/atome-ios-ota/${id}'; fs.mkdirSync(backup,{recursive:true,mode:0o700});
const patches=['server/server.js','server/http_server_hooks.js'];
const originals=[...files,...patches].map(file=>({file,target:path.join(base,file)}));
originals.push({file:'nginx.conf',target:fs.realpathSync('/etc/nginx/sites-enabled/atome.one')});
for(const item of originals){ item.exists=fs.existsSync(item.target); if(item.exists){item.mode=fs.statSync(item.target).mode; const dest=path.join(backup,item.file);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(item.target,dest);} }
const run=(command,args)=>execFileSync(command,args,{stdio:['pipe','pipe','pipe'],encoding:'utf8'});
const replaceOnce=(source,from,to)=>{if(source.includes(to))return source;if(source.split(from).length!==2)throw Error('deployment_anchor_mismatch');return source.replace(from,to);};
try {
 run('tar',['-xf',incoming+'/module.tar','-C',base]);
 const entry=path.join(base,'server/server.js'); let code=fs.readFileSync(entry,'utf8');
 code=replaceOnce(code,"import { registerWsApiRoute } from './ws_api_connection.js';","import { registerWsApiRoute } from './ws_api_connection.js';\\nimport { registerIosOtaRoutes } from './http_ios_ota_routes.js';");
 code=replaceOnce(code,'    registerMailRoutes(server, { identify: validateToken });','    registerMailRoutes(server, { identify: validateToken });\\n    registerIosOtaRoutes(server);');fs.writeFileSync(entry,code);
 const hooks=path.join(base,'server/http_server_hooks.js');let logging=fs.readFileSync(hooks,'utf8');
 logging=logging.replaceAll("request.url.startsWith('/api/social/')) return;","request.url.startsWith('/api/social/') || request.url.startsWith('/ios/')) return;");fs.writeFileSync(hooks,logging);
 const nginx=originals.at(-1).target;let config=fs.readFileSync(nginx,'utf8');
 if(!config.includes('location ^~ /ios/')) config=replaceOnce(config,'    location / {','    location ^~ /ios/ {\\n        access_log off;\\n        proxy_pass http://127.0.0.1:3001;\\n        proxy_set_header Host $host;\\n        proxy_set_header X-Forwarded-Proto $scheme;\\n    }\\n    location / {');fs.writeFileSync(nginx,config);
 for(const file of files.filter(f=>/\\.(js|mjs)$/.test(f))) run('node',['--check',path.join(base,file)]);
 run('node',['--check',entry]);run('node',['--check',hooks]);run('nginx',['-t']);
 run('node',[path.join(base,'scripts/ios/ota-store.mjs'),'init']);
 run('systemctl',['restart','squirrel']);
 let ok=false; for(let attempt=0;attempt<30;attempt++){try{const r=await fetch('http://127.0.0.1:3001/health');if(r.ok){ok=true;break;}}catch{} await new Promise(resolve=>setTimeout(resolve,1000));}
 if(!ok)throw Error('server_health_failed');
 const shell=await fetch('http://127.0.0.1:3001/ios/install');if(!shell.ok||!(await shell.text()).includes('ios-install.js'))throw Error('ota_shell_health_failed');
 run('systemctl',['reload','nginx']);console.log(JSON.stringify({deployed:true,backup}));
}catch(error){for(const item of originals){if(item.exists){fs.copyFileSync(path.join(backup,item.file),item.target);fs.chmodSync(item.target,item.mode);}else if(fs.existsSync(item.target))fs.unlinkSync(item.target);}
 run('nginx',['-t']);run('systemctl',['restart','squirrel']);run('systemctl',['reload','nginx']);throw error;}
`;
        process.stdout.write(run('ssh', [...sshArgs, 'node --input-type=module'], { input: program }));
    } else throw new Error('use_--dry-run_or_--apply');
} catch (error) { process.stderr.write(`OTA deployment failed: ${error.message}\n`); process.exitCode = 1; }
