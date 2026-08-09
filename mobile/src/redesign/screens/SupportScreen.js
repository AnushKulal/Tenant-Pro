// File: mobile/src/redesign/screens/SupportScreen.js
// Help & support, the landlord's side: the queue of every ticket their tenants have
// raised, newest activity first and unresolved before resolved.
//
// This exists because the dashboard should say what needs doing, not become a wall
// of conversation. So the dashboard card previews (what was reported, how long it
// has been waiting) and "Read more" lands on the ticket itself.
//
// This screen used to be the queue AND the selected ticket in full, stacked below
// it — description, photos, conversation and reply box appended under however many
// other tickets there were. Tapping a ticket therefore looked like nothing had
// happened, and the reply box was off the bottom of the screen. The ticket now has
// its own page (TicketScreen); this is only the list.
import React from 'react';
import { View, ScrollView } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Row, Press, Glyph, Avatar } from '../ui';

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
                        {sp.empty
                            ? 'Every ticket your tenants raise lands here.'
                            : `Tap a ticket to read it, reply and move it along.${sp.openCount ? ` ${sp.openCount} still open.` : ''}`}
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
                    <View style={{ rowGap: 7 }}>
                        {sp.list.map((k) => (
                            <Press key={k.id} onPress={k.go}>
                                <Row
                                    gap={11}
                                    style={{
                                        padding: 13,
                                        borderRadius: 18,
                                        backgroundColor: t.ink2,
                                        borderWidth: 1,
                                        borderColor: t.line
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
                                    {/* Says the row goes somewhere. Without it the list read as a
                                        set of selectable filters rather than a set of pages. */}
                                    <Glyph name="chevron-forward" size={16} color={t.fg3} />
                                </Row>
                            </Press>
                        ))}
                    </View>
                </>
            )}
        </ScrollView>
    );
}
