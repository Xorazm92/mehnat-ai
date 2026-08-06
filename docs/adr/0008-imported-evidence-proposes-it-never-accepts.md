# Imported evidence proposes a status, it never accepts one

An `IntegrationEvent` arriving from a spreadsheet, a 1C agent, Didox or a bank carries a claim
about work that was done — "this declaration was submitted", "this tax was paid". The temptation
is to let a trusted-looking source move the obligation straight to `accepted` and be done. We
refuse that, and the refusal is a single pure function.

Every claim carries a `confidence`, and **confidence means authority, not parse quality**. It caps
the highest status the claim may set:

| value | who said it | ceiling |
|---|---|---|
| `1.0` | the authority itself — a Soliq or Didox receipt | `accepted` |
| `0.7` | a system that witnessed the act but is not the authority — 1C posted the document | `sent` |
| `0.4` | an operator's spreadsheet asserting the act | `sent`, as a proposal |

`maxStatusForConfidence()` is the whole policy. An operator who types "+" into 200 rows of Excel
cannot approve 200 obligations, because the spreadsheet is not the tax authority — it is a person's
recollection in a different font. This is [ADR-0001](./0001-bot-proposes-human-disposes.md) applied
to a third class of writer, after the bot and the evidence projectors of
[ADR-0005](./0005-kpi-is-derived-from-evidence-and-confirmed-by-a-human.md).

Four rules resolve the collision between an import and a human:

- **Evidence is never discarded.** Even when the status change is refused, the
  `ObligationSubmission` and its `SubmissionEvidence` rows are written. A refused claim means "we
  hold the document but a human's word stands", which is precisely what an auditor needs to see.
  Dropping the evidence would leave no record that the two disagreed.
- **A human beats an import at equal rank.** If the last `ObligationStatusEvent` has a
  `byUserId`, an import may only move the obligation *forward* through the workflow, never
  sideways or back.
- **Terminal states are never auto-changed.** `accepted` and `cancelled` are decisions, not
  observations.
- **A refused claim raises work, not silence.** It creates a `Task` with `obligationId` set and
  `taskType='import_conflict'`, assigned to the company's supervisor. A conflict that nobody sees
  is a conflict that resolves itself wrongly.

## Consequences

- `confidence` is per-event data, not a code branch. `lib/engines/evidence/landing.ts` contains no
  `if (source === "didox")`; Didox posts `0.7` and gets `sent`, a Soliq receipt posts `1.0` and
  gets `accepted`. This is what makes [Modda 5](../CONSTITUTION.md) testable — adding a source must
  change zero lines of landing code, and `evidence-landing-source-agnostic.test.ts` asserts it.
- The Excel adapter is therefore not a lesser citizen. It is the first implementation of a contract
  that 1C and Didox will use unchanged; writing it first is how the contract gets exercised before
  the expensive integrations depend on it.
- Confidence is set by the `ImportProfile`, not by the uploader, so an operator cannot promote
  their own spreadsheet by editing a form field.
- Three independent links point from an obligation back to the raw row:
  `ObligationStatusEvent.note` → `IntegrationEvent.id`, `ObligationSubmission.externalId` +
  `sourceSystem`, and `SubmissionEvidence.sourceEventId`. `IntegrationEvent.payload` is immutable
  and carries the file name, sheet and row number. From a matrix cell you can reach the exact
  spreadsheet row that produced it — which is [Modda 7](../CONSTITUTION.md) for imports.
- The cost: an import can never fully close the loop on its own, so a human still touches every
  `accepted`. We accepted that. The alternative is a system that confidently records work nobody
  can prove happened.
