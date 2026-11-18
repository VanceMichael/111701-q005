import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePage, isWithdrawnState } from '../src/adapter.mjs';
import { collect } from '../src/pipeline.mjs';
import { RecordStore } from '../src/store.mjs';
import { TransientSourceError } from '../src/source.mjs';

test('采集链保留来源、记录身份和观察时间', async () => {
  const store = new RecordStore();
  const result = await collect({
    source: async () => ({
      source: 'local',
      observedAt: '2026-11-17T08:00:00.000Z',
      items: [{ id: 'a', label: '样例记录', state: 'active', revision: 1 }],
    }),
    store,
  });
  assert.equal(result.status, 'ok');
  assert.equal(result.records[0].source, 'local');
  assert.equal(result.records[0].id, 'a');
  assert.equal(result.records[0].observedAt, '2026-11-17T08:00:00.000Z');
  assert.equal(store.list().length, 1);
});

test('重复身份按较新的修订号更新', () => {
  const store = new RecordStore();
  store.save({ source: 'local', id: 'a', name: '旧值', state: 'active', revision: 1 });
  store.save({ source: 'local', id: 'a', name: '新值', state: 'active', revision: 2 });
  assert.equal(store.list()[0].name, '新值');
});

test('不完整来源记录被拒绝', () => {
  assert.throws(() => normalizePage({ source: 'local', items: [{ id: 'a' }] }));
});

test('来源明确撤场时记录被标记为撤场，并从有效活动视图中剔除', () => {
  const records = normalizePage({
    source: 'local',
    items: [
      { id: 'a', label: '保留活动', state: 'active', revision: 2 },
      { id: 'b', label: '被撤场次', state: 'withdrawn', revision: 2 },
    ],
  });
  assert.equal(records[0].withdrawn, false);
  assert.equal(records[1].withdrawn, true);
  assert.equal(records[1].state, 'cancelled');

  const store = new RecordStore();
  records.forEach((record) => store.save(record));
  const active = store.listActive();
  assert.deepEqual(active.map((record) => record.id), ['a']);
  // 撤场记录仍保留在全量归档里，便于审计
  assert.equal(store.list().length, 2);
});

test('撤场终态的各种来源叫法都被识别，撤场记录允许缺少标题', () => {
  for (const state of ['withdrawn', 'cancelled', 'canceled', 'closed', '撤场', '已取消']) {
    assert.equal(isWithdrawnState(state), true);
  }
  const [record] = normalizePage({ source: 'local', items: [{ id: 'x', state: '已撤场', revision: 1 }] });
  assert.equal(record.withdrawn, true);
  assert.equal(record.state, 'cancelled');
  assert.equal(record.name, 'x');
});

test('来源暂时读不到时保留全部既有归档，store 不被清空或改动', async () => {
  const store = new RecordStore();
  await collect({
    source: async () => ({
      source: 'local',
      observedAt: '2026-11-17T08:00:00.000Z',
      items: [{ id: 'a', label: '有效活动', state: 'active', revision: 1 }],
    }),
    store,
  });

  const result = await collect({
    source: async () => {
      throw new TransientSourceError('模拟网络抖动');
    },
    store,
  });

  assert.equal(result.status, 'unavailable');
  assert.ok(result.error instanceof TransientSourceError);
  assert.equal(store.list().length, 1);
  assert.equal(store.listActive().length, 1);
  assert.equal(store.list()[0].id, 'a');
});

test('一次普通请求失败同样不得清空仍有效的活动', async () => {
  const store = new RecordStore();
  store.save({ source: 'local', id: 'a', name: '有效活动', state: 'active', withdrawn: false, revision: 1 });

  const result = await collect({ source: async () => { throw new Error('boom'); }, store });

  assert.equal(result.status, 'unavailable');
  assert.equal(store.listActive().length, 1);
});

test('记录从页中消失不等于撤场，旧记录继续保留为有效', async () => {
  const store = new RecordStore();
  store.save({ source: 'local', id: 'a', name: '有效活动', state: 'active', withdrawn: false, revision: 1 });

  const result = await collect({
    source: async () => ({
      source: 'local',
      observedAt: '2026-11-18T08:00:00.000Z',
      items: [{ id: 'b', label: '另一场', state: 'active', revision: 1 }],
    }),
    store,
  });

  assert.equal(result.status, 'ok');
  assert.deepEqual(store.listActive().map((record) => record.id).sort(), ['a', 'b']);
});

test('详情页名额调整随新修订号更新', async () => {
  const store = new RecordStore();
  store.save({
    source: 'local', id: 'b', name: '活动', state: 'active', withdrawn: false, capacity: 30, revision: 1,
  });

  const result = await collect({
    source: async () => ({
      source: 'local',
      observedAt: '2026-11-18T08:00:00.000Z',
      items: [{ id: 'b', label: '活动', state: 'active', capacity: 12, revision: 2 }],
    }),
    store,
  });

  assert.equal(result.status, 'ok');
  assert.equal(store.listActive()[0].capacity, 12);
});

test('陈旧修订号不能用撤场终态覆盖较新的有效记录', () => {
  const store = new RecordStore();
  store.save({
    source: 'local', id: 'a', name: '活动', state: 'active', withdrawn: false, revision: 3,
  });
  store.save({
    source: 'local', id: 'a', name: '活动', state: 'cancelled', withdrawn: true, revision: 2,
  });
  assert.equal(store.listActive().length, 1);
  assert.equal(store.list()[0].revision, 3);
});
