import assert from 'node:assert/strict';
import {test} from 'node:test';
import {publicationNoteId,extractPublicationLink} from '../src/db/publication-link.mjs';
import {resolvePublicationNote} from '../src/db/publication-note-link';
import {noteIdOn,noteLinkOn} from '../src/db/note-identity-rules';

const a='a'.repeat(24),b='b'.repeat(24),long='https://www.xiaohongshu.com/explore/'+a+'?xsec_token=fictional';
test('完整分享文案提取规范ID，保留原链接参数',async()=>{
 assert.equal(publicationNoteId('分享 '+long+' 请查收'),a);
 assert.deepEqual(await resolvePublicationNote(long),{url:long,noteId:a});
 assert.equal(publicationNoteId('https://www.xiaohongshu.com/discovery/item/'+a.toUpperCase()),a);
 for(const invalid of ['https://xiaohongshu.com.evil.test/explore/'+a,'https://name:password@www.xiaohongshu.com/explore/'+a,'https://www.xiaohongshu.com:444/explore/'+a,'https://xhslink.cn/a'])assert.equal(publicationNoteId(invalid),null);
 assert(extractPublicationLink(long+' https://www.xiaohongshu.com/explore/'+b).error);
});
test('短链只跟随允许的官方跳转，不访问最终长链页面',async()=>{
 const original=globalThis.fetch,calls:string[]=[];
 try{
  globalThis.fetch=async(url,options)=>{calls.push(String(url));assert.equal(options?.redirect,'manual');assert(options?.signal);return new Response(null,{status:302,headers:{Location:long}});};
  assert.deepEqual(await resolvePublicationNote('https://xhslink.cn/o/example'),{url:long,noteId:a});
  assert.deepEqual(calls,['https://xhslink.cn/o/example']);
 }finally{globalThis.fetch=original;}
});
test('外站、循环、过多跳转及超时都不产生笔记身份',async()=>{
 const original=globalThis.fetch;
 try{
  let calls=0;
  for(const location of ['http://127.0.0.1/private','https://www.xiaohongshu.com.evil.test/explore/'+a,'https://xhslink.cn/o/example']){
   calls=0;globalThis.fetch=async()=>{calls++;return new Response(null,{status:302,headers:{Location:location}});};
   await assert.rejects(()=>resolvePublicationNote('https://xhslink.cn/o/example'),/完整的小红书帖子链接/);assert.equal(calls,1);
  }
  calls=0;globalThis.fetch=async()=>new Response(null,{status:302,headers:{Location:'https://xhslink.cn/o/hop'+ ++calls}});
  await assert.rejects(()=>resolvePublicationNote('https://xhslink.cn/o/example'));assert.equal(calls,5);
  globalThis.fetch=async()=>{throw new DOMException('fixture timeout','TimeoutError');};
  await assert.rejects(()=>resolvePublicationNote('https://xhslink.cn/o/example'),/输入已保留/);
 }finally{globalThis.fetch=original;}
});
test('旧日期按旧链接读取，缺少来源时不借用另一篇的新链接',()=>{
 const periods=[{effectiveOn:null,platformNoteId:a,publicationUrl:long},{effectiveOn:'2026-11-04',platformNoteId:b,publicationUrl:'https://www.xiaohongshu.com/explore/'+b}];
 assert.equal(noteIdOn(periods,'2026-11-03'),a);assert.equal(noteLinkOn(periods,'2026-11-03'),long);
 assert.equal(noteIdOn(periods,'2026-11-04'),b);assert.equal(noteLinkOn(periods,'2026-11-04'),periods[1].publicationUrl);
 assert.equal(noteLinkOn([{effectiveOn:null,platformNoteId:a}],'2026-11-03',periods[1].publicationUrl),null);
 assert.equal(noteLinkOn([{effectiveOn:null,platformNoteId:a}],'2026-11-03',long),long);
 assert.equal(noteLinkOn([{effectiveOn:null,platformNoteId:null}],'2026-11-03','https://xhslink.cn/o/unknown'),null);
});
