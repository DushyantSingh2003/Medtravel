# 014 — Versioned prices and quotes that keep their price

**Status:** accepted (AD-05)

## Context

Prices change; quotes already sent must not. The quote builder also converts the rupee price into other currencies, and an admin can
override a rate by hand.

## Decision

- A price change adds a new immutable version of an item's full price set; nothing is edited in place.
- A quote line copies the amount (and the FX snapshot the quote already stores) when it is created. It does not point at the price list,
  so there is nothing for a later version to change. The lookup also returns the version number so a line can say where it came from.
- INR is the base currency of the list; other currencies are either priced explicitly or converted at the current rate plus a markup.
- Manual exchange rates live in their own table and win over provider rates in `rateOn()` while in force. They are never edited: a new
  rate revokes the old one, and history asked about a past day still sees what was in force.

## Consequences

Price history is complete and auditable. Reports can join a line to its version later if the builder stores the version id. A
correction to a wrong price is a new version, not an edit.

A manual rate applies to every conversion made through `rateOn()`, including the public `/fx` endpoints, because it is the platform's
rate while it is in force; the markup is added only by the price lookup. Quote lines have no foreign key to the price list on purpose:
the quote builder must copy the looked-up price, and must never recompute a sent quote from the list.
