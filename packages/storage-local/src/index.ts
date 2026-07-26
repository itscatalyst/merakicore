import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { ConnectedAgentRuntime, type ConnectedRuntimeSnapshot } from "@meraki/core";

export interface MerakiRuntimeStore {
  save(runtime: ConnectedAgentRuntime): Promise<void>;
  load(): Promise<ConnectedAgentRuntime>;
}

/** Atomic JSON persistence for local development and single-user agent integrations. */
export class JsonConnectedRuntimeStore implements MerakiRuntimeStore {
  public constructor(private readonly path: string) {}

  public async save(runtime: ConnectedAgentRuntime): Promise<void> {
    const temporary = `${this.path}.tmp`;
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(temporary, JSON.stringify(runtime.snapshot(), null, 2), "utf8");
    await rename(temporary, this.path);
  }

  public async load(): Promise<ConnectedAgentRuntime> {
    try {
      const snapshot = JSON.parse(await readFile(this.path, "utf8")) as ConnectedRuntimeSnapshot;
      return ConnectedAgentRuntime.fromSnapshot(snapshot);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return new ConnectedAgentRuntime();
      throw error;
    }
  }
}
