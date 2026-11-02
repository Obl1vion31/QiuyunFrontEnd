import type {APIRoute} from 'astro';
import {eq} from 'drizzle-orm';
import {getDb} from '../../../../db/client';
import {operationsReviewMeeting} from '../../../../db/schema';
import {readMonthlyMeeting} from '../../../../db/monthly-meeting';
import {workflowErrorResponse} from '../../../../db/workflow-api';
export const prerender=false;
export const GET:APIRoute=async({params})=>{try{const [meeting]=await getDb().select().from(operationsReviewMeeting).where(eq(operationsReviewMeeting.id,params.id!));if(!meeting||meeting.meetingType!=='monthly')return Response.json({message:'月会不存在。'},{status:404});return Response.json({monthly:await readMonthlyMeeting(getDb(),meeting)});}catch(error){return workflowErrorResponse(error);}};
