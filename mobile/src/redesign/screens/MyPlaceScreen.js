import React from 'react';
import { View, ScrollView, Image } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Row, Press, Glyph } from '../ui';

export default function MyPlaceScreen() {
    const vm = useVm();
    const t = useT();
    const me = vm.me;

    return (
        <ScrollView
            contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 22 }}
            showsVerticalScrollIndicator={false}
        >
            {/* Header */}
            <Row gap={11} style={{ marginBottom: 16 }}>
                <Press
                    onPress={vm.backFromStay}
                    style={{ width: 36, height: 36, borderRadius: 12, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}
                >
                    <Glyph name="chevron-back" size={17} color={t.fg} />
                </Press>
                <T w={600} s={16} lh={1.1} c={t.fg} style={{ flex: 1, letterSpacing: -0.4 }}>My place</T>
            </Row>

            {/* Waiting on a landlord to confirm — see the note in PortalHomeScreen.
                This screen has to agree with that one: showing "no property yet" here
                while the home screen says "we found your tenancy" is a contradiction
                the tenant reads as the app being broken. */}
            {vm.portalWaiting && vm.portalWait && (
                <View style={{ paddingVertical: 24, paddingHorizontal: 20, borderRadius: 22, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.amber }}>
                    <Row gap={11}>
                        <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: t.asoft, alignItems: 'center', justifyContent: 'center' }}>
                            <Glyph name="hourglass-outline" size={19} color={t.amber} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <T w={600} s={15} lh={1.25} c={t.fg}>{vm.portalWait.title}</T>
                            {vm.portalWait.property ? (
                                <T mono w={600} s={9} lh={1.4} ls={0.08} c={t.amber} numberOfLines={1} style={{ marginTop: 4 }}>
                                    {`${String(vm.portalWait.property).toUpperCase()}${vm.portalWait.unit ? ` · ROOM ${vm.portalWait.unit}` : ''}`}
                                </T>
                            ) : null}
                        </View>
                    </Row>
                    <T w={400} s={13} lh={1.5} c={t.fg2} style={{ marginTop: 13 }}>{vm.portalWait.line}</T>
                    <T w={400} s={12} lh={1.45} c={t.fg3} style={{ marginTop: 7 }}>{vm.portalWait.note}</T>
                </View>
            )}

            {/* Unlinked state */}
            {vm.portalUnlinked && (
                <View style={{ alignItems: 'center', paddingVertical: 44, paddingHorizontal: 20, borderRadius: 22, backgroundColor: t.ink2, borderWidth: 1, borderStyle: 'dashed', borderColor: t.line2 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: t.vsoft, alignItems: 'center', justifyContent: 'center' }}>
                        <Glyph name="home-outline" size={20} color={t.violet2} />
                    </View>
                    <T w={600} s={15} lh={1.3} c={t.fg} style={{ marginTop: 14, textAlign: 'center' }}>No property yet</T>
                    <T w={400} s={13} lh={1.5} c={t.fg2} style={{ marginTop: 7, maxWidth: 230, textAlign: 'center' }}>
                        Once you join, your room, roommates and house rules live here.
                    </T>
                    <Press
                        onPress={vm.goPortal}
                        style={{ marginTop: 16, paddingVertical: 12, paddingHorizontal: 18, borderRadius: 999, backgroundColor: t.lime }}
                    >
                        <T w={600} s={12} lh={1} c={t.on}>Find a property</T>
                    </Press>
                </View>
            )}

            {/* Linked state */}
            {vm.portalLinked && me && (
                <View>
                    {/* Property hero card */}
                    <View style={{ borderRadius: 26, overflow: 'hidden', backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, marginBottom: 8 }}>
                        <Image source={{ uri: me.propImg }} style={{ width: '100%', height: 132, backgroundColor: t.ink3 }} resizeMode="cover" />
                        <View style={{ paddingTop: 16, paddingHorizontal: 18, paddingBottom: 18 }}>
                            <Row gap={7} wrap>
                                <Eyebrow s={10} ls={0.1} c={t.fg3}>{me.unitLine}</Eyebrow>
                                <Row gap={5} style={{ paddingVertical: 4, paddingHorizontal: 9, borderRadius: 999, backgroundColor: t.vsoft }}>
                                    <Glyph name={me.policyIcon} size={12} color={t.violet2} />
                                    <T mono w={600} s={9} lh={1} ls={0.06} c={t.violet2}>{me.policy}</T>
                                </Row>
                            </Row>
                            <T w={700} s={24} lh={1.05} style={{ marginTop: 9, letterSpacing: -1 }}>{me.propName}</T>
                            <Row align="flex-start" gap={8} style={{ marginTop: 10 }}>
                                <Glyph name="location-outline" size={15} color={t.fg3} style={{ marginTop: 2 }} />
                                <T w={400} s={13} lh={1.5} c={t.fg2} style={{ flex: 1 }}>{me.address}</T>
                            </Row>

                            {/* The other half of the landlord pinning the property:
                                a tenant tapping Directions and being routed to their
                                own front door. Only when it HAS been pinned — sending
                                somebody to a guessed coordinate is worse than saying
                                there isn't one. */}
                            {vm.myWay.pinned ? (
                                <Press
                                    onPress={vm.myWay.go}
                                    style={{ marginTop: 14, paddingVertical: 13, borderRadius: 14, backgroundColor: t.lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 8 }}
                                >
                                    <Glyph name="navigate" size={16} color={t.on} />
                                    <T w={700} s={13.5} c={t.on}>{vm.myWay.label}</T>
                                </Press>
                            ) : (
                                <Row gap={8} align="flex-start" style={{ marginTop: 14 }}>
                                    <Glyph name="information-circle-outline" size={14} color={t.fg3} />
                                    <T w={400} s={11.5} lh={1.45} c={t.fg3} style={{ flex: 1 }}>{vm.myWay.missingLine}</T>
                                </Row>
                            )}
                        </View>
                    </View>

                    {/* Roommates */}
                    {vm.hasRoommates && (
                        <View style={{ borderRadius: 22, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, paddingVertical: 16, paddingHorizontal: 18, marginBottom: 8 }}>
                            <Eyebrow s={10} ls={0.12} c={t.fg3} style={{ marginBottom: 12 }}>ROOMMATES</Eyebrow>
                            {vm.roommates.map((rm, i) => (
                                <Row key={i} gap={12} style={{ paddingVertical: 7 }}>
                                    <Image source={{ uri: rm.img }} style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: t.ink3 }} resizeMode="cover" />
                                    <View style={{ flex: 1 }}>
                                        <T w={600} s={14} lh={1.2}>{rm.name}</T>
                                        <T mono w={600} s={10} lh={1.4} ls={0.06} c={t.fg3} style={{ marginTop: 4 }}>{rm.co}</T>
                                    </View>
                                </Row>
                            ))}
                        </View>
                    )}

                    {/* What's included */}
                    <View style={{ borderRadius: 22, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, paddingVertical: 16, paddingHorizontal: 18, marginBottom: 8 }}>
                        <Eyebrow s={10} ls={0.12} c={t.fg3} style={{ marginBottom: 14 }}>WHAT'S INCLUDED</Eyebrow>
                        <Row wrap gap={12} align="flex-start">
                            {vm.myAmenities.map((ma, i) => (
                                <Row key={i} gap={10} style={{ flexBasis: '46%', flexGrow: 1, marginBottom: 4 }}>
                                    <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: t.vsoft, alignItems: 'center', justifyContent: 'center' }}>
                                        <Glyph name={ma.icon} size={15} color={t.violet2} />
                                    </View>
                                    <T w={500} s={13} lh={1.2} c={t.fg2} style={{ flex: 1 }}>{ma.label}</T>
                                </Row>
                            ))}
                        </Row>
                    </View>

                    {/* Food */}
                    <Row align="flex-start" gap={13} style={{ borderRadius: 22, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, paddingVertical: 16, paddingHorizontal: 18, marginBottom: 8 }}>
                        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: t.lsoft, alignItems: 'center', justifyContent: 'center' }}>
                            <Glyph name="restaurant" size={18} color={t.pos} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <Eyebrow s={10} ls={0.12} c={t.fg3}>FOOD</Eyebrow>
                            <T w={600} s={14} lh={1.25} c={t.fg} style={{ marginTop: 8 }}>{vm.myFood}</T>
                            <T w={400} s={12} lh={1.45} c={t.fg2} style={{ marginTop: 5 }}>{vm.myFoodNote}</T>
                        </View>
                    </Row>

                    {/* House rules */}
                    <View style={{ borderRadius: 22, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, paddingVertical: 16, paddingHorizontal: 18 }}>
                        <Eyebrow s={10} ls={0.12} c={t.fg3} style={{ marginBottom: 6 }}>HOUSE RULES</Eyebrow>
                        {vm.houseRules.map((hr, i) => (
                            <Row key={i} gap={12} style={{ paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: t.line }}>
                                <Glyph name={hr.icon} size={16} color={t.fg3} />
                                <T w={500} s={13} lh={1.2} c={t.fg2} style={{ flex: 1 }}>{hr.label}</T>
                                <T w={600} s={12} lh={1} c={t.fg}>{hr.v}</T>
                            </Row>
                        ))}
                    </View>

                    {/* Bring a friend */}
                    <View style={{ borderRadius: 22, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, paddingVertical: 16, paddingHorizontal: 18, marginTop: 8 }}>
                        <Eyebrow s={10} ls={0.12} c={t.fg3} style={{ marginBottom: 12 }}>BRING A FRIEND</Eyebrow>
                        <Row gap={13}>
                            <View style={{ width: 76, height: 76, borderRadius: 16, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', padding: 6 }}>
                                <Image source={{ uri: vm.myInvite.qr }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <T w={600} s={14} lh={1.3} c={t.fg}>Share {me.propName} with someone</T>
                                <T w={700} s={14} lh={1} c={t.violet2} style={{ marginTop: 8, letterSpacing: 0.5 }}>{me.propCode}</T>
                                <T mono w={600} s={9} lh={1.4} ls={0.06} c={t.fg3} style={{ marginTop: 5 }}>{vm.myInvite.beds}</T>
                            </View>
                        </Row>
                        <Press
                            onPress={vm.myInvite.share}
                            style={{ width: '100%', marginTop: 14, padding: 13, borderRadius: 14, backgroundColor: t.lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 8 }}
                        >
                            <Glyph name="share-social" size={15} color={t.on} />
                            <T w={600} s={12} lh={1} c={t.on}>Share invite</T>
                        </Press>
                    </View>

                    {/* Leave property.
                        Notice already given → this becomes a statement of the date
                        rather than a button, because pressing "Leave this property"
                        again should not be the way to find out you already have. */}
                    {vm.myNotice.given ? (
                        <View style={{ width: '100%', marginTop: 8, padding: 15, borderRadius: 18, borderWidth: 1, borderColor: t.amber, backgroundColor: t.asoft }}>
                            <Row gap={9} align="flex-start">
                                <Glyph name="exit-outline" size={16} color={t.amber} style={{ marginTop: 1 }} />
                                <View style={{ flex: 1 }}>
                                    <T w={600} s={13.5} lh={1.35} c={t.amber}>{vm.myNotice.line}</T>
                                    <T w={400} s={12} lh={1.45} c={t.fg2} style={{ marginTop: 5 }}>{vm.myNotice.sub}</T>
                                </View>
                            </Row>
                            <Press onPress={vm.myNotice.change} style={{ marginTop: 12, paddingVertical: 12, borderRadius: 14, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, alignItems: 'center' }}>
                                <T w={600} s={12.5} lh={1} c={t.fg}>{vm.myNotice.changeLabel}</T>
                            </Press>
                        </View>
                    ) : (
                        <Press
                            onPress={vm.leaveProperty}
                            style={{ width: '100%', marginTop: 8, padding: 15, borderRadius: 18, borderWidth: 1, borderColor: t.line, alignItems: 'center' }}
                        >
                            <T w={600} s={13} lh={1} c={t.coral}>Leave this property</T>
                        </Press>
                    )}
                    {/* Was "YOUR LANDLORD IS NOTIFIED · 30 DAYS NOTICE APPLIES" — both
                        halves fiction: no notification was sent and no notice period
                        existed. Both are true now, but the exact dates depend on the
                        agreed end of stay, so the caption stops asserting a number and
                        the sheet states the real one. */}
                    {!vm.myNotice.given ? (
                        <T mono w={600} s={9} lh={1.6} ls={0.06} c={t.fg3} style={{ textAlign: 'center', marginTop: 12 }}>
                            WE WILL SHOW YOUR LAST DAY BEFORE ANYTHING IS CONFIRMED
                        </T>
                    ) : null}
                </View>
            )}
        </ScrollView>
    );
}
