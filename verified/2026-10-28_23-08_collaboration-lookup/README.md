# 统一查帖与多人编辑验收

状态：已自检，待用户反馈。全部业务样本与账号为隔离 PostgreSQL 虚构夹具；没有向共享 Neon 写入验收数据，无数据库迁移。

## 查看入口

- [推广行占用](promotion-locked-1440.png)、[非推广字段姓名](nonpromotion-locked-1440.png)、[例会整场占用](meeting-whole-lock-1440.png)
- [确认接管](takeover-confirm-1440.png)、[Admin占用文案](admin-occupancy-1440.png)、[保存失败保留](save-failure-1440.png)
- [查帖结果](lookup-results-1440.png)、[详情顶部](lookup-detail-1440.png)、[详情底部](lookup-bottom-1440.png)
- [手机详情](lookup-detail-390.png)、[320px底部](lookup-bottom-320.png)、[手机触控滑动](lookup-touch-320.png)

1920／1440／1024／390／320px均保存推广、非推广与查帖详情／底部截图；390／320px另验证真实触控、账号入口与焦点返回。实际查看渲染图像及录像关键帧，修正姓名标记被公共按钮样式拉高、顶部返回按钮默认样式及窄屏日度字段拆字问题。

## 录像

- [员工输入保留完整录像](session-1.webm) · [关键帧](session-1-frames.png)
- [管理员接管及查帖完整录像](session-2.webm) · [关键帧](session-2-frames.png)
- [另一员工与例会占用完整录像](session-3.webm) · [关键帧](session-3-frames.png)

归档录像为960px／8fps压缩副本，保持原播放时长；原片保留本机私有调试目录。截图与录像分别来自独立隔离夹具。完整自动化录制包含后台等待；关键帧已查看，未将保存录像等同逐帧完整观看。

## 验证

- 222项规则通过；db:check与Node构建／类型检查通过。
- `test:collaboration-lookup`：真实并发、员工接管Admin、旧凭证拒写、过时确认拒绝、单对象续期、灰态／简称／输入保留、失败重试、整场例会、27条分页及长历史、真实触控通过，浏览器错误为0。[结果](result.json)
- `test:workspace`：原入口来源补齐、会议准备／定稿、连续保存与旧表单拒绝、租约失效恢复、账号、隐私、隔离备份恢复及兼容迁移回归通过。迁移只在临时隔离库演练。
- `test:ui`：公共容器、桌面／手机、Inspector节点及滚动、未保存确认、列表刷新失败与重试通过。
- `test:motion`：1440／1280／390／320px逐帧几何、遮罩终帧、背景位置、快速重开、嵌套确认与减少动态效果通过；各视口使用独立记录，避免上一场景的真实租约影响下一场景。
- `test:meeting-discussion`：版本草稿、定稿、冻结指标、中文PDF、回溯与到期锁定通过。

## 发布

实现 `30b50cf`，工作分支已推送 GitHub。生产构建／类型检查、中文PDF运行包通过；独立部署6项动态检查、正式域名107项检查与66个资源哈希通过。

正式部署 `dpl_2SC8bWs63Jtmr9ADiRmP96P26fay`，已核对 [正式域名](https://qiuyun-frontend.vercel.app) 指向该版本。[发布记录](release.json)、[独立部署检查](candidate-smoke.json)、[公网检查](public-smoke.json)。main未合入。
