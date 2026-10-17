/** 工作台完整时间统一按上海时区呈现；业务日期键及原生控件值不作转换。 */
const timestamp = new Intl.DateTimeFormat('sv-SE', {
  timeZone:'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit',
  hour:'2-digit', minute:'2-digit', hourCycle:'h23',
});
export const businessDateTime = (value: Date | string) => timestamp.format(new Date(value));
