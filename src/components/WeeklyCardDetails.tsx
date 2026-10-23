import type {ReactNode} from 'react';

/** 静态定稿与编辑卡片共用；开关由 meeting-layout 委托。 */
export default function WeeklyCardDetails({children,label='查看明细',variant='details'}:{children:ReactNode;label?:string;variant?:'details'|'info'}) {
  const popoverProps={popover:'auto'};
  return <div className={variant==='info'?'weekly-card-reference':'weekly-card-source'}>
    <button type="button" className="weekly-detail-trigger" aria-label={label} aria-expanded="false">{variant==='info'?<span aria-hidden="true">ⓘ</span>:label}</button>
    <div className="weekly-detail-popover" {...popoverProps} role="region" aria-label={label}>{children}</div>
  </div>;
}
