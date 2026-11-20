export interface ReasonItemProps {
  reason: {
    readonly ruleId: string;
    readonly message: string;
    readonly isMain: boolean;
    readonly plain: string;
  };
}

/**
 * graveyard-art Requirements 8.5, 8.7, 8.8: the plain-language line first, then a closed disclosure with the
 * exact core message and rule id. Every string is a React text node.
 */
export function ReasonItem({ reason }: ReasonItemProps) {
  return (
    <li>
      {reason.isMain ? <strong>main reason: </strong> : null}
      <span>{reason.plain}</span>
      <details className="gk-rule">
        <summary>Show the rule</summary>
        <span>{reason.message}</span>{" "}
        <span className="gk-detail-rule">(rule {reason.ruleId})</span>
      </details>
    </li>
  );
}
