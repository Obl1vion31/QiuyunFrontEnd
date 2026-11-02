export {};
let cleanup:(()=>void)|undefined;
function initialize(){
 cleanup?.();const root=document.querySelector<HTMLElement>('[data-usage-guide]');if(!root)return;
 const sections=[...root.querySelectorAll<HTMLElement>('[data-guide-section]')],links=[...root.querySelectorAll<HTMLAnchorElement>('[data-guide-link]')],mobile=root.querySelector<HTMLElement>('[data-guide-mobile]')!,panel=root.querySelector<HTMLElement>('#guide-directory-menu')!,current=root.querySelector<HTMLElement>('[data-guide-current]')!,toolbar=document.querySelector<HTMLElement>('.business-toolbar')!;
 const base=new URL(location.href);base.hash='';const events=new AbortController(),previousRestoration=history.scrollRestoration;history.scrollRestoration='manual';let frame=0,navigationFrame=0,requested:HTMLElement|undefined;
 const find=(hash:string)=>sections.find(section=>'#'+section.id===hash);
 const offset=()=>toolbar.getBoundingClientRect().bottom+(getComputedStyle(mobile).display!=='none'?mobile.offsetHeight:0)+20;
 const select=(section:HTMLElement)=>{for(const link of links)if(link.hash==='#'+section.id)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');current.textContent=section.querySelector('h2')!.textContent;root.dataset.guideActive=section.id;};
 const update=()=>{frame=0;const line=offset();root.style.setProperty('--guide-scroll-offset',line+'px');let active=sections[0];for(const section of sections)if(section.getBoundingClientRect().top<=line+8)active=section;if(scrollY+innerHeight>=document.documentElement.scrollHeight-2)active=requested&&requested.getBoundingClientRect().top>line+8?requested:sections.at(-1)!;select(active);};
 const queue=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(update);};
 const restore=()=>{cancelAnimationFrame(navigationFrame);navigationFrame=requestAnimationFrame(()=>go(find(location.hash)));};
 const go=(section:HTMLElement|undefined,smooth=false)=>{requested=section;update();if(section){select(section);section.querySelector<HTMLElement>('h2')?.focus({preventScroll:true});}window.scrollTo({top:section?Math.max(0,scrollY+section.getBoundingClientRect().top-offset()):0,behavior:smooth&&!matchMedia('(prefers-reduced-motion:reduce)').matches?'smooth':'instant'});queue();};
 root.addEventListener('click',event=>{const link=(event.target as Element).closest<HTMLAnchorElement>('[data-guide-link]');if(!link||event instanceof MouseEvent&&(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey))return;const target=find(link.hash);if(!target)return;event.preventDefault();event.stopPropagation();if(panel.matches(':popover-open'))panel.hidePopover();if(location.hash!==link.hash)history.pushState({...history.state},'',link.href);go(target,true);},{signal:events.signal});
 // 文档捕获同时覆盖页面与原生气泡滚动；观察器补齐布局变化后的章节判断。
 document.addEventListener('scroll',queue,{capture:true,passive:true,signal:events.signal});window.addEventListener('resize',()=>{requested=undefined;queue();},{signal:events.signal});window.addEventListener('hashchange',queue,{signal:events.signal});
 // 公共草稿保护先执行，本页只接管同一说明页的章节历史。
 document.addEventListener('business:local-history-pop',event=>{const url=new URL(location.href);url.hash='';if(url.href!==base.href)return;event.preventDefault();restore();},{signal:events.signal});
 const interrupt=()=>{requested=undefined;queue();};document.addEventListener('wheel',interrupt,{capture:true,passive:true,signal:events.signal});document.addEventListener('touchstart',interrupt,{capture:true,passive:true,signal:events.signal});document.addEventListener('pointerdown',event=>{if(!(event.target as Element).closest('[data-guide-link],[data-popover-trigger]'))interrupt();},{capture:true,signal:events.signal});document.addEventListener('keydown',event=>{if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key))interrupt();},{capture:true,signal:events.signal});
 const size=new ResizeObserver(queue);size.observe(toolbar);size.observe(mobile);const visible=new IntersectionObserver(queue,{threshold:[0,1]});for(const section of sections)visible.observe(section);
 update();if(find(location.hash))restore();
 cleanup=()=>{events.abort();size.disconnect();visible.disconnect();cancelAnimationFrame(frame);cancelAnimationFrame(navigationFrame);history.scrollRestoration=previousRestoration;if(panel.matches(':popover-open'))panel.hidePopover();};
}
document.addEventListener('astro:page-load',initialize);document.addEventListener('astro:before-swap',()=>{cleanup?.();cleanup=undefined;});initialize();
