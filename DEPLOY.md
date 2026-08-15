# 免费部署指南（2026-08-15）

应用是**单文件纯前端**（`index.html`，零后端、零依赖），任何静态托管都能跑。按推荐顺序选择：

---

## 方案一：Netlify Drop（最快，无需注册即可试，约 30 秒）

1. 打开 https://app.netlify.com/drop
2. 把 `index.html` **拖进**页面虚线框
3. 立即获得 `https://xxxx.netlify.app` 的线上地址（可分享给同学）
4. 想长期保留/自定义域名：点页面底部 "Sign up" 注册即可接管

## 方案二：GitHub Pages（免费、永久、适合长期维护，推荐）

1. 注册/登录 https://github.com ，新建仓库（Public），命名如 `student-rail-planner`
2. 上传：把本目录的 `index.html` 和 `README.md` 拖入仓库（Upload files）
3. 仓库 Settings → Pages → Source 选 `Deploy from a branch` → 分支 `main` → Save
4. 等 1~2 分钟，访问 `https://<你的用户名>.github.io/student-rail-planner/`

命令行方式（若本机配置了 GitHub 登录）：

```bash
cd student-rail-planner
git init && git add index.html README.md DEPLOY.md
git commit -m "学生优惠区间规划器"
git branch -M main
git remote add origin https://github.com/<用户名>/student-rail-planner.git
git push -u origin main
# 然后到仓库 Settings > Pages 启用，选 main 分支
```

## 方案三：Vercel / Cloudflare Pages（免费，国内访问一般）

- Vercel：https://vercel.com/new ，导入项目或拖拽，零配置
- Cloudflare Pages：https://pages.cloudflare.com ，"Direct Upload" 拖入 `index.html`

## 方案四：国内加速（Gitee Pages / 腾讯云 COS 静态网站）

- Gitee Pages：https://gitee.com 建仓库 → 服务 → Gitee Pages（需实名认证，国内访问快）
- 腾讯云 COS：对象存储 → 开启"静态网站"（需备案域名才可对外，个人演示可不备案用临时链接）

---

## 微信小程序评估（不建议个人开发者走这条路）

| 事项 | 说明 |
| --- | --- |
| 注册 | 个人主体可注册小程序，需身份证+手机号，审核 1~7 天 |
| **web-view 限制** | 个人小程序**不能**用 web-view 加载外部网页（仅企业/组织主体可用），无法"套壳"本应用 |
| 重写成本 | 地图（Leaflet）需换成小程序地图组件（需申请 key），全部逻辑要重写成 WXML/JS |
| 域名要求 | 请求需 https + ICP 备案 + 在小程序后台配置合法域名 |
| 审核 | 工具类目需提交类目资质，个人主体可选类目少 |

**结论**：除非你有企业主体和备案域名，否则小程序路线成本高、周期长（数周）。**推荐网站部署（方案一/二），手机浏览器直接访问效果等同小程序**；若一定想要"小程序体验"，可之后考虑"添加到主屏幕"（PWA 化，另需 HTTPS）。

---

## 技术提示

- 页面需要联网加载：Leaflet CDN、地图瓦片（高德/OSM）、Google Fonts（失败自动回退系统字体）
- 国内访问建议在页面右上角图层切换到"高德"底图（默认即高德）
- 部署后所有功能（地图/规划/引导）与本地完全一致
