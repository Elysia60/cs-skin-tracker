# 我给自己的 CLI 工具做了一次安全审计,发现 4 个问题

> 原始审计报告(Phase 0)见同目录 `audit-report-phase0.md`。本文是面向公众的复盘版本:方法论、发现、修复,以及为什么"个人项目也值得审计"。

## 为什么 audit 一个"价格追踪小工具"

这个工具会:抓三个外部平台的价格、把数据写进本地 JSON、再基于这些数据给出**资金分配建议**。也就是说,外部输入最终影响钱相关的决策——这就是信任边界,哪怕它只是个几百行的 CLI。

审计方法论来自 Trail of Bits 的 audit-context-building:**先建心智模型,再找漏洞**。不是拿着漏洞清单逐条 grep,而是先搞清楚数据从哪来、到哪去、中间经过谁。

## 心智模型:一页数据流图

```
CLI argv → 命令分发 → fetcher(HTTPS 请求)→ 外部平台
                         ↓ 响应体 JSON.parse
                    db.js(写入 data/*.json)
                         ↓
                    analyzer(评分/均线)→ 终端输出(建议/告警)
```

入口点只有四类:命令行参数、三个 API 的响应、重定向 Location 头、本地 JSON 文件。

## 发现 1(中危):重定向跟随没有任何限制

手写的 fetch 遇到 3xx 就递归跟随 `Location` 头——没有跳数上限,不校验目标主机,也不校验协议:

```js
// 修复前
if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
  return fetch(res.headers.location, options).then(resolve).catch(reject);
}
```

被劫持的响应可以构造**无限重定向环**(monitor 模式常驻运行,影响放大),也可以把 HTTPS 请求**降级重定向到 HTTP**,之后响应体可被中间人完全控制——而响应体里的价格会一路流进资金建议。

修复方式是抽出**纯函数网络策略**,可单测:

```js
// lib/net-policy.js
function nextRedirect(location, currentUrl, hops, maxHops = 5) {
  if (hops >= maxHops) return { ok: false, reason: 'too many redirects' };
  const target = new URL(location, currentUrl);
  if (target.protocol !== 'https:') return { ok: false, reason: 'refuses non-HTTPS' };
  if (!ALLOWED_HOSTS.has(target.hostname)) return { ok: false, reason: 'refuses non-whitelisted host' };
  return { ok: true, url: target.toString() };
}
```

## 发现 2(中危):外部价格无校验直接进决策链

Buff 的 `sell_min_price` 是字符串,Steam 的价格带货币符号,它们未经任何校验就进入算术、进入评分、进入"买哪个"的建议。更糟的是所有 fetcher 函数 `catch { return null }`——数据被污染或请求失败时**完全无感**。

修复:所有外部数字过 `sanitizeNumber`(类型/范围清洗,脏数据归 null);入库时与上一条偏差 >50% 触发告警但保留数据(由人判断,不替人删数据);失败一律打日志。

## 发现 3、4(低危):终端注入与静默清零

- API 返回的名称直接 `console.log`,可注入 ANSI 转义序列(清屏/伪造内容)→ 统一 `stripANSI`
- 本地 JSON 损坏时 `catch { return {} }`,长跑数据悄悄归零 → 先备份为 `.corrupt-<ts>` 再重置

## 同样值钱的:负面发现

审计不只是找茬,确认"没洞"同样重要:URL 拼接全部 `encodeURIComponent`(无注入);皮肤名只作 JSON 键不拼路径(无路径穿越);全项目无 `eval`/`child_process`(无命令注入面);无任何凭证存储。

## 复盘:三个收获

1. **信任边界思维比漏洞清单重要**。找到"外部数据影响资金建议"这条链,F1/F2 自然浮出;对着 CWE 编号逐条查反而容易漏。
2. **修复要落成可测的纯函数**。重定向策略抽成 `nextRedirect`,7 个测试用例锁死行为;如果只是在线程里加个计数器,下次重构就丢了。
3. **变体分析**:每修一处,全库搜同类模式。这次"静默 catch"在 4 个函数里各出现一次——只修第一个等于没修。

工具链:审计与修复全程由 GLM 驱动的 agent 完成(Trail of Bits 方法论 skill + node:test 回归)。

---
*本文与项目均开源,欢迎交流。数据参考,不构成投资建议。*
