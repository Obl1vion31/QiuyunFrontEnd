/** 暂停动作沿用共享忙碌反馈；表单重复提交使用相同请求键。 */
let refreshTimer: ReturnType<typeof setInterval> | undefined;
let pageHasDraft = false;
document.addEventListener('input', event => {
  if (event.target instanceof Element && event.target.closest('form')) pageHasDraft = true;
});
function initializePromotionPauses() {
  clearInterval(refreshTimer);
  pageHasDraft = false;
  const panel = document.querySelector<HTMLElement>('[data-promotion-pause]');
  if (panel) refreshTimer = setInterval(async () => {
    if (document.visibilityState !== 'visible') return;
    try {
      const response = await fetch('/api/promotion-pauses');
      if (!response.ok) return;
      const summary = await response.json();
      if (!panel.isConnected) return;
      if (`${summary.active?.id ?? ''}:${summary.active?.revision ?? ''}` === panel.dataset.pauseState) return;
      if (!pageHasDraft && !panel.contains(document.activeElement)) { window.location.reload(); return; }
      const output = panel.querySelector('output');
      if (output) output.textContent = '团队暂停安排已更新。当前输入已保留，保存后刷新查看。';
    } catch { /* 下次可见轮询重试，不打断业务表单。 */ }
  }, 60000);
  document.querySelectorAll<HTMLFormElement>('[data-pause-form]:not([data-pause-ready])').forEach(form => {
    form.dataset.pauseReady = 'true';
    const requestKey = crypto.randomUUID();
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const buttons = [...form.querySelectorAll<HTMLButtonElement>('button')];
      if (buttons.some(button => button.disabled)) return;
      const output = form.querySelector('output')!;
      const data = new FormData(form);
      const submitter = event.submitter as HTMLButtonElement | null;
      if (submitter?.name) data.set(submitter.name, submitter.value);
      data.set('requestKey', requestKey);
      buttons.forEach(button => button.disabled = true);
      output.textContent = data.get('action') === 'resume' ? '正在恢复…' : '正在更新暂停安排…';
      try {
        const id = form.dataset.pauseId;
        const response = await fetch(id ? `/api/promotion-pauses/${id}` : '/api/promotion-pauses', { method: id ? 'PATCH' : 'POST', body: data });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message ?? '保存失败，请重试。');
        window.location.reload();
      } catch (error) { output.textContent = error instanceof Error ? error.message : '连接失败，请重试。'; }
      finally { buttons.forEach(button => button.disabled = false); }
    });
  });
}
initializePromotionPauses();
document.addEventListener('astro:page-load', initializePromotionPauses);
