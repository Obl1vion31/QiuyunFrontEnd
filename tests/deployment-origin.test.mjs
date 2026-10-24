import assert from 'node:assert/strict';
import {test} from 'node:test';
import {IncomingMessage} from 'node:http';
import {Socket} from 'node:net';
import {NodeApp} from 'astro/app/node';
import config from '../astro.config.mjs';

const {createOriginCheckMiddleware}=await import(new URL('middlewares.js',import.meta.resolve('astro/app')));
const origin='https://qiuyun-frontend.vercel.app';
const check=createOriginCheckMiddleware();
const requestFor=(originHeader=origin,forwardedHost='qiuyun-frontend.vercel.app',protocol='https')=>{
  const incoming=new IncomingMessage(new Socket());
  incoming.method='POST';incoming.url='/api/meeting-reviews';
  incoming.headers={host:'qiuyun-frontend.vercel.app','x-forwarded-host':forwardedHost,'x-forwarded-proto':protocol,origin:originHeader,'content-type':'multipart/form-data; boundary=fixture'};
  return NodeApp.createRequest(incoming,{skipBody:true,allowedDomains:config.security.allowedDomains});
};
test('本机预构建仍识别正式域名，同源表单进入登录校验',async()=>{
  const request=requestFor();assert.equal(new URL(request.url).origin,origin);
  const response=await check({request,url:new URL(request.url),isPrerendered:false},async()=>Response.json({code:'UNAUTHORIZED'},{status:401}));
  assert.equal(response.status,401);assert.equal((await response.json()).code,'UNAUTHORIZED');
});
test('外站表单和伪造转发域名仍被拒绝',async()=>{
  for(const forwardedHost of ['qiuyun-frontend.vercel.app','untrusted.example']){
    const request=requestFor('https://untrusted.example',forwardedHost);
    const response=await check({request,url:new URL(request.url),isPrerendered:false},async()=>new Response('不应执行'));
    assert.equal(response.status,403);
  }
});
test('正式入口不接受降级的HTTP来源',async()=>{
  const request=requestFor('http://qiuyun-frontend.vercel.app','qiuyun-frontend.vercel.app','http');
  assert.notEqual(new URL(request.url).origin,'http://qiuyun-frontend.vercel.app');
});
