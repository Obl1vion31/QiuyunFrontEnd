import {z} from 'zod';
import {validReviewDate} from './non-promotion-nodes';
export const reviewPlanSchema=z.object({mode:z.enum(['standard','instant','continuous']),day7:z.boolean(),day15:z.boolean(),dueOn:z.string().optional(),expectedRevision:z.number().int().min(-1)}).superRefine((value,ctx)=>{
 if(value.mode==='instant'&&!value.dueOn)ctx.addIssue({code:'custom',path:['dueOn'],message:'请设置即时复盘截止日期'});
 if(value.dueOn&&!validReviewDate(value.dueOn))ctx.addIssue({code:'custom',path:['dueOn'],message:'请选择有效截止日期'});
});
export type ReviewPlanInput=z.infer<typeof reviewPlanSchema>;
export function reviewPlanFromForm(form:FormData){
 if(!form.has('reviewMode'))return undefined;
 return {mode:form.get('reviewMode'),day7:form.get('reviewDay7')==='on',day15:form.get('reviewDay15')==='on',dueOn:String(form.get('reviewDueOn')||''),expectedRevision:Number(form.get('expectedReviewRevision')??-1)};
}
