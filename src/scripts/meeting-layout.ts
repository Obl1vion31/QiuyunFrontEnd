/** 原位明细入口与非模态气泡；不测高、不改变卡片或页面滚动。 */
let cleanup:(()=>void)|undefined;
let sequence=0;
function initialize(){
  cleanup?.();
  let active:HTMLElement|null=null, trigger:HTMLButtonElement|null=null, frame=0;
  const position=()=>{
    if(!active?.matches(':popover-open')||!trigger)return;
    const anchor=trigger.getBoundingClientRect(),card=trigger.closest('.weekly-stage-card')!.getBoundingClientRect();
    if(anchor.bottom<0||anchor.top>innerHeight||!trigger.getClientRects().length){active.hidePopover();return;}
    const width=Math.min(card.width-32,innerWidth-24),below=innerHeight-anchor.bottom-20,above=anchor.top-20;
    const up=below<160&&above>below,available=Math.max(0,up?above:below);
    active.style.width=width+'px';active.style.maxHeight=Math.min(360,available)+'px';
    active.style.left=Math.max(12,Math.min(card.left+16,innerWidth-width-12))+'px';
    active.style.top=(up?Math.max(12,anchor.top-8-active.getBoundingClientRect().height):anchor.bottom+8)+'px';
  };
  const follow=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(position);};
  const click=(event:MouseEvent)=>{
    const button=(event.target as Element).closest<HTMLButtonElement>('.weekly-detail-trigger');
    if(!button)return;event.preventDefault();
    const panel=button.nextElementSibling as HTMLElement;
    if(panel.matches(':popover-open')){panel.hidePopover();return;}
    trigger=button;active=panel;
    if(!panel.id)panel.id=`weekly-detail-${++sequence}`;
    button.setAttribute('popovertarget',panel.id);button.setAttribute('aria-controls',panel.id);button.setAttribute('aria-expanded','true');
    panel.showPopover();position();
  };
  const toggle=(event:Event)=>{
    const panel=event.target as HTMLElement;
    if(!panel.classList?.contains('weekly-detail-popover'))return;
    const button=panel.previousElementSibling as HTMLButtonElement;
    button.setAttribute('aria-expanded',String(panel.matches(':popover-open')));
    if(!panel.matches(':popover-open')&&active===panel){
      if(panel.contains(document.activeElement))button.focus({preventScroll:true});
      active=null;trigger=null;
    }
  };
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&active)trigger?.focus({preventScroll:true});};
  document.addEventListener('click',click);document.addEventListener('toggle',toggle,true);
  document.addEventListener('keydown',key);window.addEventListener('scroll',follow,true);window.addEventListener('resize',follow);
  cleanup=()=>{active?.hidePopover();cancelAnimationFrame(frame);document.removeEventListener('click',click);document.removeEventListener('toggle',toggle,true);document.removeEventListener('keydown',key);window.removeEventListener('scroll',follow,true);window.removeEventListener('resize',follow);};
}
document.addEventListener('astro:page-load',initialize);
document.addEventListener('astro:before-swap',()=>cleanup?.());
initialize();
