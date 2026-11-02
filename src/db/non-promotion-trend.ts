export interface ReadingPoint {key:string;through:string;value:number|null}
/** 同帖累计值按真实截至日定位；缺失断线，不插值或求和。 */
export function readingTrend(input:ReadingPoint[]){
 const rows=[...input].sort((a,b)=>a.through.localeCompare(b.through)||a.key.localeCompare(b.key));
 const valid=rows.filter(row=>row.value!=null),maximum=Math.max(1,...valid.map(row=>row.value!));
 const start=Date.parse(rows[0]?.through??'1970-01-01'),end=Date.parse(rows.at(-1)?.through??'1970-01-01'),span=Math.max(86400000,end-start);
 const points=rows.map(row=>({...row,x:16+(Date.parse(row.through)-start)/span*608,y:row.value==null?null:132-row.value/maximum*112}));
 const segments:string[]=[];let segment='';
 for(const point of points){if(point.y==null){if(segment)segments.push(segment);segment='';}else segment+=(segment?' L':'M')+point.x.toFixed(2)+','+point.y.toFixed(2);}
 if(segment)segments.push(segment);
 return {visible:valid.length>=2,maximum:valid.length?Math.max(...valid.map(row=>row.value!)):0,first:rows[0]?.through??'',last:rows.at(-1)?.through??'',points,segments};
}
