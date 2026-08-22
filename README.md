# cs-skin-tracker

CS2 饰品价格监控 & 交易辅助 CLI——**零第三方依赖**(纯 Node.js 内置模块),聚合 Steam / Buff163 / 悠悠有品三平台价格,带技术分析、资金规划、风险评估与 **GLM AI 深度分析**。项目经过完整安全审计并修复全部发现(见 [安全审计](docs/security-audit.md))。

## 30 秒上手

```bash
node index.js demo    # 生成 30 天模拟数据,无需网络
node index.js ai "AK-47 | Redline (Field-Tested)"   # AI 深度分析
node index.js plan    # ¥500 资金分配方案
```

`demo` 输出:

```
✓ AK-47 | Redline (Field-Tested) (Buff ~¥85, 31条记录)
✓ 3条模拟持仓已生成
```

`ai` 命令输出(未配置 API key 时自动降级为离线演示模式):

```
🤖 GLM 深度分析 — AK-47 | Redline (Field-Tested) (离线演示模式)
  [离线模式] 未配置 ZHIPU_API_KEY,以下为本地规则生成的演示分析:
  【现状】当前 ¥79.3,较30日均值偏离 -9.0%,低于均值,可能是回调也可能是需求萎缩。
  【风险】样本 62 条,波动率 4.9%,统计意义有限;饰品流动性差,极端行情下滑点可能无承接。
  【建议】配置 ZHIPU_API_KEY 后可获取 GLM 生成的深度分析。数据参考,不构成投资建议。
```

`plan` 输出:

```
💰 ¥500 资金分配方案
  🥇 Desert Eagle | Printstream (Field-Tested) ¥122.70 x1  60分
  🥈 USP-S | Printstream (Field-Tested)  ¥46.55 x2  40分
  合计投入: ¥215.80  |  剩余现金: ¥284.20
```

## 功能

| 命令 | 说明 |
|---|---|
| `check [皮肤名]` | 三平台实时价格 + 价差计算 |
| `monitor [秒]` | 持续监控,价格告警实时触发 |
| `analyze <皮肤名>` | 均线/波动率/支撑阻力/综合评分 |
| `ai <皮肤名>` | GLM AI 深度分析报告 |
| `plan` / `risk` | 资金分配方案 / 组合风险评估 |
| `buy` `sell` `positions` `stats` | 持仓与盈亏管理 |
| `add` `remove` `alert` | 监控列表与价格告警 |

## 启用 GLM AI 分析

```bash
# bigmodel.cn 创建 API key 后:
export ZHIPU_API_KEY=你的key
node index.js ai "AK-47 | Redline (Field-Tested)"
```

可选环境变量:`GLM_MODEL`(默认 `glm-5.3`)、`GLM_BASE_URL`(默认智谱开放平台)。

## 安全特性

本项目按 [Trail of Bits 审计方法论](docs/security-audit.md) 做了完整安全审计并修复:

- **重定向策略**:跟随上限 5 跳,拒绝 HTTPS 降级,主机白名单(防重定向环与 MITM)
- **输入清洗**:外部价格全部过数字校验(范围/类型),名称去 ANSI 转义(防终端注入)
- **偏差告警**:新价格与历史偏离 >50% 时告警并记录,可疑数据可追溯
- **数据自愈**:JSON 数据损坏自动备份为 `.corrupt-<ts>` 而非静默清零
- **失败可见**:网络失败全部打日志,不再静默吞掉

## 测试

```bash
npm test    # 14 个用例:重定向策略/输入清洗/AI 层降级
```

## 项目结构

```
index.js            # CLI 入口与命令分发
lib/fetcher.js      # 三平台价格抓取(重定向策略/清洗在此层)
lib/net-policy.js   # 纯函数网络策略(可测)
lib/validate.js     # 纯函数输入清洗(可测)
lib/db.js           # 本地 JSON 存储(校验/备份/偏差告警)
lib/analyzer.js     # 评分/均线/波动/回撤
lib/ai.js           # GLM 分析层(无 key 优雅降级)
test/               # node:test 内置测试,零依赖
```

## 声明

价格数据来自公开接口,仅供学习研究;所有输出不构成投资建议。

## License

MIT
