export const contentRoles=['score_analysis','celebration','notice','question_analysis','content_preview','score_prediction','engagement'] as const;
export type ContentRole=typeof contentRoles[number];
export const contentRoleLabels:Record<ContentRole,string>={score_analysis:'分数线解析',celebration:'喜报',notice:'通知提醒',question_analysis:'试题解析',content_preview:'内容预判',score_prediction:'分数线预测',engagement:'引流互动'};
export const categoryContentRoles:Record<string,readonly ContentRole[]>={'score-release-collection':['score_analysis','celebration','notice'],'first-analysis-series':['question_analysis','content_preview','score_prediction','engagement']};
export const rolesForCategory=(categoryId:string|null|undefined)=>categoryContentRoles[categoryId??'']??[];
export const roleIsComparable=(post:{categoryId:string|null;contentRole?:string|null})=>!rolesForCategory(post.categoryId).length||!!post.contentRole&&rolesForCategory(post.categoryId).includes(post.contentRole as ContentRole);
export const sameNonPromotionCohort=(a:{subjectId:string;categoryId:string|null;contentRole?:string|null},b:typeof a)=>a.subjectId===b.subjectId&&a.categoryId===b.categoryId&&roleIsComparable(a)&&roleIsComparable(b)&&(!rolesForCategory(a.categoryId).length||a.contentRole===b.contentRole);
export const nonPromotionGroupKey=(post:{subjectId:string;categoryId:string|null;contentRole?:string|null})=>`${post.subjectId}:${post.categoryId??'temporary'}${rolesForCategory(post.categoryId).length?':'+(post.contentRole??'unassigned'):''}`;
export const contentRoleLabel=(role:string|null|undefined)=>contentRoleLabels[role as ContentRole]??'待归类';
