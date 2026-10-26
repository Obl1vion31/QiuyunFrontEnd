import {preparePromotionEditor,registerPromotionEditor} from './promotion-editor-lifecycle';
import { businessConfirm } from './business-dialog';
let popup: HTMLFormElement | null = null;
let source: HTMLFormElement | null = null;
let opener: HTMLButtonElement | null = null;
const position = () => { if (!popup || !opener)
    return; const r = opener.getBoundingClientRect(); popup.style.left = `${Math.max(12, Math.min(r.left, innerWidth - 332))}px`; popup.style.top = `${Math.max(12, Math.min(r.bottom + 8, innerHeight - popup.offsetHeight - 12))}px`; };
async function close() { if (popup?.dataset.dirty === 'true' && !await businessConfirm('笔记 ID 尚未确认，是否放弃此次输入？', { title: '保留 ID 输入', confirmLabel: '放弃输入', cancelLabel: '继续编辑' }))
    return false; popup?.remove(); popup = null; opener?.focus({ preventScroll: true }); opener?.setAttribute('aria-expanded', 'false'); document.documentElement.dataset.unsaved = String(!!document.querySelector('form[data-dirty=true]')); return true; }
export const dismissNoteId = () => close();
registerPromotionEditor('note',close);
export async function openNoteId(form: HTMLFormElement, errorMessage = '') {
    if(!await preparePromotionEditor('note'))return;
    if (popup) {
        if (source === form) {
            popup.querySelector('input')?.focus();
            return;
        }
        void close().then(() => { if (!popup)
            openNoteId(form); });
        return;
    }
    document.dispatchEvent(new Event('business:note-id-open'));
    source = form;
    opener = form.querySelector('[data-reference-trigger]');
    form.querySelector<HTMLElement>('[data-popover-panel]')?.hidePopover();
    if (!opener)
        return;
    const field = form.elements.namedItem('platformNoteId') as HTMLInputElement;
    const el = document.createElement('form');
    el.className = 'business-form review-state-bubble review-note-bubble';
    el.setAttribute('aria-label','补填笔记 ID');
    el.innerHTML = '<header><strong>笔记 ID</strong><button type="button" data-close class="review-state-close" aria-label="关闭笔记 ID">×</button></header><div class="review-bubble-body"><label>小红书笔记 ID<input name="noteId" aria-label="笔记 ID" minlength="24" maxlength="64" pattern="[0-9A-Fa-f]{24}" required autocomplete="off"/></label><p class="review-note-hint"></p><output role="status"></output></div><footer><button type="button" data-cancel class="business-action-secondary">取消</button><button type="submit" class="business-action-primary"></button></footer>';
    const input = el.querySelector('input')!, submit = el.querySelector<HTMLButtonElement>('[type=submit]')!;
    input.value = field.value;
    submit.textContent = '确认 ID';
    el.querySelector('.review-note-hint')!.textContent = '确认后随本行复盘一起保存。';
    el.querySelector('output')!.textContent = errorMessage;
    document.body.append(el);
    popup = el;
    opener.setAttribute('aria-expanded', 'true');
    position();
    input.focus();
    el.querySelector('[data-close]')!.addEventListener('click', () => void close());
    el.querySelector('[data-cancel]')!.addEventListener('click', () => void close());
    el.addEventListener('keydown', event => { if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        void close();
    } });
    el.addEventListener('input', () => { el.dataset.dirty = String(input.value !== field.value); document.documentElement.dataset.unsaved = 'true'; });
    el.addEventListener('submit', async (event) => {
        event.preventDefault();
        input.value = input.value.trim().toLowerCase();
        if (!el.reportValidity())
            return;
        form.dispatchEvent(new CustomEvent('business:note-id-draft', { detail: { contentId: form.dataset.contentId, value: input.value.trim().toLowerCase() } }));
        el.dataset.dirty = 'false';
        await close();
    });
}
window.addEventListener('resize', position);
window.addEventListener('scroll', position, true);
document.addEventListener('pointerdown', event => { if (popup && !popup.contains(event.target as Node) && !opener?.contains(event.target as Node) && !(event.target as Element).closest('[data-business-popover]'))
    void close(); });
document.addEventListener('astro:before-swap', () => { popup?.remove(); popup = null; source = null; });
