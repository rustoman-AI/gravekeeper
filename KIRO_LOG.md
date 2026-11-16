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

## Session 6
- Asked: record open-question resolutions (smol-toml latest pinned, grade thresholds A-F, position-free Cargo first occurrence), then execute tasks 1-6 with commits per group.
- Did well: 402 tests, 38 property tests; all property tests passed at 100 and 1000 runs. Task status now driven through the task tool.
- Erred: (fill in after review). I edited tasks.md text directly once and the task tool refused to save until I reverted it.

### Counterexamples and bugs found
- Property tests: no counterexample against production code in tasks 5.9-5.33 (runs: 100 default, 1000-5000 on request).
- Generator bugs caught by the parser (not production bugs): 5.20 generator emitted duplicate inline-table key `features` and a multi-line array inside an inline table (both invalid TOML; parser warning was correct). 5.15 test appended `__proto__` lines with a different EOL than the generated text, so a trailing `\`+CR joined lines.
- Unit-test bug (5.29): package.json writer emitted `"dependencies"` twice for input [a runtime, b dev, c runtime] (name-sorted walk opened a new section on every scope change). Broke 5.12 section order and produced a duplicate JSON key. Fixed: write sections by SCOPE_ORDER, each once.
- Spec ambiguities found and resolved: criterion 1.9 `a/b#` (empty ref) — core said git, oracle said registry; 1.9 clarified to allow an empty ref (git). Cargo writer table order contradicted SCOPE_ORDER; switched to [dependencies], [dev-dependencies], [build-dependencies].
- Open: `__proto__` cannot be a requirements.txt name (2.8 requires a leading alphanumeric), so Property 8 for that format only checks clean rejection.
- Disclosed narrowing: 5.21 Cargo duplicate generator always tags table entries with a unique version so the kept occurrence is identifiable; version-less tables stay covered by Property 3 tests.
