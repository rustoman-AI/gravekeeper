// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { markModelReady, measureSceneCommit } from "../../../components/scene-perf";

// R8.10, R17.1.
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete window.__GK_PERF__;
});

function setup() {
  const mark = vi.fn();
  const measure = vi.fn();
  vi.stubGlobal("performance", {
    mark,
    measure,
    clearMarks: vi.fn(),
    clearMeasures: vi.fn(),
    getEntriesByName: () => [{}],
  });
  const raf = vi.fn((cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal("requestAnimationFrame", raf);
  return { mark, measure, raf };
}

describe("scene-perf", () => {
  it("does nothing without the flag", () => {
    const { mark, measure, raf } = setup();
    markModelReady();
    measureSceneCommit();
    expect(mark).not.toHaveBeenCalled();
    expect(raf).not.toHaveBeenCalled();
    expect(measure).not.toHaveBeenCalled();
  });

  it("marks and measures with the flag", () => {
    const { mark, measure, raf } = setup();
    window.__GK_PERF__ = true;
    markModelReady();
    expect(mark).toHaveBeenCalledWith("gk-model-ready");
    measureSceneCommit();
    expect(raf).toHaveBeenCalledTimes(1);
    expect(measure).toHaveBeenCalledWith("gk-scene", "gk-model-ready");
  });
});
