// AI 层测试:提示词构造与离线降级(不发真实网络请求)
const test = require('node:test');
const assert = require('node:assert');
const ai = require('../lib/ai');

const STATS = { current: 85, mean: 82.5, count: 31, volatilityPct: '3.2', trend: '温和上涨', maxDrawdownPct: '6.1' };

test('buildPrompt 包含关键统计与皮肤名', () => {
  const msgs = ai.buildPrompt('AK-47 | Redline', STATS);
  const text = msgs.map(m => m.content).join('\n');
  assert.match(text, /AK-47 \| Redline/);
  assert.match(text, /85/);
  assert.match(text, /82\.50/);
  assert.strictEqual(msgs[0].role, 'system');
});

test('离线报告明示离线模式并含免责声明', () => {
  const r = ai.offlineReport('AK-47 | Redline', STATS);
  assert.match(r, /离线模式/);
  assert.match(r, /AK-47 \| Redline/);
  assert.match(r, /不构成投资建议/);
});

test('无 key 时 hasKey 为 false 且 analyze 走离线路径', async () => {
  delete process.env.ZHIPU_API_KEY;
  delete process.env.GLM_API_KEY;
  assert.strictEqual(ai.hasKey(), false);
  const r = await ai.analyze('AK-47 | Redline', STATS);
  assert.match(r, /离线模式/);
});
