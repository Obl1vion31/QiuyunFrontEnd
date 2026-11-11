/** 浏览器和服务端共用的日期解析；没有值不借用其他版本。 */
export type NoteIdPeriod = {effectiveOn:string|null;platformNoteId:string|null};
export type PublicationNoteIdentity={required:boolean;versionId:string;versionNumber:number;periods:NoteIdPeriod[];fingerprint:string;source:{versionId:string;versionNumber:number;periods:NoteIdPeriod[];fingerprint:string}|null};
export function noteIdOn(periods:readonly NoteIdPeriod[],date:string):string|null {
  let value:string|null=null;
  for(const row of [...periods].sort((a,b)=>(a.effectiveOn??'').localeCompare(b.effectiveOn??''))) {
    if(row.effectiveOn&&row.effectiveOn>date)break;
    value=row.platformNoteId;
  }
  return value;
}
export function replaceNoteIdPeriods(periods:readonly NoteIdPeriod[],value:string,from:string|null):NoteIdPeriod[] {
  return from===null?[{effectiveOn:null,platformNoteId:value}]:[
    ...periods.filter(row=>row.effectiveOn===null||row.effectiveOn<from),
    {effectiveOn:from,platformNoteId:value},
  ];
}
export function noteIdPeriodsLabel(periods:readonly NoteIdPeriod[]):string {
  return periods.map(row=>`${row.effectiveOn?row.effectiveOn+' 起':'版本初始'}：${row.platformNoteId??'未填写'}`).join('；');
}
