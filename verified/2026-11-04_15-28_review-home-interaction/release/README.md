# 发布检查

- 正式入口：https://qiuyun-frontend.vercel.app；应用版本`823ac7d`（含最新月计划／编辑权修复），部署`dpl_9AQUUJSfVKxKTqeMgcvdfeCmFFA6`，正式域名与独立部署均核对为READY。
- 独立部署14项、正式域名122项、87个资源SHA256核对通过。登录保护、业务API、同源表单／外站拒绝、私有目录及新首页资源正常；无生产业务写入或迁移。
- 正式首页1920／1440／1024px的浅弧及平带均实际悬停，右上角向内退、移出归零通过：[线上结果](home-online.json)、[正式站录屏](home-online-1440.mp4)、[1440px浅弧](home-arc-hover-1440.png)、[1024px平带](home-flat-hover-1024.png)。
- 发布包独立安装依赖、检查压缩Chromium与MiSans，并用实际函数包验证月5页／周3页PDF：[运行包](runtime-bundle.json)、[PDF渲染](pdf-render-check.json)。
- [部署记录](deployment.json)、[独立地址检查](candidate-smoke.json)、[正式域名检查](public-smoke.json)。
