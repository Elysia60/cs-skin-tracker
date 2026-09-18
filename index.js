const fs = require("fs");
const path = require("path");
const db = require("./lib/db");
const fetcher = require("./lib/fetcher");
const analyzer = require("./lib/analyzer");
const ai = require("./lib/ai");

const WATCHLIST_FILE = path.join(__dirname, "data", "watchlist.json");
function loadWatchlist() {
  try { return JSON.parse(fs.readFileSync(WATCHLIST_FILE, "utf-8")); }
  catch { return []; }
}
function saveWatchlist(list) {
  const dir = path.dirname(WATCHLIST_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(WATCHLIST_FILE, JSON.stringify(list, null, 2));
}

const C = { R: "\x1b[31m", G: "\x1b[32m", Y: "\x1b[33m", B: "\x1b[36m", W: "\x1b[37m", M: "\x1b[35m", X: "\x1b[0m", BOLD: "\x1b[1m" };
function pad(s, len) { return String(s).padEnd(len); }
function fmtPrice(p) { if (!p) return C.W + "N/A" + C.X; const v = Number(p); return (v > 1000 ? C.R : v > 100 ? C.Y : C.G) + "\u00a5" + v.toFixed(2) + C.X; }
function fmtChange(oldP, newP) {
  if (!oldP || !newP) return C.W + "  - " + C.X;
  const ch = ((newP - oldP) / oldP * 100).toFixed(1);
  return (ch > 0 ? C.R + "\u2191" : C.G + "\u2193") + ch + "%" + C.X;
}
function divider() { console.log(C.W + "-".repeat(70) + C.X); }
const NET_FAIL_MSG = C.Y + "\n" + "\u26a0" + " 网络受限，无法抓取实时价格 (请在你本地运行此工具)\n如需测试功能，请用: node index.js demo" + C.X;

async function cmdCheck(skinName) {
  let list = skinName ? [skinName] : loadWatchlist();
  if (list.length === 0) { console.log(C.Y + "监控列表为空" + C.X + " 先添加: node index.js add <皮肤名>"); return; }
  let hasData = false;
  for (const name of list) {
    console.log("\n" + C.BOLD + C.B + "\u25b6 " + name + C.X);
    divider();
    try {
      const result = await fetcher.getAllPrices(name);
      const history = db.getPriceHistory(name);
      const last = history.length > 0 ? history[history.length - 1] : null;
      if (result.steam) {
        hasData = true;
        const s = result.steam;
        console.log("  Steam   最低: " + fmtPrice(s.lowest) + "  中位: " + fmtPrice(s.median) + "  成交量: " + (s.volume || 0));
      }
      if (result.buff) {
        hasData = true;
        const b = result.buff;
        const oldBuff = last ? last.buff : null;
        const changeStr = oldBuff ? "  变化: " + fmtChange(oldBuff, b.minPrice) : "";
        console.log("  Buff163 最低: " + fmtPrice(b.minPrice) + "  在售: " + (b.volume || 0) + "件" + changeStr);
        if (b.steamPrice) console.log("          Steam参考: " + fmtPrice(b.steamPrice));
      }
      if (result.youpin) {
        hasData = true;
        const y = result.youpin;
        console.log("  悠悠有品 最低: " + fmtPrice(y.minPrice) + "  在售: " + (y.volume || 0) + "件");
      }
      const prices = [
        { p: "Steam", v: result.steam ? result.steam.lowest : null },
        { p: "Buff", v: result.buff ? result.buff.minPrice : null },
        { p: "悠悠", v: result.youpin ? result.youpin.minPrice : null }
      ].filter(function(x) { return x.v; });
      prices.sort(function(a, b) { return a.v - b.v; });
      if (prices.length >= 2) {
        const spread = ((prices[prices.length - 1].v - prices[0].v) / prices[0].v * 100).toFixed(1);
        console.log(C.M + "  \ud83d\udca1 价差: " + prices[0].p + "(" + fmtPrice(prices[0].v) + ") " + "\u2192" + " " + prices[prices.length - 1].p + "(" + fmtPrice(prices[prices.length - 1].v) + ") = " + (parseFloat(spread) > 0 ? C.R : C.G) + spread + "%" + C.X);
      }
      db.savePrice(name, result.steam ? result.steam.lowest : null, result.buff ? result.buff.minPrice : null, result.youpin ? result.youpin.minPrice : null);
    } catch (e) {
      console.log(C.R + "  \u2717 " + e.message + C.X);
    }
    await new Promise(function(r) { return setTimeout(r, 500); });
  }
  console.log("");
  if (!hasData && list.length > 0) console.log(NET_FAIL_MSG);
}

function cmdWatchlist() {
  const list = loadWatchlist();
  if (list.length === 0) { console.log(C.Y + "监控列表为空" + C.X); return; }
  console.log(C.BOLD + "\n\ud83d\udccb 监控列表 (" + list.length + " 个)\n" + C.X);
  list.forEach(function(name, i) { console.log("  " + (i + 1) + ". " + name); });
  console.log("");
}

function cmdAdd(skinName) {
  if (!skinName) { console.log(C.R + "用法: node index.js add <皮肤名>" + C.X); return; }
  const list = loadWatchlist();
  if (list.includes(skinName)) { console.log(C.Y + "已在列表中" + C.X); return; }
  list.push(skinName);
  saveWatchlist(list);
  console.log(C.G + "\u2713 已添加: " + skinName + C.X);
}

function cmdRemove(skinName) {
  if (!skinName) { console.log(C.R + "用法: node index.js remove <皮肤名>" + C.X); return; }
  let list = loadWatchlist();
  list = list.filter(function(n) { return n !== skinName; });
  saveWatchlist(list);
  console.log(C.G + "\u2713 已移除: " + skinName + C.X);
}

function cmdBuy(skinName, buyPrice, platform) {
  if (!skinName || !buyPrice) { console.log(C.R + "用法: node index.js buy <皮肤名> <价格> [平台]" + C.X); return; }
  const id = db.buyItem(skinName, parseFloat(buyPrice), platform || "Buff");
  console.log(C.G + "\u2713 买入记录已保存" + C.X);
  console.log("  ID: " + id + "  |  " + skinName + "  |  \u00a5" + buyPrice + "  |  " + (platform || "Buff"));
}

function cmdSell(id, sellPrice) {
  if (!id || !sellPrice) { console.log(C.R + "用法: node index.js sell <持仓ID> <卖价>" + C.X); return; }
  const result = db.sellItem(id, parseFloat(sellPrice));
  if (!result) { console.log(C.R + "\u2717 未找到: " + id + C.X); return; }
  const profit = parseFloat(result.profit);
  console.log((profit >= 0 ? C.G : C.R) + "\u2713 " + result.name + C.X);
  console.log("  买入 \u00a5" + result.buyPrice + " \u2192 卖出 \u00a5" + sellPrice + " = " + (profit >= 0 ? C.G : C.R) + "\u00a5" + result.profit + C.X);
}

function cmdStats() {
  const stats = db.getStats();
  console.log(C.BOLD + "\n\ud83d\udcca 盈亏统计\n" + C.X);
  divider();
  console.log("  总交易  " + stats.totalTrades + "笔    总成本  \u00a5" + stats.totalCost);
  console.log("  总利润  " + (parseFloat(stats.totalProfit) >= 0 ? C.G : C.R) + "\u00a5" + stats.totalProfit + C.X + "    ROI  " + stats.roi);
  console.log("  持仓中  " + stats.holding + "件 (\u00a5" + stats.holdingValue + ")");
  console.log("");
}

function cmdAlert(skinName, threshold, direction) {
  if (!skinName || !threshold || !["above", "below"].includes(direction)) {
    console.log(C.R + "用法: node index.js alert <皮肤名> <价格> <above|below>" + C.X); return;
  }
  db.setAlert(skinName, parseFloat(threshold), direction);
  console.log(C.G + "\u2713 告警: " + skinName + " " + (direction === "above" ? "\u2265" : "\u2264") + " \u00a5" + threshold + C.X);
}

function cmdAlerts() {
  const alerts = db.getAllAlerts();
  if (alerts.length === 0) { console.log(C.Y + "暂无告警" + C.X); return; }
  console.log(C.BOLD + "\n\ud83d\udd14 价格告警\n" + C.X);
  divider();
  alerts.forEach(function(a) {
    console.log("  " + a.skinName + " " + (a.direction === "above" ? "\u2265" : "\u2264") + " \u00a5" + a.thresholdPrice);
  });
  console.log("");
}

function cmdHistory(skinName) {
  if (!skinName) { console.log(C.R + "用法: node index.js history <皮肤名>" + C.X); return; }
  const history = db.getPriceHistory(skinName);
  if (history.length === 0) { console.log(C.Y + "暂无 " + skinName + " 的价格历史" + C.X); return; }
  console.log(C.BOLD + "\n\ud83d\udcc8 " + skinName + " 价格历史 (" + history.length + "条)\n" + C.X);
  divider();
  const recent = history.slice(-20);
  recent.forEach(function(h) {
    const d = new Date(h.time).toLocaleString("zh-CN");
    console.log("  " + d + "  Steam:" + fmtPrice(h.steam) + "  Buff:" + fmtPrice(h.buff) + "  悠悠:" + fmtPrice(h.youpin));
  });
  if (recent.length >= 2) {
    const first = recent[0].buff, last = recent[recent.length - 1].buff;
    if (first && last) console.log("\n  趋势(Buff): " + fmtChange(first, last));
  }
  console.log("");
}

function cmdPositions() {
  const positions = db.loadPositions();
  const entries = Object.entries(positions);
  if (entries.length === 0) { console.log(C.Y + "暂无持仓记录" + C.X); return; }
  console.log(C.BOLD + "\n\ud83d\udcbc 持仓记录\n" + C.X);
  divider();
  entries.forEach(function(entry) {
    const id = entry[0], p = entry[1];
    const status = p.sold ? (parseFloat(p.profit) >= 0 ? C.G + "已卖出 \u2705" : C.R + "已卖出 \u274c") : C.Y + "持有中";
    console.log("  " + pad(id.slice(-16), 18) + pad(p.name, 30) + "\u00a5" + pad(String(p.buyPrice), 10) + (p.sold ? "\u2192 \u00a5" + pad(String(p.sellPrice), 10) + pad("\u00a5" + p.profit, 12) : "") + C.X + status + C.X);
  });
  console.log("");
}

function cmdPrice(skinName, price, platform) {
  if (!skinName || !price) {
    console.log(C.R + "用法: node index.js price <皮肤名> <价格> [平台:Buff|Steam|悠悠]" + C.X);
    return;
  }
  const p = parseFloat(price);
  const pf = platform || "Buff";
  db.savePrice(skinName, pf === "Steam" ? p : null, pf === "Buff" ? p : null, pf === "悠悠" ? p : null);
  console.log(C.G + "\u2713 已记录: " + skinName + " \u00a5" + price + " (" + pf + ")" + C.X);
}

function cmdAnalyze(skinName) {
  if (!skinName) { console.log(C.R + "用法: node index.js analyze <皮肤名>" + C.X); return; }
  const result = analyzer.score(skinName);
  const history = db.getPriceHistory(skinName);
  const prices = history.map(function(h) { return h.buff; }).filter(Boolean);
  if (prices.length === 0) { console.log(C.Y + "暂无 " + skinName + " 的价格数据" + C.X + " 请先 check 或 demo"); return; }

  console.log(C.BOLD + "\n\ud83d\udd0d " + skinName + " 深度分析\n" + C.X);
  divider();

  const scoreColor = result.score >= 70 ? C.G : result.score >= 40 ? C.Y : C.R;
  console.log("  综合评分: " + scoreColor + C.BOLD + result.score + "/100" + C.X + "  " + C.W + result.reason + C.X);
  console.log("");

  const d = result.detail;
  const currentPrice = prices[prices.length - 1];
  console.log("  \u25cf 当前价格(Buff): " + fmtPrice(currentPrice));
  console.log("  \u25cf 波动率:        " + d.volatility);
  const trendIcon = d.trend.includes("上涨") ? C.R : d.trend.includes("下跌") ? C.G : C.Y;
  console.log("  \u25cf 趋势:          " + trendIcon + d.trend + C.X);
  console.log("  \u25cf MA5 (5日均线):  " + fmtPrice(parseFloat(d.ma5)));
  console.log("  \u25cf MA10 (10日均线): " + fmtPrice(parseFloat(d.ma10)));

  if (d.support.length > 0) {
    console.log("  \u25cf 支撑位:        " + d.support.map(function(v) { return fmtPrice(parseFloat(v)); }).join("  "));
  }
  if (d.resistance.length > 0) {
    console.log("  \u25cf 阻力位:        " + d.resistance.map(function(v) { return fmtPrice(parseFloat(v)); }).join("  "));
  }

  if (d.support.length > 0) {
    const nearestS = d.support.map(function(v) { return parseFloat(v); }).filter(function(v) { return v < currentPrice; }).sort(function(a,b) { return b-a; })[0];
    if (nearestS) {
      const dist = ((currentPrice - nearestS) / currentPrice * 100).toFixed(1);
      console.log("  \u25cf 距最近支撑:    " + (parseFloat(dist) < 5 ? C.G : C.W) + dist + "%" + C.X + " (\u00a5" + nearestS.toFixed(2) + ")");
    }
  }
  if (d.resistance.length > 0) {
    const nearestR = d.resistance.map(function(v) { return parseFloat(v); }).filter(function(v) { return v > currentPrice; }).sort(function(a,b) { return a-b; })[0];
    if (nearestR) {
      const dist = ((nearestR - currentPrice) / currentPrice * 100).toFixed(1);
      console.log("  \u25cf 距最近阻力:    " + (parseFloat(dist) < 5 ? C.R : C.W) + dist + "%" + C.X + " (\u00a5" + nearestR.toFixed(2) + ")");
    }
  }

  console.log("\n  \ud83d\udca1 操作建议:");
  if (result.score >= 70) {
    console.log(C.G + "    评分较高，可考虑分批建仓。关注支撑位附近入场。" + C.X);
  } else if (result.score >= 40) {
    console.log(C.Y + "    评分中等，观望为主。等待趋势明朗或价格回调到支撑位再操作。" + C.X);
  } else {
    console.log(C.R + "    评分较低，建议暂时回避。等待价格回落到支撑位或趋势反转。" + C.X);
  }
  console.log("");
}

function cmdPlan() {
  const capital = 500;
  const list = loadWatchlist();
  if (list.length === 0) { console.log(C.Y + "监控列表为空，先 add 皮肤或用 demo 生成数据" + C.X); return; }

  console.log(C.BOLD + "\n\ud83d\udcb0 \u00a5" + capital + " 资金分配方案\n" + C.X);
  divider();

  const allocation = analyzer.allocationPlan(capital, list);

  if (allocation.plan.length === 0) {
    console.log(C.Y + "  暂无可推荐方案。需要更多数据或更高评分的皮肤。" + C.X);
    console.log(C.W + "  提示: 至少需要5条价格历史才能评分" + C.X);
    return;
  }

  allocation.plan.forEach(function(item, i) {
    const icon = ["\ud83e\udd47", "\ud83e\udd48", "\ud83e\udd49", "4\u20e3", "5\u20e3"][i];
    const scoreColor = item.score >= 70 ? C.G : item.score >= 40 ? C.Y : C.R;
    console.log("  " + icon + " " + pad(item.name, 35) + fmtPrice(item.price) + " x" + item.qty + "  \u00a5" + item.actualCost + "  " + scoreColor + item.score + "分" + C.X);
  });

  const totalSpent = allocation.plan.reduce(function(s, i) { return s + parseFloat(i.actualCost); }, 0);
  console.log("");
  console.log(C.W + "  合计投入: \u00a5" + totalSpent.toFixed(2) + "  |  剩余现金: \u00a5" + allocation.remaining + C.X);
  console.log(C.W + "  候选皮肤: " + allocation.totalSkins + " 个  |  及格(>=40分): " + allocation.qualified + " 个" + C.X);
  console.log(C.Y + "\n  \u26a0 以上为数据驱动参考，不构成投资建议。实盘请自行判断。" + C.X);
  console.log("");
}

function cmdRisk() {
  const list = loadWatchlist();
  if (list.length === 0) { console.log(C.Y + "监控列表为空" + C.X); return; }

  console.log(C.BOLD + "\n\u26a0\ufe0f 风险评估报告\n" + C.X);
  divider();

  let totalVol = 0, totalDD = 0, count = 0;
  console.log(C.W + "  " + pad("皮肤", 35) + pad("波动率", 10) + pad("最大回撤", 10) + pad("趋势", 12) + C.X);
  divider();

  for (const name of list) {
    const history = db.getPriceHistory(name);
    const prices = history.map(function(h) { return h.buff; }).filter(Boolean);
    if (prices.length < 5) continue;
    const vol = analyzer.volatility(prices);
    const currentPrice = prices[prices.length - 1];
    const volPct = currentPrice > 0 ? (vol / currentPrice * 100) : 0;
    const dd = analyzer.maxDrawdown(prices);
    const t = analyzer.trend(prices);

    const volColor = volPct > 8 ? C.R : volPct > 4 ? C.Y : C.G;
    const ddColor = dd > 0.15 ? C.R : dd > 0.08 ? C.Y : C.G;
    const trendColor = t.includes("跌") ? C.R : t.includes("涨") ? C.Y : C.W;

    console.log("  " + pad(name, 35) + volColor + pad(volPct.toFixed(1) + "%", 10) + ddColor + pad((dd*100).toFixed(1) + "%", 10) + trendColor + t + C.X);

    totalVol += volPct;
    totalDD += dd;
    count++;
  }

  if (count > 0) {
    console.log("");
    divider();
    const avgVol = (totalVol / count).toFixed(1);
    const avgDD = (totalDD / count * 100).toFixed(1);
    console.log(C.BOLD + "  组合平均波动: " + avgVol + "%  |  平均最大回撤: " + avgDD + "%" + C.X);

    const posPct = analyzer.calcPosition(500, 0.45, 1.5);
    console.log(C.BOLD + "  建议单次仓位: " + C.Y + "\u00a5" + (500 * posPct).toFixed(0) + " (" + (posPct*100).toFixed(0) + "%)" + C.X);
    console.log(C.W + "  说明: 低胜率环境下控制仓位上限，防止单次大亏出局。" + C.X);
  }
  console.log("");
}

function cmdMomentum() {
  const list = loadWatchlist();
  if (list.length === 0) { console.log(C.Y + "监控列表为空" + C.X + " 先 add 皮肤或用 demo 生成数据"); return; }
  console.log(C.BOLD + "\n📈 动量信号 (连涨3天=买入 / 连跌=回避)\n" + C.X);
  divider();
  for (const name of list) {
    const m = analyzer.momentumSignal(name);
    const color = m.signal.includes("买入") ? C.G : m.signal.includes("回避") ? C.R : C.Y;
    console.log("  " + pad(name, 38) + color + m.signal + C.X + (m.up + m.down > 0 ? "  (涨" + m.up + "天/跌" + m.down + "天)" : ""));
  }
  console.log(C.Y + "\n  ⚠ 基于已验证的动量规律: 饰品市场连涨追、连跌避。数据参考，不构成投资建议。" + C.X);
  console.log("");
}

function cmdDemo() {
  const skins = [
    { name: "AK-47 | Redline (Field-Tested)", price: 85 },
    { name: "AWP | Asiimov (Field-Tested)", price: 320 },
    { name: "M4A1-S | Printstream (Field-Tested)", price: 680 },
    { name: "Desert Eagle | Printstream (Field-Tested)", price: 120 },
    { name: "USP-S | Printstream (Field-Tested)", price: 45 }
  ];
  console.log(C.BOLD + "\n\ud83c\udfae 生成模拟数据 (30天)...\n" + C.X);
  const now = new Date();
  skins.forEach(function(skin) {
    var name = skin.name, price = skin.price;
    if (!loadWatchlist().includes(name)) cmdAdd(name);
    var historyFile = path.join(__dirname, "data", "price_history.json");
    var history = {};
    try { history = JSON.parse(fs.readFileSync(historyFile, "utf-8")); } catch(e) {}
    if (!history[name]) history[name] = [];
    for (var d = 30; d >= 0; d--) {
      var day = new Date(now - d * 86400000);
      day.setHours(10 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60), 0, 0);
      var t = day.toISOString();
      var base = price + (Math.random() - 0.5) * price * 0.15;
      var variance = ((Math.random() - 0.5) * 0.04) + (d * 0.0008);
      var buffPrice = parseFloat((base * (1 + variance)).toFixed(2));
      var steamPrice = parseFloat((buffPrice * (1.42 + Math.random() * 0.1)).toFixed(2));
      var youpinPrice = parseFloat((buffPrice * (0.98 + Math.random() * 0.02)).toFixed(2));
      history[name].push({ time: t, steam: steamPrice, buff: buffPrice, youpin: youpinPrice });
    }
    var dir = path.dirname(historyFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
    console.log(C.G + "  \u2713 " + name + " (Buff ~\u00a5" + price + ", 31条记录)" + C.X);
  });
  var positions = db.loadPositions();
  if (Object.keys(positions).length === 0) {
    db.buyItem("AK-47 | Redline (Field-Tested)", 78, "Buff", new Date(now - 15 * 86400000).toISOString());
    db.buyItem("Desert Eagle | Printstream (Field-Tested)", 115, "悠悠", new Date(now - 8 * 86400000).toISOString());
    db.buyItem("USP-S | Printstream (Field-Tested)", 40, "Buff", new Date(now - 5 * 86400000).toISOString());
  }
  console.log(C.G + "  \u2713 3条模拟持仓已生成" + C.X);
  console.log(C.Y + "\n\u26a0 以上为模拟演示数据。真实使用时删掉 data/ 目录重新开始。" + C.X);
  console.log("  接下来试试: analyze | plan | risk | stats\n" + C.X);
}

const AI_ALERT_THRESHOLD = 15; // 单次涨跌幅 ≥15% 自动触发 AI 分析

async function maybeAIAlert(skinName, currentPrice, lastPrice) {
  if (!lastPrice || !currentPrice) return;
  const pct = Math.abs(currentPrice - lastPrice) / lastPrice * 100;
  if (pct < AI_ALERT_THRESHOLD) return;
  console.log(C.R + C.BOLD + "\n  🚨 异动检测: " + skinName + " " + (currentPrice > lastPrice ? "↑" : "↓") + pct.toFixed(1) + "% → 触发 AI 分析" + C.X);
  const history = db.getPriceHistory(skinName);
  const prices = history.map(function(h) { return h.buff; }).filter(Boolean);
  const mean = prices.reduce(function(s, v) { return s + v; }, 0) / prices.length;
  const vol = analyzer.volatility(prices);
  const stats = {
    current: currentPrice, mean: mean, count: prices.length,
    volatilityPct: currentPrice > 0 ? (vol / currentPrice * 100).toFixed(1) : null,
    trend: analyzer.trend(prices), maxDrawdownPct: (analyzer.maxDrawdown(prices) * 100).toFixed(1),
  };
  const report = await ai.analyze(skinName, stats);
  report.split("\n").forEach(function(line) { console.log("  " + line); });
  console.log("");
}

async function cmdMonitor(interval) {
  const sec = parseInt(interval) || 300;
  const list = loadWatchlist();
  if (list.length === 0) { console.log(C.Y + "监控列表为空" + C.X); return; }
  console.log(C.BOLD + "\n\ud83d\udd04 监控模式 (" + sec + "秒/次) | " + list.join(", ") + C.X);
  console.log(C.Y + "按 Ctrl+C 退出\n" + C.X);
  const check = async function() {
    const now = new Date().toLocaleTimeString("zh-CN");
    console.log(C.B + "[" + now + "]" + C.X);
    for (const name of list) {
      try {
        const result = await fetcher.getAllPrices(name);
        const history = db.getPriceHistory(name);
        const last = history.length > 0 ? history[history.length - 1] : null;
        if (result.buff) {
          const change = last && last.buff ? fmtChange(last.buff, result.buff.minPrice) : "";
          console.log("  " + pad(name, 40) + "Buff: " + fmtPrice(result.buff.minPrice) + "  " + change);
          db.savePrice(name, result.steam ? result.steam.lowest : null, result.buff.minPrice, result.youpin ? result.youpin.minPrice : null);
          if (last && last.buff) await maybeAIAlert(name, result.buff.minPrice, last.buff);
        } else {
          console.log(C.R + "  \u2717 " + name + ": 获取失败" + C.X);
        }
        const alerts = db.getAllAlerts();
        for (const a of alerts) {
          const price = result.buff ? result.buff.minPrice : null;
          if (!price) continue;
          const triggered = (a.direction === "below" && price <= a.thresholdPrice) || (a.direction === "above" && price >= a.thresholdPrice);
          if (triggered) console.log(C.R + C.BOLD + "  \ud83d\udea8 告警! " + a.skinName + " \u00a5" + price + " (阈值 \u00a5" + a.thresholdPrice + ")" + C.X);
        }
      } catch (e) {
        console.log(C.R + "  \u2717 " + name + C.X);
      }
      await new Promise(function(r) { return setTimeout(r, 500); });
    }
  };
  await check();
  setInterval(check, sec * 1000);
}

async function cmdAI(skinName) {
  if (!skinName) { console.log(C.R + "用法: node index.js ai <皮肤名>" + C.X + " (GLM 深度分析,需先 check/demo 有数据)"); return; }
  const history = db.getPriceHistory(skinName);
  const prices = history.map(function(h) { return h.buff; }).filter(Boolean);
  if (prices.length === 0) { console.log(C.Y + "暂无 " + skinName + " 的价格数据" + C.X + " 请先 check 或 demo"); return; }

  console.log(C.BOLD + "\n🤖 GLM 深度分析 — " + skinName + (ai.hasKey() ? "" : C.Y + " (离线演示模式)") + C.X);
  divider();

  const current = prices[prices.length - 1];
  const mean = prices.reduce(function(s, v) { return s + v; }, 0) / prices.length;
  const vol = analyzer.volatility(prices);
  const stats = {
    current: current,
    mean: mean,
    count: prices.length,
    volatilityPct: current > 0 ? (vol / current * 100).toFixed(1) : null,
    trend: analyzer.trend(prices),
    maxDrawdownPct: (analyzer.maxDrawdown(prices) * 100).toFixed(1),
  };

  const report = await ai.analyze(skinName, stats);
  report.split("\n").forEach(function(line) { console.log("  " + line); });
  console.log("");
}

function cmdHelp() {
  console.log(C.BOLD + "\n\ud83d\udd2b CS2 饰品价格监控 & 交易辅助工具\n" + C.X);
  console.log("零依赖 | Steam + Buff163 + 悠悠有品 | 500->30000 助力\n");
  divider();
  const cmds = [
    ["add <皮肤名>", "添加到监控列表"],
    ["remove <皮肤名>", "从监控列表移除"],
    ["watchlist", "查看监控列表"],
    ["check [皮肤名]", "查询实时价格 (三平台)"],
    ["history <皮肤名>", "价格历史 + 趋势分析"],
    ["price <皮肤名> <价格> [平台]", "手动录入价格"],
    ["buy <皮肤名> <价格> [平台]", "记录买入"],
    ["sell <持仓ID> <价格>", "记录卖出"],
    ["positions", "查看持仓"],
    ["stats", "盈亏统计 + ROI"],
    ["alert <皮肤名> <价格> <above|below>", "设置价格告警"],
    ["alerts", "查看所有告警"],
    ["monitor [秒数]", "持续监控 (默认5分钟)"],
    ["analyze <皮肤名>", "深度分析 (均线/波动/支撑/评分)"],
    ["ai <皮肤名>", "GLM AI 深度分析 (无key时为离线演示)"],
    ["plan", "500元资金分配方案"],
    ["momentum", "动量信号 (连涨3天=买入/连跌=回避)"],
    ["risk", "风险评估 (波动率/回撤/仓位)"],
    ["demo", "生成模拟数据体验功能"],
  ];
  cmds.forEach(function(pair) {
    console.log(C.B + "  " + pad(pair[0], 38) + C.W + pair[1] + C.X);
  });
  console.log(C.Y + "\n\ud83d\udca1 新手快速开始:" + C.X);
  console.log("  1. node index.js demo           # 生成模拟数据");
  console.log("  2. node index.js analyze <皮肤>  # 深度分析单个皮肤");
  console.log("  3. node index.js plan            # 查看500元分配方案");
  console.log("  4. node index.js risk            # 组合风险评估");
  console.log("  5. node index.js stats           # 盈亏统计");
  console.log("");
}

(async function() {
  var args = process.argv.slice(2);
  var cmd = args[0];
  try {
    switch (cmd) {
      case "add": cmdAdd(args[1]); break;
      case "remove": cmdRemove(args[1]); break;
      case "watchlist": cmdWatchlist(); break;
      case "check": cmdCheck(args[1]); break;
      case "history": cmdHistory(args[1]); break;
      case "price": cmdPrice(args[1], args[2], args[3]); break;
      case "buy": cmdBuy(args[1], args[2], args[3]); break;
      case "sell": cmdSell(args[1], args[2]); break;
      case "positions": cmdPositions(); break;
      case "stats": cmdStats(); break;
      case "alert": cmdAlert(args[1], args[2], args[3]); break;
      case "alerts": cmdAlerts(); break;
      case "monitor": cmdMonitor(args[1]); break;
      case "analyze": cmdAnalyze(args[1]); break;
      case "ai": await cmdAI(args[1]); break;
      case "plan": cmdPlan(); break;
      case "momentum": cmdMomentum(); break;
      case "risk": cmdRisk(); break;
      case "demo": cmdDemo(); break;
      default: cmdHelp(); break;
    }
  } catch (e) {
    console.error(C.R + "错误: " + e.message + C.X);
    process.exitCode = 1;
  }
})();