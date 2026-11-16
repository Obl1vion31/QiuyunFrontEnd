/** 与实际调用同步维护；状态说明业务消费者，不把能力目录当成已接入。 */
export const juguangInterfaces = [
  {name:'获取访问令牌',path:'/api/open/oauth2/access_token',fields:'授权账户、权限、令牌及有效期',use:'管理员完成授权后，建立本站连接',state:'正在使用'},
  {name:'刷新访问令牌',path:'/api/open/oauth2/refresh_token',fields:'更新后的令牌、有效期和授权账户',use:'后台定时自动续期；检查连接时也可按需刷新，维持已授权的报表读取',state:'正在使用'},
  {name:'笔记离线报表',path:'/api/open/jg/data/report/offline/note',fields:'消耗、推广展现、点击、私信开口人数、私信留资人数',use:'连接检查；2026-10-01起推广日度、补录及历史记录自动预览，点击保存后写入，允许人工覆盖并填写原因',state:'正在使用'},
  {name:'账户离线报表',path:'/api/open/jg/data/report/offline/account',fields:'广告账户维度的投放汇总',use:'此前用于连通性验证，当前没有推广复盘业务消费者',state:'仅历史验证'},
];
export const juguangFields = [
  {field:'fee',name:'推广消耗',use:'推广复盘的消耗；按授权账户与当天笔记 ID 汇总'},
  {field:'impression / click',name:'推广曝光量 / 点击量',use:'保存曝光、点击两个原始计数；点击率按点击量 ÷ 曝光量 × 100% 自动计算，零曝光显示 —'},
  {field:'initiative_message',name:'私信开口人数',use:'带入平台开口：广告点击后24小时内的归因人数'},
  {field:'msg_leads_num',name:'私信留资人数',use:'带入平台留资：广告点击后7天内、依赖客资标注的归因人数'},
  {field:'like / collect / comment',name:'归因点赞 / 收藏 / 评论',use:'广告归因互动，不能作为笔记全部自然互动'},
  {field:'message / message_consult',name:'私信条数 / 进线数',use:'口径与平台开口、留资人数不同，不带入这两项人数'},
];
