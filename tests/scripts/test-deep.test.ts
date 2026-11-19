import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { deepEnv, runDeep, type SpawnLike } from "../../scripts/test-deep";

const root = path.resolve(__dirname, "../..");

function fakeSpawn(exitCode: number | null) {
  const calls: { command: string; args: string[]; env: Record<string, string | undefined> }[] = [];
  const spawnImpl: SpawnLike = (command, args, options) => {
    calls.push({ command, args, env: options.env });
    return {
      on(event: string, listener: (value: never) => void) {
        if (event === "close") listener(exitCode as never);
      },
    } as ReturnType<SpawnLike>;
  };
  return { calls, spawnImpl };
}

describe("test:deep script", () => {
  it("exists and is registered in package.json", () => {
    expect(existsSync(path.join(root, "scripts/test-deep.ts"))).toBe(true);
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
    expect(pkg.scripts["test:deep"]).toContain("scripts/test-deep");
  });

  it("deepEnv sets FC_NUM_RUNS, keeps other keys and does not mutate", () => {
    const base = { A: "1", FC_NUM_RUNS: "7" };
    const out = deepEnv(base);
    expect(out).toEqual({ A: "1", FC_NUM_RUNS: "1000" });
    expect(base).toEqual({ A: "1", FC_NUM_RUNS: "7" });
    expect(out).not.toBe(base);
  });

  it("runDeep forwards args, passes env to the child only, returns exit code", async () => {
    const before = process.env.FC_NUM_RUNS;
    const { calls, spawnImpl } = fakeSpawn(3);
    const code = await runDeep(["tests/core", "--reporter=dot"], spawnImpl, { X: "y" });
    expect(code).toBe(3);
    expect(calls).toHaveLength(1);
    expect(calls[0].command).toBe(process.execPath);
    expect(calls[0].args.slice(1)).toEqual(["--run", "tests/core", "--reporter=dot"]);
    expect(calls[0].env).toEqual({ X: "y", FC_NUM_RUNS: "1000" });
    expect(process.env.FC_NUM_RUNS).toBe(before);
  });

  it("runDeep returns 1 when the child has no exit code", async () => {
    const { spawnImpl } = fakeSpawn(null);
    expect(await runDeep([], spawnImpl, {})).toBe(1);
  });
});
