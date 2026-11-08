/** 岗位标识固定；当前职责与任职由组织模块独立维护。 */
export const positionKeys = ['supervisor', 'media', 'design', 'touchpoint'] as const;
export type PositionKey = typeof positionKeys[number];
export interface OrganizationReference { label: string; url: string }
export interface PositionContent {
  responsibilities: string;
  deliverables: string;
  collaboration: string;
  references: OrganizationReference[];
}
export const positionNames: Record<PositionKey, string> = {
  supervisor: '主管', media: '新媒体运营', design: '视觉设计', touchpoint: '用户触点运营',
};
export const initialPositions: Array<PositionContent & { key: PositionKey }> = [
  { key: 'supervisor', responsibilities: '制定年度总规划，把握整体运营方向、内容与优先级，管理团队执行，并根据复盘调整安排。', deliverables: '年度总规划、运营方向与调整决定。', collaboration: '共同管理新媒体运营、视觉设计与用户触点运营；将规划和优先级交给新媒体运营，接收执行反馈。', references: [] },
  { key: 'media', responsibilities: '根据年度总规划安排内容与任务；结合用户触点反馈和即时信息，组织帖子调整。准备项目文档与设计需求，组织视觉交付、完成视觉设计审查，负责整条内容流程并持续优化。', deliverables: '项目文档、内容与设计需求、视觉审查结果、帖子调整和流程优化方案。', collaboration: '向主管反馈执行结果；向视觉设计交付项目文档与需求，审查交付稿；接收用户触点的即时反馈并组织调整。', references: [] },
  { key: 'design', responsibilities: '根据新媒体运营提供的内容和需求完成视觉设计，交付设计稿；响应即时调整，协助新媒体运营沉淀可复用的内容与视觉经验。', deliverables: '视觉设计交付稿、修订稿、可复用的视觉与内容资料。', collaboration: '承接新媒体运营的项目文档和设计需求，交付设计稿并根据审查反馈修订。', references: [] },
  { key: 'touchpoint', responsibilities: '处理小红书评论和私信，承接用户到私域，获取并回传即时信息；与销售核对客户来源，为成本核算提供依据。', deliverables: '用户反馈、私域交接信息、经销售核对的客户来源信息。', collaboration: '将用户问题和即时信息反馈给新媒体运营；与销售核对来源并完成有效交接，最终销售成交由销售侧承接。', references: [] },
];
export interface OrganizationMember {
  id: string; name: string; username: string; role: 'admin' | 'employee'; enabled: boolean; positions: PositionKey[];
}
export interface OrganizationPosition extends PositionContent { key: PositionKey; name: string }
export interface OrganizationWorkspace { positions: OrganizationPosition[]; members: OrganizationMember[] }
