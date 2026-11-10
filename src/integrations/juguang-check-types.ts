/** 连接检查摘要；仅保存安全结果，不保存报表行或凭据。 */
export interface JuguangCheck {
  checkedAt: string;
  status: 'ok' | 'partial' | 'failed' | 'reauthorize';
  accounts: Array<{ advertiserId: number; status: 'ok' | 'error' | 'reauthorize'; code: string; message: string }>;
}
