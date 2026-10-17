/** 共享侧栏会跨页面保留；仅建立一组监听，页面不可见时停止轮询。 */
let busy = false;
async function refresh() {
  if (busy || document.hidden || !document.querySelector('[data-schedule-notifications]')) return;
  busy = true;
  try {
    const response = await fetch('/api/business-notifications', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error('notification-unavailable');
    const data = await response.json();
    document.querySelectorAll<HTMLElement>('[data-schedule-count]').forEach(node => { node.textContent = String(data[node.dataset.scheduleCount!] ?? 0); });
    const status = document.querySelector('[data-schedule-notification-status]');
    if(status)status.textContent='';
    document.querySelector('[data-schedule-count=overdue]')?.closest('a')?.setAttribute('aria-label', `尚未登记 ${data.overdue ?? 0} 篇`);
    const link = document.querySelector<HTMLElement>('[data-module-id="schedule"]');
    if (link) {
      let badge = link.querySelector<HTMLElement>('[data-mobile-overdue-count]');
      if (!badge) { badge = document.createElement('b'); badge.dataset.mobileOverdueCount = ''; link.append(badge); }
      badge.hidden = !data.overdue; badge.textContent = String(data.overdue ?? 0); badge.setAttribute('aria-label', `${data.overdue ?? 0} 篇尚未登记`);
    }
    document.dispatchEvent(new CustomEvent('business:notifications-updated', { detail: data }));
  } catch {
    const status = document.querySelector('[data-schedule-notification-status]');
    if (status) status.textContent = '提醒暂不可用，稍后重试';
  } finally { busy = false; }
}
document.addEventListener('astro:page-load', refresh);
document.addEventListener('visibilitychange', refresh);
document.addEventListener('business:workflow-updated', refresh);
window.addEventListener('focus', refresh);
window.setInterval(refresh, 60_000);
refresh();
