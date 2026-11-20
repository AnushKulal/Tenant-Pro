// File: mobile/src/redesign/screens/ReceiptsScreen.js
// The tenant's full payment history.
//
// MeScreen has always shown the four most recent rows behind a "SEE ALL" that went
// nowhere — the route it used, 'treceipts', had no entry in RedesignRoot's table,
// so it fell through to the landlord's Overview. This is the screen that link, the
// two "See my receipts" buttons on the checkout, and three rows on the alert bell
// were all written for.
//
// Three things it does that the four-row summary could not:
//
//   • Shows every state, not just the green ones. A claim still AWAITING is not
//     money the landlord has agreed they received, and a REJECTED one carries the
//     reason it was refused — the server returns `decision_note` precisely so a
//     refusal does not vanish without explanation.
//   • Totals only CONFIRMED money. Adding a waiting claim into a month's total is
//     how a tenant comes to believe a month is settled when it is not.
//   • Searches. Fifty rows is the server's cap, and a tenant hunting one UTR among
//     them is not going to find it by scrolling.
import React from 'react';
import { View, RefreshControl } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Row, Press, Glyph, SearchBar } from '../ui';
import { KeyboardScroll } from '../keyboard';
import { Stagger } from '../motion';

export default function ReceiptsScreen() {
    const vm = useVm();
    const t = useT();
    const r = vm.receipts;
    const col = (v) => (v && (v[0] === '#' || v.startsWith('rgb')) ? v : t[v]);

    return (
        <KeyboardScroll
            contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 26 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={r.refreshing} onRefresh={r.refresh} tintColor={t.fg2} colors={[t.lime]} progressBackgroundColor={t.ink2} />}
        >
            <Press
                onPress={r.back}
                hitSlop={10}
                style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}
            >
                <Glyph name="chevron-back" size={19} color={t.fg} />
            </Press>

            <T w={700} s={32} lh={1.02} style={{ letterSpacing: -1.6, marginBottom: 4 }}>Receipts</T>
            <T w={400} s={13} lh={1.4} c={t.fg2} style={{ marginBottom: 16 }}>{r.sub}</T>

            {/* Confirmed money, and nothing else in the headline figure. The label
                carries the qualification so the number cannot be misread on its own. */}
            <View style={{ borderRadius: 22, backgroundColor: t.fg, padding: 18, marginBottom: 8 }}>
                <T mono w={600} s={10} lh={1} ls={0.12} c={t.ink} style={{ opacity: 0.55 }}>{r.totalLabel}</T>
                <T w={700} s={34} lh={1} c={t.ink} style={{ letterSpacing: -1.6, marginTop: 10 }}>{r.total}</T>
                <T mono w={600} s={10} lh={1.6} ls={0.08} c={t.ink} style={{ opacity: 0.55, marginTop: 8 }}>{r.countLine}</T>
            </View>

            {/* The two states that are not settled, each only when there is one. */}
            {(!!r.awaiting || !!r.rejected) && (
                <Row gap={8} style={{ marginBottom: 8 }}>
                    {!!r.awaiting && (
                        <View style={{ flex: 1, borderRadius: 16, backgroundColor: t.asoft, paddingVertical: 13, paddingHorizontal: 14 }}>
                            <Glyph name="time-outline" size={15} color={t.amber} />
                            <T mono w={600} s={9} lh={1.4} ls={0.06} c={t.amber} style={{ marginTop: 8 }}>{r.awaiting.toUpperCase()}</T>
                        </View>
                    )}
                    {!!r.rejected && (
                        <View style={{ flex: 1, borderRadius: 16, backgroundColor: t.csoft, paddingVertical: 13, paddingHorizontal: 14 }}>
                            <Glyph name="close-circle" size={15} color={t.coral} />
                            <T mono w={600} s={9} lh={1.4} ls={0.06} c={t.coral} style={{ marginTop: 8 }}>{r.rejected.toUpperCase()}</T>
                        </View>
                    )}
                </Row>
            )}

            <SearchBar
                value={r.q}
                onChangeText={r.setQ}
                onClear={r.clearQ}
                placeholder="Search amount, UTR or method"
                padV={13}
                style={{ marginTop: 10, marginBottom: 18 }}
            />

            {r.empty ? (
                <View style={{ borderRadius: 20, backgroundColor: t.ink2, borderWidth: 1, borderStyle: 'dashed', borderColor: t.line2, paddingVertical: 30, paddingHorizontal: 20, alignItems: 'center', rowGap: 11 }}>
                    <Glyph name={r.emptyIcon} size={22} color={t.fg3} />
                    <T w={400} s={13} lh={1.45} c={t.fg2} style={{ textAlign: 'center', maxWidth: 260 }}>{r.emptyLine}</T>
                </View>
            ) : null}

            {r.groups.map((g, gi) => (
                <Stagger index={gi} key={g.key}>
                    <View style={{ marginBottom: 20 }}>
                        <Row gap={10} style={{ marginBottom: 10 }}>
                            <T mono w={600} s={9} lh={1} ls={0.12} c={t.fg3}>{g.title}</T>
                            <View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
                            {!!g.total && <T mono w={600} s={9} lh={1} ls={0.08} c={t.fg2}>{g.total}</T>}
                        </Row>

                        <View style={{ borderRadius: 20, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, overflow: 'hidden' }}>
                            {g.rows.map((p, i) => (
                                <View
                                    key={p.id}
                                    style={{ paddingVertical: 14, paddingHorizontal: 16, borderTopWidth: i ? 1 : 0, borderTopColor: t.line }}
                                >
                                    <Row gap={12}>
                                        <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: col(p.soft), alignItems: 'center', justifyContent: 'center' }}>
                                            <Glyph name={p.icon} size={16} color={col(p.fg)} />
                                        </View>
                                        <View style={{ flex: 1, minWidth: 0 }}>
                                            <Row justify="space-between">
                                                <T w={600} s={15} lh={1.2}>{p.amt}</T>
                                                <T mono w={600} s={8} lh={1.3} ls={0.08} c={col(p.fg)}>{p.label}</T>
                                            </Row>
                                            <T mono w={600} s={9} lh={1.5} ls={0.06} c={t.fg3} style={{ marginTop: 4 }}>
                                                {p.method} · {p.day}
                                            </T>
                                        </View>
                                    </Row>

                                    {/* The reference is what a landlord matches against
                                        a credit in their bank, so it is worth its own
                                        line rather than being truncated into the row. */}
                                    {!!p.ref && (
                                        <Row gap={7} style={{ marginTop: 10, marginLeft: 46 }}>
                                            <Glyph name="pricetag-outline" size={12} color={t.fg3} />
                                            <T mono w={600} s={9} lh={1.3} ls={0.06} c={t.fg2} numberOfLines={1} style={{ flex: 1 }}>{p.ref}</T>
                                        </Row>
                                    )}

                                    {/* Why it is not settled. A refusal without its
                                        reason is the thing that generates a phone call. */}
                                    {!!p.note && (
                                        <T w={400} s={12} lh={1.45} c={p.state === 'rejected' ? t.coral : t.fg2} style={{ marginTop: 9, marginLeft: 46 }}>
                                            {p.note}
                                        </T>
                                    )}
                                    {!!p.decided && p.state === 'rejected' && (
                                        <T mono w={600} s={9} lh={1.3} ls={0.06} c={t.fg3} style={{ marginTop: 5, marginLeft: 46 }}>
                                            DECIDED {p.decided.toUpperCase()}
                                        </T>
                                    )}
                                </View>
                            ))}
                        </View>
                    </View>
                </Stagger>
            ))}
        </KeyboardScroll>
    );
}
