/** 连接检查摘要；仅保存安全结果，不保存报表行或凭据。 */
export interface JuguangCheck {
  checkedAt: string;
  status: 'ok' | 'partial' | 'failed' | 'reauthorize';
  accounts: Array<{ advertiserId: number; status: 'ok' | 'error' | 'reauthorize'; code: string; message: string }>;
}

/** 凭据续期结果与报表检查分开，失败只保存安全错误。 */
export interface JuguangRenewal {
  checkedAt: string;
  status: 'ok' | 'error' | 'reauthorize';
  code: string;
  message: string;
}
