import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {eq} from 'drizzle-orm';
import {readFile} from 'node:fs/promises';
import {migrateFixture} from './migrate-fixture';
import * as s from '../src/db/schema';
import {ensureMeetingPdf} from '../src/db/meeting-pdf';
test('PDF失败与中断可独立重试，同版本并发生成只归档一次，不重复定稿',async()=>{
 const pg=new PGlite(),db=drizzle(pg,{schema:s});
 try{
  await migrateFixture(pg);
  const[m]=await db.insert(s.operationsReviewMeeting).values({name:'隔离报告',periodStart:'2026-10-01',periodEnd:'2026-10-07',meetingAt:new Date(),createdByLabel:'fixture'}).returning();
  const[v]=await db.insert(s.operationsReviewMeetingVersion).values({meetingId:m.id,versionNumber:0,snapshot:{finalizationStage:'post',meeting:{name:'隔离报告'}},changeSummary:'隔离定稿',finalizedByLabel:'fixture'}).returning();
  const before=JSON.stringify(v.snapshot);
  assert.equal((await ensureMeetingPdf(db,v.id,'fixture',async()=>{throw new Error('隔离渲染失败');})).status,'failed');
  let calls=0;let release!:()=>void;const waiting=new Promise<void>(resolve=>release=resolve);
  const first=ensureMeetingPdf(db,v.id,'fixture',async()=>{calls++;await waiting;return Buffer.from('%PDF-isolated-service-test');});
  // 等待真实租约持久化，不靠并发时序猜测。
  while(!(await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,v.id)))[0].pdfStartedAt)await new Promise(r=>setTimeout(r,10));
  assert.equal((await ensureMeetingPdf(db,v.id,'fixture',async()=>{throw new Error('不应重复生成');})).status,'pending');release();assert.equal((await first).status,'ready');assert.equal(calls,1);
  assert.equal((await db.select().from(s.operationsMeetingAttachment)).length,1);assert.equal((await ensureMeetingPdf(db,v.id,'fixture')).status,'ready');
  const[v2]=await db.insert(s.operationsReviewMeetingVersion).values({meetingId:m.id,versionNumber:1,snapshot:{finalizationStage:'post'},changeSummary:'模拟中断',finalizedByLabel:'fixture',pdfStatus:'pending',pdfStartedAt:new Date(Date.now()-180000)}).returning();
  assert.equal((await ensureMeetingPdf(db,v2.id,'fixture',async()=>Buffer.from('%PDF-retry-service-test'))).status,'ready');
  assert.equal((await db.select().from(s.operationsReviewMeetingVersion)).length,2);assert.equal((await db.select().from(s.operationsReviewActionItem)).length,0);assert.equal(JSON.stringify((await db.select().from(s.operationsReviewMeetingVersion).where(eq(s.operationsReviewMeetingVersion.id,v.id)))[0].snapshot),before);
 }finally{await pg.close();}
});
test('0038兼容迁移保留旧冻结JSON和图片，旧应用仍可按原字段写图片',async()=>{
 const pg=new PGlite();try{
  await pg.exec(`CREATE TABLE operations_review_meeting (id uuid PRIMARY KEY); CREATE TABLE operations_review_meeting_version (id uuid PRIMARY KEY, snapshot jsonb NOT NULL); CREATE TABLE operations_meeting_attachment (id uuid PRIMARY KEY,meeting_id uuid NOT NULL,name text NOT NULL,mime_type text NOT NULL,byte_length integer NOT NULL,base64 text NOT NULL,created_by_label text NOT NULL,CONSTRAINT operations_meeting_attachment_type_check CHECK (mime_type IN ('image/png','image/jpeg','image/webp'))); INSERT INTO operations_review_meeting_version VALUES ('00000000-0000-4000-8000-000000000001','{"legacy":true,"frozenMean":5}');`);
  const sql=await readFile(new URL('../drizzle/0038_meeting_pdf_archive.sql',import.meta.url),'utf8');await pg.exec(sql.replaceAll('--> statement-breakpoint',''));
  await pg.exec(`INSERT INTO operations_meeting_attachment(id,meeting_id,name,mime_type,byte_length,base64,created_by_label) VALUES ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','旧图片','image/png',1,'a','fixture')`);
  assert.deepEqual((await pg.query<any>('SELECT snapshot FROM operations_review_meeting_version')).rows[0].snapshot,{legacy:true,frozenMean:5});assert.equal((await pg.query<any>('SELECT source FROM operations_meeting_attachment')).rows[0].source,'image');
 }finally{await pg.close();}
});

test('旧模板重建失败保留原PDF，成功原子替换且不覆盖手工附件',async()=>{const pg=new PGlite(),db=drizzle(pg,{schema:s});try{await migrateFixture(pg);const[m]=await db.insert(s.operationsReviewMeeting).values({name:'重建样例',periodStart:'2026-10-01',periodEnd:'2026-10-07',meetingAt:new Date(),createdByLabel:'fixture'}).returning();const[v]=await db.insert(s.operationsReviewMeetingVersion).values({meetingId:m.id,versionNumber:0,snapshot:{finalizationStage:'post'},changeSummary:'示例',finalizedByLabel:'fixture'}).returning();const[old]=await db.insert(s.operationsMeetingAttachment).values({meetingId:m.id,meetingVersionId:v.id,source:'generated',name:'old.pdf',mimeType:'application/pdf',byteLength:8,base64:Buffer.from('old-data').toString('base64'),createdByLabel:'fixture'}).returning();const[manual]=await db.insert(s.operationsMeetingAttachment).values({meetingId:m.id,meetingVersionId:v.id,source:'manual',name:'manual.pdf',mimeType:'application/pdf',byteLength:8,base64:old.base64,createdByLabel:'fixture'}).returning();assert.equal((await ensureMeetingPdf(db,v.id,'fixture',async()=>{throw new Error('失败');})).status,'failed');assert.equal((await db.select().from(s.operationsMeetingAttachment).where(eq(s.operationsMeetingAttachment.id,old.id)))[0].base64,old.base64);const result=await ensureMeetingPdf(db,v.id,'fixture',async()=>Buffer.from('%PDF-new-data'));assert.equal(result.id,old.id);assert.equal((await db.select().from(s.operationsMeetingAttachment)).length,2);assert.equal((await db.select().from(s.operationsMeetingAttachment).where(eq(s.operationsMeetingAttachment.id,manual.id)))[0].base64,manual.base64);}finally{await pg.close();}});
