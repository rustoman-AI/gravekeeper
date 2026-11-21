/**
 * graveyard-art Requirement 20: the noun form for a count. Only a count of exactly 1 takes the
 * singular; 0 and every other count take the plural. Pure and total.
 */
export function plural(n: number, singular: string, pluralForm: string): string {
  return n === 1 ? singular : pluralForm;
}
