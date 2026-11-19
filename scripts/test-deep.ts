import { spawn as nodeSpawn } from "node:child_process";
import path from "node:path";

// Runs vitest with FC_NUM_RUNS=1000 in the child env only.
export type SpawnLike = (
  command: string,
  args: string[],
  options: { stdio: "inherit"; env: Record<string, string | undefined> },
) => {
  on(event: "close", listener: (code: number | null) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
};

export function deepEnv(baseEnv: Record<string, string | undefined>): Record<string, string | undefined> {
  return { ...baseEnv, FC_NUM_RUNS: "1000" };
}

export function runDeep(
  argv: readonly string[],
  spawnImpl: SpawnLike,
  baseEnv: Record<string, string | undefined>,
): Promise<number> {
  const vitestBin = path.join("node_modules", "vitest", "vitest.mjs");
  return new Promise((resolve) => {
    const child = spawnImpl(process.execPath, [vitestBin, "--run", ...argv], {
      stdio: "inherit",
      env: deepEnv(baseEnv),
    });
    child.on("error", (error: Error) => {
      console.error(error.message);
      resolve(1);
    });
    child.on("close", (code: number | null) => resolve(code ?? 1));
  });
}

if (require.main === module) {
  void runDeep(process.argv.slice(2), nodeSpawn as unknown as SpawnLike, process.env).then((code) => {
    process.exit(code);
  });
}
