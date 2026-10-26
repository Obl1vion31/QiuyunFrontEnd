/** 同一行的 ID、当日状态与例会安排编辑共用离开保护。 */
const editors = new Map<string, () => Promise<boolean>>();
let preparing = false;
export const registerPromotionEditor = (name: string, dismiss: () => Promise<boolean>) => editors.set(name, dismiss);
export async function preparePromotionEditor(name: string) {
  if (preparing) return false;
  preparing = true;
  try {
    for (const [other, dismiss] of editors) if (other !== name && !await dismiss()) return false;
    return true;
  } finally { preparing = false; }
}
