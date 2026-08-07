// File: mobile/src/redesign/screens/SupportScreen.js
// Help & support, the landlord's side: every ticket their tenants have raised, and
// for the selected one its whole timeline — each reply and each status change, in
// the order they happened — plus the controls to move it along.
//
// This exists because the dashboard should say what needs doing, not become a wall
// of conversation. So the dashboard card previews (what was reported, how long it
// has been waiting) and "Read more" lands here, where the work actually happens.
//
// The timeline is one ordered read of maintenance_messages: a reply is a bubble, a
// status change is a marker across the thread. That is what makes "when did this
// move to In Progress" answerable by reading down rather than hunting a log.
import React from 'react';
import { View, ScrollView, Image } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Row, Press, Glyph, Avatar } from '../ui';
import { Thread } from '../Sheets';

export default function SupportScreen() {
    const vm = useVm();
    const t = useT();
    const col = (v) => (v && (v[0] === '#' || v.startsWith('rgb')) ? v : t[v]);
    const sp = vm.support;

    return (
        <ScrollView
            contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 26 }}
            showsVerticalScrollIndicator={false}
        >
            <Row gap={11} align="flex-start" style={{ marginBottom: 4 }}>
                <Press
                    onPress={vm.goBack}
                    style={{ width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center', marginTop: 3 }}
                >
                    <Glyph name="chevron-back" size={19} color={t.fg} />
                </Press>
                <View style={{ flex: 1 }}>
                    <T w={700} s={30} lh={1.04} style={{ letterSpacing: -1.4 }}>Help & support</T>
                    <T w={400} s={13} lh={1.4} c={t.fg2} style={{ marginTop: 5 }}>
                        Every ticket, its conversation, and when its status changed.
                    </T>
                </View>
            </Row>

            {sp.empty ? (
                <Row gap={12} style={{ marginTop: 18, padding: 16, borderRadius: 20, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line }}>
                    <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: t.lsoft, alignItems: 'center', justifyContent: 'center' }}>
                        <Glyph name="checkmark" size={18} color={t.pos} />
                    </View>
                    <T w={500} s={13} lh={1.45} c={t.fg2} style={{ flex: 1 }}>{sp.emptyLine}</T>
                </Row>
            ) : (
                <>
                    {/* The queue. Unresolved first, then by priority. */}
                    <Eyebrow s={9} ls={0.12} c={t.fg3} style={{ marginTop: 18, marginBottom: 9 }}>TICKETS</Eyebrow>
                    <View style={{ rowGap: 7, marginBottom: 18 }}>
                        {sp.list.map((k) => (
                            <Press key={k.id} onPress={k.go}>
                                <Row
                                    gap={11}
                                    style={{
                                        padding: 13,
                                        borderRadius: 18,
                                        backgroundColor: k.on ? t.ink3 : t.ink2,
                                        borderWidth: 1,
                                        borderColor: k.on ? t.accent : t.line
                                    }}
                                >
                                    <Avatar uri={k.img} initials={k.initials} size={36} radius={12} />
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <T w={600} s={13.5} lh={1.25} c={t.fg} numberOfLines={1}>{k.title}</T>
                                        <T mono w={600} s={9} lh={1.4} ls={0.06} c={t.fg3} numberOfLines={1} style={{ marginTop: 4 }}>{k.meta}</T>
                                    </View>
                                    <View style={{ alignItems: 'flex-end', rowGap: 5 }}>
                                        <View style={{ paddingVertical: 3, paddingHorizontal: 7, borderRadius: 6, backgroundColor: col(k.bg) }}>
                                            <T mono w={600} s={8} lh={1.3} ls={0.05} c={col(k.fg)}>{k.priority}</T>
                                        </View>
                                        <T mono w={600} s={8} lh={1} ls={0.08} c={col(k.statusFg)}>{k.status}</T>
                                    </View>
                                </Row>
                            </Press>
                        ))}
                    </View>

                    {/* The selected ticket in full. */}
                    {sp.has && (
                        <View style={{ borderRadius: 22, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, padding: 16 }}>
                            <Row align="flex-start" gap={10} style={{ marginBottom: 12 }}>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <T w={700} s={19} lh={1.2} style={{ letterSpacing: -0.6 }}>{sp.title}</T>
                                    <Eyebrow s={9} ls={0.08} style={{ marginTop: 6 }}>{sp.meta}</Eyebrow>
                                </View>
                                <View style={{ paddingVertical: 4, paddingHorizontal: 8, borderRadius: 7, backgroundColor: col(sp.pbg) }}>
                                    <T mono w={600} s={9} lh={1.3} ls={0.05} c={col(sp.pfg)}>{sp.priority}</T>
                                </View>
                            </Row>

                            <Row gap={11} style={{ paddingVertical: 12, paddingHorizontal: 13, borderRadius: 16, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, marginBottom: 10 }}>
                                <Avatar uri={sp.img} initials={sp.initials} size={36} radius={12} />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <T w={600} s={13.5} lh={1.2} c={t.fg} numberOfLines={1}>{sp.who}</T>
                                    <Row gap={7} style={{ marginTop: 4 }}>
                                        <T mono w={600} s={8} lh={1.4} ls={0.08} c={col(sp.statusFg)}>{sp.status}</T>
                                        {sp.openFor ? <T mono w={600} s={8} lh={1.4} ls={0.08} c={t.fg3}>{sp.openFor}</T> : null}
                                    </Row>
                                </View>
                                <Press onPress={sp.call} style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: t.lsoft, alignItems: 'center', justifyContent: 'center' }}>
                                    <Glyph name="call" size={15} color={t.pos} />
                                </Press>
                            </Row>

                            <View style={{ borderRadius: 16, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, padding: 14, marginBottom: 12 }}>
                                <Eyebrow s={9} ls={0.12} style={{ marginBottom: 9 }}>WHAT THEY REPORTED</Eyebrow>
                                <T w={400} s={13.5} lh={1.55} c={t.fg2}>{sp.body}</T>
                            </View>

                            {sp.hasPhotos && (
                                <View style={{ marginBottom: 12 }}>
                                    <Eyebrow s={9} ls={0.12} style={{ marginBottom: 9 }}>ATTACHED</Eyebrow>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                                        {sp.photos.map((ph, i) => (
                                            <Image key={i} source={{ uri: ph }} style={{ width: 168, height: 126, borderRadius: 14, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }} resizeMode="cover" />
                                        ))}
                                    </ScrollView>
                                </View>
                            )}

                            <Thread
                                thread={sp.thread}
                                composer={vm.composer}
                                canReply={sp.canReply}
                                t={t}
                                placeholder="Reply to your tenant…"
                            />

                            {!sp.resolved && (
                                <Row gap={7}>
                                    {!sp.started && (
                                        <Press onPress={sp.start} style={{ flex: 1, paddingVertical: 14, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, alignItems: 'center' }}>
                                            <T w={600} s={13} c={t.fg}>Start work</T>
                                        </Press>
                                    )}
                                    <Press onPress={sp.resolve} style={{ flex: 1, paddingVertical: 14, borderRadius: 999, backgroundColor: t.lime, alignItems: 'center' }}>
                                        <T w={700} s={13.5} c={t.on}>Mark resolved</T>
                                    </Press>
                                </Row>
                            )}
                        </View>
                    )}
                </>
            )}
        </ScrollView>
    );
}
