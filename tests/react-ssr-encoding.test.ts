import assert from 'node:assert/strict';
import test from 'node:test';
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
import {PassThrough} from 'node:stream';
import {text} from 'node:stream/consumers';
import {createElement,type ReactNode} from 'react';
import {renderToString} from 'react-dom/server';

const require=createRequire(import.meta.url),root=dirname(require.resolve('react-dom/package.json'));
async function streamed(renderer:any,node:ReactNode){
 const destination=new PassThrough(),result=text(destination);
 const stream=renderer.renderToPipeableStream(node,{onAllReady(){stream.pipe(destination);},onError(error:Error){destination.destroy(error);}});
 return result;
}
for(const mode of ['development','production.min']){
 test('React '+mode+' 流式中文／emoji分片与同步HTML逐字节一致',{timeout:15000},async()=>{
  const renderer=require(join(root,'cjs/react-dom-server.node.'+mode+'.js'));
  // 穷举不同起点，覆盖多字节字符落在2048字节边界；不复制编码实现。
  for(let offset=0;offset<256;offset++){
   const node=createElement('section',{title:'x'.repeat(offset)},Array.from({length:24},(_,n)=>
    createElement('p',{key:n,'aria-label':'当天状态与后续衔接'},'当日状态：测试暂停，恢复测试🙂'.repeat(7))));
   const actual=await streamed(renderer,node),expected=renderToString(node);
   assert.equal(actual.includes('\0'),false,'offset='+offset+' 不插入空字符');
   assert.deepEqual(Buffer.from(actual),Buffer.from(expected),'offset='+offset+' 保留中文、emoji、属性及标记');
  }
 });
}
