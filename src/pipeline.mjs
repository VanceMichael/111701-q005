import { normalizePage } from './adapter.mjs';
import { readSource } from './source.mjs';
import { RecordStore } from './store.mjs';

/**
 * 采集一轮来源页。
 *
 * 两种异常要严格区分：
 * - 来源暂时读不到 / 页面无法解析：返回 status: 'unavailable'，
 *   完全不触碰 store，此前归档的有效活动原样保留，
 *   绝不能因为一次请求失败就清空仍有效的活动；
 * - 来源页明确把活动标成撤场终态：走正常落库，
 *   记录带 withdrawn 标记并通过 listActive 过滤掉，
 *   避免继续把学生安排到无效时段。
 *
 * 注意：记录单纯从页中消失不等于撤场，可能是分页或暂时不可读，
 * 因此本流程不做"不在页里就删除"的推断。
 */
export async function collect({ source = readSource, store = new RecordStore() } = {}) {
  let page;
  try {
    page = await source();
  } catch (error) {
    return {
      status: 'unavailable',
      error,
      source: null,
      observedAt: null,
      records: store.list(),
      store,
    };
  }

  let normalized;
  try {
    normalized = normalizePage(page);
  } catch (error) {
    // 页面结构无法规整同样按本轮失败处理，保证整轮原子性，不写入半截数据
    return {
      status: 'unavailable',
      error,
      source: page.source ?? null,
      observedAt: page.observedAt ?? null,
      records: store.list(),
      store,
    };
  }

  const records = normalized.map((record) => store.save(record));
  return {
    status: 'ok',
    source: page.source,
    observedAt: page.observedAt ?? null,
    records,
    store,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await collect();
  if (result.status === 'unavailable') {
    console.error(
      `来源暂时不可读（${result.error?.message ?? result.error}），已保留 ${result.records.length} 条既有归档，未做任何改动`,
    );
    process.exitCode = 1;
  } else {
    const active = result.store.listActive().length;
    const withdrawn = result.records.length - active;
    console.log(
      JSON.stringify(
        { source: result.source, count: result.records.length, active, withdrawn },
        null,
        2,
      ),
    );
  }
}
