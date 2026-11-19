import { describe, expect, it } from 'vitest';
import { ROUTE_MAX_DURATION_SECONDS, SCAN_MAX_DEPENDENCIES } from '../../../pipeline/constants';
import {
  CLIENT_FETCH_TIMEOUT_MS,
  FEATURED_GRAVEYARDS,
  PLOT_BOX_HEIGHT_PX,
  PLOT_BOX_WIDTH_PX,
  PLOT_CELL_WIDTH_PX,
  PLOT_JITTER_MAX_PX,
  REASON_PRIORITY,
  SCAN_SLOW_NOTICE_MS,
  SCAN_STAGE_START_MS,
  SCENE_MAX_COLUMNS,
  SCENE_MAX_PLOTS,
  SCENE_MIN_COLUMNS,
} from '../../../view-model/constants';

describe('view-model constants (R19.7)', () => {
  it('SCENE_MAX_PLOTS equals SCAN_MAX_DEPENDENCIES', () => {
    expect(SCENE_MAX_PLOTS).toBe(SCAN_MAX_DEPENDENCIES);
  });

  it('CLIENT_FETCH_TIMEOUT_MS is above 26500 and equals ROUTE_MAX_DURATION_SECONDS * 1000', () => {
    expect(CLIENT_FETCH_TIMEOUT_MS).toBeGreaterThan(26500);
    expect(CLIENT_FETCH_TIMEOUT_MS).toBe(ROUTE_MAX_DURATION_SECONDS * 1000);
  });

  it('SCAN_STAGE_START_MS is strictly increasing and below SCAN_SLOW_NOTICE_MS', () => {
    for (let i = 1; i < SCAN_STAGE_START_MS.length; i++) {
      expect(SCAN_STAGE_START_MS[i]).toBeGreaterThan(SCAN_STAGE_START_MS[i - 1]!);
    }
    expect(SCAN_STAGE_START_MS[SCAN_STAGE_START_MS.length - 1]).toBeLessThan(SCAN_SLOW_NOTICE_MS);
  });

  it('PLOT_JITTER_MAX_PX * 2 is below PLOT_CELL_WIDTH_PX', () => {
    expect(PLOT_JITTER_MAX_PX * 2).toBeLessThan(PLOT_CELL_WIDTH_PX);
  });

  it('SCENE_MIN_COLUMNS is at most SCENE_MAX_COLUMNS', () => {
    expect(SCENE_MIN_COLUMNS).toBeLessThanOrEqual(SCENE_MAX_COLUMNS);
  });

  it('plot box is 80 by 104', () => {
    expect(PLOT_BOX_WIDTH_PX).toBe(80);
    expect(PLOT_BOX_HEIGHT_PX).toBe(104);
  });

  it('REASON_PRIORITY lists the ten rule ids in order', () => {
    expect([...REASON_PRIORITY]).toEqual(['7.2', '8.1', '8.2', '8.3', '8.4', '10.7', '10.8', '10.6', '6.3', '11.2']);
  });

  it('FEATURED_GRAVEYARDS lists the three URLs in order', () => {
    expect([...FEATURED_GRAVEYARDS]).toEqual([
      'https://github.com/request/request',
      'https://github.com/revmic/canopy',
      'https://github.com/ajeetdsouza/zoxide',
    ]);
  });
});
