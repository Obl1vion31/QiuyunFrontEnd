/** 浏览器只提交凭据，不持久保存密码或令牌。 */
export async function signIn(username: string, password: string) {
  try {
    const response = await fetch('/api/auth/sign-in/username', { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: username.trim().toLowerCase(), password }),
      signal: AbortSignal.timeout(15000) });
    if (response.ok) return { ok: true, message: '' };
    if (response.status === 422) {
      // 只翻译已知校验代码，不向页面透传服务端错误详情。
      const error = await response.json().catch(() => null);
      const message = error?.code === 'USERNAME_TOO_SHORT' ? '账号名至少需要 3 个字符，请使用管理员提供的登录账号。'
        : error?.code === 'USERNAME_TOO_LONG' ? '账号名不能超过 30 个字符，请检查登录账号。'
          : error?.code === 'INVALID_USERNAME' ? '账号格式不正确，请使用管理员提供的登录账号。'
            : '账号或密码的填写格式不正确，请检查后重试。';
      return { ok: false, message };
    }
    const message = response.status === 401 ? '账号或密码不正确，请重新输入。'
      : response.status === 429 ? '尝试次数较多，请稍等一分钟后重试。'
        : response.status === 403 ? '登录请求被拒绝，请刷新页面或联系管理员确认账号状态。'
          : response.status === 400 ? '请检查账号和密码后重试。' : '登录服务暂时不可用，请稍后重试。';
    return { ok: false, message };
  } catch { return { ok: false, message: '连接失败，请检查网络后重试。' }; }
}

export async function signOut() {
  const response = await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('退出失败，请重试。');
}
