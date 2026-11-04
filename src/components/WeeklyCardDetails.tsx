import React,{type ReactNode} from 'react';

/** 静态定稿与编辑卡片共用；开关由 meeting-layout 委托。 */
export default function WeeklyCardDetails({children,label='查看明细',variant='details',boundary='.weekly-stage-card',triggerContent,readOnly=false}:{children:ReactNode;label?:string;variant?:'details'|'info';boundary?:string;triggerContent?:ReactNode;readOnly?:boolean}) {
  const popoverProps={popover:'auto'};
  const triggerProps={className:variant==='info'?'weekly-detail-trigger business-reference-trigger':'weekly-detail-trigger','data-popover-trigger':true,'aria-label':label,'aria-expanded':false as const};
  const content=variant==='info'?<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 10.5v7M12 6.5v1"/></svg>:triggerContent??label;
  return <div className={variant==='info'?'weekly-card-reference business-post-reference':'weekly-card-source'} data-business-popover data-popover-kind={variant==='info'?'reference':'details'} data-popover-boundary={boundary}>
    {/* 只读资料不随编辑fieldset禁用；不使用href，避免触发站内导航与未保存保护。 */}
    {readOnly||variant==='info'?<span role="button" tabIndex={0} {...triggerProps} onKeyDown={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();e.currentTarget.click();}}}>{content}</span>:<button type="button" {...triggerProps}>{content}</button>}
    <div className="weekly-detail-popover" data-popover-panel {...popoverProps} role="region" aria-label={label}>{children}</div>
  </div>;
}
