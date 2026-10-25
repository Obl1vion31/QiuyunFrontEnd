/** 从不可变例会快照生成可搜索、可打印的 A4 报告。字体在构建中打包，无运行时下载。 */
import PDFDocument from 'pdfkit';
import regularFont from '../assets/report-fonts/NotoSansCJKsc-Regular.otf?inline';
import boldFont from '../assets/report-fonts/NotoSansCJKsc-Bold.otf?inline';
import {promotionActualLabels} from './promotion-successors.mjs';
import {promotionRateComparison,rateDifference,type RateComparison} from './meeting-rate-comparison';
import {sortMeetingNonPromotions,cardDataRange} from './meeting-card-rules';
const money=(v:any)=>v==null?'—':`¥${Number(v).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const rate=(v:any)=>v==null?'未补充':`${Number(v).toFixed(2)}%`;
function compared(value:number|null|undefined,b:RateComparison|undefined,field:'clickRate'|'threeSecondReadRate'='clickRate'){
 if(!b)return '';
 const delta=rateDifference(value,b,field);
 return `${delta==null?'':Math.abs(delta)<0.005?'；与同类持平':`；较同类${delta>0?'高':'低'} ${Math.abs(delta).toFixed(2)} 个百分点`}；同类均值 ${rate(b[field])}（${b.n} 份样本${b.n===1?'，仅本帖':''}）`;
}
export function renderMeetingPdf(snapshot:any,versionNumber:number):Promise<Buffer>{
 return new Promise((resolve,reject)=>{
  const doc=new PDFDocument({size:'A4',margins:{top:46,bottom:58,left:44,right:44},bufferPages:true,info:{Title:`${snapshot.meeting?.name??'例会复盘'} V${versionNumber}`,Author:'淞云数竞',Subject:'会后例会复盘'}});
  const chunks:Buffer[]=[];doc.on('data',chunk=>chunks.push(chunk));doc.on('error',reject);doc.on('end',()=>resolve(Buffer.concat(chunks)));
  doc.registerFont('body',Buffer.from(regularFont.split(',')[1],'base64'));doc.registerFont('bold',Buffer.from(boldFont.split(',')[1],'base64'));
  const width=507.28,ink='#202a29',muted='#596760';
  function space(min=45){if(doc.y+min>doc.page.height-64)doc.addPage();}
  function text(value:string,size=10.5,color=ink,bold=false){doc.font(bold?'bold':'body').fontSize(size).fillColor(color).text(value||'—',44,doc.y,{width,lineGap:4});}
  function heading(value:string){space(180);doc.moveDown(.65);text(value,14,ink,true);doc.moveDown(.45);}
  function paragraph(label:string,value:any){space(38);text(label,9.5,muted,true);text(String(value||'未补充'));doc.moveDown(.5);}
  function rule(){space(16);doc.strokeColor('#cdd4d1').lineWidth(.5).moveTo(44,doc.y).lineTo(551,doc.y).stroke();doc.moveDown(.6);}
  const {meeting={},draft={},generated={}}=snapshot,summary=generated.summary??{};
  text(meeting.name??'例会业务复盘',19,ink,true);doc.moveDown(.45);
  text(`会后定稿 V${versionNumber}  |  ${meeting.periodStart??''} - ${meeting.periodEnd??''}`,10,muted);doc.moveDown(.6);rule();
  heading('本期结果');
  text(`实际跑量 ${summary.posts??'—'} 篇    总消耗 ${money(summary.spend)}`);
  text(`实际开口成本 ${money(summary.actualOpenCost)}    实际留资成本 ${money(summary.actualLeadCost)}`);doc.moveDown(.5);
  paragraph('核心结论',draft.coreConclusion);paragraph('下一步行动',draft.nextAction);
  if(snapshot.decisionEffectiveOn)text(`已定安排：从 ${snapshot.decisionEffectiveOn} 起生效`,9.5,muted);
  heading('推广帖阶段复盘');
  if(!generated.promotions?.length)text('本期无推广阶段');
  for(const row of generated.promotions??[]){
   space(260);rule();text(`${row.contentName}  V${row.versionNumber}`,12,ink,true);
   const range=cardDataRange(row),input=draft.promotionInputs?.[row.key],b=promotionRateComparison(row,input);
   text(`${row.stageType==='testing'?`测试第${row.testCycleNumber??1}轮`:'放量阶段'}  |  ${range?range.from+' - '+range.through:'暂无非零数据'}`,9.5,muted);
   text(`消耗 ${money(row.total?.spend)}  |  实际开口 ${row.total?.actualOpenCount??'—'} 人  |  留资 ${row.total?.actualLeadCount??'—'} 人`);
   text(`开口成本 ${money(row.total?.actualOpenCost)}  |  留资成本 ${money(row.total?.actualLeadCost)}`);
   text(`点击率 ${rate(input?.clickRate)}${compared(input?.clickRate,b)}`);
   for(const h of row.ownHistory??[])text(`本帖历史 ${h.periodLabel??''}：开口成本 ${money(h.actualOpenCost)}；留资成本 ${money(h.actualLeadCost)}`,9.5,muted);
   if(row.historical?.n)text(`历史同类（${row.historical.n} 份样本）：开口成本 ${money(row.historical.actualOpenCost)}；留资成本 ${money(row.historical.actualLeadCost)}`,9.5,muted);
   paragraph('观察',input?.currentSituation);paragraph('行动',input?.activeAction);
   const decision=(generated.meetingDecisions??[]).find((d:any)=>d.campaignId===row.campaignId),target=decision?.action??decision?.targetStatus??draft.promotionDecisions?.[row.campaignId];
   if(target&&!row.testCycleEndedOn)text(`已定安排：${target==='restart_testing'?'重新开始测试':promotionActualLabels[target]??target}；从 ${snapshot.decisionEffectiveOn??'未记录'} 起`,10,ink,true);
  }
  heading('非推广帖复盘');
  if(!generated.nonPromotions?.length)text('本期无非推广节点');
  for(const row of sortMeetingNonPromotions<any>(generated.nonPromotions??[])){
   space(155);rule();text(`${row.contentName}  V${row.versionNumber}  |  ${row.checkpointType==='day_7'?'首轮（7天）':'二轮（15天）'}`,12,ink,true);
   text(`发布 ${row.publishedOn??'未记录'}  |  数据截止 ${row.recordedThrough??'未记录'}`,9.5,muted);
   text(`点击率 ${rate(row.clickRate)}${compared(row.clickRate,row.rateComparison)}`);
   text(`3 秒阅读率 ${rate(row.threeSecondReadRate)}${compared(row.threeSecondReadRate,row.rateComparison,'threeSecondReadRate')}`);
   if(!row.rateComparison&&row.historical?.n)text(`原版本历史同类（${row.historical.n} 份）：点击率 ${rate(row.historical.clickRate)}；3秒阅读率 ${rate(row.historical.threeSecondReadRate)}`,9.5,muted);
   paragraph('复盘结论',row.conclusion);
  }
  heading('补充分析与事项');paragraph('衡量情况',draft.situation);paragraph('本期具体动作',draft.strategy);
  if(!draft.issues?.length)text('本期无跟进事项');
  for(const [index,item]of (draft.issues??[]).entries()){
   space(90);rule();text(`事项 ${index+1}  |  ${{pending:'待解决',validating:'进行中',resolved:'已解决',paused:'暂缓'}[item.status as string]??item.status}`,10.5,ink,true);
   paragraph('问题',item.problem);paragraph('解决方案',item.conclusion);
  }
  if(generated.excludedNonPromotions?.length){heading('不复盘记录');for(const row of generated.excludedNonPromotions)text(`${row.contentName} · ${row.checkpointType==='day_7'?'首轮':'二轮'} · ${row.reason}`);}
  if(draft.temporaryNotes){heading('补充记录');text(draft.temporaryNotes);}
  if(draft.temporaryLinks?.length){heading('补充链接');for(const link of draft.temporaryLinks)paragraph(link.label||'相关链接',link.url);}
  if(generated.attachments?.length){heading('归档附件');for(const attachment of generated.attachments)text(attachment.name);}
  const pages=doc.bufferedPageRange();
  for(let i=0;i<pages.count;i++){doc.switchToPage(i);doc.page.margins.bottom=0;doc.font('body').fontSize(8).fillColor(muted).text(`淞云数竞  |  会后 V${versionNumber}  |  ${i+1} / ${pages.count}`,44,810,{width,align:'right',lineBreak:false});}
  doc.end();
 });
}
