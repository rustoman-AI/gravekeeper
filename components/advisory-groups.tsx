import { ExternalLink } from "@/components/external-link";
import type { AdvisoryGroupModel } from "@/view-model";

export interface AdvisoryGroupsProps {
  groups: readonly AdvisoryGroupModel[];
  /** Id prefix that keeps heading ids unique within the page. */
  idPrefix: string;
}

/** Requirements 10.16, 10.18, 10.19: one labelled section per group. */
export function AdvisoryGroups({ groups, idPrefix }: AdvisoryGroupsProps) {
  return (
    <>
      {groups.map((group) => {
        const headingId = `${idPrefix}-${group.exclusion}`;
        return (
          <section key={group.exclusion} aria-labelledby={headingId} className="gk-advisory-group">
            <h4 id={headingId}>{group.heading}</h4>
            <p>{group.countText}</p>
            {group.explanation === null ? null : <p>{group.explanation}</p>}
            {group.entries.length === 0 ? null : (
              <ul>
                {group.entries.map((entry, i) => (
                  <li key={`${entry.id}-${String(i)}`}>
                    <ExternalLink href={entry.href}>{entry.id}</ExternalLink>
                    {entry.aliases.length === 0 ? null : (
                      <span>, also known as {entry.aliases.join(", ")}</span>
                    )}
                    <span>, {entry.severityText}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}
