/**
 * 正式撤场的终态。只有来源页明确给出这些状态，才表示活动被撤掉；
 * 一次请求失败或记录从页中暂时消失，都不能当作撤场。
 * 不同来源的叫法先统一规整成内部的 cancelled。
 */
const WITHDRAWN_STATES = new Map([
  ['cancelled', 'cancelled'],
  ['canceled', 'cancelled'],
  ['withdrawn', 'cancelled'],
  ['closed', 'cancelled'],
  ['撤场', 'cancelled'],
  ['已取消', 'cancelled'],
  ['已撤场', 'cancelled'],
]);

export function isWithdrawnState(state) {
  return WITHDRAWN_STATES.has(String(state ?? '').trim().toLowerCase());
}

function normalizeCapacity(value) {
  if (value === undefined || value === null) return null;
  const capacity = Number(value);
  return Number.isFinite(capacity) ? capacity : null;
}

export function normalizePage(page) {
  return page.items.map((item) => {
    if (!item.id || !item.state) {
      throw new Error('来源记录缺少 id 或 state');
    }
    const stateKey = String(item.state).trim().toLowerCase();
    const withdrawn = isWithdrawnState(stateKey);
    // 撤场记录的标题可能已被来源清空，缺失时退回 id 占位，不再强制要求 label
    if (!item.label && !withdrawn) {
      throw new Error('来源记录缺少 id、label 或 state');
    }
    return {
      source: page.source,
      id: String(item.id),
      name: item.label === undefined || item.label === null ? String(item.id) : String(item.label).trim(),
      state: withdrawn ? WITHDRAWN_STATES.get(stateKey) : String(item.state),
      withdrawn,
      capacity: normalizeCapacity(item.capacity),
      revision: Number(item.revision ?? 0),
      observedAt: page.observedAt ?? null,
    };
  });
}
