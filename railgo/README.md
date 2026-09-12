# RailGo · 铁路学生出游智能规划

> 「让铁路成为旅行主线，让城市成为旅途节点。」

RailGo 是挂在「学生票区间规划器」项目上、独立的**多目的地铁路出游规划** Web 页面。
不触碰原学生票核心算法、不改动原项目测试、不进小程序。

当前状态: **阶段 7 封版** (HEAD `58c7a36`)。已完成 Value Engine、目的地价值、
中途站点优化器, 以及三条 UI 理由路径的 Core 单一事实源统一。

详见下方「阶段2-6」「阶段7」章节。

## 项目目的

解决"学生从学校出发，输入多个目的地/天数/预算，得到一条合理旅行方案"：

- 多目的地 *按用户顺序* 或 *智能优化* 排序
- 城际铁路路线（自己的铁路图 + Dijkstra，**不用百度负责铁路算法**）
- 中途城市主动推荐（时间充裕时提示可加站，如 石家庄→上海 推荐 济南）
- 城市内部游玩规划（车站→景点→餐饮→住宿，分 Day），可接真实 POI
- 预算与时间可行性检查（超预算自动调整 / 时间不足提示减城）
- 三套方案候选（综合/省钱/轻松），各带可解释分数明细
- 配置百度 AK 后使用真实地图与 POI，无 AK 自动降级演示模式

## 运行方式

浏览器**直接打开** `railgo/railgo.html` 即可（纯前端，无构建、无依赖，与主项目一致）。
无需服务器。默认自动载入 Demo4（石家庄→上海，演示中途推荐）。

## 文件结构

```
railgo/
├── railgo.html       入口页面（表单/结果/时间轴/地图/详情）
├── railgo.css        样式
├── railgo.js         页面交互逻辑（只消费 Core 结果, 不重算业务语义）
├── railgo.core.js    核心算法（Dijkstra/排序/评分/可行性/Value Engine，UMD 可测试）
├── mock-data.js      模拟数据（城市/铁路边/景点/餐饮/住宿，全部 source:"mock"）
├── baidu-api.js      百度地图 API 抽象层（无 AK 自动降级，不崩溃）
├── baidu-map.js      地图渲染层
└── tests/            10 套 176 项独立测试
```

## 模拟数据（重要）

第一版**没有真实数据**：铁路里程/时长/票价（按 0.46 元/km 与线路时速估算）、景点、
餐饮、住宿、推荐指数 **全部是模拟估算**，每个输出都带 `【模拟】/est/mock` 标注。
不伪造实时车次、实时票价、实时评分、营业状态。所有估算均可在 mock-data.js 一键替换。

## 百度地图 API

- 用途：**仅城市内部**（POI 检索、周边搜索、地理编码、步行/公交/驾车路线、坐标转换）。
- 城际铁路算法永远是本地铁路图，不依赖百度。
- AK 获取：百度开放平台（lbsyun.baidu.com）→ 创建应用 → 浏览器端 AK → 配置 Referer 白名单。
- **AK 存放**：仅存本机 `localStorage`（`RAILGO_BAIDU_AK`），或 `window.RAILGO_CONFIG`；
  绝不写死源码、绝不提交 Git。页面上"地图 API 设置"可粘贴/清除。
- **无 AK**：所有 API 返回 `{success:false, source:"mock", message:"Baidu API key not configured"}`，
  页面用 SVG 演示地图，功能完整可预览，不会崩溃。

## API 限制（诚实说明）

| 事项 | 状态 |
|---|---|
| 实时 12306 车次/票价/余票 | **不能稳定实现**，第一版不做，不用"模拟成真实" |
| POI 名称/坐标/分类/地址 | 百度可返回，可接入 |
| 商户评分/人均/营业状态 | **百度不保证稳定返回**，仅当 API 实际返回才展示 |
| 百度坐标(BD09) vs 项目站表(WGS84) | 展示前需坐标转换（baidu-api.coordConvert 已预留） |
| 浏览器直连百度 Web API | 可能受 CORS 限制 → 正式接入建议经自建代理/云函数 |

## 阶段1: 三方案候选系统(已完成)

`generateRouteCandidates()` 在 `planRoute()` 之上生成 综合(⭐)/省钱(💰)/轻松(🌿) 三套 RouteCandidate：

- 每个候选: cities/segments/days/transport(里程·时长·换乘·绕行比)/budget(铁·住·食·门票·市内·总)/score/
  scoreBreakdown(游玩/时间/预算/铁路/换乘, 带分母)/reasons/warnings, source:"computed"
- 综合: 权重 游玩30 时间25 预算20 铁路15 换乘10
- 省钱: 权重 预算45 铁路成本25 游玩10 时间20; 预算紧张时自动循环删城直至预算内或剩1城
- 轻松: 权重 时间30 换乘25 预算10 铁路15 游玩20; 高价值城市分配更多停留天数
- UI: 页面生成 3 张方案卡片, 点击切换 → 时间轴/地图/预算/详情联动

测试: railgo/tests/ 共 21 项(核心 11 + 候选 10), 全部独立于原项目 422 项。

## 阶段2-6: 地图/坐标/POI (已完成)

- **阶段2-3**: 百度地图 JSAPI 最小可用接入 + 铁路旅行方案地图可视化(仅调用地图层, 不含 API 细节于 railgo.js)
- **阶段4**: 坐标体系确认 + 坐标处理层(地理编码/缓存/容错, WGS84↔BD09 统一入口)
- **阶段5**: POI 地点检索层(标准化/TTL 缓存/竞态处理/overlay 隔离); 真实通道为 `BMapGL.LocalSearch`
- **阶段5.2**: POI 融入旅行方案(城市 Day 行程由真实 POI 驱动); 城市内步行路线接入
- **阶段6**: 城市内路线行展示 + 方案切换后 DayPlan/POI 重建

无 AK 时全部降级为演示数据, 功能完整可预览; 真实 API 仅在明确需要时调用(见下方"网络请求事实")。

## 阶段7: Value Engine 与理由体系 (已完成)

### 7.1 / 7.2 Value Engine

`placeValueOf()`(地点价值) + `evaluateStop()`(沿途增量价值) + 偏好体系(7 维 + 节奏映射),
评分按"时间效率/体验/铁路适配/预算匹配/便利/代表性"归一加权, 再扣疲劳/机会成本/换乘惩罚。

### 7.3 目的地价值 `destinationEvaluation()`

终点城市的**绝对**旅行价值, 与沿途 TripEvaluation 严格区分:
- 含 `railAccess`(起点→终点绝对铁路质量: 可达/直达/时长/里程/票价/换乘)
- **无** detour / addedKm / addedRailH / addedFare(终点不存在"绕行"概念)
- **无** opportunityCost(终点不是被插入的可选项)

UI: 目的地价值卡片, 明确标注"与方案匹配度含义不同"。

### 7.4 中途站点选择优化器 `optimizeStopSelection()`

复用 `evaluateStop` 做贪心 + 边际评估, 每次选择"增量价值/增量成本"最高的下一站;
返回 `selected` / `rejected` / `remainingDays` / `remainingBudget`。

### 7.5-7.8 理由文案统一消费 Core(单一事实源)

三条 UI 路径(StopBox / DestinationBox / optBox)统一改为**逐条消费 Core `reasons`**,
UI 不再自建中文 reason 文案表, `reasonCodes` 仅用于 ✓/⚠ 分类:

- 7.5: StopBox 删除自建文案映射表, 改消费 Core reasons; 修复 `LOW_EXPERIENCE_VALUE` 分类遗漏
- 7.6: DestinationBox 分类补齐 `LOW_EXPERIENCE` / `SAME_AS_ENDPOINT`(此前被静默丢弃)
- 7.7: optBox 由"只显示 `reasons[0]`"改为全量展示(此前其余理由被丢弃)
- 7.8: StopBox/optBox 分类补齐 4 个硬约束 code + `SAME_AS_ENDPOINT`

**硬约束**(`BUDGET_EXCEEDED` / `TIME_INFEASIBLE` / `RAILWAY_UNREACHABLE` / `PLACE_DATA_MISSING`)
由 Core 判定, 任何 UI 路径都不得隐藏。

## 三条 score 的语义边界(禁止混用)

| 分数 | 含义 | 产出函数 | UI 标签 |
|---|---|---|---|
| 方案匹配度 | 某套方案整体的匹配程度 | `routeScore` / 候选 `score` | 「推荐指数」 |
| 目的地价值 | 终点城市的**绝对**旅行价值 | `destinationEvaluation` | 「目的地价值」 |
| 沿途值得去 | 沿途城市插入本行程的**增量**价值 | `evaluateStop` | 「值得去」 |

三者**不得相加、不得互相覆盖、不得互相替代**; UI 只消费 Core 结果, 不重算 score。

## 当前不能实现

- 真实车次时刻表 / 实时票价 / 余票查询（无授权数据源）
- 真实景点开放时间 / 实时评分 / 排队状态
- 真实餐饮商家评分与人均（依赖不稳定字段）
- 多城市真实铁路时刻衔接（需授权数据）

## 下一阶段计划

- P1：扩展城市/景点数据（手工整理全国热门城）
- P2：百度路线规划（步行/公交）在更多城市启用
- P2：把 RailGo 作为 Web 独立页并入主项目部署（GitHub Pages）

## 测试

```
node --test railgo/tests/*.test.mjs
```

**176 项全过**(10 套): value 76 / localsearch 16 / poi 15 / route-plan 12 / route 12 /
railgo 11 / candidate 10 / map 10 / geo 9 / poi-plan 5。
不依赖、不改动原项目测试(原项目 5 套 455 项断言 + check-v2 回测 63 吻合/0 不符 均独立全绿)。

## 网络请求事实(诚实的边界说明)

- 无 AK / 未触发检索时: **真实业务 API 请求 0**(地图 JSAPI 底图加载除外)
- 城际铁路算法永远本地(自己的铁路图 + Dijkstra), 不调用百度
- 百度 API 仅用于城市内 POI / 路线, 且必须经 `baidu-api.js` 抽象层, UI 不得直连
- 已知事实(非缺陷): `confidence` 字段在 Core 中完整产出并有契约测试, 但 UI 未展示 ——
  现有 8 城全为 `medium`, 展示无区分意义; 待未来数据分级变化时再考虑

## 已知环境限制

- 自动化浏览器(CUA 坐标点击)在页面滚动后可能失效, 验收时改用页面内派发用户事件序列
  (属**合成事件验证**, 非真实坐标点击)
- 部分 code(`SAME_AS_ENDPOINT` / `LOW_EXPERIENCE_VALUE`)在当前 mock 数据下不可自然触发,
  仅有契约级测试覆盖, 不伪造数据制造 PASS
不依赖、不改动原项目 422 项测试。