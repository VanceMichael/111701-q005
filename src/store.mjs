export class RecordStore {
  #records = new Map();

  save(record) {
    const key = `${record.source}:${record.id}`;
    const previous = this.#records.get(key);
    if (!previous || record.revision >= previous.revision) {
      this.#records.set(key, structuredClone(record));
    }
    return structuredClone(this.#records.get(key));
  }

  /** 全量归档，包括已撤场的终态记录（审计与排查用） */
  list() {
    return [...this.#records.values()].map((record) => structuredClone(record));
  }

  /**
   * 仍可安排学生的有效活动。
   * 撤场记录仍留在 list() 里，但不会出现在这里，
   * 避免继续把学生安排到无效时段。
   */
  listActive() {
    return this.list().filter((record) => record.withdrawn !== true);
  }
}
