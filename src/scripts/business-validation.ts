import {nativeValidationMessage} from '../db/validation-messages';

type Control=HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement;
const messages=new WeakMap<Control,string>();
const isControl=(node:unknown):node is Control=>node instanceof HTMLInputElement||node instanceof HTMLSelectElement||node instanceof HTMLTextAreaElement;
export function clearNativeValidation(control:Control){
 const message=messages.get(control);
 // 不清除其他业务校验后来设置的说明。
 if(message&&control.validationMessage===message)control.setCustomValidity('');
 messages.delete(control);
}
document.addEventListener('invalid',event=>{
 const control=event.target;if(!isControl(control))return;
 clearNativeValidation(control);
 if(control.validity.valid||control.validity.customError)return;
 const message=nativeValidationMessage(control);control.setCustomValidity(message);messages.set(control,message);
},true);
for(const type of ['input','change'])document.addEventListener(type,event=>{
 const control=event.target;if(!isControl(control))return;clearNativeValidation(control);
 if(control.type==='radio'&&control.form)for(const field of control.form.elements)if(isControl(field)&&field.type==='radio'&&field.name===control.name)clearNativeValidation(field);
});
document.addEventListener('reset',event=>{if(event.target instanceof HTMLFormElement)for(const field of event.target.elements)if(isControl(field))clearNativeValidation(field);});
