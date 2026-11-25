import type { Post } from './model';

export const previewPosts: Post[] = [
  {
    id: 'course-post', title: '试用样例 · 课程答疑与试听', subject: '测试学科 A', type: '非推广',
    note: 'aaaaaaaaaaaaaaaaaaaaaaaa', published: '2026-10-20T18:00', versions: ['V0', 'V1'],
    short: 'https://xhslink.com/a/PreviewCourse',
  },
  {
    id: 'handout-post', title: '试用样例 · 讲义内容与用法', subject: '测试学科 A', type: '推广',
    note: 'bbbbbbbbbbbbbbbbbbbbbbbb', published: '2026-10-21T20:00', versions: ['V0'],
    short: 'https://xhslink.com/a/PreviewHandout',
    promotion: { name: '样例推广 · 讲义引流', stage: '放量中' },
  },
  {
    id: 'mock-post', title: '试用样例 · 模考安排说明', subject: '测试学科 B', type: '非推广',
    note: 'cccccccccccccccccccccccc', published: '2026-11-05T18:00', versions: ['V0'],
    short: 'https://xhslink.com/a/PreviewMock',
  },
];
