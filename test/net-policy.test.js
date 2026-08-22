// F1 回归测试:重定向策略
const test = require('node:test');
const assert = require('node:assert');
const { nextRedirect, hostAllowed } = require('../lib/net-policy');

const ORIGIN = 'https://steamcommunity.com/market/priceoverview/';

test('允许:同域 HTTPS 重定向', () => {
  const r = nextRedirect('/moved', ORIGIN, 0);
  assert.ok(r.ok);
  assert.strictEqual(r.url, 'https://steamcommunity.com/moved');
});

test('允许:白名单内另一主机', () => {
  const r = nextRedirect('https://buff.163.com/api/x', ORIGIN, 0);
  assert.ok(r.ok);
});

test('拒绝:降级到 HTTP', () => {
  const r = nextRedirect('http://steamcommunity.com/moved', ORIGIN, 0);
  assert.ok(!r.ok);
  assert.match(r.reason, /non-HTTPS/);
});

test('拒绝:非白名单主机', () => {
  const r = nextRedirect('https://evil.example.com/x', ORIGIN, 0);
  assert.ok(!r.ok);
  assert.match(r.reason, /non-whitelisted/);
});

test('拒绝:超过最大跳数(防重定向环)', () => {
  const r = nextRedirect('https://steamcommunity.com/a', ORIGIN, 5);
  assert.ok(!r.ok);
  assert.match(r.reason, /too many redirects/);
});

test('拒绝:非法 location', () => {
  const r = nextRedirect('http://%zz', ORIGIN, 0);
  assert.ok(!r.ok);
});

test('主机白名单大小写不敏感', () => {
  assert.ok(hostAllowed('SteamCommunity.COM'));
  assert.ok(!hostAllowed('steamcommunity.com.evil.io'));
});
