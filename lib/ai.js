// GLM AI 分析层 — 有 key 走真实调用,无 key 降级为明示的规则演示报告
const https = require('https');
const { stripANSI } = require('./validate');

function hasKey() {
  return !!(process.env.ZHIPU_API_KEY || process.env.GLM_API_KEY);
}

function endpoint() {
  return process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
}

function model() {
  return process.env.GLM_MODEL || 'glm-5.3';
}

// 底层 chat 调用,返回模型文本
function chat(messages, timeoutMs) {
  timeoutMs = timeoutMs || 30000;
  return new Promise((resolve, reject) => {
    const key = process.env.ZHIPU_API_KEY || process.env.GLM_API_KEY;
    const payload = JSON.stringify({ model: model(), messages, max_tokens: 800, temperature: 0.4 });
    const url = new URL(endpoint());
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: timeoutMs,
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.error) return reject(new Error(data.error.message || JSON.stringify(data.error)));
          const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
          resolve(text ? stripANSI(text) : '');
        } catch (e) { reject(new Error('AI 响应解析失败: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('AI 请求超时')); });
    req.write(payload);
    req.end();
  });
}

// 用价格统计构造分析指令
function buildPrompt(skin, stats) {
  return [
    { role: 'system', content: '你是 CS2 饰品交易数据分析师。基于给定统计做简明分析,输出三段:【现状】【风险】【建议】。数据有限时明说,不编造。最后加一句"以上为数据参考,不构成投资建议"。' },
    { role: 'user', content: '皮肤: ' + skin + '\n当前价(Buff): ¥' + stats.current + '\n30日均价: ¥' + stats.mean.toFixed(2) + '\n波动率: ' + (stats.volatilityPct || 'N/A') + '%\n趋势: ' + (stats.trend || 'N/A') + '\n最大回撤: ' + (stats.maxDrawdownPct || 'N/A') + '%\n样本数: ' + stats.count },
  ];
}

// 无 key / 调用失败时的规则报告,首行明示离线
function offlineReport(skin, stats) {
  const drift = ((stats.current - stats.mean) / stats.mean * 100).toFixed(1);
  const pos = drift > 5 ? '高于均值偏多,追高风险上升' : drift < -5 ? '低于均值,可能是回调也可能是需求萎缩' : '贴近均值,处于常规区间';
  return [
    '[离线模式] 未配置 ZHIPU_API_KEY,以下为本地规则生成的演示分析:',
    '',
    '【现状】' + skin + ' 当前 ¥' + stats.current + ',较30日均值偏离 ' + drift + '%,' + pos + '。',
    '【风险】样本 ' + stats.count + ' 条,波动率 ' + (stats.volatilityPct || 'N/A') + '%,统计意义有限;饰品流动性差,极端行情下滑点可能无承接。',
    '【建议】配置 ZHIPU_API_KEY 后可获取 GLM 生成的深度分析。数据参考,不构成投资建议。',
  ].join('\n');
}

async function analyze(skin, stats) {
  if (!hasKey()) return offlineReport(skin, stats);
  try {
    return await chat(buildPrompt(skin, stats));
  } catch (e) {
    return '[AI 调用失败,降级为离线报告] ' + e.message + '\n\n' + offlineReport(skin, stats);
  }
}

module.exports = { hasKey, analyze, buildPrompt, offlineReport };
