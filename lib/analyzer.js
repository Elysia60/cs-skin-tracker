// 饰品分析引擎 — 均线、波动率、支撑阻力、仓位计算
const db = require("./db");

// 简单移动平均
function sma(prices, period) {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

// 波动率 (标准差)
function volatility(prices) {
  if (prices.length < 2) return 0;
  const mean = prices.reduce((s, v) => s + v, 0) / prices.length;
  const variance = prices.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / prices.length;
  return Math.sqrt(variance);
}

// 找局部极值点（支撑/阻力）
function findLevels(prices, windowSize) {
  if (prices.length < windowSize * 2) return { support: [], resistance: [] };
  const supports = [], resistances = [];
  for (let i = windowSize; i < prices.length - windowSize; i++) {
    const left = prices.slice(i - windowSize, i);
    const right = prices.slice(i + 1, i + windowSize + 1);
    const val = prices[i];
    if (left.every(v => v >= val) && right.every(v => v >= val)) supports.push(val);
    if (left.every(v => v <= val) && right.every(v => v <= val)) resistances.push(val);
  }
  // 聚类去重
  function cluster(arr, threshold) {
    if (arr.length === 0) return [];
    const sorted = [...arr].sort((a, b) => a - b);
    const result = [];
    let group = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      if ((sorted[i] - group[0]) / group[0] < threshold) {
        group.push(sorted[i]);
      } else {
        result.push(group.reduce((s, v) => s + v, 0) / group.length);
        group = [sorted[i]];
      }
    }
    result.push(group.reduce((s, v) => s + v, 0) / group.length);
    return result;
  }
  return {
    support: cluster(supports, 0.03),
    resistance: cluster(resistances, 0.03)
  };
}

// 趋势判断
function trend(prices) {
  if (prices.length < 5) return "数据不足";
  const recent5 = prices.slice(-5);
  const first5 = prices.slice(0, 5);
  const shortMA = sma(prices, 5);
  const longMA = sma(prices, Math.min(20, prices.length));
  if (!shortMA || !longMA) return "数据不足";
  const change = ((recent5[recent5.length - 1] - first5[0]) / first5[0] * 100);
  if (change > 5 && shortMA > longMA) return "强势上涨";
  if (change > 1 && shortMA > longMA) return "温和上涨";
  if (change < -5 && shortMA < longMA) return "强势下跌";
  if (change < -1 && shortMA < longMA) return "温和下跌";
  return "横盘震荡";
}

// 综合评分 (0-100)
function score(skinName) {
  const history = db.getPriceHistory(skinName);
  const prices = history.map(h => h.buff).filter(Boolean);
  if (prices.length < 10) return { score: 0, reason: "历史数据不足 (需 >= 10 条)" };

  const vol = volatility(prices);
  const avgPrice = prices[prices.length - 1];
  const volPct = avgPrice > 0 ? (vol / avgPrice * 100) : 0;
  const trendDir = trend(prices);
  const levels = findLevels(prices, 3);
  const currentPrice = prices[prices.length - 1];
  const ma5 = sma(prices, 5);
  const ma10 = sma(prices, 10);

  let s = 50; // 基础分
  const reasons = [];

  // 波动率评分 (低波动 = 安全, 高波动 = 风险)
  if (volPct < 3) { s += 15; reasons.push("低波动(+15)"); }
  else if (volPct > 10) { s -= 15; reasons.push("高波动(-15)"); }

  // 趋势评分
  if (trendDir.includes("上涨")) { s += 15; reasons.push(trendDir + "(+15)"); }
  else if (trendDir.includes("下跌")) { s -= 20; reasons.push(trendDir + "(-20)"); }

  // 均线关系
  if (ma5 && ma10) {
    if (ma5 > ma10) { s += 10; reasons.push("MA5>MA10 多头排列(+10)"); }
    else { s -= 5; reasons.push("MA5<MA10 空头排列(-5)"); }
  }

  // 支撑阻力位置
  if (levels.support.length > 0) {
    const nearestSupport = levels.support.filter(v => v < currentPrice).sort((a, b) => b - a)[0];
    if (nearestSupport) {
      const distToSupport = ((currentPrice - nearestSupport) / currentPrice * 100);
      if (distToSupport < 3) { s += 10; reasons.push("接近支撑位(+10)"); }
    }
  }

  // 成交量虚拟评估 (基于价格数据点密度)
  if (history.length > 30) { s += 5; reasons.push("数据充分(+5)"); }

  return {
    score: Math.max(0, Math.min(100, s)),
    reason: reasons.join(", "),
    detail: { volatility: volPct.toFixed(1) + "%", trend: trendDir, ma5: ma5 ? ma5.toFixed(2) : "N/A", ma10: ma10 ? ma10.toFixed(2) : "N/A", support: levels.support.map(v => v.toFixed(2)), resistance: levels.resistance.map(v => v.toFixed(2)) }
  };
}

// 仓位计算 (凯利公式简化版)
function calcPosition(capital, winProb, winLossRatio) {
  // 凯利: f = p - (1-p)/b
  const f = winProb - (1 - winProb) / winLossRatio;
  return Math.max(0.05, Math.min(0.25, f)); // 限制 5%-25%
}

// 最大回撤
function maxDrawdown(prices) {
  if (prices.length < 2) return 0;
  let peak = prices[0], maxDD = 0;
  for (const p of prices) {
    if (p > peak) peak = p;
    const dd = (peak - p) / peak;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

// 资金分配方案
function allocationPlan(capital, watchlist) {
  const candidates = [];
  for (const name of watchlist) {
    const history = db.getPriceHistory(name);
    const prices = history.map(h => h.buff).filter(Boolean);
    if (prices.length < 5) continue;
    const currentPrice = prices[prices.length - 1];
    const s = score(name);
    candidates.push({ name, price: currentPrice, score: s.score, trend: s.detail.trend });
  }
  // 按评分排序
  candidates.sort((a, b) => b.score - a.score);
  
  const plan = [];
  let remaining = capital;
  const weights = [0.35, 0.25, 0.20, 0.15, 0.05]; // 前5名权重
  
  for (let i = 0; i < Math.min(candidates.length, 5); i++) {
    const c = candidates[i];
    const alloc = capital * weights[i];
    const qty = Math.floor(alloc / c.price);
    if (qty > 0 && c.score >= 40) {
      plan.push({ ...c, alloc: alloc.toFixed(0), qty, actualCost: (qty * c.price).toFixed(2) });
      remaining -= qty * c.price;
    }
  }
  
  return { plan, remaining: remaining.toFixed(2), totalSkins: candidates.length, qualified: candidates.filter(c => c.score >= 40).length };
}

// 连续涨/跌天数 (动量)
function streak(prices) {
  if (prices.length < 2) return { up: 0, down: 0 };
  const last = prices[prices.length - 1];
  const prev = prices[prices.length - 2];
  const dir = last > prev ? "up" : last < prev ? "down" : "flat";
  if (dir === "flat") return { up: 0, down: 0 };
  let n = 0;
  for (let i = prices.length - 1; i > 0; i--) {
    if (dir === "up" && prices[i] > prices[i - 1]) n++;
    else if (dir === "down" && prices[i] < prices[i - 1]) n++;
    else break;
  }
  return dir === "up" ? { up: n, down: 0 } : { up: 0, down: n };
}

// 动量信号 —— 已验证: 饰品是动量市, 连涨3天买入有正超额, 连跌是接飞刀
function momentumSignal(skinName) {
  const prices = db.getPriceHistory(skinName).map(function(h) { return h.buff; }).filter(Boolean);
  if (prices.length < 4) return { signal: "数据不足", up: 0, down: 0 };
  const s = streak(prices);
  let signal;
  if (s.up >= 3) signal = "连涨" + s.up + "天 → 动量买入(持有30天)";
  else if (s.down >= 2) signal = "连跌" + s.down + "天 → 回避(别接飞刀)";
  else signal = "震荡/观望";
  return { signal: signal, up: s.up, down: s.down };
}

module.exports = { sma, volatility, findLevels, trend, score, calcPosition, maxDrawdown, allocationPlan, streak, momentumSignal };