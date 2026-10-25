# 报告字体

PDF服务端使用Noto Sans CJK SC的Regular和Bold静态OpenType字面，从已有Noto CJK字体集中提取简体中文面，沿用旁边的OFL许可。只经服务端PDF构建导入，不改变网页MiSans字体。PDFKit按实际文字子集嵌入，避免运行时下载或依赖系统字体。
