/** 仅提供预览包与当前构建的原首页，不提供源码、环境变量或业务 API。 */
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,dirname,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const batch=resolve(root,process.env.HOME_OPTIONS_BATCH||'verified/2026-10-23_02-49_home-options');
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.mp4':'video/mp4','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8','.pdf':'application/pdf'};
createServer(async(req,res)=>{
 try{
  let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(name==='/'){res.writeHead(302,{location:'/preview/index.html'});res.end();return;}
  let base=batch,relative=name;
  if(name==='/baseline/'){base=resolve(root,'dist/client');relative='/index.html';}
  else if(name.startsWith('/_astro/')){base=resolve(root,'dist/client');}
  else if(name.startsWith('/fonts/')||name.startsWith('/images/home/')){base=resolve(root,'public');}
  else if(name.startsWith('/business/')||name==='/login'){res.writeHead(302,{location:'https://qiuyun-frontend.vercel.app'+name});res.end();return;}
  const file=resolve(base,'.'+relative);
  if(file!==base&&!file.startsWith(base+sep)){res.writeHead(403);res.end();return;}
  const info=await stat(file);if(!info.isFile()){res.writeHead(404);res.end();return;}
  const data=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(data);
 }catch{res.writeHead(404);res.end('Not found');}
}).listen(Number(process.env.PORT||4330),'0.0.0.0',()=>console.log('首页方案 http://localhost:4330/'));
