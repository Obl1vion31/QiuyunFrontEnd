export function promotionHistoryImpactMessage(impact:{from:string;through:string;dailyMetrics:number;arrangements:number;message:string;dayAdjustment?:string;originCorrection?:boolean}){
 if(impact.originCorrection)return impact.message+'归档 '+impact.dailyMetrics+' 条记录（'+impact.from+' 至 '+impact.through+'）。';
 return impact.message+'\n\n归档 '+impact.dailyMetrics+' 条日度记录，撤回 '+impact.arrangements+' 项后续安排。更正当天及以前的指标保留。'+(impact.dayAdjustment?'\n'+impact.dayAdjustment:'')+'\n\n确认后需要按实际情况重新登记后续推广。';
}
