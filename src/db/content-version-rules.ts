export interface ContentVersionReference { id:string; contentId:string; versionNumber:number }
interface RevisionState { latestActiveVersionId:string|null; latestActiveVersionNumber:number|null; nextVersionNumber:number }

/** 有效版本决定派生资格；全部历史版本决定新编号，取消不回收编号。 */
export function contentRevisionStates(history:readonly ContentVersionReference[],active:readonly ContentVersionReference[]){
 const states=new Map<string,RevisionState>();
 const include=(version:ContentVersionReference)=>{
  let state=states.get(version.contentId);
  if(!state){state={latestActiveVersionId:null,latestActiveVersionNumber:null,nextVersionNumber:0};states.set(version.contentId,state);}
  state.nextVersionNumber=Math.max(state.nextVersionNumber,version.versionNumber+1);
  return state;
 };
 for(const version of history)include(version);
 for(const version of active){
  const state=include(version);
  if(state.latestActiveVersionNumber===null||version.versionNumber>state.latestActiveVersionNumber){state.latestActiveVersionId=version.id;state.latestActiveVersionNumber=version.versionNumber;}
 }
 return states;
}

export const canCreateRevision=(source:{actualPublishAt:Date|string|null;isLatestActiveVersion:boolean})=>Boolean(source.actualPublishAt)&&source.isLatestActiveVersion;
