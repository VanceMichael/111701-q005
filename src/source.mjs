import { readFile } from 'node:fs/promises';

/**
 * 来源暂时读不到（网络抖动、文件缺失、JSON 损坏等）。
 * 这是一次采集失败，不代表来源页里的活动被撤场，
 * 调用方必须保留此前已归档的记录。
 */
export class TransientSourceError extends Error {
  constructor(message, { cause } = {}) {
    super(message);
    this.name = 'TransientSourceError';
    if (cause !== undefined) this.cause = cause;
  }
}

export async function readSource(path = new URL('../data/source.json', import.meta.url)) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (cause) {
    throw new TransientSourceError('来源页暂时读取失败，已保留此前归档的记录', { cause });
  }

  let page;
  try {
    page = JSON.parse(text);
  } catch (cause) {
    throw new TransientSourceError('来源页内容暂时无法解析，已保留此前归档的记录', { cause });
  }

  if (!page.source || !Array.isArray(page.items)) {
    throw new TransientSourceError('来源页缺少 source 或 items，按暂时不可读处理');
  }
  return page;
}
