import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import type {Database} from '../src/db/client';
import {seedHistoricalDay} from './promotion-day.fixture';
import * as s from '../src/db/schema';
export const ids={a:'a'.repeat(24),b:'b'.repeat(24),c:'c'.repeat(24),d:'d'.repeat(24)};
export async function notePost(db:Database,name='TMUA 讲义 · 笔记身份核对',days=6){
 const row=await seedHistoricalDay(db,name,Array(days).fill('testing'));
 await db.update(s.operationsContent).set({platformNoteId:randomUUID().replaceAll('-','').slice(0,24),operationType:'promotion_only'}).where(eq(s.operationsContent.id,row.post.content.id));
 await db.update(s.operationsContentVersion).set({versionNumber:0,projectDocUrl:'https://example.test/documents/tmua-note-identity'}).where(eq(s.operationsContentVersion.id,row.post.version.id));
 await db.update(s.operationsContentSchedule).set({publicationUrl:'https://www.xiaohongshu.com/explore/'+ids.a}).where(eq(s.operationsContentSchedule.id,row.post.schedule.id));
 return row;
}
export async function noteRevision(db:Database,source:Awaited<ReturnType<typeof notePost>>,options:{name?:string;date?:string;promoted?:boolean}={}){
 const [version]=await db.insert(s.operationsContentVersion).values({contentId:source.post.content.id,versionNumber:1,workType:'revision',sourceVersionId:source.post.version.id,contentName:options.name??'TMUA 讲义 · 改帖新版',subjectId:'interview',categoryId:'success-story',projectDocUrl:'https://example.test/documents/tmua-revision',revisionSummary:'更新案例结构与资料入口，重新发布'}).returning();
 const [schedule]=await db.insert(s.operationsContentSchedule).values({contentVersionId:version.id,isPromoted:options.promoted!==false,promotionStatus:options.promoted===false?'none':'pending',plannedPublishAt:new Date((options.date??'2026-10-31')+'T10:00:00+08:00'),completionStatus:'pending'}).returning();
 return {version,schedule};
}
