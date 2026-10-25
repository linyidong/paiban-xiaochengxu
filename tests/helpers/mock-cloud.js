// 测试用云开发 mock：只实现云函数用到的集合读写接口，不连接真实云环境。
// 用法：loadWithMock(fnPath, state) 会临时替换 require('wx-server-sdk')，返回云函数的 main。
const Module = require('module');

function createState() {
  return {
    users: [
      { _id: 'u1', openid: 'o-member-1', name: '甲', role: 'member' },
      { _id: 'u2', openid: 'o-member-2', name: '乙', role: 'member' },
      { _id: 'u3', openid: 'o-admin', name: '管理员', role: 'admin' }
    ],
    shifts: [],
    changeLog: [],
    memos: [],
    openid: '',
    seq: 0
  };
}

function op(name, value) {
  return {
    __op: name,
    value: value,
    and: function (other) { return { __op: 'and', ops: [this, other] }; }
  };
}

const command = {
  gte: function (v) { return op('gte', v); },
  lte: function (v) { return op('lte', v); },
  neq: function (v) { return op('neq', v); },
  eq: function (v) { return op('eq', v); }
};

function valueMatch(docVal, expected) {
  if (expected && typeof expected === 'object' && expected.__op) {
    if (expected.__op === 'and') return expected.ops.every(function (o) { return valueMatch(docVal, o); });
    if (expected.__op === 'gte') return docVal >= expected.value;
    if (expected.__op === 'lte') return docVal <= expected.value;
    if (expected.__op === 'neq') return docVal !== expected.value;
    if (expected.__op === 'eq') return docVal === expected.value;
  }
  return docVal === expected;
}

function match(doc, cond) {
  return Object.keys(cond).every(function (k) { return valueMatch(doc[k], cond[k]); });
}

function createDb(state) {
  return {
    command: command,
    serverDate: function () { return new Date(); },
    collection: function (name) {
      const arr = state[name] || (state[name] = []);
      function query(cond) {
        return {
          get: async function () { return { data: arr.filter(function (d) { return match(d, cond); }) }; },
          count: async function () { return { total: arr.filter(function (d) { return match(d, cond); }).length }; },
          remove: async function () {
            const keep = arr.filter(function (d) { return !match(d, cond); });
            const removed = arr.length - keep.length;
            arr.length = 0;
            keep.forEach(function (d) { arr.push(d); });
            return { stats: { removed: removed } };
          },
          orderBy: function () { return query(cond); },
          limit: function () { return query(cond); }
        };
      }
      return {
        where: query,
        get: async function () { return { data: arr.slice() }; },
        orderBy: function () { return query({}); },
        limit: function () { return query({}); },
        add: async function (payload) {
          const d = Object.assign({ _id: 'x' + (++state.seq) }, payload.data);
          arr.push(d);
          return { _id: d._id };
        },
        doc: function (id) {
          return {
            get: async function () {
              const d = arr.find(function (x) { return x._id === id; });
              if (!d) throw new Error('not found');
              return { data: d };
            },
            update: async function (payload) {
              const d = arr.find(function (x) { return x._id === id; });
              if (d) Object.assign(d, payload.data);
              return { stats: { updated: d ? 1 : 0 } };
            },
            remove: async function () {
              const i = arr.findIndex(function (x) { return x._id === id; });
              if (i > -1) arr.splice(i, 1);
              return { stats: { removed: i > -1 ? 1 : 0 } };
            }
          };
        }
      };
    }
  };
}

function loadModuleWithMock(fnPath, state) {
  const sdk = {
    DYNAMIC_CURRENT_ENV: 'test',
    init: function () {},
    getWXContext: function () { return { OPENID: state.openid }; },
    database: function () { return createDb(state); }
  };
  const orig = Module._load;
  Module._load = function (request) {
    if (request === 'wx-server-sdk') return sdk;
    return orig.apply(this, arguments);
  };
  try {
    delete require.cache[require.resolve(fnPath)];
    return require(fnPath);
  } finally {
    Module._load = orig;
  }
}

function loadWithMock(fnPath, state) {
  return loadModuleWithMock(fnPath, state).main;
}

module.exports = { createState, loadWithMock, loadModuleWithMock };
