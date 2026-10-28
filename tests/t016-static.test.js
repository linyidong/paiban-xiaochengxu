// T-016 回归测试：静态一致性（JSON、WXML 事件、require、页面注册、云函数、文档密钥、BOM）。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const MP = path.join(ROOT, 'miniprogram');

function walk(dir, out) {
  out = out || [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const files = walk(ROOT);
const jsonFiles = files.filter(function (f) { return f.endsWith('.json'); });
const jsFiles = files.filter(function (f) { return f.endsWith('.js'); });
const wxmlFiles = files.filter(function (f) { return f.endsWith('.wxml'); });

test('所有 JSON 文件可解析', function () {
  assert.ok(jsonFiles.length >= 20);
  jsonFiles.forEach(function (f) {
    assert.doesNotThrow(function () { JSON.parse(fs.readFileSync(f, 'utf8')); }, f);
  });
});

test('WXML 事件处理器都在对应 JS 中定义', function () {
  const missing = [];
  wxmlFiles.forEach(function (w) {
    const src = fs.readFileSync(w, 'utf8');
    const jsPath = w.replace(/\.wxml$/, '.js');
    if (!fs.existsSync(jsPath)) return;
    const js = fs.readFileSync(jsPath, 'utf8');
    const handlers = [];
    const re = /(?:bind|catch):?[a-zA-Z]+\s*=\s*"([^"]+)"/g;
    let m;
    while ((m = re.exec(src))) handlers.push(m[1]);
    handlers.forEach(function (h) {
      const def = new RegExp('(^|[\\s,{])' + h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[:(]', 'm');
      if (!def.test(js)) missing.push(path.relative(ROOT, w) + ' -> ' + h);
    });
  });
  assert.deepStrictEqual(missing, []);
});

test('所有相对 require 路径可解析', function () {
  const missing = [];
  jsFiles.forEach(function (f) {
    const src = fs.readFileSync(f, 'utf8');
    const re = /require\(['"](\.[^'"]+)['"]\)/g;
    let m;
    while ((m = re.exec(src))) {
      const p = path.resolve(path.dirname(f), m[1]);
      if (!fs.existsSync(p) && !fs.existsSync(p + '.js') && !fs.existsSync(path.join(p, 'index.js'))) {
        missing.push(path.relative(ROOT, f) + ' -> ' + m[1]);
      }
    }
  });
  assert.deepStrictEqual(missing, []);
});

test('app.json 页面与 tabBar 指向真实文件', function () {
  const app = JSON.parse(fs.readFileSync(path.join(MP, 'app.json'), 'utf8'));
  app.pages.forEach(function (p) {
    assert.ok(fs.existsSync(path.join(MP, p + '.js')), p + '.js');
    assert.ok(fs.existsSync(path.join(MP, p + '.wxml')), p + '.wxml');
  });
  (app.tabBar.list || []).forEach(function (t) {
    assert.ok(app.pages.includes(t.pagePath), t.pagePath);
  });
});

test('usingComponents 指向真实组件', function () {
  const pageJsons = jsonFiles.filter(function (f) { return f.startsWith(MP); });
  pageJsons.forEach(function (f) {
    const cfg = JSON.parse(fs.readFileSync(f, 'utf8'));
    const uc = cfg.usingComponents || {};
    Object.keys(uc).forEach(function (k) {
      const v = uc[k];
      const base = v.charAt(0) === '/' ? path.join(MP, v) : path.resolve(path.dirname(f), v);
      assert.ok(fs.existsSync(base + '.json'), f + ' -> ' + v);
    });
  });
});

test('前端调用的云函数目录都存在', function () {
  const dirs = fs.readdirSync(path.join(ROOT, 'cloudfunctions'), { withFileTypes: true })
    .filter(function (e) { return e.isDirectory(); })
    .map(function (e) { return e.name; });
  const used = new Set();
  jsFiles.filter(function (f) { return f.startsWith(MP); }).forEach(function (f) {
    const src = fs.readFileSync(f, 'utf8');
    const re = /name:\s*['"]([A-Za-z]+)['"]/g;
    let m;
    while ((m = re.exec(src))) if (dirs.includes(m[1])) used.add(m[1]);
  });
  assert.deepStrictEqual(Array.from(used).sort(), dirs.slice().sort());
});

test('docs 目录不含密钥与管理员 openid', function () {
  const docs = walk(path.join(ROOT, 'docs')).filter(function (f) { return f.endsWith('.md'); });
  docs.forEach(function (f) {
    const text = fs.readFileSync(f, 'utf8');
    assert.strictEqual(/ark-[A-Za-z0-9-]{20,}/.test(text), false, '密钥出现在 ' + f);
    // OpenID 形如 o + 27 位；示例占位符（o_your_admin_openid）不会命中
    assert.strictEqual(/o[A-Za-z0-9_-]{27,}/.test(text), false, 'openid 出现在 ' + f);
  });
});

test('docs 与源码无 UTF-8 BOM', function () {
  const targets = walk(path.join(ROOT, 'docs')).concat(jsFiles);
  targets.forEach(function (f) {
    const b = fs.readFileSync(f);
    if (b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) {
      assert.fail('BOM: ' + f);
    }
  });
});
