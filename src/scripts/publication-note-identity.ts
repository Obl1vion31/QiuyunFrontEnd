import {noteIdOn,type PublicationNoteIdentity} from '../db/note-identity-rules';
import {extractPublicationLink,publicationNoteId} from '../db/publication-link.mjs';
const contexts=new WeakMap<HTMLFormElement,PublicationNoteIdentity>();
export function resetPublicationNote(form:HTMLFormElement,required:boolean){
 contexts.delete(form);const host=form.querySelector<HTMLFieldSetElement>('[data-publication-note-identity]')!;host.hidden=!required;host.disabled=true;
 host.querySelector<HTMLElement>('[data-publication-note-value]')!.textContent='';
 const scope=host.querySelector<HTMLFieldSetElement>('[data-publication-link-scope]')!;scope.hidden=true;scope.disabled=true;
}
export function updatePublicationNote(form:HTMLFormElement){
 const context=contexts.get(form);if(!context)return;
 const host=form.querySelector<HTMLFieldSetElement>('[data-publication-note-identity]')!;host.hidden=!context.required;host.disabled=!context.required;
 if(!context.required)return;
 const actual=(form.elements.namedItem('actualPublishAt') as HTMLInputElement).value.slice(0,10);
 const raw=(form.elements.namedItem('publicationUrl') as HTMLTextAreaElement).value;
 const link=extractPublicationLink(raw),value=link.error?null:publicationNoteId(link.url),previous=noteIdOn(context.periods,'9999-12-31')??publicationNoteId(context.publicationUrl);
 host.querySelector('[data-publication-note-value]')!.textContent=value?`${value} · 来自发布链接`:raw.trim()&&!link.error?'保存时自动解析分享短链接':previous?`${previous} · 历史录入`:'由小红书帖子链接自动识别';
 const changing=!!context.published&&!link.error&&!!raw.trim()&&(value?value!==previous:link.url!==context.publicationUrl);
 const scope=host.querySelector<HTMLFieldSetElement>('[data-publication-link-scope]')!;scope.hidden=!changing;scope.disabled=!changing;
 for(const radio of scope.querySelectorAll<HTMLInputElement>('[name=linkScope]'))radio.required=changing;
 const from=changing&&!!scope.querySelector<HTMLInputElement>('[name=linkScope][value=from_date]')!.checked;
 const date=scope.querySelector<HTMLInputElement>('[name=linkEffectiveOn]')!;date.disabled=!from;date.required=from;date.min=actual;
 scope.querySelector<HTMLElement>('[data-link-effective-field]')!.hidden=!from;
 scope.querySelector<HTMLElement>('[data-link-impact-row]')!.dataset.fromDate=String(from);
 const affected=(context.metricDates??[]).filter(d=>!from||!date.value||d>=date.value).length;
 scope.querySelector<HTMLElement>('[data-publication-link-impact]')!.textContent=changing?`影响已保存日记录 ${affected} 条，原指标保留。`:'';
 (form.elements.namedItem('expectedNoteIdFingerprint') as HTMLInputElement).value=context.fingerprint;
}
export function setPublicationNote(form:HTMLFormElement,context:PublicationNoteIdentity){
 const previous=contexts.get(form);
 if(previous&&previous.fingerprint!==context.fingerprint){
  for(const radio of form.querySelectorAll<HTMLInputElement>('[name=linkScope]'))radio.checked=false;
  form.querySelector<HTMLElement>('[data-publication-message]')!.textContent='笔记归属已变化，请重新核对链接生效范围；其他输入已保留。';
 }
 contexts.set(form,context);updatePublicationNote(form);
}
