/** 资料与明细共用原生气泡；各消费者声明自己的锚点边界。 */
let cleanup:(()=>void)|undefined;
let sequence=0;
function initialize(){
  cleanup?.();
  let active:HTMLElement|null=null, trigger:HTMLButtonElement|null=null, frame=0,hideTimer=0,pinned=false,restoringFocus=false;
  const restoreFocus=(button:HTMLButtonElement)=>{restoringFocus=true;button.focus({preventScroll:true});restoringFocus=false;};
  const position=()=>{
    if(!active?.matches(':popover-open')||!trigger)return;
    const anchor=trigger.getBoundingClientRect(),group=trigger.closest<HTMLElement>('[data-business-popover]')!,card=group.dataset.popoverBoundary?trigger.closest(group.dataset.popoverBoundary)?.getBoundingClientRect():null;
    if(anchor.bottom<0||anchor.top>innerHeight||!trigger.getClientRects().length){active.hidePopover();return;}
    const info=group.dataset.popoverKind==='reference';
    const width=Math.min(info?Math.min(340,card?card.width-32:340):card?card.width-32:340,innerWidth-24),below=innerHeight-anchor.bottom-20,above=anchor.top-20;
    const up=below<160&&above>below,available=Math.max(0,up?above:below);
    active.style.width=width+'px';active.style.maxHeight=Math.min(360,available)+'px';
    const left=card?(info?Math.max(card.left+16,Math.min(anchor.left,card.right-16-width)):card.left+16):anchor.left;
    active.style.left=Math.max(12,Math.min(left,innerWidth-width-12))+'px';
    active.style.top=(up?Math.max(12,anchor.top-8-active.getBoundingClientRect().height):anchor.bottom+8)+'px';
  };
  const follow=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(position);};
  const open=(button:HTMLButtonElement,pin:boolean)=>{
    clearTimeout(hideTimer);
    const panel=button.nextElementSibling as HTMLElement;
    if(active===panel&&panel.matches(':popover-open')){pinned ||=pin;return;}
    if(active?.matches(':popover-open'))active.hidePopover();trigger=button;active=panel;pinned=pin;
    const feedback=panel.querySelector<HTMLOutputElement>('[data-reference-message]');if(feedback)feedback.textContent='';
    if(!panel.id)panel.id=`business-popover-${++sequence}`;
    button.setAttribute('popovertarget',panel.id);button.setAttribute('aria-controls',panel.id);button.setAttribute('aria-expanded','true');
    panel.showPopover();position();
  };
  const click=(event:MouseEvent)=>{
    const copy=(event.target as Element).closest<HTMLButtonElement>('[data-copy-note-id]');
    if(copy){event.preventDefault();const panel=copy.closest<HTMLElement>('[data-popover-panel]')!,value=panel.querySelector<HTMLElement>('[data-reference-note-id]')!,out=panel.querySelector<HTMLOutputElement>('[data-reference-message]')!;void Promise.resolve().then(()=>navigator.clipboard.writeText(value.textContent??'')).then(()=>{out.textContent='已复制';position();}).catch(()=>{const range=document.createRange();range.selectNodeContents(value);getSelection()?.removeAllRanges();getSelection()?.addRange(range);out.textContent='请选择并复制 ID。';position();});return;}

    const button=(event.target as Element).closest<HTMLButtonElement>('[data-popover-trigger]');
    if(!button)return;event.preventDefault();
    const panel=button.nextElementSibling as HTMLElement;
    if(active===panel&&panel.matches(':popover-open')&&pinned){panel.hidePopover();return;}
    open(button,true);
  };
  const enter=(event:PointerEvent|FocusEvent)=>{
    const group=(event.target as Element).closest?.('[data-business-popover][data-popover-kind=reference]');
    if(!group||restoringFocus||pinned)return;
    clearTimeout(hideTimer);open(group.querySelector<HTMLButtonElement>('[data-popover-trigger]')!,false);
  };
  const leave=(event:PointerEvent|FocusEvent)=>{
    const group=(event.target as Element).closest?.('[data-business-popover][data-popover-kind=reference]');
    if(!group||pinned||event.relatedTarget instanceof Node&&group.contains(event.relatedTarget))return;
    clearTimeout(hideTimer);hideTimer=window.setTimeout(()=>{if(!pinned&&active?.parentElement===group)active.hidePopover();},180);
  };
  const toggle=(event:Event)=>{
    const panel=event.target as HTMLElement;
    if(!panel.hasAttribute?.('data-popover-panel'))return;
    const button=panel.previousElementSibling as HTMLButtonElement;
    button.setAttribute('aria-expanded',String(panel.matches(':popover-open')));
    if(!panel.matches(':popover-open')&&active===panel){
      if(panel.contains(document.activeElement))restoreFocus(button);
      active=null;trigger=null;pinned=false;clearTimeout(hideTimer);
    }
  };
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&active){event.preventDefault();const button=trigger;active.hidePopover();if(button)restoreFocus(button);}};
  document.addEventListener('click',click);document.addEventListener('toggle',toggle,true);
  document.addEventListener('pointerover',enter);document.addEventListener('pointerout',leave);
  document.addEventListener('focusin',enter);document.addEventListener('focusout',leave);
  document.addEventListener('keydown',key);window.addEventListener('scroll',follow,true);window.addEventListener('resize',follow);
  cleanup=()=>{if(active?.matches(':popover-open'))active.hidePopover();clearTimeout(hideTimer);cancelAnimationFrame(frame);document.removeEventListener('click',click);document.removeEventListener('toggle',toggle,true);document.removeEventListener('pointerover',enter);document.removeEventListener('pointerout',leave);document.removeEventListener('focusin',enter);document.removeEventListener('focusout',leave);document.removeEventListener('keydown',key);window.removeEventListener('scroll',follow,true);window.removeEventListener('resize',follow);};
}
document.addEventListener('astro:page-load',initialize);
document.addEventListener('astro:before-swap',()=>cleanup?.());
initialize();
