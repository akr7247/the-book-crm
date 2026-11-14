# The Book — thinking doc

**One page. What I built, the rules I set, what I left out, and where the machine helped.**

## What it is, and who it is for

The Book is a live CRM page for my two accounts: Eastern Counties Police Alliance
(£350,000 a year, 35 docks) and Aldermoor Industrial Group (€140,000 a year, 14 docks).
It is built for the Monday conversation with my manager, not for reporting. It answers
five questions per account: what the book is worth, who holds the power, what I do
first, what is about to go wrong, and what I still do not know.

Everything on the page comes from the Account Quest records. The page does not ask the
reader to trust it: every figure carries a small id chip. Click it and the record opens
beside the page — the contract, the email, the weekly usage row, the ticket, the exact
signal. A single "All sources" view lists all 140 records behind the page.

## The rules I set

**Backed means a record states it.** The book totals count only money that appears in a
contract, an invoice, a deal record or an offer. "Up to 300 docks" and "a 40-plant sister
company" are real things customers said, and they are shown, but they are labelled as
claims and carry no value. A CRM that adds claimed pipeline to signed revenue flatters
the book and misleads the manager.

**Unknown stays unknown.** The right-hand column in Q2 is often empty, and it says who is
missing: the signatory at Eastern Counties, the finance owner at Aldermoor, the deputy
who ran the rollout. Those blanks are the most useful part of the page. Guessing would
hide the actual work.

**Derived numbers show their working.** The value at risk is apportionment:
£350,000 ÷ 35 docks = £10,000 a dock, multiplied by the 17 docks that flew nothing in the
last four weeks. That is £170,000 of annual value attached to silent kit. The contract
does not state a per-dock price, so the page says "apportioned", not "lost revenue".

**One owner and one date per move.** The first move is a written answer to Insp. Karen
Mbeki before her 5 December event, because she asked on 18 November and nobody replied.
The second protects the renewal from Rhys Calder's January exit. The third starts the
order and the force-by-force review before the 28 February term end. Ranked by deadline,
then by value at risk.

**Signals are read, not displayed.** The MCP gives each signal once, so the page keeps all
three as dated events and wires each into the move, risk and gap it changes. A signal feed
that nobody acts on is decoration.

## What I deliberately did not do

- I did not convert GBP and EUR into one number. The book is shown in the currency each
  record states.
- I did not split usage by force or by plant. The dock-to-site list is not on file, so the
  page shows that as a gap instead of inventing an allocation.
- I did not count declined offers as pipeline. £105,000 at Eastern Counties and €280,000 at
  Aldermoor were refused; they sit in a separate, visually quieter block.
- I did not build a pipeline forecast. The two large opportunities have no quantity, price
  or date on file, so a forecast would be fiction with a percentage sign.

## How I used AI, and where I did not

I used AI to read 1,200+ pages of calls, emails, contracts and usage rows quickly, to
draft the analysis code and the page, and to keep the linking between claim, record and
figure consistent. I did not let it invent facts: the analysis file is a set of explicit
rules over stored records, and a check script fails the build if any cited id is missing,
if a total does not equal the sum of its deals, or if the MCP token appears in a file.
The judgement calls — what counts as backed, what to do first, what to leave blank — are
mine, and they are written down in the page and in the README.

## What would make it better next week

Two things: a named successor and a dock-to-site list. Those two records would turn the
largest unknowns into a force-level view and a plant-level renewal quote. Until then, the
honest page is the one that shows the holes.
