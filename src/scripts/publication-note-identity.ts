import {noteIdOn,type PublicationNoteIdentity} from '../db/note-identity-rules';
const contexts=new WeakMap<HTMLFormElement,PublicationNoteIdentity>();
export function resetPublicationNote(form:HTMLFormElement,required:boolean){
 contexts.delete(form);const host=form.querySelector<HTMLFieldSetElement>('[data-publication-note-identity]')!;host.hidden=!required;host.disabled=true;
 host.querySelector('[data-note-inherit-value]')!.textContent=required?'选择发布日期后，核对上一版本的笔记 ID。':'';
 host.querySelector<HTMLElement>('[data-note-new-field]')!.hidden=true;
}
export function updatePublicationNote(form:HTMLFormElement){
 const context=contexts.get(form);if(!context)return;
 const host=form.querySelector<HTMLFieldSetElement>('[data-publication-note-identity]')!;host.hidden=!context.required;host.disabled=!context.required;
 if(!context.required)return;
 const actual=(form.elements.namedItem('actualPublishAt') as HTMLInputElement).value.slice(0,10);
 const source=context.source,value=actual&&source?noteIdOn(source.periods,actual):null;
 const inherit=form.querySelector<HTMLInputElement>('[name=noteIdMode][value=inherit]')!;inherit.disabled=!value;
 if(!value)inherit.checked=false;
 host.querySelector('[data-note-inherit-value]')!.textContent=!actual?'请先选择发布日期。':value?`V${source!.versionNumber} · ${value}`:'原版本在该发布日期没有笔记 ID；请先补齐原版，或选择填写新 ID。';
 const fresh=form.querySelector<HTMLInputElement>('[name=noteIdMode][value=new]')!.checked;
 const field=form.elements.namedItem('platformNoteId') as HTMLInputElement;field.disabled=!fresh;field.required=fresh;host.querySelector<HTMLElement>('[data-note-new-field]')!.hidden=!fresh;
 (form.elements.namedItem('expectedNoteIdFingerprint') as HTMLInputElement).value=context.fingerprint;
 (form.elements.namedItem('expectedSourceNoteIdFingerprint') as HTMLInputElement).value=source?.fingerprint??'';
}
export function setPublicationNote(form:HTMLFormElement,context:PublicationNoteIdentity){
 const previous=contexts.get(form);
 if(previous?.source?.fingerprint!==context.source?.fingerprint&&previous){
  const inherit=form.querySelector<HTMLInputElement>('[name=noteIdMode][value=inherit]')!;
  if(inherit.checked){inherit.checked=false;form.querySelector<HTMLElement>('[data-publication-message]')!.textContent='原版本笔记 ID 已变化，请核对后重新选择；其他输入已保留。';}
 }
 contexts.set(form,context);updatePublicationNote(form);
}
