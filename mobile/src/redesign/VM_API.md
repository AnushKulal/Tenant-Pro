# View-Model API — `useVm()`

Every key returned by `useVm()` (from `AppContext.js`). Ported 1:1 from the
prototype's `renderVals()`. **236 keys · 57 top-level actions.**

## Conventions
- **type** is one of `string` · `number` · `boolean` · `array` · `object` · `action`.
- **Colour values are TOKEN KEYS**, not colours. Any field documented as a *colour token*
  (`fg`, `bg`, `bd`, `dot`, `edge`, `halo`, `checkFg`, `iconBg`, …) holds a plain string like
  `'pos'`, `'coral'`, `'lime'`, `'ink2'`, `'fg2'`, `'accent'`, `'vsoft'`. Resolve with
  `useT()[key]` → `t[p.fg]`. Three literals are passed through verbatim (not tokens):
  `pendingIconFg` may be `'#fff'`; `properties[].badgeBg` = `'rgba(8,8,10,.62)'`;
  `properties[].badgeFg` = `'#F4F3F7'`.
- Sizes such as `h`, `stackY`, `barWidth`, `idThumbX` are **CSS strings** (`'68px'`, `'70%'`,
  `'calc(0% + 4px)'`) exactly as the prototype emitted them — the screen decides how to consume.
- **action** = a zero-arg function `() => void` (except `setQ`/`setPq`/`setJq`, which take an
  event-or-value; see below). Calling one mutates state and re-derives the vm.
- `img` / `qr` / `mapSrc` fields are remote URL strings.

---

## Global / chrome

| key | type | notes |
|---|---|---|
| `fx` | string | theme-swap flash flag, `'0'`/`'1'` |
| `mode` | string | `'dark'` \| `'light'` (from `state.theme`, default `'dark'`) |
| `statusDark` | boolean | `mode === 'dark'` — status-bar hint |
| `toast` | string | current toast text (`''` when hidden) |
| `overlayOpen` | boolean | any overlay/sheet is open |
| `flash` is exposed via `useApp()`, not vm | | |

### Route flags (booleans)
`isRole`, `isLogin`, `isHome`, `isUnits`, `isPeople`, `isTenant`, `isLedger`, `isSettings`,
`isPortal`, `isOwner`, `isTenantLogin`, `isSignup`, `isProperty`, `isProfile`, `isFind`,
`isCheckout`, `isHelp`, `isStay`, `isTMe`, `isTSettings` — all boolean, true when that route is active.
`isOwner` = route is one of the owner screens. `tenantSide` / `showTenantDock` = boolean, true on tenant routes.

### Overlay flags (booleans)
`isSearch`, `isRecord`, `isPay`, `isMenu`, `isOverdueSheet`, `isVacant`, `isTickets`, `isTicket`,
`isUnit`, `isAssign`, `isInvite`, `isMove`, `isRent`, `isDanger`, `isSignOut` — boolean.

### Navigation actions
`goRole`, `goLogin`, `goHome`, `goUnits`, `goPeople`, `goPeopleOverdue`, `goLedger`, `goSettings`,
`goProfile`, `goPortal`, `goTenantLogin`, `goSignup`, `goBack`, `goCheckout`, `goFind`, `goTMe`,
`goStay`, `goTSettings`, `backFromStay` — all **action**. (`goPeople`/`goPeopleOverdue` also set the
People filter.)

### Overlay-open / misc actions
`openSearch`, `openMenu`, `openRecord`, `openPay`, `closeOverlay`, `openOverdue`, `openVacant`,
`openAllTickets`, `openInvite`, `openMove`, `openRent`, `openDanger`, `openTenant`(n/a), `addTenant`,
`addProperty`, `addUnit`, `confirmRecord`, `askSignOut`, `confirmSignOut`, `leaveProperty`, `noop`,
`submitSignup` — **action**.

---

## Owner header / search
| key | type | fields / notes |
|---|---|---|
| `showHeader` | boolean | show owner shell header (false on ledger & people) |
| `showSearch` | boolean | header shows the scope search field (home/units only) |
| `showBack` | boolean | header shows a back button instead of search |
| `backTitle` | string | back-button label for current route |
| `scoped` | boolean | a single property is selected |
| `scopeHint` | string | placeholder / current scope name |
| `scopeFg` | string | colour token |
| `scopeBorder` | string | colour token |
| `scopeIconFg` | string | colour token |
| `clearScope` | action | reset scope to all |
| `q` | string | header search text |
| `hasQ` | boolean | `q` non-empty |
| `setQ` | action(e) | takes an event `{target:{value}}` **or** a raw string |
| `clearQ` | action | |
| `searchGroups` | array | see below |
| `noResults` | boolean | search yielded nothing |

`searchGroups[]` = `{ title:string, rows:array }`.
`searchGroups[].rows[]` = `{ name:string, sub:string, icon:string, check:string (ionicon),
checkFg:token, bg:token, border:token, go:action }`.

---

## Deck dock (owner)
`dock` : array of `{ label:string, icon:string (ionicon), h:string (px), bg:token, fg:token,
stack:number, stackY:string (px), go:action }`.

---

## Overview / Home screen
| key | type | notes |
|---|---|---|
| `todayTitle` | string | "Overview" or scoped property name |
| `collectedStr` | string | e.g. `"₹46,000"` |
| `expectedStr` | string | e.g. `"of ₹66,000 expected"` |
| `pendingStr` | string | pending amount |
| `pendingSub` | string | overdue summary line |
| `pendingBg` | string | colour token |
| `pendingIconBg` | string | colour token |
| `pendingIcon` | string | ionicon name |
| `pendingIconFg` | string | colour token **or** literal `'#fff'` |
| `pendingSubFg` | string | colour token |
| `paidRatio` | string | `"4 OF 6 PAID"` |
| `pctStr` | string | `"70%"` |
| `barWidth` | string | `"70%"` (progress bar width) |
| `occupancyStr` | string | numeric string, e.g. `"80"` |
| `vacantNo` | string | vacant room count as string |
| `vacantSub` | string | vacancy summary |
| `vacantBg` / `vacantIconBg` / `vacantIconFg` / `vacantSubFg` | string | colour tokens |
| `paidFaces` | array | array of avatar URL strings |
| `bars` | array | `{ m:string, h:string(%), fill:token, lab:token, value:string, showValue:boolean }` |
| `peakLabel` | string | `"PEAK ₹66K"` |
| `trendLabel` | string | e.g. `"▲ 2.4× VS MAR"` |

### Tickets (overview + sheets)
| key | type | notes |
|---|---|---|
| `tickets` | array | preview cards (see *ticket card* shape) |
| `ticketCounts` | array | `{ label:string, n:string, fg:token, bg:token }` |
| `ticketTotal` | string | `"7 OPEN"` |
| `ticketsEmpty` | boolean | |
| `ticketsEmptyLine` | string | empty-state copy |
| `hasMoreTickets` | boolean | |
| `moreTicketsLabel` | string | `"View all 7 tickets"` |
| `allTickets` | array | full list, same *ticket card* shape |
| `ticket` | object | the opened ticket (detail sheet), see below |

**Ticket card** (`tickets[]` & `allTickets[]`): `{ title:string, img:url, who:string, meta:string,
priority:string, fg:token, bg:token, status:string, statusFg:token, read:action, start:action,
resolve:action, started:boolean, notStarted:boolean }`.

**`ticket`** (object): `{ title, who, img, meta, priority, fg:token, bg:token, status,
statusFg:token, body:string, photos:array(url), hasPhotos:boolean, photoCount:string,
started:boolean, notStarted:boolean, start:action, resolve:action, call:action }`.

### Overdue sheet
| key | type | notes |
|---|---|---|
| `overdueTitle` | string | |
| `overdueScopeLine` | string | |
| `overdueRows` | array | `{ name, img:url, rent:string, sub:string, late:string, record:action, remind:action, open:action }` |

### Vacant sheet
| key | type | notes |
|---|---|---|
| `vacantTitle` | string | |
| `vacantScopeLine` | string | |
| `vacantRooms` | array | `{ no:string, type:string, rent:string, prop:string, go:action }` |

### Recent payments (overview)
`recent` : array of `{ name:string, img:url, sub:string, amt:string, date:string }`.

### Properties grid (overview)
`properties` : array of `{ name:string, loc:string, img:url, stat:string, pips:array(token),
border:token, dim:number, badge:string, badgeIcon:string, badgeBg:string(literal rgba),
badgeFg:string(literal hex), go:action }`.

---

## Property detail (`place`)
`place` (object): `{ name, img:url, type, address, rating, reviews, code, policy, policyIcon,
invite:action, food, foodNote, amenities:array, mapSrc:url, mapsUrl:url, osmUrl:url, units:array,
viewUnits:action }`.
- `place.amenities[]` = `{ icon:string, label:string }`.
- `place.units[]` = `{ no:string, type:string, rent:string, fg:token, state:string }`.

---

## Units screen
| key | type | notes |
|---|---|---|
| `unitsLine` | string | summary line |
| `units` | array | see below |

`units[]` = `{ no:string, rent:string, beds:string, open:action, type:string, bg:token, fg:token,
sub:token, dot:token, faces:array(url) }`.

### Unit sheet
`isUnit` boolean · `unitSheet` (object): `{ no, type, rent, prop, share:string, beds:string,
bedFg:token, hasFree:boolean, isFull:boolean, freeLine:string, occupants:array, addExisting:action,
addNew:action }`.
- `unitSheet.occupants[]` = `{ name, img:url, rent:string, sub:string, fg:token, open:action }`.

### Assign sheet
`isAssign` boolean · `assignBack` action · `assignEmpty` boolean ·
`assignList` : array of `{ name:string, img:url, sub:string, go:action }`.

---

## People screen
| key | type | notes |
|---|---|---|
| `peopleLine` | string | header summary |
| `filters` | array | `{ label:string, bg:token, fg:token, bd:token, go:action }` |
| `pq` | string | people search text |
| `hasPq` | boolean | |
| `setPq` | action(e) | event or raw string |
| `clearPq` | action | |
| `peopleEmpty` | boolean | |
| `peopleEmptyLine` | string | |
| `people` | array | see below |

`people[]` = `{ name:string, img:url, rent:string, sub:string, edge:token, chip:string, chipBg:token,
chipFg:token, open:action }`.

---

## Tenant detail (`who`) + edit sheets
`who` (object): `{ name, img:url, rentFull:string, unitLine:string, sub:string, halo:token,
tenure:string, assigned:boolean, unassigned:boolean, movedIn:string, stats:array, credit:object,
timeline:array, docs:array }`.
- `who.stats[]` = `{ k:string, v:string, fg:token }`.
- `who.credit` = **credit object** (same shape as `myCredit`, below).
- `who.timeline[]` = `{ month:string, method:string, amt:string, fg:token, dot:token }`.
- `who.docs[]` = `{ icon:string, label:string }`.

### Move sheet
| key | type | notes |
|---|---|---|
| `moveName` | string | |
| `moveFrom` | string | |
| `moveTargets` | array | `{ name:string, policy:string, rooms:array }` |
| `noMoveTargets` | boolean | |
| `moveOut` | action | |
| `deleteMember` | action | |

`moveTargets[].rooms[]` = `{ no:string, type:string, beds:string, bg:token, bd:token, fg:token,
sub:token, go:action }`.

### Rent edit sheet
| key | type | notes |
|---|---|---|
| `rentDraft` | string | `"₹0"` |
| `rentDelta` | string | `"NO CHANGE"` / `"+₹2,000 VS NOW"` |
| `rentDeltaFg` | string | colour token |
| `rentDown` / `rentUp` | action | ±500 |
| `rentSteps` | array | `{ label:string, go:action }` |
| `saveRent` | action | |

### Record-payment sheet
`methods` : array of `{ label:string, bg:token, fg:token, bd:token, go:action }`.
(`confirmRecord` action + `isRecord` flag are in the chrome section.)

---

## Ledger screen
| key | type | notes |
|---|---|---|
| `ledger` | array | `{ title:string, total:string, rows:array }` |
| `ledgerScope` | string | uppercase scope label |
| `netStr` | string | current-month net |
| `inStr` | string | `"IN ₹46,000"` |
| `outStr` | string | `"OUT ₹4,600"` |

`ledger[].rows[]` (payment-in **or** expense-out) = `{ name:string, sub:string, amt:string,
date:string, fg:token, icon:string, iconBg:token, iconFg:token }`.

---

## Owner menu / profile / settings
| key | type | notes |
|---|---|---|
| `menuRows` | array | `{ label:string, icon:string, go:action, fg:token, bg:token, ifg:token }` |
| `profileFields` | array | `{ label:string, value:string, editable:boolean }` — read-only rows; the ONE edit button lives in the card header, not per row. `editable:false` renders a lock and mutes the value |
| `themeModes` | array | `{ label:string, icon:string, bg:token, fg:token, bd:token, go:action }` |
| `settingsRows` | array | `{ label:string, icon:string, meta:string }` |

---

## Invite sheet
`invite` (object): `{ name:string, code:string, policy:string, link:url, qr:url, options:array,
share:action, manual:action }`.
- `invite.options[]` = `{ name:string, code:string, bg:token, fg:token, bd:token, go:action }`.

---

## Tenant login / signup
| key | type | notes |
|---|---|---|
| `tenantIdModes` | array | `{ label, bg:token, fg:token, bd:token, go:action }` |
| `tenantIdLabel` | string | |
| `tenantIdValue` | string | |
| `idThumbX` | string | CSS calc string for the toggle thumb |
| `setEmailMode` / `setMobileMode` | action | |
| `emailFg` / `mobileFg` | string | colour tokens |
| `socials` | array | `{ label:string, icon:string, go:action }` |
| `adult` | boolean | 18+ selected |
| `minor` | boolean | under-18 selected |
| `ageOptions` | array | `{ label, bg:token, fg:token, bd:token, go:action }` |
| `signupFields` | array | `{ label:string, value:string, icon:string }` |
| `guardianFields` | array | `{ label:string, value:string, icon:string }` |
| `signupCta` | string | |
| `signupNote` | string | |

---

## Tenant portal / me
| key | type | notes |
|---|---|---|
| `portalLinked` | boolean | tenant has a unit |
| `portalUnlinked` | boolean | |
| `me` | object | see below |
| `showTenantDock` | boolean | |
| `tenantDock` | array | `{ label, icon, h:string, bg:token, fg:token, stack:number, stackY:string, go:action }` |
| `tmeOn` | string | `'0'`/`'1'` |
| `tmeBg` / `tmeFg` | string | colour tokens |
| `tmeH` | string | px |
| `myCredit` | object | credit object (see below) |
| `myTimeline` | array | `{ month, method, amt:string, fg:token, dot:token }` |
| `myStats` | array | `{ k:string, v:string, fg:token }` |
| `myDocs` | array | `{ icon:string, label:string }` |
| `myTickets` | array | `{ title, meta, priority, fg:token, bg:token, status, statusFg:token, open:action }` |
| `myPayments` | array | `{ amt:string, sub:string, ref:string }` |
| `roommates` | array | `{ name:string, img:url, co:string }` |
| `hasRoommates` | boolean | |
| `myAmenities` | array | `{ icon:string, label:string }` |
| `myFood` | string | |
| `myFoodNote` | string | |
| `houseRules` | array | `{ icon:string, label:string, v:string }` |
| `myInvite` | object | `{ qr:url, beds:string, share:action }` |

**`me`** (object): `{ name:string (first name), img:url, rent:string, deposit:string, since:string,
movedIn:string, due:string, dueFg:token, home:string, propName:string, propImg:url, propCode:string,
policy:string, policyIcon:string, address:string, unitLine:string }`.

**Credit object** (`myCredit`, `who.credit`): `{ score:number, band:string ('Positive'|'Neutral'|
'Negative'), factors:array, label:string, fg:token, bg:token, marker:string(%) }`.
`factors[]` = `{ label:string, detail:string, pts:string, fg:token }`.

---

## Tenant checkout / pay
| key | type | notes |
|---|---|---|
| `payMethods` | array | `{ id:string, label:string, sub:string, icon:string, bg:token, bd:token, check:string, checkFg:token, go:action }` |
| `payLabel` | string | `"Pay ₹8,000"` |
| `paid` | boolean | |
| `unpaid` | boolean | |
| `payNow` / `payDone` | action | |
| `payBreakdown` | array | `{ k:string, v:string }` |
| `payCards` | array | `{ label:string, sub:string, icon:string, tag:string }` |

---

## Tenant find / join
| key | type | notes |
|---|---|---|
| `jq` | string | join search text |
| `setJq` | action(e) | event or raw string |
| `joinQuery` | string | trimmed `jq` |
| `scanQr` | action | fills a demo code |
| `jfilters` | array | `{ label, bg:token, fg:token, bd:token, go:action }` |
| `findLine` | string | |
| `joinResults` | array | see below |
| `noJoinResults` | boolean | |

`joinResults[]` = `{ name:string, code:string, loc:string, img:url, policy:string, policyIcon:string,
beds:string, bedFg:token, cta:string, bd:token, join:action }`.

---

## Tenant help
`requests` : array of `{ title:string, sub:string, status:string, dot:token }`.

---

## Tenant settings
| key | type | notes |
|---|---|---|
| `tenantSettingsRows` | array | `{ label:string, icon:string, meta:string }` |

---

## Actions summary (57)
`clearScope, setQ, clearQ, goBack, addProperty, addUnit, goRole, goLogin, goHome, goUnits, goPeople,
goPeopleOverdue, goLedger, goSettings, goProfile, goPortal, goTenantLogin, setEmailMode, setMobileMode,
goSignup, submitSignup, leaveProperty, noop, openSearch, openMenu, openRecord, openPay, closeOverlay,
confirmRecord, openOverdue, openVacant, openAllTickets, goCheckout, payNow, payDone, goFind, goTMe,
goStay, goTSettings, backFromStay, openInvite, openMove, moveOut, deleteMember, openRent, rentDown,
rentUp, saveRent, openDanger, addTenant, askSignOut, confirmSignOut, assignBack, clearPq, setPq,
scanQr, setJq`.

Nested/per-item actions (inside arrays & objects) not counted above include: each `go` in
`dock`/`tenantDock`/`filters`/`jfilters`/`methods`/`themeModes`/`ageOptions`/`tenantIdModes`/
`socials`/`searchGroups[].rows`/`invite.options`/`rentSteps`/`vacantRooms`/`moveTargets[].rooms`;
the ticket card `read`/`start`/`resolve`; `overdueRows` `record`/`remind`/`open`; `people[].open`;
`unitSheet.occupants[].open`, `unitSheet.addExisting`/`addNew`; `assignList[].go`; `place.invite`/
`viewUnits`; `ticket.start`/`resolve`/`call`; `properties[].go`; `myTickets[].open`;
`joinResults[].join`; `myInvite.share`; `invite.share`/`manual`.

## Access via `useApp()`
`useApp()` returns `{ state, set, go, flash, setState }` for screens needing raw state control
(`set(k,v)`, `go(route)`, `flash(msg)`).
