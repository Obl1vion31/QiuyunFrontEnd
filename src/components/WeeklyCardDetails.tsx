import type {ReactNode} from 'react';

/** 静态定稿与编辑卡片共用；开关由 meeting-layout 委托。 */
export default function WeeklyCardDetails({children,label='查看明细',variant='details'}:{children:ReactNode;label?:string;variant?:'details'|'info'}) {
  const popoverProps={popover:'auto'};
  return <div className={variant==='info'?'weekly-card-reference business-post-reference':'weekly-card-source'} data-business-popover data-popover-kind={variant==='info'?'reference':'details'} data-popover-boundary=".weekly-stage-card">
    <button type="button" className={variant==='info'?'weekly-detail-trigger business-reference-trigger':'weekly-detail-trigger'} data-popover-trigger aria-label={label} aria-expanded="false">{variant==='info'?<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 10.5v7M12 6.5v1"/></svg>:label}</button>
    <div className="weekly-detail-popover" data-popover-panel {...popoverProps} role="region" aria-label={label}>{children}</div>
  </div>;
}
