// File: mobile/src/redesign/screens/TicketScreen.js
// One ticket, on its own page: who raised it, what they reported, any photos, the
// whole timeline — each reply and each status change in the order they happened —
// and the controls to move it along.
//
// It is a separate screen rather than an expanding section on the queue because
// replying is a task, not a glance. Appended to the bottom of the list it was
// several screens down, past every other ticket, and it was not obvious that
// tapping a ticket had done anything at all.
//
// The scroll view is the keyboard-aware one: the reply box is near the bottom of
// the content, so without it the keyboard opens straight over the field you are
// typing into.
import React from 'react';
import { View, ScrollView, Image } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Row, Press, Glyph, Avatar } from '../ui';
import { Thread } from '../Sheets';
import { KeyboardScroll } from '../keyboard';

export default function TicketScreen() {
    const vm = useVm();
    const t = useT();
    const col = (v) => (v && (v[0] === '#' || v.startsWith('rgb')) ? v : t[v]);
    const sp = vm.support;

    // No ticket to show — the queue was emptied while this was open, or the app was
    // restored straight onto this route. Send them somewhere real rather than
    // rendering a page of blanks.
    if (!sp.has) {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, rowGap: 14 }}>
                <Glyph name="checkmark-circle-outline" size={28} color={t.pos} />
                <T w={400} s={13} lh={1.5} c={t.fg2} style={{ textAlign: 'center' }}>
                    That ticket is no longer in your queue.
                </T>
                <Press onPress={sp.backToList} style={{ paddingVertical: 12, paddingHorizontal: 24, borderRadius: 999, backgroundColor: t.lime }}>
                    <T w={700} s={13.5} c={t.on}>Back to tickets</T>
                </Press>
            </View>
        );
    }

    return (
        <KeyboardScroll
            contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 26 }}
            showsVerticalScrollIndicator={false}
        >
            <Row gap={11} align="flex-start" style={{ marginBottom: 14 }}>
                <Press
                    onPress={sp.backToList}
                    style={{ width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}
                >
                    <Glyph name="chevron-back" size={19} color={t.fg} />
                </Press>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <Eyebrow s={9} ls={0.1} c={t.fg3} style={{ marginBottom: 6 }}>TICKET</Eyebrow>
                    <T w={700} s={24} lh={1.14} style={{ letterSpacing: -1 }}>{sp.title}</T>
                    <Row gap={8} wrap style={{ marginTop: 9 }}>
                        <View style={{ paddingVertical: 4, paddingHorizontal: 8, borderRadius: 7, backgroundColor: col(sp.pbg) }}>
                            <T mono w={600} s={9} lh={1.3} ls={0.05} c={col(sp.pfg)}>{sp.priority}</T>
                        </View>
                        <T mono w={600} s={9} lh={1.4} ls={0.08} c={col(sp.statusFg)}>{sp.status}</T>
                        {sp.openFor ? <T mono w={600} s={9} lh={1.4} ls={0.08} c={t.fg3}>{sp.openFor}</T> : null}
                    </Row>
                </View>
            </Row>

            {/* Who raised it, and a way to ring them. */}
            <Row gap={11} style={{ paddingVertical: 12, paddingHorizontal: 13, borderRadius: 18, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, marginBottom: 10 }}>
                <Avatar uri={sp.img} initials={sp.initials} size={38} radius={13} />
                <View style={{ flex: 1, minWidth: 0 }}>
                    <T w={600} s={14} lh={1.2} c={t.fg} numberOfLines={1}>{sp.who}</T>
                    <T mono w={600} s={9} lh={1.4} ls={0.06} c={t.fg3} numberOfLines={1} style={{ marginTop: 4 }}>{sp.meta}</T>
                </View>
                <Press onPress={sp.call} style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: t.lsoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Glyph name="call" size={16} color={t.pos} />
                </Press>
            </Row>

            <View style={{ borderRadius: 18, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, padding: 15, marginBottom: 12 }}>
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
        </KeyboardScroll>
    );
}
