import { JsonFile } from './json-file.js';

export interface JsonStoreOptions<T> {
  empty: () => T;
  parse: (value: unknown) => T;
  path: () => string;
}

export class JsonStore<T> {
  constructor(private readonly options: JsonStoreOptions<T>) {}

  async read(): Promise<T> {
    const path = this.options.path();
    return this.parse(await this.file(path).read(), path);
  }

  async write(value: T): Promise<void> {
    const path = this.options.path();
    await this.file(path).write(this.parse(value, path));
  }

  async update(op: (current: T) => T | Promise<T>): Promise<T> {
    const path = this.options.path();
    return this.file(path).update(async (raw) => {
      const current = this.parse(raw, path);
      return this.parse(await op(current), path);
    });
  }

  private file(path: string): JsonFile<T> {
    return new JsonFile<T>(path, this.options.empty);
  }

  private parse(value: unknown, path: string): T {
    try {
      return this.options.parse(value);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${path}: ${message}`);
    }
  }
}
