/** 退役接口不再接受任何角色的新建、延期或恢复请求。 */
import assert from 'node:assert/strict';
import {startFixture,admin,employee} from './auth.fixture';
const fixture=await startFixture();
try{
 for(const account of [admin,employee]){
  const login=await fetch(fixture.baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:fixture.baseURL,'Content-Type':'application/json'},body:JSON.stringify(account)});assert.equal(login.status,200);
  const cookie=login.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
  for(const [path,method]of [['/api/promotion-pauses','POST'],['/api/promotion-pauses','GET'],['/api/promotion-pauses/old-batch','PATCH']])assert.equal((await fetch(fixture.baseURL+path,{method,headers:{Cookie:cookie,Origin:fixture.baseURL}})).status,410);
 }
 console.log('retired team pause endpoints passed');
}finally{await fixture.stop();}
