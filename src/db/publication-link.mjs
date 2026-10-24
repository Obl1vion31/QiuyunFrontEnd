/** 浏览器与服务端共用；只解析文字，不请求第三方网站。 */
export function extractPublicationLink(text) {
  const links = new Set();
  for (const match of String(text ?? '').matchAll(/https?:\/\/[^\s<>"'`\u0080-\uffff]+/gi)) {
    const candidate = match[0].replace(/[.,;:!?)[\]{}]+$/, '');
    try {
      const url = new URL(candidate);
      const long = ['xiaohongshu.com', 'www.xiaohongshu.com'].includes(url.hostname)
        && /^\/(?:explore|discovery\/item)\/[0-9a-fA-F]{24}\/?$/.test(url.pathname);
      const short = ['xhslink.cn', 'www.xhslink.cn', 'xhslink.com', 'www.xhslink.com'].includes(url.hostname)
        && /^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\/?$/.test(url.pathname);
      if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.port && (long || short)) links.add(candidate);
    } catch { /* 其他文字由下方统一反馈。 */ }
  }
  if (links.size > 1) return { url: '', error: '识别到多个小红书链接，请只保留这一篇帖子的链接。' };
  if (!links.size) return { url: '', error: '请粘贴有效的小红书帖子链接或完整分享文案。' };
  return { url: [...links][0], error: '' };
}
