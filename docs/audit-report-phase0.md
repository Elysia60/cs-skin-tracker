# Phase 0 安全审计报告 — cs-skin-tracker

> 审计链:audit-context-building(Trail of Bits)→ 威胁建模(STRIDE)→ 初步发现
> 引擎:GLM(本次由 ZCode 会话驱动;Codex 接入 GLM-5.3 后同链路可迁移)
> 日期:2026-08-22 | 靶子:`C:\Users\14676\Documents\codex\2026-06-23\q-d\cs-skin-tracker`

## 1. 系统心智模型

CS2 饰品价格监控 CLI。Node.js,零第三方依赖,本地 JSON 存储。

```
CLI argv → index.js(命令分发)→ lib/fetcher.js ──HTTPS──→ Steam / Buff163 / 悠悠有品
                                   │
                                   ▼ 响应体 JSON.parse(外部输入)
                          lib/db.js ──写入──→ data/*.json(price_history/positions/watchlist)
                                   │
                                   ▼
                          lib/analyzer.js(评分/均线/波动)→ 终端输出(建议/告警)
```

代码量:index.js 466 行 + fetcher.js 127 行 + db.js 112 行 + analyzer.js。无 eval、无 child_process、无 shell 调用——**攻击面主要在网络响应与本地 JSON 数据**。

## 2. 入口点与信任边界

| # | 入口点 | 位置 | 跨越的边界 |
|---|---|---|---|
| E1 | CLI 参数(皮肤名/价格) | `index.js:440-466` | 用户 → 进程 |
| E2 | 三个外部 API 的响应体 | `lib/fetcher.js:32,51-64,90-95` | 互联网 → 进程 |
| E3 | 3xx 重定向 Location 头 | `lib/fetcher.js:14-16` | 互联网 → 进程(二次请求目标可控) |
| E4 | data/*.json 本地文件 | `lib/db.js:11-16` | 磁盘 → 进程 |

## 3. 初步发现(带证据,标置信度)

### F1 [中危·高置信] 重定向跟随无深度限制、无协议/主机校验
`lib/fetcher.js:14-16`:收到 3xx 即递归跟随 `res.headers.location`,无最大跳数,不校验目标主机或协议。
- 恶意/被劫持的 API 可构造**重定向环**导致无限递归(内存/栈耗尽,monitor 模式下持续运行放大影响);
- 可将 HTTPS 请求**降级重定向到 HTTP**,后续响应可被中间人完全控制。
- 变体分析:该模式仅此一处。修复:跳数上限(如 5)+ 仅允许同 scheme + 白名单主机。

### F2 [中危·高置信] 外部价格数据无完整性/类型校验,直接进入决策链
Buff 的 `sell_min_price`、Steam 的 `lowest_price` 等字符串直接进入 `fmtChange`(`index.js:22-24`)做算术、进入 `analyzer` 评分并驱动 `plan`/`risk` 的**资金分配建议**。被污染的响应会直接操纵交易建议。且所有 fetcher 函数 catch 后返回 null(`fetcher.js:39,65,78,96`),静默失败无日志,数据异常不可察觉。
- 修复:数字类型强校验 + 偏离度检查(如与历史均值差 >50% 告警)+ 失败计数与日志。

### F3 [低危·中置信] 终端 ANSI 注入
API 返回的 `item.name`、皮肤名未经清洗直接 `console.log`(`index.js:50,56` 等)。被控 API 可注入终端转义序列(清屏/光标操作/标题伪造)。修复:输出前剥离 `\x1b`。

### F4 [低危·高置信] 静默吞错 + JSON 解析失败返回空对象
`lib/db.js:15` 解析失败静默返回 `{}`;monitor 长跑中数据文件损坏 = 无提示的**历史数据清零**(savePrice 会用空对象重新写入)。修复:备份 + 显式报错。

### 好的一面(负面发现,同样值钱)
- 皮肤名拼 URL 前全部 `encodeURIComponent`(`fetcher.js:29,46,86`)——无注入;
- 皮肤名只作 JSON 键,**从不拼文件路径**——无路径穿越;
- 无 eval/exec/shell——无命令注入面;
- 无密钥、无凭证存储。

## 4. STRIDE 快速通过

| 类别 | 结论 |
|---|---|
| Spoofing | N/A(无认证体系) |
| Tampering | F1/F2:响应可被篡改且进入决策链 |
| Repudiation | N/A |
| Info Disclosure | data/ 仅含交易记录,无敏感凭证;低风险 |
| DoS | F1 重定向环;monitor 常驻放大 |
| EoP | 无(eval/exec 均无) |

## 5. ToB 成熟度迷你评分

| 维度 | 评 | 备注 |
|---|---|---|
| 测试 | 0/5 | package.json test 为占位符 |
| 文档 | 1/5 | 仅 ReadMe 级别 |
| 审计实践 | 0/5 | 本次为首审 |
| 算术安全 | 2/5 | 金额用 float+toFixed,展示级可接受,累计统计有精度隐患 |
| 低级代码 | 2/5 | 手写 fetch 重定向逻辑即 F1 |

## 6. 下一步(接入 cso v2 深扫)

1. F1/F2 修复后跑 `grill-with-docs` 对抗复核;2. 全量 12 阶段扫描(cso);3. 补最小测试(重定向上限、价格类型校验)。
