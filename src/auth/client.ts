/** 浏览器只提交凭据，不持久保存密码或令牌。 */
export async function signIn(username: string, password: string) {
  try {
    const response = await fetch('/api/auth/sign-in/username', { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: username.trim(), password }),
      signal: AbortSignal.timeout(15000) });
    if (response.ok) return { ok: true, message: '' };
    const message = response.status === 401 ? '账号、用户名或密码不正确，请重新输入。'
      : response.status === 429 ? '尝试次数较多，请稍等一分钟后重试。'
        : response.status === 403 ? '登录请求被拒绝，请刷新页面或联系管理员确认账号状态。'
          : (response.status === 400 || response.status === 422) ? '请检查账号或用户名和密码后重试。' : '登录服务暂时不可用，请稍后重试。';
    return { ok: false, message };
  } catch { return { ok: false, message: '连接失败，请检查网络后重试。' }; }
}

export async function signOut() {
  const response = await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('退出失败，请重试。');
}
