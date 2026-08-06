# A platform is earned, not declared

The domain model here is accidentally general. `lib/deadlines.ts` (126 lines) and
`lib/applicability.ts` (89 lines) have **zero imports**. `DeadlineTemplate` carries no
accounting-specific field — `obligationType` is a free String whose own schema comment says
"erkin turkum". `ObligationStatus` runs `planned → in_progress → ready → sent → accepted | rejected
| cancelled`, which describes a court filing, an audit finding and a holiday request as accurately
as it describes a VAT declaration. Accounting lives in exactly five places, the largest of which is
three `case` arms in one `switch`.

That generality is worth about 200 lines to make explicit, so we make it explicit now: the
`engines / domains / adapters / platform` split, and the two constitution tests that keep the
dependency arrow pointing inward. At that price it is not a bet — it is bookkeeping on something
already true.

What we do **not** do is build the platform. No plugin runtime, no dynamic loading, no plugin
registry, no marketplace, no multi-tenant schema, no second vertical. Not one line.

The reason is that frameworks are extracted, not designed. Rails came out of Basecamp; Django came
out of a newspaper site; Stripe was a payment API for years before anyone called it developer
infrastructure; Salesforce opened AppExchange in its sixth year, not its first. The second vertical
is what tells you *which* generalisations were real, and a wrong abstraction is more expensive to
remove than a missing one is to add — because by then things depend on it.

So the boundary is a **rule about where code may live**, enforced in CI, and nothing else. When
Audit arrives, the reuse comes from the fact that the engines never learned the word "soliq" — not
from a plugin loader nobody has exercised.

## Consequences

- The second vertical opens on a decision rule, not a date. All three must hold at once: one firm
  cannot work without ASRO (12 months continuous, director ≥ 5 days a week); at least three other
  firms have said they would pay; and the core engines have gone 6 months without domain vocabulary
  (Modda 4a/4b green). Miss one and it is not discussed.
- Dates in a roadmap — "2028 Marketplace, 2029 Audit" — are wishes. A gate does not expire, does not
  need renegotiating when a quarter slips, and answers "are we ready" with evidence rather than with
  a calendar.
- Because the boundary is only a rule, breaking it is cheap and invisible without a test. Hence
  [Modda 4a](../CONSTITUTION.md) walks the AST for `ImportDeclaration` — regex misses `import type`,
  re-exports and multi-line imports — and 4b scans for vocabulary separately, because a hard-coded
  `"soliq"` string or a `c.taxRegime` field access produces no import at all. The two tests check
  different failures and neither replaces the other.
- The near-term cost is real: some engine code will look over-abstracted for a product with one
  vertical, and `SubjectFacts.attributes` is slightly more awkward than reading `company.taxRegime`
  directly. We accepted that for 200 lines and a test.
