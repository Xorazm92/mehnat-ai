# The bot scores only what Telegram can witness

The bot proposes drafts for 17 of the 26 KPI rules: the 6 counter rules (arrival, absence), the 4
response rules, and the 7 report rules. It never proposes the 5 `automation` rules — 1C, my.mehnat.uz,
Didox.uz, my.soliq.uz, avtokameral — nor the 3 judgment rules (critical error, wrong transfer,
unresolved problems).

The automation rules describe work done on external platforms the bot has no eyes on; scoring them
would mean integrating those platforms, which is a different project. The judgment rules are
opinions, and an opinion is not a Signal.

## Consequences

- The Supervisor's checklist is permanent, not transitional. 9 of 26 cells per Company per month
  stay hand-entered no matter how good the bot gets.
- Counter rules are additive and roll up by summing Signals. Verdict rules are categorical and
  cannot: turning counted Signals into a colour needs a threshold, and the rules define none —
  "tizimli kechikish" has no number behind it. Every Verdict Rule the bot owns needs that threshold
  supplied before it can propose anything.
- For the report rules the bot can prove green and red but never yellow: `threeState` yellow means
  "qisman / neytral", a judgment about quality. The bot proposes green or red and a Supervisor
  downgrades to yellow.
