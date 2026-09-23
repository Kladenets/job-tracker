import { SourceAdapter } from "./adapter-interface";
import { JobSpyAdapter } from "./jobspy-adapter";
import { GreenhouseAdapter } from "./greenhouse-adapter";
import { LeverAdapter } from "./lever-adapter";

class SourceAdapterRegistry {
  private adapters = new Map<string, SourceAdapter>();

  constructor() {
    this.register(new JobSpyAdapter());
    this.register(new GreenhouseAdapter());
    this.register(new LeverAdapter());
  }

  register(adapter: SourceAdapter) {
    this.adapters.set(adapter.sourceName.toLowerCase(), adapter);
  }

  get(name: string): SourceAdapter | undefined {
    return this.adapters.get(name.toLowerCase());
  }

  list(): string[] {
    return Array.from(this.adapters.keys());
  }
}

export const sourceRegistry = new SourceAdapterRegistry();
