# reservation-service: Smells and One Fix

Fill in each section. One section per milestone. Keep it short and specific. Point at files
and methods, not adjectives.

---

## Milestone 1: Three smells

Three smells, each in a different part of the module. For each one, fill in all five parts.

### Smell 1

**The smell.** Name it, using the vocabulary from lecture.
God class. ReservationManager handles booking creation/cancellation/listings, calculates price, formats receipts and summaries, and sends notifications. 

**Classic or agent-specific.** Which, and why that label. For agent-specific, say which of
the lecture's three causes produced it.
Classic; developers likely gradually piled up responsibility to this class.

**Where in the code.** File and, where there is one, method.
src/reservationManager.ts.

**The principle it violates.** Name the principle. "This is too big" is not a principle.
High cohesion / SRP.

**What it makes expensive.** A concrete future change, or something that already goes wrong
today. What breaks first?
Unit testing a single module like pricing will always require constructing a manager, which always builds a cache and notifier. 

### Smell 2

**The smell.**
Dead code + duplication.

**Classic or agent-specific.**
Classic, but potentially also agent-specific. Duplication could be coming from missing context but generally agents would write code with more phantom complexity than these methods. 

**Where in the code.**
invalidate(key):
- src/cache/queryCache.ts:28
- src/cache/queryCache.ts:42
- src/cache/queryCache.ts:49-51
size():
- src/cache/queryCache.ts:39
- src/cache/queryCache.ts:54-56

**The principle it violates.**
DRY. 

**What it makes expensive.**
Future storage changes need to edit multiple lines instead of 1 method.

### Smell 3

**The smell.**
Duplication over reuse.

**Classic or agent-specific.**
Agent-specific due to missing context. Same rules and numbers applied under different variable names.

**Where in the code.**
reportGenerator.ts:104-117
reservationManager.ts:140-147

**The principle it violates.**
DRY.

**What it makes expensive.**
Updating the pricing rules requires touching both methods. If a dev updates only 1 copy, the revenue reports stops matching what the customer was charged.

---

## Milestone 2: One small fix

One fix, behavior preserved, suite green, zero test edits.

**Which smell you attacked.** And why that one.
Smell 2. It's a small change (3 lines) of replacing code with pre-existing & correct methods.

**What changed.** Files and methods you touched, and what the code does differently now.
src/cache/queryCache.ts. The file now uses the previously dead invalidate() and size() methods.

**What you deliberately did not touch.** Name the scope line you drew and why you drew it there. "I ran out of time" is not a scope line.
The cache's set is never called (dead code). I would pause on adding the cache to the service modules until I figure out where it should be placed. Also, service classes should be refactored first for their smells before we add new logic.

**How you know behavior is preserved.** Point at the suite, say what it actually covers, and say what it would not catch.

The full vitest suite passes with zero test edits. However, the only tests that touch QueryCache go through listBookingsForRoom. Since nothing ever calls set, they only hit the miss branch of get() and never run the expiry or eviction lines I changed. The real guarantee is that the change is mechanical: invalidate(key) is exactly this.entries.delete(key) and size() is exactly this.entries.size. A bug in those branches, like evicting the wrong key or an off-by-one on maxEntries, would not be caught without new QueryCache unit tests that use a fake clock.

---

## Milestone 3: Two proposals and one false positive

One proposal for each milestone 1 smell you did not fix.

### Proposal A (not coded)

**The problem.** Name it.
Smell 1, ReservationManager god class.

**The decomposition.** What are the pieces, what does each own, and where do the rules live?
Split ReservationManager class into:
BookingManager
- cancels, lists bookings. checks conflicts.
RoomManager
- registers, gets, lists rooms
PriceCalculator
- calculates prices and discounts
NotificationManager
- logs, sends notifications
Formatter
- formats receipts and daily summaries

ReservationManager still implements createBooking() and cache.


**One cost.** Something this actually costs. "No real downside" is not a cost.
Tests that call manager.formatDailySummary and other methods from manager. Needs to be re-written to point from respective modules. 

### Proposal B (not coded)

**The problem.**
Smell 3, duplicated pricing logic. ReservationManager.calculatePrice (reservationManager.ts:140-158) and ReportGenerator.priceOf (reportGenerator.ts:104-117) implement the same rules with separately named constants.

**The decomposition.**
Pricing module (src/pricing.ts)
- owns the rate constants (premium, long booking, evening) and a single priceFor(room, start, end) function
- the only place pricing rules live
ReservationManager
- calls priceFor once at booking time and stores the result in booking.priceCents
ReportGenerator
- drops priceOf and its constants, sums the stored booking.priceCents instead of recomputing

This is the same PriceCalculator piece as in Proposal A, so the two proposals share one module.

**One cost.**
Revenue reports would now show the price charged at booking time rather than a price recomputed under the current rules. Changing the rates would no longer change past revenue, and the reporting test expectations need to be checked against that new meaning.

### The thing that looks smelly but is fine

**What it is.** File and method.
src/validation.ts, validateReservationRequest (lines 14-63). Long method: one function checks request shape, times, duration, capacity, and building rules.

**Why it is fine.** Defend it with properties of the code, not with its line count.
It is a flat list of independent guard clauses. Each check reads the request, returns early with its own reason, and shares no state with the others, so the length adds no nesting or branching to follow. It is pure (no I/O, no mutation) and has one call site (reservationManager.ts:63), and all limits are already named constants (lines 3-8). tests/validation.test.ts already has a rejection test for every rule, driven through createBooking (17 tests). Splitting it into helper functions would add indirection without making any rule easier to change or test.

**What would flip your verdict.** Name the change that would turn this into a real problem.
If rules started depending on each other or on outside state, for example building hours that vary per room or day, or a rule that needs existing bookings from storage. The same goes for a second caller that needs only some of the rules. The function would then need shared context or flags to pick which checks run, and at that point it should be split into separate rule functions. 