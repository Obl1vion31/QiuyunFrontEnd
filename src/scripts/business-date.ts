/** 工作台完整时间统一按上海时区呈现；业务日期键及原生控件值不作转换。 */
const timestamp = new Intl.DateTimeFormat('sv-SE', {
  timeZone:'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit',
  hour:'2-digit', minute:'2-digit', hourCycle:'h23',
});
export const businessDateTime = (value: Date | string) => timestamp.format(new Date(value));
export const businessDate = (value: Date|string) => businessDateTime(value).slice(0,10);
/** 原因记录按所属排期的自然日期命名，不暴露计时实现。 */
export const delayDayLabel = (planned:Date|string,due:Date|string) => {
  const days=Math.max(0,Math.round((Date.parse(businessDate(due))-Date.parse(businessDate(planned)))/86400000));
  return days===0?'当日延期':`已延期${['','一','两','三','四','五','六','七','八','九','十'][days]??days}天`;
};
