/** 真实 PostgreSQL、正式管理接口及浏览器；不连接共享业务库。 */
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {eq,sql} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {admin,employee} from './auth.fixture';
import {businessFetch} from './business-request.helper';
import {settleBusinessUI} from './business-confirm.helper';
import {authUser,authAccount} from '../src/db/schema';
const folder='.tools/test-artifacts/account-identifiers';await mkdir(folder,{recursive:true});
const fixture=await startPostgresFixture(),{db,baseURL}=fixture;let browser:any,context:any;const checks:string[]=[],errors:string[]=[];
const login=async(username:string,password:string)=>globalThis.fetch(baseURL+'/api/auth/sign-in/username',{method:'POST',headers:{Origin:baseURL,'Content-Type':'application/json'},body:JSON.stringify({username,password})});
const cookies=(response:Response)=>response.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
try{
 const cookie=cookies(await login(admin.username,admin.password)),employeeCookie=cookies(await login(employee.username,employee.password));
 const api=async(path:string,method:string,body:unknown,c=cookie)=>{const r=await businessFetch(baseURL+path,{method,headers:{Origin:baseURL,Cookie:c,'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 const create=(username:string,name:string,role='employee')=>api('/api/admin/accounts','POST',{username,name,role,password:'fictional-created-password'});
 const race=await Promise.all([create('race_a','Same Name'),create('race_b',' same name ')]);assert.deepEqual(race.map(r=>r.status).sort(),[201,409]);checks.push('并发创建规范化同名只有一个成功');
 const one=await create('unique_one','First Name'),two=await create('unique_two','Second Name');assert.equal(one.status,201);assert.equal(two.status,201);
 const changed=await Promise.all([one,two].map(r=>api('/api/admin/accounts/'+r.data.account.id,'PATCH',{action:'rename',name:'Concurrent Name',expectedUpdatedAt:r.data.account.updatedAt})));assert.deepEqual(changed.map(r=>r.status).sort(),[200,409]);
 const [current]=await db.select().from(authUser).where(eq(authUser.id,two.data.account.id));
 const mixed=await Promise.all([api('/api/admin/accounts/'+current.id,'PATCH',{action:'rename',name:'cross_new',expectedUpdatedAt:current.updatedAt.toISOString()}),create('cross_new','Other Name')]);assert.deepEqual(mixed.map(r=>r.status).sort(),[mixed[0].status===200?200:201,409].sort());
 assert.equal((await create('unique_one','Another Name')).status,409);assert.equal((await create('different_account',admin.username.toUpperCase())).status,409);
 assert.equal((await api('/api/admin/accounts','POST',{username:'forbidden',name:'Forbidden',password:'fictional-password',role:'admin'},employeeCookie)).status,403);
 checks.push('修改对修改、创建对修改、跨字段及员工越权均由真实服务拒绝');
 const rawRace=await Promise.allSettled([db.update(authUser).set({name:'unique_two'}).where(eq(authUser.id,one.data.account.id)),db.update(authUser).set({username:'unique_one'}).where(eq(authUser.id,two.data.account.id))]);assert.ok(rawRace.every(r=>r.status==='rejected'),'直接写库也不能占用另一个账号标识');
 // 用真实迁移验证冲突时原子失败；当前约束在事务回滚后恢复。
 const migration=await readFile(new URL('../drizzle/0042_account_login_identifiers.sql',import.meta.url),'utf8');
 const before=await db.select().from(authUser);
 await assert.rejects(db.transaction(async tx=>{await tx.execute(sql`DROP TRIGGER auth_user_login_identifier_guard ON auth_user`);await tx.execute(sql`DROP INDEX auth_user_name_key`);await tx.execute(sql`DROP INDEX auth_user_login_identifier_username_key`);await tx.update(authUser).set({name:admin.username}).where(eq(authUser.id,current.id));for(const statement of migration.split('--> statement-breakpoint'))await tx.execute(sql.raw(statement));}));
 assert.deepEqual(await db.select().from(authUser),before);
 await db.transaction(async tx=>{await tx.execute(sql`DROP TRIGGER auth_user_login_identifier_guard ON auth_user`);await tx.execute(sql`DROP INDEX auth_user_name_key`);await tx.execute(sql`DROP INDEX auth_user_login_identifier_username_key`);for(const statement of migration.split('--> statement-breakpoint'))await tx.execute(sql.raw(statement));});
 assert.deepEqual(await db.select().from(authUser),before);checks.push('实际迁移冲突原子失败，无冲突迁移保持身份数据');
 const {chromium}=await import(process.env.PLAYWRIGHT_MODULE!);browser=await chromium.launch({headless:true});context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:folder+'/video',size:{width:1440,height:1000}}});
 await context.addCookies(cookie.split('; ').map(c=>({name:c.slice(0,c.indexOf('=')),value:c.slice(c.indexOf('=')+1),url:baseURL})));
 const page=await context.newPage();page.on('pageerror',(e:Error)=>errors.push(e.message));
 const shot=async(name:string)=>{await settleBusinessUI(page);await page.screenshot({path:folder+'/'+name+'.png'});};
 await page.goto(baseURL+'/business/settings');await page.getByRole('button',{name:'新增账号',exact:true}).click();const createDialog=page.locator('[data-account-create-dialog]');
 await createDialog.getByLabel('登录账号',{exact:true}).fill('created_admin');await createDialog.getByLabel('用户名',{exact:true}).fill('Alice Chen');await createDialog.getByLabel('初始密码',{exact:true}).fill('fictional-created-password');await createDialog.getByLabel('角色',{exact:true}).selectOption('admin');await createDialog.getByText('管理员可管理团队账号、操作授权和系统设置。',{exact:true}).waitFor();
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});await shot('create-admin-'+width);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 await createDialog.getByRole('button',{name:'创建账号',exact:true}).click();await createDialog.waitFor({state:'hidden'});await page.locator('[data-account-username=created_admin]').waitFor();assert.equal((await login('Alice Chen','fictional-created-password')).status,200);
 await page.setViewportSize({width:1440,height:1000});await page.getByRole('button',{name:'新增账号',exact:true}).click();assert.equal(await createDialog.getByLabel('角色',{exact:true}).inputValue(),'employee');await createDialog.getByLabel('登录账号',{exact:true}).fill('created_employee');await createDialog.getByLabel('用户名',{exact:true}).fill('Alice Chen');await createDialog.getByLabel('初始密码',{exact:true}).fill('fictional-created-password');await createDialog.getByRole('button',{name:'创建账号',exact:true}).click();await createDialog.getByRole('alert').filter({hasText:'已被使用'}).waitFor();assert.equal(await createDialog.getByLabel('用户名',{exact:true}).inputValue(),'Alice Chen');await shot('create-conflict-1440');await createDialog.getByLabel('用户名',{exact:true}).fill('陈晓 Employee');await createDialog.getByRole('button',{name:'创建账号',exact:true}).click();await createDialog.waitFor({state:'hidden'});
 const self=page.locator('[data-account-username=test_admin]');await self.locator('[data-account-action=rename]').click();const editor=page.locator('[data-account-editor]');await editor.locator('input').fill('OB');await editor.locator('[type=submit]').click();await editor.waitFor({state:'hidden'});assert.equal((await login(' ob ',admin.password)).status,200);
 const identityBefore=await (await context.request.get(baseURL+'/api/auth/get-session')).json();await self.locator('[data-account-action=updateUsername]').click();await editor.locator('input').fill('renamed_admin');
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});await shot('rename-account-'+width);}
 await editor.locator('[type=submit]').click();await editor.waitFor({state:'hidden'});const identityAfter=await (await context.request.get(baseURL+'/api/auth/get-session')).json();assert.equal(identityAfter.user.id,identityBefore.user.id);assert.equal(identityAfter.user.username,'renamed_admin');assert.equal(identityAfter.session.id,identityBefore.session.id);
 assert.equal((await login(admin.username,admin.password)).status,401);assert.equal((await login('renamed_admin',admin.password)).status,200);assert.equal((await login('OB',admin.password)).status,200);
 const reused=await create(admin.username,'Reused Account');assert.equal(reused.status,201,'旧登录账号可重新分配，不受内部邮箱碰撞影响');
 const credential=await db.select().from(authAccount).where(eq(authAccount.userId,identityBefore.user.id));assert.equal(credential[0].accountId,identityBefore.user.id);assert.equal(credential.length,1);
 checks.push('网页新增两种角色、冲突重试、两字符/中文姓名登录、修改自身账号保留ID/密码/会话、旧账号可重用');
 await page.setViewportSize({width:1440,height:1000});await page.goto(baseURL+'/business/annual-plan');await settleBusinessUI(page);
 const trigger=page.locator('[data-tools-trigger]'),menu=page.locator('#business-tools-menu');
 await trigger.hover();await menu.waitFor();await menu.getByRole('button',{name:'查找帖子',exact:true}).hover();await page.waitForTimeout(250);assert.ok(await menu.isVisible());await shot('tools-hover-1440');await page.mouse.move(300,150);await menu.waitFor({state:'hidden'});
 await trigger.click();await page.mouse.move(300,150);await page.waitForTimeout(250);assert.ok(await menu.isVisible());await shot('tools-pinned-1440');await page.keyboard.press('Escape');await menu.waitFor({state:'hidden'});
 await trigger.focus();await page.keyboard.press('ArrowDown');await menu.waitFor();assert.ok(await menu.getByRole('button',{name:'查找帖子',exact:true}).evaluate((n:HTMLElement)=>document.activeElement===n));await page.keyboard.press('Escape');
 for(const width of [1920,1440,1024,390,320]){await page.setViewportSize({width,height:900});await page.mouse.move(300,150);await trigger.click();await menu.waitFor();assert.equal(await menu.locator('button:disabled').count(),3);await shot('tools-open-'+width);await page.keyboard.press('Escape');}
 await trigger.click();await menu.getByRole('button',{name:'查找帖子',exact:true}).click();await page.locator('[data-post-lookup][open]').waitFor();await page.locator('[data-post-lookup] [data-lookup-close]').first().click();await page.locator('[data-post-lookup]').waitFor({state:'hidden'});assert.ok(await trigger.evaluate((n:HTMLElement)=>document.activeElement===n));
 checks.push('悬停跨越间隙、移出关闭、点击固定、键盘及查帖焦点返回，五档工具菜单');
 await context.close();context=undefined;
 for(const width of [1440,390,320]){const mobile=await browser.newContext({viewport:{width,height:900},isMobile:width<500,hasTouch:width<500});const p=await mobile.newPage();await p.goto(baseURL+'/login');await p.getByLabel('账号或用户名',{exact:true}).fill('OB');await p.getByLabel('密码',{exact:true}).fill(admin.password);await settleBusinessUI(p);await p.screenshot({path:folder+'/login-name-'+width+'.png'});await p.getByRole('button',{name:'登录工作台',exact:true}).click();await p.waitForURL('**/business/operations-schedule');if(width<500){await p.locator('[data-tools-trigger]').tap();await p.locator('#business-tools-menu').waitFor();await settleBusinessUI(p);await p.screenshot({path:folder+'/tools-touch-'+width+'.png'});}await mobile.close();}
 assert.deepEqual(errors,[]);await writeFile(folder+'/result.json',JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({passed:true,checks,folder}));
}catch(error){for(const p of context?.pages()??[])await p.screenshot({path:folder+'/failure.png'}).catch(()=>{});console.error(fixture.logs().slice(-1500));throw error;}finally{await context?.close();await browser?.close();await fixture.stop();}
