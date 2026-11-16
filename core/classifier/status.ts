// Status precedence (Requirement 9).
import type { Status } from '../model/types';

// Requirements 9.1, 9.2, 9.3, 9.4: vulnerable wins over abandoned
export const statusOf = (vulnerable: boolean, abandoned: boolean): Status => {
  if (vulnerable) return 'HAUNTED';
  if (abandoned) return 'DEAD';
  return 'ALIVE';
};
