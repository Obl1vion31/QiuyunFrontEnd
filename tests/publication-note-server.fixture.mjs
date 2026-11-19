import {readFile} from 'node:fs/promises';
if(process.env.NODE_ENV!=='test')throw new Error('ISOLATED_TEST_ONLY');
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(input,init)=>{
 if(!String(input).startsWith('https://xhslink.cn/'))return nativeFetch(input,init);
 const scenario=JSON.parse(await readFile(process.env.JUGUANG_SCENARIO_FILE,'utf8'));
 if(scenario.shortFailure)throw new DOMException('fixture short timeout','TimeoutError');
 return new Response(null,{status:302,headers:{Location:scenario.shortTarget}});
};
await import('./juguang-server.fixture.mjs');
