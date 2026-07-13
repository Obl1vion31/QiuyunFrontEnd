export type LinkStatus = 'external' | 'placeholder' | 'restricted';

export interface CoverItem {
  id: string;
  label: string;
  caption: string;
  tone: 'blue' | 'orange' | 'mint' | 'yellow' | 'coral' | 'ink';
  image?: string;
}

export interface WorkflowStage {
  id: string;
  label: string;
  verb: string;
  description: string;
}

export interface SystemEntry {
  id: string;
  eyebrow: string;
  title: string;
  summary: string;
  cta: string;
  status: LinkStatus;
  href?: string;
}

export const homeContent = {
  meta: {
    title: '前端内容总控台',
    description: '贯穿策划、内容、视觉、发布、用户触点与复盘的前端工作流总枢纽。',
    updatedAt: '2026/07/13',
  },

  hero: {
    eyebrow: 'FRONTEND CONTENT WORKSPACE',
    title: '前端内容工作台',
    statement: ['让用户愿意点击', '让用户愿意读且阅读完', '让用户愿意进一步了解与咨询'],
    note: '串联策划、内容、视觉、发布、用户触点与复盘的一体化工作平台。',
    scrollHint: '滚动，查看内容工作流',
  },

  covers: [
    { id: 'cover-plan', label: '内容策划', caption: '把一个想法变成清晰选题', tone: 'blue' },
    { id: 'cover-read', label: '阅读体验', caption: '让复杂信息更容易读完', tone: 'yellow' },
    { id: 'cover-visual', label: '视觉设计', caption: '用封面建立第一眼吸引力', tone: 'coral' },
    { id: 'cover-publish', label: '内容发布', caption: '让内容在正确时间被看见', tone: 'orange' },
    { id: 'cover-touch', label: '用户触点', caption: '把评论与私信变成有效信号', tone: 'mint' },
    { id: 'cover-review', label: '数据复盘', caption: '让结果回到下一轮内容', tone: 'ink' },
  ] as CoverItem[],

  mission: {
    title: '让内容从想法走向反馈。',
    body: '让每一次内容触达，推进为理解、兴趣与咨询。',
    outcomes: [
      ['点击', '选题、标题与封面先获得注意力。'],
      ['读完', '结构、文字与视觉共同维持阅读。'],
      ['询问', '内容建立信任，并形成进一步了解的入口。'],
    ],
    boundary: '前端负责从“看见内容”到“产生咨询兴趣并完成有效交接”的过程；最终销售成交仍由销售侧承接。',
  },

  workflow: {
    eyebrow: 'SIX STAGES · ONE WORKFLOW',
    title: '六个环节，组成一条持续回流的工作流。',
    intro: '从策划到复盘，每个环节承接上一步的判断，也为下一轮内容积累依据。',
    stages: [
      { id: 'plan', label: '策划', verb: '判断什么值得做', description: '整理目标、热点、用户问题与历史反馈，确定优先级。' },
      { id: 'content', label: '内容', verb: '把信息讲清楚', description: '完成选题、结构、文案与阅读节奏。' },
      { id: 'visual', label: '视觉', verb: '让人愿意点开', description: '完成封面、正文排版与视觉表达。' },
      { id: 'publish', label: '发布', verb: '让内容正确抵达', description: '完成审核、发布、自然与推广流量管理。' },
      { id: 'touch', label: '触点', verb: '听见用户回应', description: '处理评论与私信，整理来源和有效用户信息。' },
      { id: 'review', label: '复盘', verb: '把结果带回起点', description: '将数据与用户反馈转化为下一轮内容调整。' },
    ] as WorkflowStage[],
  },

  systems: {
    eyebrow: 'SYSTEM ENTRANCES',
    title: '继续进入系统',
    intro: '首页负责说明方向。具体工作、人员与敏感管理内容，进入各自边界。',
    entries: [
      {
        id: 'business',
        eyebrow: '01 / WORK',
        title: '业务系统',
        summary: '计划、内容、任务、用户触点与复盘。',
        cta: '建设中',
        status: 'placeholder',
      },
      {
        id: 'people',
        eyebrow: '02 / GROWTH',
        title: '组织与人员',
        summary: '岗位、能力、SOP 与成长路径。',
        cta: '建设中',
        status: 'placeholder',
      },
      {
        id: 'performance',
        eyebrow: '03 / PRIVATE',
        title: '绩效与报酬',
        summary: '评价、激励与需要授权查看的内容。',
        cta: '授权访问',
        status: 'restricted',
      },
    ] as SystemEntry[],
  },
};
