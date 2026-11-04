/** 历史比较只返回算法实际使用的字段；完整冻结快照仍由版本展示、回溯和 PDF 读取。 */
import {sql,type SQL} from 'drizzle-orm';
import {operationsReviewMeetingVersion as versions} from './schema';

function objectFields(value:SQL,keys:readonly string[]):SQL {
  // 通过原有键投影，保留“缺失”和显式 null 的区别（如 dataRange）。
  return sql`(select coalesce(jsonb_object_agg(key,value),'{}'::jsonb)
    from jsonb_each(coalesce(nullif(${value},'null'::jsonb),'{}'::jsonb)) as fields(key,value)
    where key in (${sql.join(keys.map(key=>sql`${key}`),sql`, `)}))`;
}
function arrayFields(value:SQL,keys:readonly string[]):SQL {
  return sql`(select coalesce(jsonb_agg(${objectFields(sql`item`,keys)} order by position),'[]'::jsonb)
    from jsonb_array_elements(coalesce(nullif(${value},'null'::jsonb),'[]'::jsonb)) with ordinality as items(item,position))`;
}
const promotionFields=['key','originKey','campaignId','scheduleId','stageType','startedOn','endedOn','originalStageStartedOn',
  'facts','total','dataRange','actualLeadCost','comparisonOnly','events','sourceHash','subjectId','categoryId'];
const nonPromotionFields=['key','scheduleId','checkpointType','checkpoint','sourceHash','comparisonOnly'];

export const meetingNonPromotionSelections=arrayFields(sql`${versions.snapshot}#>'{generated,nonPromotions}'`,['scheduleId','checkpointType','checkpoint']);
export const weeklyHistorySnapshot=sql<Record<string,any>>`jsonb_build_object(
  'meeting', ${objectFields(sql`${versions.snapshot}->'meeting'`,['periodEnd'])},
  'draft', jsonb_build_object('promotionInputs', (
    select coalesce(jsonb_object_agg(key,${objectFields(sql`value`,['confirmed','rateNeedsReview','clickRate','rateRange'])}),'{}'::jsonb)
    from jsonb_each(coalesce(nullif(${versions.snapshot}#>'{draft,promotionInputs}','null'::jsonb),'{}'::jsonb)) as inputs(key,value))),
  'generated', jsonb_build_object(
    'promotions', ${arrayFields(sql`${versions.snapshot}#>'{generated,promotions}'`,promotionFields)},
    'nonPromotions', ${arrayFields(sql`${versions.snapshot}#>'{generated,nonPromotions}'`,nonPromotionFields)},
    'promotionSnapshots', (
      select coalesce(jsonb_agg(jsonb_build_object('snapshot',jsonb_build_object('rows',${arrayFields(sql`ref#>'{snapshot,rows}'`,promotionFields)})) order by position),'[]'::jsonb)
      from jsonb_array_elements(coalesce(nullif(${versions.snapshot}#>'{generated,promotionSnapshots}','null'::jsonb),'[]'::jsonb)) with ordinality as refs(ref,position))))`;
