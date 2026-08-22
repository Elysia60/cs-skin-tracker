// F2/F3 回归测试:输入清洗
const test = require('node:test');
const assert = require('node:assert');
const { stripANSI, sanitizeNumber, sanitizeName } = require('../lib/validate');

test('stripANSI 移除终端转义序列(防 ANSI 注入)', () => {
  assert.strictEqual(stripANSI('\x1b[31mAK-47\x1b[0m'), 'AK-47');
  assert.strictEqual(stripANSI('\x1b[2J\x1b[H清屏攻击'), '清屏攻击');
  assert.strictEqual(stripANSI(null), '');
});

test('sanitizeNumber 解析货币字符串', () => {
  assert.strictEqual(sanitizeNumber('¥ 85.00'), 85);
  assert.strictEqual(sanitizeNumber('¥1,234.56'), 1234.56);
  assert.strictEqual(sanitizeNumber(123), 123);
});

test('sanitizeNumber 拒绝脏数据', () => {
  assert.strictEqual(sanitizeNumber('abc'), null);
  assert.strictEqual(sanitizeNumber(''), null);
  assert.strictEqual(sanitizeNumber(-5), null);          // 价格无负数
  assert.strictEqual(sanitizeNumber(1e12), null);        // 超上限
  assert.strictEqual(sanitizeNumber('NaN'), null);
});

test('sanitizeName 限长且去控制序列', () => {
  assert.strictEqual(sanitizeName('  AK-47 | Redline  '), 'AK-47 | Redline');
  assert.strictEqual(sanitizeName('\x1b[31mx'.repeat(300)).length, 200);
});
