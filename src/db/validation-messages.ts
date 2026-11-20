import type {z} from 'zod';
/** 在表单错误输出边界转换默认校验错误，字段键及校验规则保持原样。 */
const labels:Record<string,string>={contentName:'内容名称',subjectId:'学科',categoryId:'帖子分类',contentRole:'内容职能',operationType:'运营类型',projectDocUrl:'项目资料链接',publicationUrl:'帖子链接',platformNoteId:'笔记 ID',plannedPublishAt:'应发时间',actualPublishAt:'实际发布时间',reviewDueOn:'复盘截止日期',recordedThrough:'数据截止日期',finalReviewOn:'最终复盘日期',reviewDecision:'下一步安排',dailyStatus:'当日状态',actualStatusSnapshot:'当日状态',dayStatus:'当日状态',stageTypeSnapshot:'推广阶段',spend:'消耗金额',platformOpenCount:'平台开口人数',actualOpenCount:'实际开口人数',platformLeadCount:'平台留资人数',actualLeadCount:'实际留资人数',impressionCount:'曝光量',clickCount:'点击量',exposureCount:'曝光量',readCount:'阅读量',clickRate:'点击率',threeSecondReadRate:'3 秒阅读率',reason:'修改原因',note:'备注',name:'名称',username:'登录账号',displayUsername:'用户名',password:'密码',meetingAt:'会议时间',periodStart:'开始日期',periodEnd:'结束日期',coreConclusion:'核心结论',nextAction:'下一步行动',month:'月份',added:'私域增加人数',consulted:'课程意向人数',converted:'成交人数',conclusion:'复盘结论',start:'开始时间',end:'结束时间'};
const recordFields=new Set(['requestKey','requestId','fingerprint','contextFingerprint','expectedUpdatedAt','expectedRevision','expectedPlanRevision','expectedPublicationRevision','expectedReviewRevision','expectedNoteIdFingerprint','expectedSourceNoteIdFingerprint','campaignId','scheduleId','sourceScheduleId','sourceVersionId','draftVersionId','versionId','meetingId']);
type FormControl=HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement;
/** 只解释浏览器现有约束，不增加必填、范围或精度要求。 */
export function nativeValidationMessage(control:FormControl){
 const label=control.getAttribute('aria-label')||labels[control.name]||control.labels?.[0]?.textContent?.trim()||'当前字段';
 const state=control.validity;
 if(state.customError)return control.validationMessage;
 if(state.valueMissing)return `${label}${control.tagName==='SELECT'||control.type==='checkbox'||control.type==='radio'?'请选择。':'请填写。'}`;
 if(state.badInput)return `${label}请填写有效数字。`;
 if(state.typeMismatch)return `${label}${control.type==='url'?'请填写完整链接，例如 https://example.com。':control.type==='email'?'请填写有效的邮箱地址。':'格式不正确，请重新填写。'}`;
 const min=control.getAttribute('min'),max=control.getAttribute('max');
 if(state.rangeUnderflow||state.rangeOverflow)return min!=null&&max!=null?`${label}请填写 ${min}～${max} 之间的${control.type.includes('date')?'日期':control.type==='time'?'时间':'数值'}。`:state.rangeUnderflow?`${label}不能小于 ${min}。`:`${label}不能大于 ${max}。`;
 if(state.stepMismatch){const step=control.getAttribute('step')||'1',base=min||control.getAttribute('value')||'0';return control.type==='number'?step==='1'&&Number.isInteger(Number(base))?`${label}请填写整数。`:`${label}请按 ${step} 的间隔填写，起点为 ${base}。`:`${label}请按字段要求选择日期或时间。`;}
 if(state.tooShort)return `${label}至少填写 ${control.getAttribute('minlength')} 个字符。`;
 if(state.tooLong)return `${label}最多填写 ${control.getAttribute('maxlength')} 个字符。`;
 return `${label}格式不正确，请按字段要求填写。`;
}
export function validationMessage(issue?:z.core.$ZodIssue){
 if(!issue)return '请检查填写内容后重试。';
 const keys=issue.path.filter((key):key is string=>typeof key==='string');
 if(keys.some(key=>recordFields.has(key)))return '记录信息不完整或已更新，请先保留输入，再重新打开这条记录。';
 const label=[...keys].reverse().map(key=>labels[key]).find(Boolean)??'填写内容';
 if(/[\u4e00-\u9fff]/.test(issue.message))return label==='填写内容'||issue.message.includes(label)?issue.message:`${label}：${issue.message}`;
 switch(issue.code){
  case 'invalid_type':return issue.expected==='number'?`${label}请填写有效数字。`:issue.expected==='boolean'?`${label}选项无效，请重新选择。`:`请填写有效的${label}。`;
  case 'too_small':return issue.origin==='number'||issue.origin==='bigint'?`${label}不能${issue.inclusive?'小于':'小于或等于'} ${issue.minimum}。`:issue.origin==='string'?`${label}至少填写 ${issue.minimum} 个字符。`:`${label}数量不足，请补齐后重试。`;
  case 'too_big':return issue.origin==='number'||issue.origin==='bigint'?`${label}不能${issue.inclusive?'大于':'大于或等于'} ${issue.maximum}。`:issue.origin==='string'?`${label}最多填写 ${issue.maximum} 个字符。`:`${label}数量过多，请减少后重试。`;
  case 'invalid_value':return `请选择有效的${label}。`;
  case 'invalid_format':return `${label}格式不正确，请重新填写。`;
  default:return `请检查${label}后重试。`;
 }
}
export function validationFields(issues:z.core.$ZodIssue[]){
 const fields:Record<string,string[]>={};for(const issue of issues)(fields[String(issue.path[0]??'form')]??=[]).push(validationMessage(issue));return fields;
}
