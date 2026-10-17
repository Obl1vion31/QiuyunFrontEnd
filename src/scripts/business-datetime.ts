/** 日期与分钟拆分录入，原字段仍提交上海本地时间字符串；不引入时区转换。 */
type Configuration = { value?: string; required?: boolean; disabled?: boolean; readOnly?: boolean };
const fields = (group: HTMLElement) => ({
  date: group.querySelector<HTMLInputElement>('[data-datetime-date]')!,
  time: group.querySelector<HTMLInputElement>('[data-datetime-time]')!,
  value: group.querySelector<HTMLInputElement>('[data-datetime-value]')!,
});
const synchronize = (group: HTMLElement) => {
  const { date, time, value } = fields(group);
  value.value = date.value && time.value ? `${date.value}T${time.value.slice(0,5)}` : '';
};
export const configureDateTimeField = (group: HTMLElement, configuration: Configuration) => {
  const { date, time, value } = fields(group);
  if (configuration.value !== undefined) {
    const [day = '', clock = ''] = configuration.value.split('T');
    date.value = day; time.value = clock.slice(0,5); value.value = configuration.value;
  }
  for (const control of [date, time]) {
    if (configuration.required !== undefined) control.required = configuration.required;
    if (configuration.disabled !== undefined) control.disabled = configuration.disabled;
    if (configuration.readOnly !== undefined) control.readOnly = configuration.readOnly;
  }
  if (configuration.disabled !== undefined) value.disabled = configuration.disabled;
};
const groupFor = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>('[data-datetime-field]') : null;
// 捕获阶段先同步，业务表单的校验、状态预览和逐日理由读取仍获得同一个原字段。
for (const type of ['input','change']) document.addEventListener(type, event => {
  if(!(event.target instanceof Element)||!event.target.matches('[data-datetime-date],[data-datetime-time]'))return;
  const group = groupFor(event.target); if(!group)return;
  const value=fields(group).value, previous=value.value;
  synchronize(group);
  // 某些原生选择器只触发 change，继续让原表单获得输入、dirty 和联动反馈。
  if(type==='change'&&value.value!==previous)value.dispatchEvent(new Event('input',{bubbles:true}));
}, true);
document.addEventListener('submit', event => {
  if (event.target instanceof HTMLFormElement) event.target.querySelectorAll<HTMLElement>('[data-datetime-field]').forEach(synchronize);
}, true);
document.addEventListener('business:datetime-configure', event => {
  const group = groupFor(event.target); if (group) configureDateTimeField(group, (event as CustomEvent<Configuration>).detail);
}, true);
