/* RailGo 配置示例 — 可安全提交(不含真实 AK)
 * 使用: 复制本文件为 config.local.js, 填入自己的百度地图 AK。
 *       config.local.js 已被 .gitignore 忽略, 不会进入 Git。
 * AK 申请: 百度地图开放平台 https://lbsyun.baidu.com → 应用管理 → 创建应用
 *          类型选【浏览器端】, 并配置 Referer 白名单(本地开发填 localhost 与 127.0.0.1)。
 */
window.RAILGO_CONFIG = {
  BAIDU_MAP_AK: ''  // 在此填入你的 AK, 例如 '你的浏览器端AK'
};