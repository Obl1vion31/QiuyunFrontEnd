export const subjects = [
  { id: 'tmua', name: 'TMUA' },
  { id: 'step', name: 'STEP' },
  { id: 'interview', name: '面试课' },
] as const;

export const postCategories = [
  { id: 'small-class-or-tutoring', name: '小班课和一对一' },
  { id: 'promotional-handout', name: '推广讲义帖' },
  { id: 'large-class', name: '正式大班' },
  { id: 'mock-exam', name: '模考' },
  { id: 'intensive-course', name: '冲刺班' },
  { id: 'success-story', name: '成功案例' },
  { id: 'non-promotional-handout', name: '非推广讲义帖' },
  { id: 'exam-information', name: '考试信息' },
  { id: 'first-analysis-series', name: '第一时间解析帖集' },
  { id: 'score-release-celebration', name: '喜报' },
  { id: 'exam-guide', name: '备考须知' },
  { id: 'innovation', name: '创新帖' },
  { id: 'interview-course', name: '面试课' },
  { id: 'interview-information', name: '面试信息' },
  { id: 'interview-preparation-guide', name: '面试准备须知' },
] as const;

export const subjectCategoryMappings = [
  ...postCategories
    .filter((category) => !category.id.startsWith('interview-'))
    .map((category) => ({ subjectId: 'tmua' as const, categoryId: category.id })),
  ...postCategories
    .filter((category) => category.id !== 'intensive-course' && !category.id.startsWith('interview-'))
    .map((category) => ({ subjectId: 'step' as const, categoryId: category.id })),
  ...[
    'interview-course',
    'promotional-handout',
    'success-story',
    'score-release-celebration',
    'interview-information',
    'interview-preparation-guide',
    'innovation',
  ].map((categoryId) => ({ subjectId: 'interview' as const, categoryId })),
] as const;

export type SubjectId = typeof subjects[number]['id'];
export type PostCategoryId = typeof postCategories[number]['id'];

export const categoryBelongsToSubject = (categoryId: string, subjectId: string) => (
  subjectCategoryMappings.some((mapping) => mapping.categoryId === categoryId && mapping.subjectId === subjectId)
);

export const subjectRequiresCategory = (subjectId: string) => subjects.some((subject) => subject.id === subjectId);
