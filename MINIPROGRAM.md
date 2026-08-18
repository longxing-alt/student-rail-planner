# 小程序版 · 使用与提审指南

`miniprogram/` 目录是「学生票区间规划器」的微信小程序版，由网页版 `index.html` 移植：

- **计算逻辑**：`miniprogram/utils/logic.js` 由 `scripts/build-mp-logic.mjs` 从网页版 PURE LOGIC 段自动生成（逐字一致，86 项一致性测试保障）
- **图钉图标**：`scripts/gen-pins.mjs` 生成（node 零依赖 PNG）
- **页面**：`pages/index/`（单页：向导输入 + 结果 + 区间优化 + 地图）
- **零网络**：不使用任何外部域名/云服务，全部本地计算（审核友好、无配额消耗）

## 一、注册小程序账号（需要你实名）

1. 打开 https://mp.weixin.qq.com →「立即注册」→ 选 **小程序**
2. 填未注册过微信平台的邮箱 + 密码 → 邮箱激活
3. 主体类型选 **个人** → 用微信扫码 + **身份证实名**（你负责这步）
4. 注册完成后进入后台 → **开发管理 → 开发设置** → 复制 **AppID**（形如 `wx1234567890abcdef`）

> 费用：个人主体注册免费、无需 300 元/年企业认证。

## 二、填入 AppID 并上传（扫码需要你）

1. 微信开发者工具已在 `D:\weix\微信web开发者工具` 安装好，项目已打开（游客模式可先预览）
2. 点右上角「**登录**」，**用你的微信扫码**（只有扫码这一步需要你）
3. 把 `miniprogram/project.config.json` 里的 `"appid": "touristappid"` 改成你的真实 AppID
   （或在工具右上角「详情 → 基本信息 → 测试号/AppID」里切换）
4. 左侧模拟器检查页面正常 → 点右上角「**上传**」→ 版本号 `1.0.0`、备注随意

## 三、提审（审核快要点）

1. 微信公众平台 → **管理 → 版本管理** → 找到刚上传的开发版本 →「提交审核」
2. 服务类目选：**工具 → 效率**（个人主体可开、无需资质；不要选出行/票务类目）
3. 审核信息填好功能介绍与页面截图（在工具里逐页截图即可）
4. 无需配置《用户隐私保护指引》：本小程序**不收集任何个人信息**（无定位/无登录/无上报）
5. 提交后一般 1~7 天；工作日上午提审 + 材料齐 = 最快路径

## 四、内容避雷（已按此编写）

- 名称用「学生票区间规划器」这类通用词，已弱化"12306"商标表述
- 零支付、零交易、零诱导分享——纯计算工具
- 若审核被拒：按驳回原因改后重新提交即可，多为类目/截图问题

## 五、目录与常用命令

**双目录结构**（仓库 `miniprogram/` 是源，`D:\mini` 是开发者工具项目）：

```
D:\mini\                          ← 微信开发者工具项目（官方 TS 模板结构）
├── project.config.json           ← 权威配置（AppID 在这里）
├── tsconfig.json / typings/      ← TS 模板（allowJs 兼容我们的 JS）
└── miniprogram/                  ← 由仓库同步而来（勿手改）
    ├── app.js / app.json / sitemap.json
    ├── pages/index/              ← 页面（JS/WXML/WXSS）
    ├── utils/logic.js            ← 计算逻辑（与网页版逐字一致）
    └── images/                   ← 图钉 + 头像
```

> 每次改完仓库里的 `miniprogram/`，跑一次同步即可（会整体替换 D:\mini\miniprogram，模板自带的 pages/logs、app.ts 等自动清除）。

```bash
npm run build:mp   # 重新生成 logic.js + 图钉 + 头像 → 同步到 D:\mini
npm test           # 网页版 102+178 测试 + 网页/小程序一致性 86 项
node scripts/sync-mini.mjs        # 仅同步（不改逻辑时）
```

开发者工具 CLI（`D:\weix\微信web开发者工具\cli.bat`）：
- `cli.bat open --project D:\mini` 打开项目
- `cli.bat preview --project D:\mini` 生成预览二维码
- `cli.bat upload --project D:\mini -v 1.0.0 -d "说明"` 上传（需已登录）
