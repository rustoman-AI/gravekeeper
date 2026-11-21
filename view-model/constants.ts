import type { RuleId, Severity } from '../core';
import { SCAN_MAX_DEPENDENCIES, SCAN_MAX_MANIFESTS } from '../pipeline/constants';

// Requirement 8.9: the render budget applies up to this many plots. Equals SCAN_MAX_DEPENDENCIES.
export const SCENE_MAX_PLOTS = SCAN_MAX_DEPENDENCIES;
// Requirement 19.7: scene render budget in milliseconds.
export const SCENE_RENDER_BUDGET_MS = 100;
// Requirement 17.2: client JavaScript budget, gzip, route `/`.
export const CLIENT_JS_BUDGET_BYTES = 256000;

// Requirement 8.1: scene cell size.
export const PLOT_CELL_WIDTH_PX = 96;
// Requirement 8.15: cell height = box + top jitter margin + label space (see below).
export const PLOT_CELL_HEIGHT_PX = 156;
// Requirement 8.2: maximum jitter of a plot inside its cell.
export const PLOT_JITTER_MAX_PX = 8;
// Requirement 8.3: fixed scene padding.
export const SCENE_PADDING_PX = 16;
// Requirement 8.11: plot box is the cell minus the jitter on both sides, so plots cannot overlap.
export const PLOT_BOX_WIDTH_PX = PLOT_CELL_WIDTH_PX - 2 * PLOT_JITTER_MAX_PX;
export const PLOT_BOX_HEIGHT_PX = 104;
// Requirement 8.15: label band below the Plot box: at most two lines of exact pixel line height.
// Space under a box in its cell: 156 - 8 - 104 = 44 = 2 * 14 + 2 * 8.
export const LABEL_MAX_LINES = 2;
export const LABEL_LINE_HEIGHT_PX = 14;
export const LABEL_FONT_SIZE_PX = 12;
export const LABEL_BAND_HEIGHT_PX = LABEL_MAX_LINES * LABEL_LINE_HEIGHT_PX;
// Requirement 8.3: column limits.
export const SCENE_MIN_COLUMNS = 2;
export const SCENE_MAX_COLUMNS = 20;
// Requirement 8.9: visible epitaph length.
export const EPITAPH_MAX_CHARS = 48;

// Requirement 7.7: glow level by severity.
export const GLOW_LEVELS: Readonly<Record<Severity, 1 | 2 | 3 | 4>> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
};

// Requirement 5.1: short SHA length.
export const SHORT_SHA_LENGTH = 7;
// Requirement 3.2: query parameters.
export const REPO_QUERY_PARAM = 'repo';
export const MANIFEST_QUERY_PARAM = 'manifest';

// Requirement 2.1: featured graveyards, in order.
export const FEATURED_GRAVEYARDS: readonly string[] = [
  'https://github.com/request/request',
  'https://github.com/revmic/canopy',
  'https://github.com/ajeetdsouza/zoxide',
];

// Requirement 4: the four stages of the scanning screen.
export const SCAN_STAGES = [
  { id: 1, label: 'Reading the repository' },
  { id: 2, label: 'Checking the registries' },
  { id: 3, label: 'Consulting the vulnerability records' },
  { id: 4, label: 'Asking GitHub about the living' },
] as const;
// Requirement 4: elapsed time at which each stage becomes current.
export const SCAN_STAGE_START_MS: readonly number[] = [0, 2000, 6000, 10000];
// Requirement 4: elapsed time after which the long-scan notice appears.
export const SCAN_SLOW_NOTICE_MS = 15000;
// Requirement 3.8: client abort time; equals ROUTE_MAX_DURATION_SECONDS * 1000.
export const CLIENT_FETCH_TIMEOUT_MS = 30000;
// Requirement 13: retry cooldown without Retry-After.
export const RETRY_FALLBACK_COOLDOWN_SECONDS = 10;
// Requirement 13: manifest picker limit, imported from the pipeline.
export { SCAN_MAX_MANIFESTS };

// Requirement 7.4: reason priority, strongest first.
export const REASON_PRIORITY: readonly RuleId[] = [
  '7.2',
  '8.1',
  '8.2',
  '8.3',
  '8.4',
  '10.7',
  '10.8',
  '10.6',
  '6.3',
  '11.2',
];

// Requirement 21.7: hosts a built link may point to. canonicalRepoUrl adds the configured repo host.
export const LINK_HOSTS: readonly string[] = [
  'www.npmjs.com',
  'pypi.org',
  'crates.io',
  'github.com',
  'osv.dev',
];

// graveyard-art Requirement 3.1, 3.3: tombstone silhouettes (also used by restless plots).
export const TOMBSTONE_VARIANTS = ['rounded', 'cross', 'obelisk', 'slab'] as const;
// graveyard-art Requirement 3.1, 3.4: overgrown graves differ in the amount of ivy.
export const OVERGROWN_VARIANTS = ['ivy-light', 'ivy-medium', 'ivy-heavy'] as const;
// graveyard-art Requirement 3.6: maximum tilt of a stone in degrees, either direction.
export const TILT_MAX_DEG = 6;
// graveyard-art Requirement 2.6: scale of the back row relative to the front row.
export const DEPTH_SCALE_BACK = 0.88;
// graveyard-art Requirement 2.6: brightness (opacity) of the back row relative to the front row.
export const DEPTH_BRIGHTNESS_BACK = 0.7;
// graveyard-art Requirement 2.2, 13.3: opacity of the low and the high fog layer (equal to the CSS values).
export const FOG_OPACITY_LOW = 0.25;
export const FOG_OPACITY_HIGH = 0.35;
// graveyard-art Requirement 6.3: durations below this many days are written in days.
export const DURATION_DAYS_MAX_EXCLUSIVE = 60;
// graveyard-art Requirement 6.3: durations below this many days are written in months.
export const DURATION_MONTHS_MAX_EXCLUSIVE = 730;
// graveyard-art Requirement 6.3: days per month and per year in duration text.
export const DAYS_PER_MONTH_TEXT = 30;
export const DAYS_PER_YEAR_TEXT = 365;
// graveyard-art Requirement 10.1: stones on the scanning screen; equals SCAN_STAGES.length.
export const SCAN_STONE_COUNT = 4;
// graveyard-art Requirement 10.1: x position of each stone in the scanning scene viewBox.
export const SCAN_STONE_X = [50, 150, 250, 350] as const;
// resurrect Requirement 10.10: milliseconds until the Copy_Status text returns to empty.
export const COPY_STATUS_RESET_MS = 3000;
// resurrect Requirement 7.2: most Alternatives a Curated_Entry may list.
export const CURATED_MAX_ALTERNATIVES = 4;
// resurrect Requirement 7.2: longest allowed `why` sentence of a Curated_Entry, in characters.
export const CURATED_WHY_MAX_LENGTH = 200;
