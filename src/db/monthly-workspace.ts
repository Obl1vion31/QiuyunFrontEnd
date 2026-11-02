import type {Database} from './client';
import {readMonthlyOperations,type MonthlyQuery} from './monthly-operations';
import {readMonthlyPrivate} from './monthly-private';
import {readMonthlyPlan} from './monthly-plans';
export async function readMonthlyWorkspace(db:Database,query:MonthlyQuery){const base=await readMonthlyOperations(db,query);const full=query.subject||query.category?await readMonthlyOperations(db,{month:query.month,subject:'',category:''}):base;return {...base,privateData:await readMonthlyPrivate(db,full),planExecution:await readMonthlyPlan(db,query.month)};}
export type MonthlyWorkspace=Awaited<ReturnType<typeof readMonthlyWorkspace>>;
