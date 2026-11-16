# KIRO_LOG

Raw notes for the write-up. After each session: what I asked, what Kiro did well, where Kiro erred.

## Session 1
- Asked: create steering files (product, tech, structure) with no application code.
- Did well: (fill in after review)
- Erred: (fill in after review)

## Session 2
- Asked: requirements-only spec for dependency-graveyard-core (parsers, classifier, repo summary) with PBT-tagged EARS criteria.
- Did well: (fill in after review)
- Erred: (fill in after review). Note for write-up: automatic requirement detailing added two criteria that contradicted the spec (error on invalid flags, reason without ruleId); I removed them while merging.

## Session 3
- Asked: apply 6 requirement changes (daysSinceLastCommit, combined-score strictness, monotonicity, sourceKind, richer summary/grade, clock rule), commit, then produce design.md only.
- Did well: (fill in after review)
- Erred: (fill in after review). Note: design surfaced real conflicts in the requirements (3.8 vs 4.6 duplicate keys, 10.12 vs unknown severity).

## Session 4
- Asked: resolve design open questions (dedupe by (name, scope), sorted output, known-severity monotonicity, smol-toml pinned), update requirements and design, generate tasks.md, then execute through the parsers group.
- Did well: design review caught real requirement conflicts before any code was written; subagent applied the resolutions consistently across all three docs.
- Erred: (fill in after review). Note: design phase left 4 new minor open items; I took the design's recommended defaults and recorded them in tasks.md.

## Session 5
- Asked: stop rejecting non-normalized Python names (PEP 503 normalize + rawName), add idempotence property, move all design defaults into numbered criteria; update all three docs, no execution.
- Did well: (fill in after review). Design update caught a new round-trip conflict (backslash in git/path specs vs 5.13) before any code existed.
- Erred: (fill in after review). Note: Kiro's earlier D1 rule rejected Django/PyYAML, a real-world miss the user had to catch. Also: task execution could not start in session 4 because task status must be set via the task UI.
