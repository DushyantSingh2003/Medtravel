# ADR 010 — Money as integer minor units, exchange rates stored daily, snapshotted by quotes

Status: accepted (F-09)

## Decision

- A price is `{ amountMinor, currency }`: a safe integer count of the currency's smallest unit (the master's `minorUnits`, 0 for
  JPY, 3 for KWD). Arithmetic runs through `BigInt` with explicit rounding (half-even by default); parts of a total are made with
  `allocate` (largest remainder) so they always add up. Rates are decimal strings with 8 places, never floats.
- The worker fetches rates every day at 06:00 India time (a BullMQ job scheduler, registered once however many workers run) from
  a provider chosen by `FX_PROVIDER` and stores one `FxRate` row per currency against USD and day; re-running changes nothing.
  A failed fetch keeps yesterday's rates and retries with backoff.
- A rate lookup finds the newest rate not after the date asked: direct, inverted, or through USD. Older than three days, or none, is an
  error: nobody is shown or charged a guessed price.
- A quote stores the rate it used (`fxRate`, `fxRateAt`, `fxSource`, `fxBaseCurrency`) so a converted price never moves after it is sent.
- Language is the visitor's earlier choice, then the browser's, then the country's; Arabic shows Latin digits and keeps each figure
  left-to-right inside right-to-left text. Ops screens use Asia/Kolkata for dates and day filters through one `dayBoundary` helper.

## Why not

Floats lose cents on large totals. Fetching rates at request time makes pages slow and breaks when the provider is down. Converting a
sent quote again later would change a price the patient had already accepted.

## Consequences

The public `GET /fx/rates` (cached five minutes) feeds the website's currency switcher. New currencies need a master row and a provider
that quotes them.
