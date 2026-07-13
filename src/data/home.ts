/**
 * 文件：data/home.ts
 *
 * 【实现需求】
 * 集中维护首页可编辑内容和展示数据，避免文案散落在 Astro、React 和 CSS 文件中。
 *
 * 【文件职责】
 * 1. 定义封面、工作流和系统入口的数据格式；
 * 2. 提供 Meta、Hero、使命、六阶段工作流和系统入口内容；
 * 3. 保存首页真实封面的公开路径。
 *
 * 【关联】
 * - pages/index.astro 读取 homeContent 并组装整张首页；
 * - components/ContentTunnel.tsx 使用 CoverItem 和 WorkflowStage 类型；
 * - public/images/home/ 保存 covers 中引用的真实图片。
 *
 * 【修改入口】
 * 修改文案、阶段、入口状态或图片路径时，优先从 homeContent 对应区块进入。
 *
 * 【安全边界】
 * 不写入生产凭据、真实员工隐私、绩效薪资或未经确认的业务结果；公开图片需先检查敏感信息。
 */

// ============================================================
// 1. 数据类型
// 【作用】限制页面可接受的数据形状，让 pnpm check 能发现字段遗漏或错误状态。
// ============================================================
export type LinkStatus = 'external' | 'placeholder' | 'restricted';

export interface CoverItem {
  id: string;
  label: string;
  caption: string;
  tone: 'blue' | 'orange' | 'mint' | 'yellow' | 'coral' | 'ink';
  // 【关联】图片放在 public/images/home/，路径必须以 /images/home/ 开头。
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

// ============================================================
// 2. 首页内容
// 【输出】index.astro 会拆分以下区块，再传给对应页面结构和 React 组件。
// ============================================================
export const homeContent = {
  // 2.1 Meta
  // 【关联】index.astro 的 <head> 使用 title/description，页脚使用 updatedAt。
  meta: {
    title: '前端内容总控台',
    description: '贯穿策划、内容、视觉、发布、用户触点与复盘的前端工作流总枢纽。',
    updatedAt: '2026/07/14',
  },

  // 2.2 Hero
  // 【关联】全部字段作为 Props 传给 ContentTunnel。
  hero: {
    eyebrow: 'FRONTEND CONTENT WORKSPACE',
    title: ['前端内容', '工作台'],
    statement: ['让用户愿意点击', '让用户愿意读且阅读完', '让用户愿意进一步了解与咨询'],
    note: '让策划、创作、发布、用户触点与复盘在同一工作台连续发生。',
    scrollHint: '滚动，查看内容工作流',
  },

  // 2.3 封面
  // 【需求】每张真实素材只创建一个循环实例；未设置 image 时显示代码备用封面。
  covers: [
    { id: 'cover-plan', label: '内容策划', caption: '把一个想法变成清晰选题', tone: 'blue', image: '/images/home/封面模板1.png' },
    { id: 'cover-read', label: '阅读体验', caption: '让复杂信息更容易读完', tone: 'yellow', image: '/images/home/封面模板2.jpg' },
    { id: 'cover-visual', label: '视觉设计', caption: '用封面建立第一眼吸引力', tone: 'coral', image: '/images/home/封面模板3.jpg' },
    { id: 'cover-publish', label: '内容发布', caption: '让内容在正确时间被看见', tone: 'orange', image: '/images/home/封面模板4.jpg' },
    { id: 'cover-touch', label: '用户触点', caption: '把评论与私信变成有效信号', tone: 'mint', image: '/images/home/封面模板5.jpg' },
    { id: 'cover-review', label: '数据复盘', caption: '让结果回到下一轮内容', tone: 'ink', image: '/images/home/封面模板6.jpg' },
    { id: 'cover-step-camp', label: 'STEP 先导营', caption: '课程招生活动封面', tone: 'blue', image: '/images/home/封面模板7.jpg' },
    { id: 'cover-step-guide', label: 'STEP 讲义', caption: '微分方程内容封面', tone: 'mint', image: '/images/home/封面模板8.jpg' },
  ] as CoverItem[],

  // 2.4 使命
  // 【关联】与 Hero 平台定位同屏显示，不再生成独立使命区块。
  mission: {
    eyebrow: 'WHY WE EXIST',
    body: '让每一次内容触达，推进为理解、兴趣与咨询。',
    boundary: '前端负责从“看见内容”到“产生咨询兴趣并完成有效交接”的过程；最终销售成交仍由销售侧承接。',
  },

  // 2.5 六阶段工作流
  // 【关联】同一 stages 数组同时驱动 Hero 轨道和 index.astro 的详细工作流。
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

  // 2.6 系统入口
  // 【修改入口】有真实地址时增加 href，并把 status 改为 external。
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
