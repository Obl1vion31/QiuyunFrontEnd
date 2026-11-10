import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {eq,sql} from 'drizzle-orm';
import {loadDevelopmentEnvironment,privateDevelopmentDirectory} from './environment';
import {ensureDevelopmentTunnel} from './tunnel';
import {createDatabase} from '../../src/db/client';
import {provisionAccount} from '../../src/auth/provision';
import {initialPositions} from '../../src/data/organization';
import * as s from '../../src/db/schema';
import type {ContentConfiguration} from '../../src/db/content-config-values';
import type {Role} from '../../src/auth/permissions';

type Configuration={subjects:Array<{id:string;name:string;sort_order:number}>;categories:Array<{id:string;name:string;sort_order:number}>;mappings:Array<{subject_id:string;category_id:string}>;content:Array<{subject_id:string;config:ContentConfiguration}>;costs:Array<{id:string;entries:Record<string,import('../../src/db/monthly-plan-types').DemandType|null>}>};
try{
 const url=loadDevelopmentEnvironment('maintenance');await ensureDevelopmentTunnel(url);
 const {configuration}=JSON.parse(await readFile(resolve(privateDevelopmentDirectory(),'development-baseline/snapshot.json'),'utf8')) as {configuration:Configuration};
 const accounts=JSON.parse(await readFile(resolve(privateDevelopmentDirectory(),'development-accounts.json'),'utf8')) as Array<{username:string;name:string;password:string;role:Role}>;
 assert.deepEqual(accounts.map(account=>account.username),['dev_admin','dev_employee'],'仅初始化独立开发账号。');
 const database=createDatabase(url),db=database.db;
 try{
  const [seedState]=await db.execute<{note:string|null}>(sql`select shobj_description(oid,'pg_database') as note from pg_database where datname=current_database()`);
  if(seedState?.note==='qiuyun development seed v1'){
   console.log(JSON.stringify({database:'qiuyun_dev',alreadyInitialized:true,existingDataPreserved:true}));
  }else{
  await db.insert(s.operationsSubject).values(configuration.subjects.map(row=>({id:row.id,name:row.name,sortOrder:row.sort_order}))).onConflictDoNothing();
  await db.insert(s.operationsCategory).values(configuration.categories.map(row=>({id:row.id,name:row.name,sortOrder:row.sort_order}))).onConflictDoNothing();
  await db.insert(s.operationsSubjectCategory).values(configuration.mappings.map(row=>({subjectId:row.subject_id,categoryId:row.category_id}))).onConflictDoNothing();
  const users=[];
  for(const account of accounts){const row=await provisionAccount(db,account);users.push({id:row.id,...account});}
  const admin=users.find(user=>user.role==='admin')!,employee=users.find(user=>user.role==='employee')!;
  for(const row of configuration.content)await db.insert(s.operationsContentConfig).values({subjectId:row.subject_id,config:row.config,updatedById:admin.id,updatedBy:'开发样例管理员',history:[],revision:0}).onConflictDoNothing();
  for(const row of configuration.costs)await db.insert(s.operationsMonthlyCostMapping).values({id:row.id,entries:row.entries,updatedBy:'开发样例管理员',history:[],revision:0}).onConflictDoNothing();
  await db.insert(s.organizationPosition).values(initialPositions).onConflictDoNothing();
  await db.insert(s.organizationAssignment).values([{userId:admin.id,positionKey:'supervisor'},...(['media','design','touchpoint'] as const).map(positionKey=>({userId:employee.id,positionKey}))]).onConflictDoNothing();
  const pending='10000000-0000-4000-8000-000000000001',published='10000000-0000-4000-8000-000000000002',chain='10000000-0000-4000-8000-000000000003';
  const category=configuration.mappings.find(row=>row.subject_id==='tmua'&&row.category_id==='non-promotional-handout')??configuration.mappings.find(row=>row.subject_id==='tmua')??configuration.mappings[0];
  assert(category,'开发样例需要基础分类。');
  await db.transaction(async tx=>{
   for(const [id,name,publishedAt,versions] of [[pending,'开发样例·待发布帖',null,1],[published,'开发样例·已发布帖','2026-10-21T10:00:00+08:00',1],[chain,'开发样例·改帖链','2026-10-22T10:00:00+08:00',2]] as const){
    const [existing]=await tx.select({id:s.operationsContent.id}).from(s.operationsContent).where(eq(s.operationsContent.id,id));if(existing)continue;
    const [content]=await tx.insert(s.operationsContent).values({id,operationType:'non_promotion_standard',platformNoteId:publishedAt?(id===published?'000000000000000000000002':'000000000000000000000003'):null}).returning();
    let sourceVersionId:string|undefined;
    for(let number=0;number<versions;number++){
     const [version]=await tx.insert(s.operationsContentVersion).values({contentId:content.id,versionNumber:number,sourceVersionId,workType:number?'revision':'new',contentName:name,subjectId:category.subject_id,categoryId:category.category_id,projectDocUrl:'https://example.invalid/qiuyun-development',projectDocName:'开发样例项目文档',revisionSummary:number?'开发样例：取消新版后保留历史':null}).returning();
     await tx.insert(s.operationsContentSchedule).values({contentVersionId:version.id,plannedPublishAt:new Date(number?'2026-10-25T10:00:00+08:00':publishedAt??'2026-10-20T10:00:00+08:00'),actualPublishAt:!number&&publishedAt?new Date(publishedAt):null,completionStatus:!number&&publishedAt?'completed':'pending',cancelledAt:number?new Date('2026-10-24T10:00:00+08:00'):null,isPromoted:false,promotionStatus:'none'});
     sourceVersionId=version.id;
    }
   }
  });
  await db.execute(sql`comment on database qiuyun_dev is 'qiuyun development seed v1'`);
  const [counts]=await db.execute(sql`select (select count(*) from auth_user)::int as accounts,(select count(*) from operations_content)::int as posts,(select count(*) from operations_content_version)::int as versions,(select count(*) from operations_review_meeting)::int as meetings`);
  console.log(JSON.stringify({database:'qiuyun_dev',samplesMonth:'2026-10',...counts}));
  }
 }finally{await database.close();}
}catch(error){console.error(error instanceof Error?error.message:'开发样例初始化失败。');process.exitCode=1;}
