import { SourceAdapter } from "./adapter-interface.js";
import { JobSpyAdapter } from "./jobspy-adapter.js";
import { GreenhouseAdapter } from "./greenhouse-adapter.js";
import { LeverAdapter } from "./lever-adapter.js";
import { RemoteOkAdapter } from "./remoteok-adapter.js";
import { JobicyAdapter } from "./jobicy-adapter.js";
import { HackerNewsAdapter } from "./hackernews-adapter.js";
import { WeWorkRemotelyAdapter } from "./weworkremotely-adapter.js";

class SourceAdapterRegistry {
  private adapters = new Map<string, SourceAdapter>();

  constructor() {
    this.register(new JobSpyAdapter());
    this.register(new GreenhouseAdapter());
    this.register(new LeverAdapter());
    this.register(new RemoteOkAdapter());
    this.register(new JobicyAdapter());
    this.register(new HackerNewsAdapter());
    this.register(new WeWorkRemotelyAdapter());
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
