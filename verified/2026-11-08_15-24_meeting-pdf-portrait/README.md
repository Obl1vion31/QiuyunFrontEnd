# 周／月例会 A4 竖版 PDF

应用已发布，样张为隔离数据，已自检、待用户反馈。基线361755d；应用f97c34c。新导出使用竖版，已有同一冻结内容的横版原件继续复用。样本均为本机隔离PostgreSQL及保存的合成冻结材料，未向正式库写测试业务数据。

正式部署dpl_7s4viyajwVinWWm3DHBUHhW7PYaJ READY，正式域名与候选一致；候选26项／27资源、正式26项／77资源核对通过。

## 查看

- [月会竖版 PDF](pdf/monthly-after.pdf) · [原横版](pdf/monthly-before.pdf) · [清晰首屏对照](screenshots/monthly-comparison.png)
- [周会竖版 PDF](pdf/weekly-after.pdf) · [原横版](pdf/weekly-before.pdf) · [清晰首屏对照](screenshots/weekly-comparison.png)
- [月会直接打印](pdf/monthly-browser-print.pdf) · [旧口径月会](pdf/monthly-legacy.pdf) · [空态周会](pdf/weekly-empty.pdf)
- [月会长内容／长金额](pdf/monthly-long.pdf) · [周会长内容／长金额](pdf/weekly-long.pdf)
- [完整检查记录](checks.json)

## 改动与核对

- 统一A4竖版及专用打印样式；周会逐帖通栏、指标两列，月会六项成本两列，收紧内距与区块留白。普通表格行、图形及Week尽量完整，长表重复表头，长文字自然分页；保留MiSans、可搜索文字、资料链接和版本页码。
- 同一输入的当前月会由6页变5页，旧口径月会由6页变5页，非空周会保持3页；以可读性为先，不保证每份文档页数都会减少。长结论、长观察、18条事项及宽金额未截断，Week 5和12个原资料链接完整。实际发布包重新生成的当前月会与对照样张正文一致。
- 浏览器直接打印自动展开冻结依据，结束后恢复原折叠及滚动；服务端使用同一选择器。缓存识别旧横版指纹，新版本生成竖版；权限、统计、保存及封存流程沿用现行实现。
- 302规则、schema、Node／Vercel构建、类型0错误／0警告及公共UI通过；原有59条hint保留。实际Vercel包从压缩Chromium运行文件独立展开并生成中文PDF。管理员／员工实查1920／1440／1024，390仅检查页面溢出；双方生成、下载、缓存、打印恢复及冻结JSON不变通过。全部PDF逐页渲染并查看，主要纸面另存144dpi PNG。
- 本批当时的旧周会综合回归在进入PDF前，被原版已有的员工定稿按钮角色门禁阻断，未计通过。后续“员工周会定稿权限”批次已修复canConfirmPlan混用月会条件，并重新跑通完整周会回归；详见图库新索引，原始失败记录保留。

原始日志与中间稿位于本工作树.tools/portrait/及.tools/test-artifacts/portrait/。样本输入保留在sources/；前后对照的同一原始输入及新口径真实夹具分别记录，具体数据来源和指纹见checks.json。
