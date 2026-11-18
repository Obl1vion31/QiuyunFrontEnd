import assert from 'node:assert/strict';
import test from 'node:test';
import {readHistoryPeople,delayDaysWithNames} from '../src/db/history-people';
import type {Database} from '../src/db/client';

test('展示按稳定用户ID取姓名，兼容已有账号或姓名；未知不冒用账号，原记录保持',async()=>{
 const rows=[{id:'one',username:'new_login',name:'jennifer qiao'},{id:'two',username:'old_login',name:'Obl1vion Shi'}];
 const db={select:()=>({from:async()=>rows})} as unknown as Database;
 const name=await readHistoryPeople(db);
 assert.equal(name('old_login','one'),'jennifer qiao');
 assert.equal(name('old_login'),'Obl1vion Shi');assert.equal(name('jennifer qiao'),'jennifer qiao');
 assert.equal(name('missing_login'),'姓名未记录');assert.equal(name('系统'),'系统');
 const raw=[{saved:{changedById:'one',changedByLabel:'old_login',history:[{changedById:'two',changedByLabel:'old_login'}]}}];
 const before=structuredClone(raw),view=delayDaysWithNames(raw,name);
 assert.equal(view[0].saved?.changedByName,'jennifer qiao');assert.equal(view[0].saved?.history[0].changedByName,'Obl1vion Shi');
 assert.deepEqual(raw,before);
});
