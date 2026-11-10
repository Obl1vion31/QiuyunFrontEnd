/** 与实际调用同步维护；状态说明业务消费者，不把能力目录当成已接入。 */
export const juguangInterfaces = [
  {name:'获取访问令牌',path:'/api/open/oauth2/access_token',fields:'授权账户、权限、令牌及有效期',use:'管理员完成授权后，建立本站连接',state:'正在使用'},
  {name:'刷新访问令牌',path:'/api/open/oauth2/refresh_token',fields:'更新后的令牌、有效期和授权账户',use:'检查连接时按需刷新，维持已授权的报表读取',state:'正在使用'},
  {name:'笔记离线报表',path:'/api/open/jg/data/report/offline/note',fields:'消耗、推广展现、点击、点击率、归因互动和私信等',use:'当前用于检查连接；已按真实笔记 ID 验证，尚未自动带入或保存推广复盘',state:'连接检查已接入'},
  {name:'账户离线报表',path:'/api/open/jg/data/report/offline/account',fields:'广告账户维度的投放汇总',use:'此前用于连通性验证，当前没有推广复盘业务消费者',state:'仅历史验证'},
];
export const juguangFields = [
  {field:'fee',name:'推广消耗',use:'供推广每日复盘的消耗核对，当前由人工录入'},
  {field:'ctr',name:'推广点击率',use:'供推广每日复盘的点击率核对，当前由人工录入'},
  {field:'impression / click',name:'推广展现 / 点击',use:'用于理解流量与核对点击率，当前不写入复盘表'},
  {field:'like / collect / comment',name:'归因点赞 / 收藏 / 评论',use:'广告归因互动，不能作为笔记全部自然互动'},
  {field:'message / message_consult',name:'私信开口条数 / 进线数',use:'与复盘“平台开口 / 平台留资”的对应口径待确认，当前不自动映射'},
];
