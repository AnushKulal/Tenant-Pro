import React from 'react';
import { View, ScrollView } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Card, Row, Press, Glyph, Face, Avatar } from '../ui';

export default function TenantDetailScreen() {
    const vm = useVm();
    const t = useT();
    const who = vm.who;
    const col = (v) => (v && (v[0] === '#' || v.startsWith('rgb')) ? v : t[v]);

    if (!who) return null;

    const credit = who.credit || {};

    return (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 22 }} showsVerticalScrollIndicator={false}>
            {/* Hero */}
            <Card radius={26} pad={20} style={{ marginBottom: 8 }}>
                <View style={{ position: 'absolute', right: -40, top: -40, width: 150, height: 150, borderRadius: 75, backgroundColor: col(who.halo) }} />
                <Row gap={14}>
                    <Avatar uri={who.img} name={who.name} size={64} radius={20} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                        <T w={700} s={24} lh={1.05} style={{ letterSpacing: -1 }} numberOfLines={1}>{who.name}</T>
                        <Eyebrow s={10} ls={0.08} c={t.fg3} style={{ marginTop: 6 }}>{who.sub}</Eyebrow>
                        <T w={400} s={12} lh={1.4} c={t.fg2} style={{ marginTop: 6 }}>{who.tenure} · {who.movedIn}</T>
                    </View>
                </Row>
                <Row gap={8} style={{ marginTop: 18 }}>
                    <Press style={{ flex: 1, paddingVertical: 11, borderRadius: 13, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 6 }}>
                        <Glyph name="call-outline" size={15} color={t.fg} />
                        <T w={600} s={11} lh={1} c={t.fg}>Call</T>
                    </Press>
                    <Press onPress={vm.openRecord} style={{ flex: 2, paddingVertical: 11, borderRadius: 13, backgroundColor: t.lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 6 }}>
                        <Glyph name="add-circle-outline" size={15} color={t.on} />
                        <T w={600} s={11} lh={1} c={t.on}>Record payment</T>
                    </Press>
                </Row>
            </Card>

            {/* Action row */}
            <Row gap={7} style={{ marginBottom: 8 }}>
                <Press onPress={vm.openMove} style={{ flex: 1, paddingVertical: 12, borderRadius: 15, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 7 }}>
                    <Glyph name="swap-horizontal" size={15} color={t.accent} />
                    <T w={600} s={11} lh={1} c={t.fg}>Move room</T>
                </Press>
                <Press onPress={vm.openRent} style={{ flex: 1, paddingVertical: 12, borderRadius: 15, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 7 }}>
                    <Glyph name="pricetag-outline" size={15} color={t.accent} />
                    <T w={600} s={11} lh={1} c={t.fg}>Edit rent</T>
                </Press>
                <Press onPress={vm.openDanger} style={{ width: 46, paddingVertical: 12, borderRadius: 15, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
                    <Glyph name="ellipsis-horizontal" size={17} color={t.fg2} />
                </Press>
            </Row>

            {/* Stats grid */}
            {who.stats && (
                <Row wrap gap={8} align="stretch" style={{ marginBottom: 8 }}>
                    {who.stats.map((s, i) => (
                        <View key={i} style={{ flexBasis: '48%', flexGrow: 1, borderRadius: 18, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, paddingVertical: 14, paddingHorizontal: 12 }}>
                            <T w={700} s={17} lh={1} c={col(s.fg)} style={{ letterSpacing: -0.6 }}>{s.v}</T>
                            <Eyebrow s={9} ls={0.08} c={t.fg3} style={{ marginTop: 7 }}>{s.k}</Eyebrow>
                        </View>
                    ))}
                </Row>
            )}

            {/* Credit */}
            <Card radius={22} pad={0} style={{ paddingVertical: 16, paddingHorizontal: 18, marginBottom: 8 }}>
                <Eyebrow s={10} ls={0.12} c={t.fg3}>CREDIT SCORE</Eyebrow>
                <Row align="baseline" gap={9} style={{ marginTop: 10 }}>
                    <T w={700} s={34} lh={1} c={col(credit.fg)} style={{ letterSpacing: -1.6 }}>{credit.label}</T>
                    <View style={{ paddingVertical: 4, paddingHorizontal: 9, borderRadius: 7, backgroundColor: col(credit.bg) }}>
                        <Eyebrow s={10} ls={0.06} c={col(credit.fg)}>{credit.band}</Eyebrow>
                    </View>
                </Row>
                {/* No dial when there is nothing to point it at. A tenant whose
                    payments were all recorded before the app tracked due dates has no
                    scorable history, and a needle resting at zero would read as a
                    judgement rather than an absence — which is precisely the fake this
                    replaced. The server says why; this prints it. */}
                {credit.known === false ? (
                    <T w={400} s={12.5} lh={1.5} c={t.fg2} style={{ marginTop: 10 }}>{credit.why}</T>
                ) : (
                    <>
                        <View style={{ position: 'relative', height: 6, borderRadius: 3, backgroundColor: t.line, marginTop: 18, marginBottom: 9 }}>
                            <View style={{ position: 'absolute', left: '50%', top: -4, width: 1, height: 14, backgroundColor: t.line2 }} />
                            <View style={{ position: 'absolute', top: -4, width: 14, height: 14, borderRadius: 7, borderWidth: 3, borderColor: t.ink2, backgroundColor: col(credit.fg), left: credit.marker, marginLeft: -7 }} />
                        </View>
                        <Row justify="space-between" style={{ marginBottom: 14 }}>
                            <Eyebrow s={9} ls={0.06} c={t.fg3}>−100 NEGATIVE</Eyebrow>
                            <Eyebrow s={9} ls={0.06} c={t.fg3}>POSITIVE +100</Eyebrow>
                        </Row>
                        {(credit.factors || []).map((cf, i) => (
                            <Row key={i} gap={12} style={{ paddingVertical: 9, borderTopWidth: 1, borderTopColor: t.line }}>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <T w={500} s={13} lh={1.2} c={t.fg}>{cf.label}</T>
                                    <Eyebrow s={9} ls={0.06} c={t.fg3} style={{ marginTop: 4 }}>{cf.detail}</Eyebrow>
                                </View>
                                <T w={700} s={14} lh={1} c={col(cf.fg)}>{cf.pts}</T>
                            </Row>
                        ))}
                        {/* A thin score should LOOK thin. Payments that exist but carry
                            no due date cannot be judged, so they are named rather than
                            folded into the number as if they were on time. */}
                        {credit.unscored > 0 ? (
                            <Eyebrow s={9} ls={0.06} c={t.fg3} style={{ marginTop: 12 }}>
                                {`${credit.unscored} EARLIER ${credit.unscored === 1 ? 'PAYMENT' : 'PAYMENTS'} NOT SCORED — RECORDED BEFORE DUE DATES WERE TRACKED`}
                            </Eyebrow>
                        ) : null}
                    </>
                )}
            </Card>

            {/* Timeline */}
            <Card radius={22} pad={0} style={{ paddingVertical: 16, paddingHorizontal: 18, marginBottom: 8 }}>
                <Eyebrow s={10} ls={0.12} c={t.fg3} style={{ marginBottom: 14 }}>PAYMENT TIMELINE</Eyebrow>
                {(who.timeline || []).map((tl, i) => (
                    <Row key={i} gap={12} style={{ paddingVertical: 9 }}>
                        <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: col(tl.dot) }} />
                        <T w={500} s={13} lh={1} c={t.fg} style={{ flex: 1 }}>{tl.month}</T>
                        <Eyebrow s={9} ls={0.06} c={t.fg3} style={{ marginRight: 10 }}>{tl.method}</Eyebrow>
                        <T w={700} s={13} lh={1} c={col(tl.fg)}>{tl.amt}</T>
                    </Row>
                ))}
            </Card>

            {/* Documents — the tenant's real ID proofs, and the way in to verify them */}
            <Card radius={22} pad={0} style={{ paddingVertical: 16, paddingHorizontal: 18 }}>
                <Row justify="space-between" style={{ marginBottom: 10 }}>
                    <Eyebrow s={9} ls={0.12} c={t.fg3}>DOCUMENTS</Eyebrow>
                    <Row gap={5}>
                        <Glyph name={who.idProof.icon} size={13} color={col(who.idProof.fg)} />
                        <Eyebrow s={9} ls={0.08} c={col(who.idProof.fg)}>{who.idProof.label}</Eyebrow>
                    </Row>
                </Row>

                <T w={400} s={12.5} lh={1.45} c={t.fg2} style={{ marginBottom: 12 }}>{who.idProof.line}</T>

                <Press
                    onPress={who.idProof.go}
                    style={{ paddingVertical: 13, borderRadius: 14, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 7 }}
                >
                    <Glyph name="folder-open-outline" size={15} color={t.accent} />
                    <T w={600} s={12.5} c={t.fg}>{who.idProof.cta}</T>
                </Press>
            </Card>

            {/* Guest sign-in ID — only for someone who joined as a guest and has
                not completed a profile. This is the account-recovery path for a
                person with no email: the landlord holds their government ID, so
                they can verify them in person and read the code back. */}
            {who.guestId.is && (
                <Card radius={22} pad={0} style={{ paddingVertical: 16, paddingHorizontal: 18, marginTop: 8 }}>
                    <Row justify="space-between" style={{ marginBottom: 10 }}>
                        <Eyebrow s={9} ls={0.12} c={t.fg3}>{who.guestId.title.toUpperCase()}</Eyebrow>
                        <Glyph name={who.guestId.shown ? 'eye-outline' : 'eye-off-outline'} size={14} color={t.fg3} />
                    </Row>

                    <Row gap={10} align="center" style={{ marginBottom: 12 }}>
                        <T
                            mono
                            w={700}
                            s={who.guestId.shown ? 21 : 19}
                            lh={1}
                            ls={0.18}
                            c={who.guestId.shown ? t.amber : t.fg3}
                            style={{ flex: 1 }}
                        >
                            {who.guestId.shown ? who.guestId.code : who.guestId.masked}
                        </T>
                        {who.guestId.shown && (
                            <Press
                                onPress={who.guestId.copy}
                                style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}
                            >
                                <Glyph name="copy-outline" size={15} color={t.fg2} />
                            </Press>
                        )}
                    </Row>

                    <T w={400} s={12.5} lh={1.45} c={t.fg2} style={{ marginBottom: 12 }}>{who.guestId.line}</T>

                    <Press
                        onPress={who.guestId.toggle}
                        style={{ paddingVertical: 13, borderRadius: 14, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 7 }}
                    >
                        <Glyph name={who.guestId.shown ? 'eye-off-outline' : 'eye-outline'} size={15} color={t.accent} />
                        <T w={600} s={12.5} c={t.fg}>{who.guestId.cta}</T>
                    </Press>

                    <T w={400} s={11} lh={1.45} c={t.fg3} style={{ marginTop: 10 }}>{who.guestId.foot}</T>
                </Card>
            )}
        </ScrollView>
    );
}
