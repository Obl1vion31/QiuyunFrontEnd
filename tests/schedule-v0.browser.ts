import assert from 'node:assert/strict';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import {startPostgresFixture} from './postgres.fixture';
import {prepareMonthlyArrangement} from './monthly-arrangement.fixture';
import {seedLinkPost} from './monthly-plan-links.fixture';
import {admin,employee} from './auth.fixture';
import {settleBusinessUI,respondToBusinessConfirm} from './business-confirm.helper';
import {discussionFromDraft} from '../src/db/meeting-discussion-values';
import {weekOf,type PlanContent} from '../src/db/monthly-plan-types';
import * as s from '../src/db/schema';
const dir=process.env.SCHEDULE_V0_DIR??'.tools/test-artifacts/schedule-v0';
for(const name of ['screenshots','video','pdf'])await mkdir(dir+'/'+name,{recursive:true});
const clockFile=process.cwd()+'/'+dir+'/clock.txt';await writeFile(clockFile,'2026-11-06T12:00:00+08:00');
const f=await startPostgresFixture({clockFile,entry:process.env.SCHEDULE_V0_ENTRY}),{db,baseURL}=f;
let browser:any,context:any,staff:any;const checks:string[]=[],images:string[]=[],errors:string[]=[];
try{
 const pw=await import(process.env.PLAYWRIGHT_MODULE!);browser=await pw.chromium.launch({headless:true,args:['--no-sandbox']});
 context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',recordVideo:{dir:dir+'/video',size:{width:1440,height:1000}}});
 staff=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN'});
 async function login(c:any,who:any){assert.equal((await c.request.post(baseURL+'/api/auth/sign-in/username',{headers:{Origin:baseURL},data:who})).status(),200);return (await c.cookies()).map((v:any)=>v.name+'='+v.value).join('; ');}
 let bossCookie=await login(context,admin),staffCookie=await login(staff,employee);
 async function api(path:string,input?:any,method='GET',cookie=bossCookie,expected=200,form=false){
  const body=new FormData();if(form)for(const[k,v]of Object.entries(input))body.set(k,String(v));
  const response=await fetch(baseURL+path,{method,headers:{Origin:baseURL,Cookie:cookie,Accept:'application/json',...(input&&!form?{'Content-Type':'application/json'}:{})},...(input?{body:form?body:JSON.stringify(input)}:{})});
  const result=await response.json();assert.equal(response.status,expected,JSON.stringify(result));return result;
 }
 const page=await context.newPage(),other=await staff.newPage();for(const p of [page,other])p.on('pageerror',(e:any)=>errors.push(e.message));
 async function go(path:string,p=page){await p.goto(baseURL+path);await settleBusinessUI(p);}
 async function shot(name:string,p=page,full=false){if(full)await p.evaluate(()=>scrollTo(0,0));await p.mouse.move(0,0);await settleBusinessUI(p);assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' page overflow');await p.screenshot({path:dir+'/screenshots/'+name+'.png',fullPage:full});images.push(name);}
 const group=randomUUID(),content:PlanContent={groups:[{id:group,name:'TMUA 常规内容',subjectId:'tmua',categoryId:'non-promotional-handout',quantity:25,annualPlanId:null,annualVersion:null,note:'隔离验收',reason:'隔离样本预排期'}],items:[]},posts:any[]=[];
 for(let i=0;i<25;i++){const day=8+i%7,date='2026-11-'+String(day).padStart(2,'0')+'T10:00',p=await seedLinkPost(db,i===0?'隔离长名称：原计划专题解析、备考方法与完整资料说明':'隔离计划帖子 '+(i+1),date,{categoryId:'non-promotional-handout'});posts.push(p);content.items.push({id:randomUUID(),groupId:group,week:weekOf(date),kind:'existing',scheduleId:p.schedule.id});}
 const setup=await prepareMonthlyArrangement(db,baseURL,bossCookie,{content}),endpoint='/api/monthly-plans/'+setup.planId+'/arrangement';
 const fields=(name:string,date:string)=>({contentName:name,subjectId:'tmua',categoryId:'non-promotional-handout',plannedPublishAt:date,projectDocUrl:'https://example.test/project',promotionStatus:'none',operationType:'non_promotion_standard',reviewMode:'standard',reviewDay7:'on',reviewDay15:'on'});
 async function edit(post:any,date:string,reason='',expected=200){const [row]=await db.select().from(s.operationsContentSchedule).where(eq(s.operationsContentSchedule.id,post.schedule.id));return api('/api/operations-content/'+row.id,{...fields(post.version.contentName,date),expectedPlanRevision:row.planRevision,changeReason:reason,planChangeReason:reason},'PATCH',staffCookie,expected,true);}
 await go('/business/operations-schedule?month=2026-11');assert.equal(await page.locator('[data-arrangement-refresh]').isVisible(),false);assert.equal(await page.locator('button[value=submit]').count(),0);assert.equal(await page.locator('button[value=confirm]').innerText(),'定稿并封存');
 await edit(posts[0],'2026-11-09T18:00');await edit(posts[0],'2026-11-16T18:00','',422);await edit(posts[0],'2026-11-16T18:00','跨原Week调整');await edit(posts[0],'2026-11-08T10:00');
 const state=await api(endpoint);await api(endpoint,{action:'submit',fingerprint:state.fingerprint,requestId:randomUUID(),reason:''},'POST',staffCookie);
 await edit(posts[1],'2026-11-09T18:00');await api(endpoint,{action:'draft',fingerprint:state.fingerprint,requestId:randomUUID(),reason:'员工在核对前继续完善'},'POST',staffCookie);
 assert.equal((await api(endpoint)).stage,'review_pending');await go('/business/operations-schedule?month=2026-11',other);assert(await other.locator('[data-open-new]').isEnabled());
 const pending=await api(endpoint);await api(endpoint,{action:'return',fingerprint:pending.fingerprint,requestId:randomUUID(),reason:'继续核对'},'POST');
 checks.push('同原Week免理由、跨原Week必填；员工提交后继续编辑和保存草稿，取消仍管理员专属');
 await page.locator('[name=reason]').fill('管理员当前核对说明');await page.locator('button[value=confirm]').click();await respondToBusinessConfirm(page,true);await page.locator('[data-arrangement-refresh]').waitFor({state:'visible'});assert.equal(await page.locator('[name=reason]').inputValue(),'管理员当前核对说明');await shot('seal-conflict-1440');
 await page.locator('[data-arrangement-refresh]').click();await page.getByText('核对清单已更新，请查看后再定稿。',{exact:true}).waitFor();await page.locator('button[value=confirm]').click();await respondToBusinessConfirm(page,true);await page.locator('[data-arrangement-stage=confirmed]').waitFor();
 const [sealed]=await db.select().from(s.operationsMonthlyPlan).where(eq(s.operationsMonthlyPlan.id,setup.planId)),[version]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,sealed.sealedVersionId!)),frozen=structuredClone(version.snapshot);
 assert.equal((frozen as any).generated.scheduleBaseline.items.length,25);assert((frozen as any).generated.scheduleBaseline.items.every((i:any)=>i.versionId&&i.plannedAt));
 assert.equal(await page.locator('[data-monthly-plan-pool]').count(),0);assert.equal(await page.locator('[data-arrangement-details]').getAttribute('open'),null);
 checks.push('管理员从编辑状态一步定稿；旧清单409仅在冲突时重读；V0含精确排期与版本且默认折叠');
 await writeFile(clockFile,'2026-11-06T13:00:00+08:00');
 await api('/api/operations-content',fields('缺少原因的新增','2026-11-12T10:00'),'POST',staffCookie,422,true);
 for(let i=0;i<4;i++)await api('/api/operations-content',{...fields('隔离V0后新增 '+(i+1),'2026-11-12T10:00'),changeReason:'本月补充专题 '+(i+1)},'POST',staffCookie,201,true);
 await edit(posts[2],'2026-11-10T18:00','',422);await edit(posts[2],'2026-11-10T18:00','同周时段调整');
 await api('/api/operations-content/'+posts[3].schedule.id,{reason:'取消一篇重复主题'},'DELETE',staffCookie,403);await api('/api/operations-content/'+posts[3].schedule.id,{reason:'取消一篇重复主题'},'DELETE');
 await writeFile(clockFile,'2026-11-15T12:00:00+08:00');bossCookie=await login(context,admin);staffCookie=await login(staff,employee);
 await edit(posts[4],'2026-11-20T18:00','过期后直接改期，周会核对');await go('/business/operations-schedule?month=2026-11&row='+posts[4].schedule.id,other);await other.locator('[data-inspector].is-open').waitFor();assert.equal(await other.getByText('申请调整排期',{exact:true}).count(),0);
 assert.equal((await db.select().from(s.operationsChangeProposal).where(eq(s.operationsChangeProposal.status,'pending'))).length,0);
 await api('/api/operations-content/'+posts[5].schedule.id+'/publication',{actualPublishAt:'2026-11-13T10:00',publicationUrl:'https://www.xiaohongshu.com/explore/0123456789abcdef01234567',projectDocUrl:'https://example.test/project',expectedPlanRevision:0,expectedPublicationRevision:0,dailyReasons:'[]'},'PATCH',staffCookie,200,true);
 const month=await api('/api/monthly-operations?month=2026-11');assert.deepEqual([month.scheduleComparison.original,month.scheduleComparison.added,month.scheduleComparison.removed,month.scheduleComparison.current],[25,4,1,28]);
 assert.deepEqual((await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,version.id)))[0].snapshot,frozen);
 checks.push('V0后新增、同周修改及超时改期带理由直接生效，无逐笔审批；25+4-1=28且V0不变');
 const first=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',recordVideo:{dir:dir+'/video/first-paint',size:{width:1440,height:1000}}});await first.addCookies(await context.cookies());const firstPage=await first.newPage();await firstPage.route('**/*.woff2',async(route:any)=>{await new Promise(resolve=>setTimeout(resolve,650));await route.continue();});await firstPage.addInitScript(()=>{const w=window as any;w.v0Frames=[];let started=0;function frame(t:number){const panel=document.querySelector('[data-arrangement-stage]');if(panel){if(!started)started=t;w.v0Frames.push({t:t-started,stage:panel.getAttribute('data-arrangement-stage'),heading:panel.querySelector('h2')?.textContent,top:panel.getBoundingClientRect().top});if(t-started>1800)return;}requestAnimationFrame(frame);}requestAnimationFrame(frame);});const firstPaint:any[]=[];
 for(const mode of ['direct','reload','navigation']){if(mode==='direct')await firstPage.goto(baseURL+'/business/operations-schedule?month=2026-11');else if(mode==='reload')await firstPage.reload();else{await firstPage.goto(baseURL+'/business/monthly-operations?month=2026-11');await firstPage.locator('a[href="/business/operations-schedule"]').first().click();}await settleBusinessUI(firstPage);await firstPage.waitForTimeout(1900);assert.equal(await firstPage.locator('[data-monthly-plan-pool]').count(),0);await shot('first-paint-'+mode+'-1440',firstPage);firstPaint.push({mode,frames:await firstPage.evaluate(()=>(window as any).v0Frames)});if(mode==='direct'){await firstPage.unroute('**/*.woff2');await firstPage.goto(baseURL+'/business/operations-schedule?month=2026-11');await settleBusinessUI(firstPage);}}
 const firstVideo=firstPage.video();await first.close();if(firstVideo)await copyFile(await firstVideo.path(),dir+'/video/first-paint.webm');await writeFile(dir+'/first-paint.json',JSON.stringify(firstPaint));
 for(const width of [1920,1440,1024]){await page.setViewportSize({width,height:1000});await go('/business/operations-schedule?month=2026-11');await shot('sealed-calendar-'+width,page,true);await page.locator('[data-arrangement-details] summary').first().click();await page.locator('[data-arrangement-details]').scrollIntoViewIfNeeded();await shot('sealed-checklist-'+width);}
 for(const width of [1920,1440,1024]){await page.setViewportSize({width,height:1000});await go('/business/monthly-operations?month=2026-11');await page.locator('[data-schedule-comparison]').scrollIntoViewIfNeeded();await shot('monthly-collapsed-'+width);await page.locator('.plan-comparison-details>summary').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('.plan-comparison-details').getAttribute('open'),'');assert.equal(await page.locator('.plan-comparison-table tr').filter({hasText:'隔离计划帖子 4'}).locator('td:first-child a').count(),0);await shot('monthly-expanded-'+width);}
 const weekly=await api('/api/meeting-reviews',{meetingType:'weekly',meetingAt:'2026-11-15T15:00',periodStart:'2026-11-08',periodEnd:'2026-11-14'},'POST',bossCookie,201,true);
 let [meeting]=await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,weekly.id));const [initial]=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.meetingId,weekly.id));
 const draft:any={...meeting.draftSnapshot,coreConclusion:'按V0核对执行及调整原因',nextAction:'会前补齐实发登记',situation:'隔离执行复盘',strategy:'保持计划与实际可追溯',candidatesConfirmed:true};
 await api('/api/meeting-reviews/'+weekly.id,{action:'finalize_version_draft',stage:'pre',draftVersionId:initial.id,draft,expectedUpdatedAt:meeting.updatedAt.toISOString()},'PATCH');
 [meeting]=await db.select().from(s.operationsReviewMeeting).where(eq(s.operationsReviewMeeting.id,weekly.id));const pre=(await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.meetingId,weekly.id))).find(v=>v.lifecycleStatus==='finalized')!;
 await api('/api/meeting-reviews/'+weekly.id,{action:'finalize_version_draft',stage:'post',sourceVersionId:pre.id,discussion:discussionFromDraft(meeting.draftSnapshot),expectedUpdatedAt:meeting.updatedAt.toISOString()},'PATCH');
 const weeklyVersion=(await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.meetingId,weekly.id))).sort((a,b)=>b.versionNumber-a.versionNumber)[0];
 assert.equal((weeklyVersion.snapshot as any).generated.scheduleComparison.current,28,'15日改期不得影响14日截止的周会');
 for(const width of [1920,1440,1024]){await page.setViewportSize({width,height:1000});await go('/business/meeting-review?meeting='+weekly.id);await page.locator('[data-schedule-comparison]').scrollIntoViewIfNeeded();await shot('weekly-collapsed-'+width);await page.locator('.plan-comparison-details>summary').click();await shot('weekly-expanded-'+width);}
 const pdf=await api('/api/meeting-versions/'+weeklyVersion.id+'/pdf',{},'POST');const response=await fetch(baseURL+'/api/meeting-attachments/'+pdf.id,{headers:{Cookie:bossCookie}});assert.equal(response.status,200);await writeFile(dir+'/pdf/weekly-execution.pdf',Buffer.from(await response.arrayBuffer()));
 await writeFile(clockFile,'2026-12-05T12:00:00+08:00');bossCookie=await login(context,admin);const december=await prepareMonthlyArrangement(db,baseURL,bossCookie,{month:'2026-12',content:{groups:[],items:[]}});
 for(const width of [1920,1440,1024]){await page.setViewportSize({width,height:1000});await go('/business/meeting-review?meeting='+december.meetingId);await page.locator('[data-schedule-comparison]').scrollIntoViewIfNeeded();await shot('monthly-meeting-collapsed-'+width);await page.locator('.plan-comparison-details>summary').click();await shot('monthly-meeting-expanded-'+width);}
 const decemberVersions=await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.meetingId,december.meetingId)),latest=decemberVersions.sort((a,b)=>b.versionNumber-a.versionNumber)[0];const monthlyPdf=await api('/api/meeting-versions/'+latest.id+'/pdf',{},'POST');const mr=await fetch(baseURL+'/api/meeting-attachments/'+monthlyPdf.id,{headers:{Cookie:bossCookie}});await writeFile(dir+'/pdf/monthly-execution.pdf',Buffer.from(await mr.arrayBuffer()));
 checks.push('月度、周会、月会三档真实页面与PDF共用基准执行；截止后改期不反改周会，实发补登记按真实发生日');
 await page.setViewportSize({width:390,height:844});await go('/business/operations-schedule?month=2026-11');await shot('sealed-mobile-390');await page.locator('.calendar-item').first().click();await page.locator('[data-inspector].is-open').waitFor();await shot('inspector-mobile-390');await page.locator('[data-close-inspector]').click();await page.locator('[data-inspector].is-open').waitFor({state:'hidden'});
 await go('/business/monthly-operations?month=2026-11');await page.locator('[data-schedule-comparison]').scrollIntoViewIfNeeded();await page.locator('.plan-comparison-details>summary').click();await shot('monthly-mobile-expanded-390');
 assert.deepEqual(errors,[]);const video=page.video();await context.close();context=null;if(video)await copyFile(await video.path(),dir+'/video/workflow.webm');await writeFile(dir+'/result.json',JSON.stringify({passed:true,checks,images,errors},null,2));console.log('SCHEDULE_V0_OK '+checks.length);
}catch(error){console.error(f.logs().slice(-4000));throw error;}finally{await context?.close();await staff?.close();await browser?.close();await f.stop();}
