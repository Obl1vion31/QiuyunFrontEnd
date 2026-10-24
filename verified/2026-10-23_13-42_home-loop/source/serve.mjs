/** 本地只读样片服务，不提供业务 API 或环境文件。 */
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {dirname,resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const batch=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg','.mp4':'video/mp4','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8'};
createServer(async(req,res)=>{try{const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(path==='/'){res.writeHead(302,{location:'/preview/index.html'});res.end();return;}const file=resolve(batch,'.'+path);if(!file.startsWith(batch+sep)||! (await stat(file)).isFile()){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(await readFile(file));}catch{res.writeHead(404);res.end('Not found');}}).listen(4332,'0.0.0.0',()=>console.log('电影带样片 http://localhost:4332/preview/index.html'));
