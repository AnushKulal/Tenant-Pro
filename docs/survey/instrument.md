# Rental record-keeping in independent tenancies — survey instrument

**Version 2.** Version 1 was reviewed across five lenses — measurement bias, form
logic, analysis validity, data protection, and respondent burden — and 87 defects
were found, 34 of them serious. This version fixes them. The record of what
changed and why is at the end, because several of the fixes are the kind that look
like fussiness until you see what they cost.

**Target population.** People currently renting a room or flat in an independent
property (paying guest accommodation, private hostel, small apartment block), and
people who let such property out. Urban India, Bengaluru as the primary base.

**Target sample.** 150–300 completed responses, of which at least 30 landlords.
Below 30 on the landlord branch, landlord results are reported as indicative with
raw counts and are not claimed as supported — see the analysis plan.

**Measured completion time.** Tenant path 4.6 min, landlord path 4.2 min. Every
surface — consent text and all recruitment messages — says *five minutes*, because
one number stated everywhere and true on both paths is worth more than a tighter
number that is wrong on one of them.

---

## Design rules

**Behaviour before opinion.** Where a proposition can be tested by asking what
happened, it asks what happened. "In the last 12 months has there been a
disagreement about whether a payment was made?" is answerable and checkable. "Do
you think record-keeping is important?" is neither, and everyone says yes.

**No agree/disagree batteries.** A column of positively-phrased statements
collects acquiescence, not opinion.

**Every question earns its place.** Each one below either tests a numbered
proposition or is named in P0 as sample description. Version 1 collected 28
questions of which 5 fed the analysis; that is data held without a purpose, which
is the thing the Digital Personal Data Protection Act, 2023 exists to stop, and
it is also what pushed the form past its promised length.

**Q13 is the question the project rests on, and it is the easiest to rig.** Both
options name the same bearer, in the same voice, with the cost in the bold lead
where a skim-reader cannot miss it. Version 1 failed this: its two costs fell on
different people — the respondent's own money held by a company, versus an
inconvenience for "one party", who for a tenant meant the landlord. Weighing a
cost you bear against a cost someone else bears is not a choice. Do not edit this
question to be shorter by removing a cost; shortening it while keeping both costs
is an improvement.

**No priming anywhere.** Not in the form, the title, the recruitment, or the
thank-you page: no mention of what other respondents chose, what the researcher
expects, or that a product exists. The debrief on the closing page discloses the
project *after* the answers are in, which is how concealment is kept time-limited
rather than permanent.

**Minimum personal data.** No name, phone, address or income. Rent in bands. One
optional email at the very end, handled as set out in Q20.

---

## Form settings

| Setting | Value | Why |
|---|---|---|
| Collect email addresses | **Off** | Not needed; lowers completion, raises the data-protection burden |
| Limit to 1 response | **Off** | Requires sign-in, which excludes respondents and links identity to answers |
| Progress bar | **On** | Reduces mid-form abandonment |
| Shuffle option order | **Off everywhere** | See note below |
| Confirmation message | The debrief text at the end of this document | — |

> **On shuffling.** Version 1 shuffled Q9, Q13 and Q19. Google Forms shuffles
> *every* option in a question — there is no way to pin one in place. That floats
> "Nothing" and "I don't know" into the middle of the list, and those two options
> are precisely what the P2 headline figure is built from. A residual option
> appearing mid-list is selected inconsistently. Primacy effects in a select-all
> are weak, so shuffling bought very little and cost the central number. It is off.

---

## Section 1 — Purpose and consent

> **Rental record-keeping in independent tenancies**
>
> This survey is academic research for a postgraduate project at [UNIVERSITY]. It
> asks how rent, deposits and repairs are recorded in paying guest accommodation,
> hostels and small rented flats.
>
> **Who is running it.** [YOUR NAME], [PROGRAMME], [UNIVERSITY], supervised by
> [SUPERVISOR NAME]. Questions or complaints: [INSTITUTIONAL EMAIL].
>
> **How long.** About five minutes.
>
> **What is asked.** It does not ask for your name, phone number or address. The
> last question has an optional email box, for anyone willing to be contacted for
> a short follow-up — leaving it blank changes nothing else.
>
> **What happens to your answers.** They are held in a response sheet accessible
> only to the researcher and supervisor, and deleted no later than [DATE — three
> months after the result is declared]. Results are reported only as totals and
> percentages. Nothing is passed to any landlord, tenant or company.
>
> **Your choices.** You may skip any question and stop at any time. If you leave
> an email you can ask for it to be deleted at any point by writing to the address
> above. If you are unhappy with how your data has been handled you may complain
> to the Data Protection Board of India.

**Q0. I have read the above and agree to take part.** *(Required — checkbox)*
- [ ] Yes, I agree to take part

> *Note: one box, no "No" option — a respondent who does not agree closes the tab.
> Version 1 inferred consent from the act of navigating to the next page, which is
> not the clear affirmative action s.6(1) of the DPDP Act requires.*

**Q1. Are you 18 or older?** *(Required — multiple choice)*
- Yes → **Section 2**
- No → **Section 1b**

**Section 1b — Not eligible.** *(Section description, no questions, After section → Submit form)*
> Thank you. This survey is open only to people aged 18 or over.

> *Analysis note: a screening question, not data. Under s.9 of the DPDP Act,
> processing the data of anyone under 18 needs verifiable parental consent, which
> this project does not seek. Any response with Q1 = No is deleted from the sheet
> within 24 hours and kept only as a tally of screen-outs. Self-declaration is
> accepted practice for minimal-risk survey research.*

---

## Section 2 — Which side are you on

**Q2. Which best describes you right now?** *(Required — multiple choice)*
- I rent a room or flat as a tenant → **Section 3**
- Both — I rent somewhere and also let property out → **Section 3**
- I rent out property to tenants → **Section 5**
- Neither → **Section 2b**

**Section 2b — Not eligible.** *(Section description, no questions, After section → Submit form)*
> Thank you — this survey is for current tenants and landlords.

> *Analysis note: report tenant and landlord results separately throughout;
> pooling them produces averages that describe nobody. "Both" respondents take the
> tenant branch and are then routed to the landlord branch by Q11, so they appear
> in both and must be flagged. In version 1 they were routed to the tenant branch
> and then straight past the landlord section, so every "Both" respondent silently
> contributed no landlord data at all.*

---

## Section 3 — Your tenancy (tenants and Both)

**Q3. What kind of place do you rent?** *(Required — multiple choice)*
- A paying guest accommodation (PG)
- A private hostel
- A room in a shared flat
- An independent flat or house
- Other: ______

**Q4. How long have you been in your current place?** *(Required — multiple choice)*
- Less than 3 months
- 3 to 6 months
- 6 months to 1 year
- 1 to 2 years
- More than 2 years

**Q5. What is your monthly rent?** *(Required — multiple choice)*
- Under ₹5,000
- ₹5,000 – ₹9,999
- ₹10,000 – ₹14,999
- ₹15,000 – ₹24,999
- ₹25,000 or more
- Prefer not to say

**Q6. Do you have a written rental agreement for your current place?** *(Required — multiple choice)*
- Yes, and I have a copy
- Yes, but I don't have a copy
- No, the arrangement is verbal
- I'm not sure

> *Analysis note: the exposure variable for P3. The distinction between having an
> agreement and having a copy of it is the finding — a respondent who cannot
> produce the document is in the same practical position as one who never signed
> one. Pooling for P3 is pre-specified: option 1 against options 2+3+4.*

---

## Section 4 — Paying rent, and proving you paid (tenants and Both)

**Q7. How do you usually pay your rent?** *(Required — multiple choice)*
- UPI (GPay, PhonePe, Paytm and similar)
- Bank transfer (NEFT / IMPS)
- Cash
- Cheque
- Through a rental platform or app
- Other: ______

**Q8. After you pay, what do you receive from your landlord?**
*(Required — checkboxes. Help text: "Select all that apply. If you receive nothing, select only 'Nothing'.")*
- A written or printed receipt
- A message confirming they received it
- An entry in a register or book they keep
- An update in an app
- Nothing
- I don't know

> *Analysis note: the P2 outcome variable, and the single most important question
> on the tenant branch. Fixed order, residuals last, never shuffled. Google Forms
> cannot enforce mutual exclusivity, so the coding rule is fixed now rather than
> after the data arrives: **"Nothing" or "I don't know" counts toward P2 only when
> selected with no substantive option. A row combining them with a substantive
> option is coded as having that proof, and the number of such contradictory rows
> is reported.***

**Q9. Since you moved in — or in the last 12 months, whichever is shorter — has
there been a disagreement with your landlord about whether a payment was made, or
how much was owed?** *(Required — multiple choice)*
- Yes, more than once
- Yes, once
- No

> *Analysis note: the P3 outcome. Version 1 asked about "disagreement or confusion"
> here while asking landlords only about a "dispute" — two different thresholds,
> which would have made the tenant rate read higher than the landlord rate from
> wording alone. Both sides now say "disagreement". Version 1 also offered "I've
> been here less than 12 months" as a fourth option, which is a tenure statement
> competing with three dispute answers; Q4 already captures tenure, and the stem
> now handles short tenancies directly.*

**Q10. If yes — what settled it?** *(Optional — checkboxes; shown only if Q9 is a "Yes")*
- I showed a payment screenshot from my bank or UPI app
- The landlord checked their own record
- We worked it out from memory
- It was never properly settled
- Other: ______

> *Conditional by section: Q9 is a multiple-choice question at the end of its own
> short section, so Forms can branch on it. Keep it last in the section or the
> branch will not fire.*

**Q11. Do you also let out a room, flat or property to tenants?** *(Required — multiple choice)*
- Yes → **Section 5**
- No → **Section 6**

> *This gate is what makes the "Both" option in Q2 mean anything. Per-question
> branching on a multiple-choice question fires at section end and overrides the
> section default, so it is native to Google Forms and needs no prose instruction.*

---

## Section 5 — Your properties (landlords and Both)

**Q12. How many rooms or units do you let out in total?** *(Required — multiple choice)*
- 1
- 2 to 5
- 6 to 10
- 11 to 20
- More than 20

**Q13. How do you keep track of who has paid rent and who hasn't?**
*(Required — checkboxes, "select all that apply", fixed order)*
- A physical register or notebook
- A spreadsheet (Excel, Google Sheets)
- WhatsApp messages
- Memory
- Property management software or an app
- An accountant or manager handles it
- Other: ______

> *Analysis note: the P1 variable. The classification is fixed now, because
> "manual" and "non-software" are not the same thing and a spreadsheet sits
> exactly between them — version 1's criterion said one and meant the other. The
> rule: **manual = {physical register, WhatsApp messages, memory, spreadsheet};
> software = {property management software or an app}. "An accountant or manager
> handles it" is excluded from numerator and denominator and reported separately.
> "Other" free text is coded against this list by a rule written before the sheet
> is opened.***

**Q14. In a typical month, how much time do you spend following up on rent that
hasn't arrived?** *(Required — multiple choice)*
- None — it all arrives on time
- Under 1 hour
- 1 to 3 hours
- 3 to 8 hours
- More than 8 hours

**Q15. Do you give tenants a receipt or written acknowledgement for rent received?**
*(Required — multiple choice)*
- Always, without being asked
- Most of the time
- About half the time
- Rarely
- Only when a tenant asks
- Never

> *Analysis note: corroborates P2 from the other side. Version 1 offered "Always /
> Usually / Only when asked / Never", which is not a frequency scale — two
> high-frequency positives, no middle, and one option measuring prompting rather
> than frequency. A landlord issuing receipts for about half of payments had no
> true answer and had to overstate or understate.*

**Q16. Since the start of this year, has a tenant disagreed with you about whether
a payment was made, or how much was owed?** *(Required — multiple choice)*
- Yes, more than once
- Yes, once
- No

---

## Section 6 — A shared record (everyone)

> *Shown to respondents:*
>
> The last few questions are about rental apps in general. There are several on
> the market and this survey is not about any particular one.

**Q17. Which of these two arrangements would you prefer?** *(Required — multiple choice)*

- **Rent goes through the app** — the payment confirms itself, but your money sits
  in the app company's account for a day or two on the way.
- **Rent goes straight from your account to theirs** — your money never sits
  anywhere else, but one of you has to confirm each payment by hand, every month.
- No preference
- I don't understand the difference

> *Analysis note: THE question, carrying P4. Both options name the same bearer
> ("your money"), in the same register, with the cost in the bold lead where a
> skim-reader meets it. "Directly" is gone — it is a positively loaded word and
> version 1 had it in one bold line and nothing comparable in the other. "Every
> month" is there because version 1 left one cost with a vague minimiser ("a short
> period") and the other with no magnitude at all, so the two were not comparable.*
>
> *"I don't understand the difference" is deliberately offered. Without it,
> confused respondents pick at random and their noise is indistinguishable from
> preference. Report its size honestly; above about 15%, the question was too
> abstract for this population and the result carries that caveat rather than
> being quietly dropped.*
>
> ***Order effect:*** *this is the only substantive preference item in the form and
> it cannot be shuffled without shuffling the two residual options into the middle.
> Publish two versions of the form, identical but for the order of the first two
> options, with the residuals pinned last in both; split recruitment between them
> and report the result by version. If one version is not run, the finding is
> reported with the order effect named as an unquantified limitation.*

**Q18. Attention check — please select "Rarely" for this question.**
*(Required — multiple choice)*
- Always
- Often
- Sometimes
- Rarely
- Never

> *Responses failing this are excluded before analysis and the number excluded is
> reported in the methodology.*

---

## Section 7 — About you (everyone)

**Q19. Your age group** *(Required — multiple choice)*
- 18–24 · 25–34 · 35–44 · 45–54 · 55 or over

**Q20. Which city is the property you are answering about in?** *(Required — dropdown)*
- Bengaluru · Chennai · Hyderabad · Mumbai · Delhi NCR · Pune · Kolkata · Other

> *A dropdown, not a text box. A free-text city field returns "bengaluru",
> "Bangalore", "blr" and "B'lore" as four distinct values. Worded as "the property
> you are answering about" because version 1 asked "which city do you rent in?"
> as a required question that every landlord-only respondent reached, and they do
> not rent anywhere.*

**Q21. If you would be willing to answer a few follow-up questions, leave an email
address.** *(Optional — short answer)*

> Optional. Used only to arrange a short follow-up about this research, and
> deleted once the follow-up interviews are finished, by [DATE] at the latest.

> *Handling, which is part of the instrument and not an afterthought: an email
> sitting in the same row as city, age band, rent band, accommodation type and
> dispute history is not an anonymous response — those five together identify
> people in a small city sample. **Within 48 hours of each batch, copy the email
> column to a separate access-restricted sheet containing email and nothing else,
> then clear the column in the response sheet.** The alternative, which is
> cleaner, is to drop Q21 from this form entirely and link a separate one-question
> form from the closing page.*

---

## Closing message (the debrief)

> Thank you. Your answers have been recorded.
>
> One thing was held back until now so it would not influence your answers:
> alongside this research the researcher is building a free rental record-keeping
> application, and these findings inform its design. Nothing you have given is
> passed to any other company.
>
> If you would rather your answers were not used for that, write to [EMAIL] with
> roughly the time you submitted and they will be removed.

> *This is here because the no-priming rule means the form cannot disclose the
> project up front. Concealment during the survey is defensible; permanent
> concealment is not. A debrief makes it time-limited and gives the respondent a
> way out.*

---

## Analysis plan — fixed before collection, not after

Deciding what counts as support after seeing the data is how researchers fool
themselves. Every threshold below is committed now.

### P0 — Sample description
Report Q3, Q4, Q5, Q7, Q12, Q14, Q19 and Q20 as frequency tables characterising
the sample. These are description, not evidence, and no claim rests on them.

### P1 — Record-keeping among independent landlords is predominantly manual
- **Tested by:** Q13 (landlord branch only).
- **Classification:** as fixed in the Q13 note above.
- **Support:** the lower bound of the 95% CI on the proportion selecting at least
  one manual option and no software option exceeds 50%.
- **Precondition:** landlord n ≥ 30. Below that, P1 is reported as indicative with
  the raw count beside every percentage and is **not** claimed as supported.
- *Q8 is not cited here. It measures what a tenant receives, not how a landlord
  keeps records, and version 1 listed it under P1 with no criterion at all.*

### P2 — Tenants commonly hold no landlord-acknowledged proof of payment
- **Tested by:** Q8, corroborated by Q15 from the landlord side.
- **Support:** the proportion of tenants selecting "Nothing" or "I don't know"
  **and no acknowledgement option** has a 95% CI whose lower bound exceeds 40%.
- **Denominator:** all non-excluded tenant-branch respondents answering Q8.
- **Contradictory rows** (a residual ticked alongside a substantive option) are
  reported as a count and excluded from both numerator and denominator.
- **Corroboration:** Q15 "Only when a tenant asks" or "Never".
- *Version 1 offered "modal answer, or exceeds 40%" — two independent routes to
  success, one of which is undefined for a select-all question. Two chances to
  pass is not a test.*

### P3 — Absent records coincide with disputes *(secondary, descriptive)*
- **Tested by:** Q6 × Q9, collapsed to 2 × 2 — has a copy (Q6 option 1) against
  does not (options 2+3+4); any dispute (Q9 options 1+2) against none (option 3).
- **Support:** the no-copy dispute rate exceeds the has-copy rate by at least 20
  percentage points **and** the 95% Newcombe interval on the difference excludes
  zero. Report Fisher's exact p and all four raw counts whatever the outcome.
- **Stop rule:** if the analysable base is under 80, or any cell is under 5, P3 is
  recorded as **untested**, not as unsupported.
- *Demoted from primary. At the sample sizes this study can realistically reach,
  a 4 × 4 cross-tab is powered only to detect an enormous effect, and publishing
  the full 4 × 4 would invite reading noise as structure.*

### P4 — Users prefer funds to move directly rather than through a platform
- **Tested by:** Q17, on the **tenant branch as primary**; the landlord branch is
  reported separately as indicative with its n.
- **Base:** all non-excluded respondents in the branch, including "No preference"
  and "I don't understand the difference", both reported as their own percentages.
- **Support:** the direct option's lead over the app-collects option exceeds the
  95% interval on that paired difference.
- **Order effect:** reported by form version, or named as an unquantified
  limitation if only one version was run.

### Before any of the above
1. Report responses received, completion rate, and the number excluded by Q18.
2. State plainly that this is a **convenience sample**. It is not representative
   of all Indian renters and must not be described as though it were.
3. Check the timestamp distribution. Responses should spread over days, clustered
   around when each recruitment message went out. **A block arriving within
   minutes of each other needs explaining before anything is computed from it.**
4. Check for straight-lining.
5. Delete Q1 = No rows within 24 hours; keep only the tally.
6. **Report every difference with its uncertainty.** At n = 300 a gap under about
   8 points is not a finding. "34% versus 32%" is a tie, and writing it as a
   majority is the commonest way a student survey is taken apart in a viva.

---

## What changed from version 1, and why

| Area | Version 1 | Now |
|---|---|---|
| **Q2 "Both"** | Routed to the tenant branch, then past the landlord section entirely — collected no landlord data | Q11 gate routes them into Section 5 |
| **Q17 (was Q16)** | Two costs borne by *different people*; warm possessive on one side, "sits with the app's company" on the other; "directly" in a bold lead | Same bearer, same register, cost in both bold leads, "directly" removed |
| **Q8 (was Q9)** | Shuffled, so "Nothing"/"I don't know" floated mid-list | Fixed order, residuals last, coding rule for contradictions fixed in advance |
| **Q9/Q16 thresholds** | Tenants asked about "disagreement or confusion", landlords about a "dispute" | One threshold, "disagreement", on both sides |
| **Q15 (was Q5e)** | "Always / Usually / Only when asked / Never" — not a frequency scale | Six-point scale with prompting inside the option text |
| **Skip logic** | Q12 and Q14 had per-question skips Google Forms cannot implement | Removed; branching is by section on multiple-choice questions only |
| **Consent** | Inferred from navigating to the next page | Q0 affirmative checkbox; notice carries DPDP s.5 elements |
| **"Anonymous"** | Claimed in six recruitment messages while an email was collected | "Confidential"; email handling specified; debrief added |
| **Questions** | 28, of which 5 fed the analysis | 21, every one tied to P0–P4 |
| **Length** | Promised 5 min, ran 6.7 | 4.6 min tenant, 4.2 landlord; every surface says five |
| **P1–P4** | "Materially higher", "modal answer or exceeds 40%", no branch specified, no small-sample rule | Numeric thresholds, CIs, pre-specified pooling, stop rules, branch named |

**One reviewer recommendation not taken.** The burden reviewer proposed moving
Section 6 ahead of the behavioural sections, so Q17 is answered fresh rather than
at minute 4.5. The reasoning is sound, but it trades one priming risk for another:
asking people to contemplate a rent-handling app before asking what their landlord
currently gives them as proof could colour that recall, and Q8 is the more
fragile measurement of the two. Instead the form was cut from 28 questions to 21,
which brings Q17 forward in wall-clock terms without reordering. If a pilot shows
heavy drop-off before Q17, revisit this.
