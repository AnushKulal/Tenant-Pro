// File: mobile/src/redesign/Sheets.js
// The bottom-sheet overlay layer. A single absolutely-positioned scrim + sheet
// that RedesignRoot stacks above every screen. Which sheet body renders is chosen
// by whichever overlay flag on the vm is true. Translated from Sheets.html.
import React from 'react';
import { View, ScrollView, Image, TextInput, Animated, Dimensions, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVm } from './AppContext';
import { useT } from './ThemeContext';
import { grotesk } from './theme';
import { T, Eyebrow, Row, Press, Glyph, Field, Avatar, Composer, DocThumb } from './ui';
import { useSheetIn, useFadeIn } from './motion';
import { useIdShield } from './shield';
import { KeyboardScroll, useKeyboardHeight } from './keyboard';

// ── The conversation on a maintenance request ────────────────────────────────
// One component, both sides: the landlord's ticket sheet and the tenant's request
// sheet render the same thread from the same rows, with "own" messages aligned
// right in the accent tint. `canReply` is false on the seed walk-through (no
// server-side request to hang a message off), in which case the compose box is
// left out rather than shown as a box that silently does nothing.
export function Thread({ thread, composer, canReply, t, placeholder }) {
    const th = thread || { messages: [] };
    const rows = th.messages || [];

    return (
        <View style={{ marginBottom: 14 }}>
            <Eyebrow s={9} ls={0.12} c={t.fg3} style={{ marginBottom: 10 }}>
                {rows.length ? `CONVERSATION · ${rows.length}` : 'CONVERSATION'}
            </Eyebrow>

            {th.loading ? (
                <Row gap={9} style={{ paddingVertical: 12 }}>
                    <ActivityIndicator size="small" color={t.accent} />
                    <T mono w={600} s={9} ls={0.12} c={t.fg3}>LOADING MESSAGES</T>
                </Row>
            ) : null}

            {th.error ? (
                <Row gap={9} align="flex-start" style={{ paddingVertical: 11, paddingHorizontal: 13, borderRadius: 14, backgroundColor: t.csoft, marginBottom: 10 }}>
                    <Glyph name="alert-circle-outline" size={15} color={t.coral} />
                    <T w={500} s={12} lh={1.45} c={t.coral} style={{ flex: 1 }}>{th.error}</T>
                </Row>
            ) : null}

            {!th.loading && !th.error && rows.length === 0 ? (
                <T w={400} s={12.5} lh={1.5} c={t.fg3} style={{ paddingBottom: 4 }}>
                    No messages yet. {canReply ? 'Add one below.' : ''}
                </T>
            ) : null}

            {rows.map((m, i) => (
                m.event ? (
                    // A status change: a marker across the thread, so the moment it
                    // moved is readable in sequence with what was said around it.
                    <Row key={m.id != null ? m.id : i} gap={9} style={{ marginBottom: 8, paddingVertical: 2 }}>
                        <View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
                        <Row gap={6} style={{ paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: col2(m.eventFg, t) }} />
                            <T mono w={600} s={8} ls={0.08} c={col2(m.eventFg, t)}>
                                {m.to ? String(m.to).toUpperCase() : 'UPDATED'}
                            </T>
                            {m.time ? <T mono w={600} s={8} ls={0.08} c={t.fg3}>{m.time}</T> : null}
                        </Row>
                        <View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
                    </Row>
                ) : (
                    <View key={m.id != null ? m.id : i} style={{ alignItems: m.align, marginBottom: 8 }}>
                        <View
                            style={{
                                maxWidth: '86%',
                                borderRadius: 16,
                                backgroundColor: col2(m.bg, t),
                                borderWidth: 1,
                                borderColor: t.line,
                                paddingVertical: 11,
                                paddingHorizontal: 13
                            }}
                        >
                            <T mono w={600} s={8} ls={0.1} c={t.fg3} style={{ marginBottom: 5 }}>
                                {`${m.who}${m.time ? ` · ${m.time}` : ''}`}
                            </T>
                            <T w={400} s={13} lh={1.5} c={col2(m.fg, t)}>{m.body}</T>
                        </View>
                    </View>
                )
            ))}

            {canReply ? (
                <Row gap={8} align="flex-end" style={{ marginTop: 6 }}>
                    <Composer
                        value={composer.value}
                        onChangeText={composer.set}
                        placeholder={placeholder}
                        editable={!composer.sending}
                        style={{ flex: 1 }}
                    />
                    <Press
                        onPress={composer.send}
                        disabled={!composer.canSend}
                        style={{
                            width: 46,
                            height: 46,
                            borderRadius: 16,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: composer.canSend ? t.lime : t.ink3,
                            borderWidth: 1,
                            borderColor: composer.canSend ? t.lime : t.line
                        }}
                    >
                        {composer.sending
                            ? <ActivityIndicator size="small" color={t.fg2} />
                            : <Glyph name="send" size={17} color={composer.canSend ? t.on : t.fg3} />}
                    </Press>
                </Row>
            ) : null}
        </View>
    );
}

// A row of pick-one chips. Every creation sheet needs the same control, and the
// selected chip reads as selected in both themes because it uses the foreground
// token rather than a hand-picked colour.
// A row of choice chips. `maxWidth` + a single truncated line is the important
// part: a chip's label can carry a property name, and a long one ("Green Meadows
// Apartment · 102") grew the chip past the screen edge and pushed the row out of
// shape. It now shrinks and ellipsizes instead of overflowing.
function Chips({ items, t, wrap = true }) {
    return (
        <Row gap={7} wrap={wrap} style={{ marginBottom: 12 }}>
            {(items || []).map((c) => (
                <Press
                    key={c.label}
                    onPress={c.go}
                    style={{
                        paddingVertical: 9,
                        paddingHorizontal: 13,
                        borderRadius: 999,
                        backgroundColor: c.on ? t.lsoft : t.ink3,
                        borderWidth: 1,
                        borderColor: c.on ? t.accent : t.line,
                        maxWidth: '100%',
                        flexShrink: 1
                    }}
                >
                    <T w={600} s={12} lh={1} numberOfLines={1} c={c.on ? t.accent : t.fg2}>{c.label}</T>
                </Press>
            ))}
        </Row>
    );
}

// Attach-a-photo, or the thumbnail once one is attached.
function PhotoPick({ form, t, label = 'Add a photo' }) {
    if (form.hasPhoto) {
        return (
            <Row gap={10} style={{ marginBottom: 12 }}>
                <Image source={{ uri: form.photo }} style={{ width: 72, height: 72, borderRadius: 16, backgroundColor: t.ink3 }} resizeMode="cover" />
                <View style={{ flex: 1 }}>
                    <T w={600} s={13} lh={1.2} c={t.fg}>Photo attached</T>
                    <Press onPress={form.clearPhoto} style={{ marginTop: 7 }}>
                        <T mono w={600} s={9} ls={0.12} c={t.coral}>REMOVE</T>
                    </Press>
                </View>
            </Row>
        );
    }
    // Two sources, side by side. A landlord adding a room is usually standing in
    // it, so "take one" has to be as easy to reach as "choose one".
    return (
        <Row gap={8} align="stretch" style={{ marginBottom: 12 }}>
            <Press
                onPress={form.takePhoto}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 7, paddingVertical: 14, borderRadius: 16, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}
            >
                <Glyph name="camera-outline" size={17} color={t.accent} />
                <T w={600} s={12.5} c={t.fg2}>Take a photo</T>
            </Press>
            <Press
                onPress={form.pickPhoto}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 7, paddingVertical: 14, borderRadius: 16, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}
            >
                <Glyph name="image-outline" size={17} color={t.fg2} />
                <T w={600} s={12.5} c={t.fg2}>{label}</T>
            </Press>
        </Row>
    );
}

// The error banner and the Cancel/Save pair every creation sheet ends with.
function FormError({ form, t }) {
    if (!form.hasError) return null;
    return (
        <Row gap={9} align="flex-start" style={{ paddingVertical: 11, paddingHorizontal: 13, borderRadius: 14, backgroundColor: t.csoft, marginBottom: 12 }}>
            <Glyph name="alert-circle-outline" size={15} color={t.coral} />
            <T w={500} s={12} lh={1.45} c={t.coral} style={{ flex: 1 }}>{form.error}</T>
        </Row>
    );
}

function FormActions({ form, onCancel, label, t }) {
    const live = form.canSubmit;
    return (
        <Row gap={8}>
            <Press onPress={onCancel} style={{ paddingVertical: 15, paddingHorizontal: 20, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                <T w={600} s={13.5} c={t.fg2}>Cancel</T>
            </Press>
            <Press
                onPress={form.submit}
                disabled={!live}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 8, paddingVertical: 15, borderRadius: 999, backgroundColor: live ? t.lime : t.ink3, borderWidth: 1, borderColor: live ? t.lime : t.line }}
            >
                {form.busy ? <ActivityIndicator size="small" color={t.on} /> : null}
                <T w={700} s={14} c={live ? t.on : t.fg3}>{form.busy ? 'Saving…' : label}</T>
            </Press>
        </Row>
    );
}

// Same token resolution as the sheet body's `col`, needed outside its closure.
const col2 = (v, t) => (v && (v[0] === '#' || v.startsWith('rgb')) ? v : t[v]);

export default function Sheets() {
    const vm = useVm();
    const t = useT();
    const insets = useSafeAreaInsets();

    // The documents sheet lists thumbnails of government IDs, so a screenshot of it
    // leaks the same thing the full-screen viewer does. Its own tag, because the viewer
    // opens ON TOP of this sheet — expo-screen-capture reference-counts by tag, so
    // sharing one would let closing the viewer unshield the sheet still underneath it.
    useIdShield(!!vm.isDocs, 'tenantpro-id-sheet');
    // `animation: tpsheet .26s cubic-bezier(.2,.8,.2,1)` — slide the sheet up from
    // off-screen while the scrim fades in. Keyed on which overlay is open so each
    // sheet replays the motion (see the key on <Sheets/> usage in RedesignRoot).
    const H = Dimensions.get('window').height;
    const SHEET_MAX = Math.round(H * 0.88);
    // A sheet sits on the bottom edge, which is exactly where the keyboard appears.
    // Every field in every sheet was underneath it; this is what lifts them clear.
    const kbHeight = useKeyboardHeight();
    const sheetIn = useSheetIn({ height: H });
    const scrimIn = useFadeIn();

    if (!vm.overlayOpen) return null;

    // Resolve a vm colour value: literal (#/rgb) passthrough, else a token key.
    const col = (v) => (v && (v[0] === '#' || v.startsWith('rgb')) ? v : t[v]);
    const who = vm.who || {};

    // Shared grabber handle at the top of every sheet.
    const Handle = () => (
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: t.line2, alignSelf: 'center', marginBottom: 16 }} />
    );

    return (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end', zIndex: 60, elevation: 24 }}>
            <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, scrimIn]}>
            <Press
                onPress={vm.closeOverlay}
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(4,4,6,0.6)' }}
            />
            </Animated.View>

            {/* A sheet is pinned to the bottom of the window, so the keyboard opens
                straight over it — the reply box and every notes field were underneath
                it. Lifting the whole sheet by the keyboard's height is what makes the
                composer sit just above the keys, and shrinking the ceiling by the same
                amount keeps a tall sheet from being pushed off the top of the screen.
                The safe-area padding is dropped while it is up: that space exists for
                the home indicator, which the keyboard is now covering. */}
            <Animated.View style={[{ position: 'absolute', left: 0, right: 0, bottom: kbHeight, maxHeight: SHEET_MAX - kbHeight }, sheetIn]}>
            <KeyboardScroll
                bounces={false}
                mode="lifted"
                extra={14}
                style={{
                    maxHeight: SHEET_MAX - kbHeight,
                    backgroundColor: t.ink2,
                    borderTopLeftRadius: 28,
                    borderTopRightRadius: 28,
                    borderTopWidth: 1,
                    borderColor: t.line2
                }}
                contentContainerStyle={{ paddingTop: 10, paddingHorizontal: 18, paddingBottom: 26 + (kbHeight ? 0 : insets.bottom) }}
                showsVerticalScrollIndicator={false}
            >
                <Handle />

                {/* ── Search ──────────────────────────────────────────── */}
                {vm.isSearch && (
                    <View>
                        <Row
                            style={{
                                gap: 10,
                                paddingVertical: 13,
                                paddingHorizontal: 15,
                                borderRadius: 16,
                                backgroundColor: t.ink3,
                                borderWidth: 1,
                                borderColor: t.accent,
                                marginBottom: 6
                            }}
                        >
                            <Glyph name="search" size={17} color={t.accent} />
                            <TextInput
                                value={vm.q}
                                onChangeText={vm.setQ}
                                placeholder="Property, unit or tenant"
                                placeholderTextColor={t.fg3}
                                autoFocus
                                style={{ flex: 1, minWidth: 0, padding: 0, fontFamily: grotesk(500), fontSize: 14, color: t.fg }}
                            />
                            {vm.hasQ && (
                                <Press onPress={vm.clearQ} hitSlop={8}>
                                    <Glyph name="close-circle" size={18} color={t.fg3} />
                                </Press>
                            )}
                        </Row>

                        {vm.noResults && (
                            <View style={{ paddingVertical: 34, alignItems: 'center' }}>
                                <T w={500} s={14} lh={1.4} c={t.fg2}>{`Nothing matches "${vm.q}"`}</T>
                                <Eyebrow s={10} ls={0.08} style={{ marginTop: 8, textAlign: 'center' }}>TRY A UNIT NUMBER OR A LOCALITY</Eyebrow>
                            </View>
                        )}

                        {(vm.searchGroups || []).map((grp, gi) => (
                            <View key={gi} style={{ marginTop: 14 }}>
                                <Eyebrow s={10} ls={0.12} style={{ marginBottom: 10 }}>{grp.title}</Eyebrow>
                                {(grp.rows || []).map((r, ri) => (
                                    <Press
                                        key={ri}
                                        onPress={r.go}
                                        style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            gap: 12,
                                            width: '100%',
                                            paddingVertical: 11,
                                            paddingHorizontal: 12,
                                            borderRadius: 16,
                                            borderWidth: 1,
                                            borderColor: col(r.border),
                                            backgroundColor: col(r.bg),
                                            marginBottom: 7
                                        }}
                                    >
                                        <View style={{ width: 40, height: 40, borderRadius: 13, overflow: 'hidden', backgroundColor: t.vsoft, alignItems: 'center', justifyContent: 'center' }}>
                                            <Glyph name={r.icon} size={18} color={t.accent} />
                                        </View>
                                        <View style={{ flex: 1, minWidth: 0 }}>
                                            <T w={600} s={14} lh={1.2} c={t.fg}>{r.name}</T>
                                            <Eyebrow s={10} ls={0.08} style={{ marginTop: 4 }}>{r.sub}</Eyebrow>
                                        </View>
                                        <Glyph name={r.check} size={19} color={col(r.checkFg)} />
                                    </Press>
                                ))}
                            </View>
                        ))}
                    </View>
                )}

                {/* Every open ticket at this priority. The dashboard only carries the
                    top of the pile, so this is where "View all 4 tickets" lands —
                    and each row now opens the ticket's own page rather than a
                    second modal stacked on this one. */}
                {vm.isTickets && (
                    <View>
                        <T w={700} s={20} lh={1} style={{ letterSpacing: -0.8 }}>All tickets</T>
                        <Eyebrow s={10} ls={0.08} style={{ marginTop: 7, marginBottom: 16 }}>{`SORTED BY PRIORITY · ${vm.ticketTotal || ''}`}</Eyebrow>
                        <View style={{ gap: 8 }}>
                            {(vm.allTickets || []).map((at, i) => (
                                <Press key={i} onPress={at.read} style={{ borderRadius: 20, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, padding: 14, position: 'relative', overflow: 'hidden' }}>
                                    <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: col(at.fg) }} />
                                    <Row align="flex-start" style={{ gap: 11 }}>
                                        <Image source={{ uri: at.img }} style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: t.ink3 }} resizeMode="cover" />
                                        <View style={{ flex: 1, minWidth: 0 }}>
                                            <T w={600} s={14} lh={1.25} c={t.fg}>{at.title}</T>
                                            <Eyebrow s={10} ls={0.06} numberOfLines={1} style={{ marginTop: 5 }}>{at.meta}</Eyebrow>
                                        </View>
                                        <View style={{ paddingVertical: 4, paddingHorizontal: 8, borderRadius: 7, backgroundColor: col(at.bg) }}>
                                            <T mono w={600} s={10} lh={1.3} ls={0.05} c={col(at.fg)}>{at.priority}</T>
                                        </View>
                                    </Row>
                                    <Row style={{ gap: 6, marginTop: 12 }}>
                                        <T mono w={600} s={9} lh={1} ls={0.08} c={col(at.statusFg)} style={{ flex: 1 }}>{at.status}</T>
                                        <Press onPress={at.read} style={{ flexDirection: 'row', alignItems: 'center', columnGap: 5, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 11, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                                            <T w={600} s={11} lh={1} c={t.fg}>Read</T>
                                            <Glyph name="chevron-forward" size={11} color={t.fg3} />
                                        </Press>
                                        {at.started && (
                                            <Press onPress={at.resolve} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 11, backgroundColor: t.lime }}>
                                                <T w={600} s={11} lh={1} c={t.on}>Resolve</T>
                                            </Press>
                                        )}
                                        {at.notStarted && (
                                            <Press onPress={at.start} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 11, backgroundColor: t.lime }}>
                                                <T w={600} s={11} lh={1} c={t.on}>Open</T>
                                            </Press>
                                        )}
                                    </Row>
                                </Press>
                            ))}
                        </View>
                    </View>
                )}


                {/* ── Ticket detail ───────────────────────────────────── */}
                {vm.isTicket && vm.ticket && (
                    <View>
                        <Row align="flex-start" style={{ gap: 10, marginBottom: 14 }}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <T w={700} s={20} lh={1.15} style={{ letterSpacing: -0.7 }}>{vm.ticket.title}</T>
                                <Eyebrow s={10} ls={0.06} style={{ marginTop: 8 }}>{vm.ticket.meta}</Eyebrow>
                            </View>
                            <View style={{ paddingVertical: 5, paddingHorizontal: 9, borderRadius: 8, backgroundColor: col(vm.ticket.bg) }}>
                                <T mono w={600} s={10} lh={1.3} ls={0.05} c={col(vm.ticket.fg)}>{vm.ticket.priority}</T>
                            </View>
                        </Row>

                        <Row style={{ gap: 11, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, marginBottom: 10 }}>
                            <Image source={{ uri: vm.ticket.img }} style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: t.ink2 }} resizeMode="cover" />
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <T w={600} s={14} lh={1.2} c={t.fg}>{vm.ticket.who}</T>
                                <T mono w={600} s={9} lh={1.4} ls={0.08} c={col(vm.ticket.statusFg)} style={{ marginTop: 4 }}>{vm.ticket.status}</T>
                            </View>
                            <Press onPress={vm.ticket.call} style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: t.lsoft, alignItems: 'center', justifyContent: 'center' }}>
                                <Glyph name="call" size={16} color={t.pos} />
                            </Press>
                        </Row>

                        {/* A preview, not the whole story: what was reported and how
                            long it has been waiting. Replies and the status history
                            live in Help & support, one tap away. */}
                        <View style={{ borderRadius: 16, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 10 }}>
                            <Row justify="space-between" style={{ marginBottom: 10 }}>
                                <Eyebrow s={9} ls={0.12}>WHAT THEY REPORTED</Eyebrow>
                                <Eyebrow s={9} ls={0.1} c={t.amber}>{vm.ticket.openFor}</Eyebrow>
                            </Row>
                            <T w={400} s={14} lh={1.55} c={t.fg2}>{vm.ticket.preview}</T>
                        </View>

                        <Press
                            onPress={vm.ticket.readMore}
                            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 7, paddingVertical: 14, borderRadius: 16, backgroundColor: t.vsoft, borderWidth: 1, borderColor: t.line, marginBottom: 12 }}
                        >
                            <Glyph name="chatbubbles-outline" size={16} color={t.accent} />
                            <T w={600} s={13} c={t.accent}>Read more and reply</T>
                        </Press>

                        {vm.ticket.hasPhotos && (
                            <View style={{ marginBottom: 14 }}>
                                <Eyebrow s={9} ls={0.12} style={{ marginBottom: 10 }}>{vm.ticket.photoCount}</Eyebrow>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 18, paddingBottom: 2 }} style={{ marginHorizontal: -18 }}>
                                    {(vm.ticket.photos || []).map((ph, i) => (
                                        <Image key={i} source={{ uri: ph }} style={{ width: 168, height: 126, borderRadius: 14, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }} resizeMode="cover" />
                                    ))}
                                </ScrollView>
                            </View>
                        )}

                        <Row style={{ gap: 7 }}>
                            {/* "Open ticket" was a verb sitting next to a status that
                                already read OPEN. Moving a ticket along now reads as
                                what it does: start work, or resolve it. */}
                            {vm.ticket.notStarted && (
                                <Press onPress={vm.ticket.start} style={{ flex: 1, paddingVertical: 15, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, alignItems: 'center' }}>
                                    <T w={600} s={13} lh={1} c={t.fg}>Start work</T>
                                </Press>
                            )}
                            <Press onPress={vm.ticket.resolve} style={{ flex: 1, paddingVertical: 15, borderRadius: 999, backgroundColor: t.lime, alignItems: 'center' }}>
                                <T w={700} s={14} lh={1} c={t.on}>Mark resolved</T>
                            </Press>
                        </Row>
                    </View>
                )}

                {/* ── Edit rent ───────────────────────────────────────── */}
                {vm.isRent && (
                    <View>
                        <T w={700} s={20} lh={1} style={{ letterSpacing: -0.8 }}>Edit rent</T>
                        <Eyebrow s={10} ls={0.08} style={{ marginTop: 7, marginBottom: 16 }}>{`${who.name || ''} · ${who.unitLine || ''}`}</Eyebrow>
                        <Row style={{ gap: 12, borderRadius: 20, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, padding: 16 }}>
                            <Press onPress={vm.rentDown} style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
                                <Glyph name="remove" size={20} color={t.fg} />
                            </Press>
                            <View style={{ flex: 1, alignItems: 'center' }}>
                                <T w={700} s={32} lh={1} c={t.fg} style={{ letterSpacing: -1.4 }}>{vm.rentDraft}</T>
                                <T mono w={600} s={9} lh={1} ls={0.08} c={col(vm.rentDeltaFg)} style={{ marginTop: 8 }}>{vm.rentDelta}</T>
                            </View>
                            <Press onPress={vm.rentUp} style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
                                <Glyph name="add" size={20} color={t.fg} />
                            </Press>
                        </Row>
                        <Row style={{ gap: 7, marginTop: 12, marginBottom: 16 }}>
                            {(vm.rentSteps || []).map((rs, i) => (
                                <Press key={i} onPress={rs.go} style={{ flex: 1, paddingVertical: 11, borderRadius: 13, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, alignItems: 'center' }}>
                                    <T w={600} s={11} lh={1} c={t.fg2}>{rs.label}</T>
                                </Press>
                            ))}
                        </Row>
                        <Press onPress={vm.saveRent} style={{ width: '100%', paddingVertical: 16, borderRadius: 999, backgroundColor: t.lime, alignItems: 'center' }}>
                            <T w={700} s={14} lh={1} c={t.on}>{`Save ${vm.rentDraft || ''}`}</T>
                        </Press>
                        <Eyebrow s={9} ls={0.06} style={{ marginTop: 13, textAlign: 'center' }}>APPLIES FROM THE NEXT BILLING CYCLE</Eyebrow>
                    </View>
                )}

                {/* ── Unit sheet ──────────────────────────────────────── */}
                {vm.isUnit && vm.unitSheet && (
                    <View>
                        <Row align="flex-start" style={{ gap: 13, marginBottom: 16 }}>
                            <View style={{ width: 54, height: 54, borderRadius: 17, backgroundColor: t.ink3, alignItems: 'center', justifyContent: 'center' }}>
                                <T w={700} s={21} lh={1} c={t.fg}>{vm.unitSheet.no}</T>
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <T w={700} s={20} lh={1.1} style={{ letterSpacing: -0.8 }}>{vm.unitSheet.prop}</T>
                                <Eyebrow s={10} ls={0.06} style={{ marginTop: 6 }}>{vm.unitSheet.type}</Eyebrow>
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <T w={700} s={16} lh={1} c={t.fg}>{vm.unitSheet.rent}</T>
                                <Eyebrow s={9} ls={0.06} style={{ marginTop: 5 }}>{vm.unitSheet.share}</Eyebrow>
                            </View>
                        </Row>

                        <Row style={{ gap: 9, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, marginBottom: 14 }}>
                            <Glyph name="bed-outline" size={16} color={t.fg2} />
                            <T w={500} s={13} lh={1.2} c={t.fg2} style={{ flex: 1 }}>{vm.unitSheet.beds}</T>
                            <T mono w={600} s={10} lh={1} ls={0.06} c={col(vm.unitSheet.bedFg)}>{vm.unitSheet.freeLine}</T>
                        </Row>

                        <Eyebrow s={10} ls={0.12} style={{ marginBottom: 10 }}>WHO LIVES HERE</Eyebrow>
                        {(vm.unitSheet.occupants || []).map((oc, i) => (
                            <Press key={i} onPress={oc.open} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%', paddingVertical: 12, paddingHorizontal: 13, borderRadius: 17, borderWidth: 1, borderColor: t.line, backgroundColor: t.ink3, marginBottom: 7 }}>
                                <Image source={{ uri: oc.img }} style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: t.ink2 }} resizeMode="cover" />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <T w={600} s={14} lh={1.2} c={t.fg}>{oc.name}</T>
                                    <T mono w={600} s={10} lh={1.4} ls={0.06} c={col(oc.fg)} style={{ marginTop: 4 }}>{oc.sub}</T>
                                </View>
                                <T w={700} s={14} lh={1} c={t.fg}>{oc.rent}</T>
                            </Press>
                        ))}

                        {vm.unitSheet.hasFree && (
                            <Row style={{ gap: 7, marginTop: 12 }}>
                                <Press onPress={vm.unitSheet.addExisting} style={{ flex: 2, paddingVertical: 15, borderRadius: 999, backgroundColor: t.lime, alignItems: 'center' }}>
                                    <T w={700} s={13} lh={1} c={t.on}>Add a tenant</T>
                                </Press>
                                <Press onPress={vm.unitSheet.addNew} style={{ flex: 1, paddingVertical: 15, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, alignItems: 'center' }}>
                                    <T w={600} s={12} lh={1} c={t.fg2}>Add new</T>
                                </Press>
                            </Row>
                        )}
                    </View>
                )}

                {/* ── Assign sheet ────────────────────────────────────── */}
                {vm.isAssign && (
                    <View>
                        <Row style={{ gap: 11, marginBottom: 6 }}>
                            <Press onPress={vm.assignBack} style={{ width: 34, height: 34, borderRadius: 12, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
                                <Glyph name="chevron-back" size={16} color={t.fg} />
                            </Press>
                            <T w={700} s={20} lh={1} style={{ flex: 1, letterSpacing: -0.8 }}>{`Add to Unit ${vm.unitSheet ? vm.unitSheet.no : ''}`}</T>
                        </Row>
                        <Eyebrow s={10} ls={0.08} style={{ marginTop: 7, marginBottom: 16 }}>PICK SOMEONE UNASSIGNED, OR ADD A NEW TENANT</Eyebrow>
                        {vm.assignEmpty && (
                            <View style={{ paddingVertical: 30, alignItems: 'center' }}>
                                <T w={500} s={13} lh={1.5} c={t.fg2}>Nobody is unassigned right now.</T>
                            </View>
                        )}
                        {(vm.assignList || []).map((al, i) => (
                            <Press key={i} onPress={al.go} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%', paddingVertical: 12, paddingHorizontal: 13, borderRadius: 17, borderWidth: 1, borderColor: t.line, backgroundColor: t.ink3, marginBottom: 7 }}>
                                <Image source={{ uri: al.img }} style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: t.ink2 }} resizeMode="cover" />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <T w={600} s={14} lh={1.2} c={t.fg}>{al.name}</T>
                                    <Eyebrow s={10} ls={0.06} style={{ marginTop: 4 }}>{al.sub}</Eyebrow>
                                </View>
                                <Glyph name="add-circle" size={20} color={t.accent} />
                            </Press>
                        ))}
                        {vm.unitSheet && (
                            <Press onPress={vm.unitSheet.addNew} style={{ width: '100%', marginTop: 8, paddingVertical: 15, borderRadius: 999, backgroundColor: t.lime, alignItems: 'center' }}>
                                <T w={700} s={13} lh={1} c={t.on}>Add a new tenant instead</T>
                            </Press>
                        )}
                    </View>
                )}

                {/* ── Sign out ────────────────────────────────────────── */}
                {vm.isSignOut && (
                    <View>
                        <Row align="flex-start" style={{ gap: 12, marginBottom: 18 }}>
                            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: t.csoft, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                                <Glyph name="log-out-outline" size={20} color={t.coral} />
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <T w={700} s={20} lh={1.1} style={{ letterSpacing: -0.7 }}>Sign out?</T>
                                <T w={400} s={13} lh={1.5} c={t.fg2} style={{ marginTop: 7 }}>You will need your email and password to get back in.</T>
                            </View>
                            <Press onPress={vm.closeOverlay} style={{ width: 34, height: 34, borderRadius: 12, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
                                <Glyph name="close" size={17} color={t.fg2} />
                            </Press>
                        </Row>
                        <Row style={{ gap: 8 }}>
                            <Press onPress={vm.closeOverlay} style={{ flex: 1, paddingVertical: 15, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, alignItems: 'center' }}>
                                <T w={600} s={14} lh={1} c={t.fg}>No, stay</T>
                            </Press>
                            <Press onPress={vm.confirmSignOut} style={{ flex: 1, paddingVertical: 15, borderRadius: 999, backgroundColor: t.coral, alignItems: 'center' }}>
                                <T w={700} s={14} lh={1} c="#fff">Yes, sign out</T>
                            </Press>
                        </Row>
                    </View>
                )}

                {/* ── Invite ──────────────────────────────────────────── */}
                {vm.isInvite && vm.invite && (
                    <View>
                        <T w={700} s={20} lh={1} style={{ letterSpacing: -0.8 }}>Invite a tenant</T>
                        <Eyebrow s={10} ls={0.08} style={{ marginTop: 7, marginBottom: 14 }}>THEY SCAN, PICK A ROOM, YOU APPROVE</Eyebrow>

                        <Row style={{ gap: 7, marginBottom: 14 }}>
                            {(vm.invite.options || []).map((io, i) => (
                                <Press
                                    key={i}
                                    onPress={io.go}
                                    style={{ flex: 1, minWidth: 0, paddingVertical: 11, paddingHorizontal: 8, borderRadius: 13, alignItems: 'center', borderWidth: 1, borderColor: col(io.bd), backgroundColor: col(io.bg) }}
                                >
                                    {/* One truncated line. "Green Meadows Luxury Residency
                                        Apartment Block A" used to wrap to four lines and
                                        stretch this row into a different shape from its
                                        neighbour; the code below it is the unambiguous bit
                                        anyway. */}
                                    <T w={600} s={12} lh={1.2} numberOfLines={1} c={col(io.fg)} style={{ textAlign: 'center' }}>{io.name}</T>
                                    <T mono w={600} s={9} lh={1} ls={0.06} c={col(io.fg)} style={{ opacity: 0.62, marginTop: 5 }}>{io.code}</T>
                                </Press>
                            ))}
                        </Row>

                        <View style={{ borderRadius: 20, backgroundColor: '#FFFFFF', padding: 18, alignItems: 'center', marginBottom: 10 }}>
                            <Image source={{ uri: vm.invite.qr }} style={{ width: 196, height: 196 }} resizeMode="contain" />
                            <T w={700} s={15} lh={1.2} numberOfLines={2} c="#0A0A0C" style={{ marginTop: 14, textAlign: 'center' }}>{vm.invite.name}</T>
                            <T mono w={600} s={10} lh={1} ls={0.08} c="rgba(10,10,12,.5)" style={{ marginTop: 7 }}>{vm.invite.policy}</T>
                        </View>

                        <Row style={{ gap: 12, paddingVertical: 13, paddingHorizontal: 15, borderRadius: 16, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, marginBottom: 10 }}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <Eyebrow s={9} ls={0.1}>PROPERTY ID</Eyebrow>
                                <T w={700} s={15} lh={1} c={t.fg} style={{ marginTop: 7, letterSpacing: 0.5 }}>{vm.invite.code}</T>
                            </View>
                            <Press onPress={vm.invite.share} style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: t.vsoft, alignItems: 'center', justifyContent: 'center' }}>
                                <Glyph name="copy-outline" size={16} color={t.accent} />
                            </Press>
                        </Row>

                        <Row style={{ gap: 7 }}>
                            <Press onPress={vm.invite.share} style={{ flex: 1, paddingVertical: 15, borderRadius: 999, backgroundColor: t.lime, alignItems: 'center' }}>
                                <T w={700} s={14} lh={1} c={t.on}>Share invite link</T>
                            </Press>
                            <Press onPress={vm.invite.manual} style={{ paddingVertical: 15, paddingHorizontal: 18, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                                <T w={600} s={13} lh={1} c={t.fg2}>Add manually</T>
                            </Press>
                        </Row>
                    </View>
                )}

                {/* ── Move ────────────────────────────────────────────── */}
                {vm.isMove && (
                    <View>
                        <T w={700} s={20} lh={1} style={{ letterSpacing: -0.8 }}>{`Move ${vm.moveName || ''}`}</T>
                        <Eyebrow s={10} ls={0.08} style={{ marginTop: 7, marginBottom: 16 }}>{`FROM ${vm.moveFrom || ''} · ROOMS WITH A FREE BED`}</Eyebrow>
                        {vm.noMoveTargets && (
                            <View style={{ paddingVertical: 34, alignItems: 'center' }}>
                                <T w={500} s={13} lh={1.5} c={t.fg2} style={{ textAlign: 'center' }}>Every other room is full. Free a bed first, or add a unit.</T>
                            </View>
                        )}
                        {(vm.moveTargets || []).map((mt, i) => (
                            <View key={i} style={{ marginBottom: 14 }}>
                                <Row align="baseline" style={{ gap: 9, marginBottom: 9 }}>
                                    <T w={600} s={13} lh={1.2} numberOfLines={1} c={t.fg} style={{ flexShrink: 1 }}>{mt.name}</T>
                                    <Eyebrow s={9} ls={0.06}>{mt.policy}</Eyebrow>
                                </Row>
                                {(mt.rooms || []).map((mr, j) => (
                                    <Press key={j} onPress={mr.go} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, width: '100%', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, marginBottom: 7, borderWidth: 1, borderColor: col(mr.bd), backgroundColor: col(mr.bg) }}>
                                        <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: t.ink2, alignItems: 'center', justifyContent: 'center' }}>
                                            <T w={700} s={15} lh={1} c={col(mr.fg)}>{mr.no}</T>
                                        </View>
                                        <View style={{ flex: 1, minWidth: 0 }}>
                                            <T w={600} s={13} lh={1.2} c={col(mr.fg)}>{mr.type}</T>
                                            <T mono w={600} s={10} lh={1.4} ls={0.06} c={col(mr.sub)} style={{ marginTop: 4 }}>{mr.beds}</T>
                                        </View>
                                        <Glyph name="chevron-forward" size={16} color={t.fg3} />
                                    </Press>
                                ))}
                            </View>
                        ))}
                    </View>
                )}

                {/* ── Danger (move out / delete) ──────────────────────── */}
                {vm.isDanger && (
                    <View>
                        <T w={700} s={20} lh={1} style={{ letterSpacing: -0.8, marginBottom: 16 }}>{who.name}</T>
                        {who.assigned && (
                            <Press onPress={vm.moveOut} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, width: '100%', padding: 14, borderRadius: 18, borderWidth: 1, borderColor: t.line, backgroundColor: t.ink3, marginBottom: 8 }}>
                                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: t.asoft, alignItems: 'center', justifyContent: 'center' }}>
                                    <Glyph name="log-out-outline" size={17} color={t.amber} />
                                </View>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <T w={600} s={14} lh={1.2} c={t.fg}>Move out</T>
                                    <T w={400} s={12} lh={1.4} c={t.fg2} style={{ marginTop: 4 }}>Frees the room. Account stays, marked unassigned.</T>
                                </View>
                            </Press>
                        )}
                        <Press onPress={vm.deleteMember} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, width: '100%', padding: 14, borderRadius: 18, borderWidth: 1, borderColor: t.line, backgroundColor: t.csoft, marginBottom: 8 }}>
                            <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: t.ink2, alignItems: 'center', justifyContent: 'center' }}>
                                <Glyph name="trash-outline" size={17} color={t.coral} />
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <T w={600} s={14} lh={1.2} c={t.coral}>Delete member</T>
                                <T w={400} s={12} lh={1.4} c={t.fg2} style={{ marginTop: 4 }}>Removes the account and its history for good.</T>
                            </View>
                        </Press>
                        <Press onPress={vm.closeOverlay} style={{ width: '100%', padding: 14, borderRadius: 18, borderWidth: 1, borderColor: t.line, alignItems: 'center' }}>
                            <T w={600} s={13} lh={1} c={t.fg2}>Cancel</T>
                        </Press>
                    </View>
                )}

                {/* ── Overdue sheet ───────────────────────────────────── */}
                {vm.isOverdueSheet && (
                    <View>
                        <T w={700} s={20} lh={1} style={{ letterSpacing: -0.8 }}>{vm.overdueTitle}</T>
                        <Eyebrow s={10} ls={0.08} style={{ marginTop: 7, marginBottom: 16 }}>{vm.overdueScopeLine}</Eyebrow>
                        {(vm.overdueRows || []).map((o, i) => (
                            <View key={i} style={{ borderRadius: 18, borderWidth: 1, borderColor: t.line, backgroundColor: t.ink3, paddingVertical: 13, paddingHorizontal: 14, marginBottom: 8 }}>
                                <Row style={{ gap: 11 }}>
                                    <Image source={{ uri: o.img }} style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: t.ink2 }} resizeMode="cover" />
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <T w={600} s={15} lh={1.2} c={t.fg}>{o.name}</T>
                                        <Eyebrow s={10} ls={0.06} style={{ marginTop: 4 }}>{o.sub}</Eyebrow>
                                    </View>
                                    <View style={{ alignItems: 'flex-end' }}>
                                        <T w={700} s={15} lh={1} c={t.fg}>{o.rent}</T>
                                        <T mono w={600} s={9} lh={1} ls={0.06} c={t.coral} style={{ marginTop: 5 }}>{o.late}</T>
                                    </View>
                                </Row>
                                <Row style={{ gap: 7, marginTop: 12 }}>
                                    <Press onPress={o.record} style={{ flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: t.lime, alignItems: 'center' }}>
                                        <T w={600} s={11} lh={1} c={t.on}>Record payment</T>
                                    </Press>
                                    <Press onPress={o.remind} style={{ flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, alignItems: 'center' }}>
                                        <T w={600} s={11} lh={1} c={t.fg}>Remind</T>
                                    </Press>
                                    <Press onPress={o.open} style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line }}>
                                        <T w={600} s={11} lh={1} c={t.fg2}>View</T>
                                    </Press>
                                </Row>
                            </View>
                        ))}
                    </View>
                )}

                {/* ── Vacant sheet ────────────────────────────────────── */}
                {vm.isVacant && (
                    <View>
                        <T w={700} s={20} lh={1} style={{ letterSpacing: -0.8 }}>{vm.vacantTitle}</T>
                        <Eyebrow s={10} ls={0.08} style={{ marginTop: 7, marginBottom: 16 }}>{vm.vacantScopeLine}</Eyebrow>
                        {(vm.vacantRooms || []).map((v, i) => (
                            <Press key={i} onPress={v.go} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, width: '100%', paddingVertical: 13, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: t.line, backgroundColor: t.asoft, marginBottom: 8 }}>
                                <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: t.ink2, alignItems: 'center', justifyContent: 'center' }}>
                                    <T w={700} s={17} lh={1} c={t.fg}>{v.no}</T>
                                </View>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <T w={600} s={14} lh={1.2} c={t.fg}>{v.prop}</T>
                                    <Eyebrow s={10} ls={0.06} style={{ marginTop: 4 }}>{v.type}</Eyebrow>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <T w={700} s={14} lh={1} c={t.amber}>{v.rent}</T>
                                    <Eyebrow s={9} ls={0.06} style={{ marginTop: 5 }}>LOST RENT</Eyebrow>
                                </View>
                            </Press>
                        ))}
                    </View>
                )}

                {/* ── Record a payment ────────────────────────────────── */}
                {vm.isRecord && (
                    <View>
                        <T w={700} s={20} lh={1} style={{ letterSpacing: -0.8 }}>Record a payment</T>
                        <T w={400} s={12} lh={1.4} c={t.fg2} style={{ marginTop: 6, marginBottom: 18 }}>{`${who.name || ''} · ${who.unitLine || ''}`}</T>
                        <View style={{ borderRadius: 20, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, padding: 20, alignItems: 'center', marginBottom: 12 }}>
                            <Eyebrow s={9} ls={0.12}>AMOUNT</Eyebrow>
                            <T w={700} s={40} lh={1} c={t.fg} style={{ marginTop: 12, letterSpacing: -2 }}>{who.rentFull}</T>
                        </View>
                        <Row style={{ gap: 7, marginBottom: 16 }}>
                            {(vm.methods || []).map((m, i) => (
                                <Press key={i} onPress={m.go} style={{ flex: 1, paddingVertical: 12, borderRadius: 13, borderWidth: 1, borderColor: col(m.bd), backgroundColor: col(m.bg), alignItems: 'center' }}>
                                    <T mono w={600} s={9} lh={1} ls={0.08} c={col(m.fg)}>{m.label}</T>
                                </Press>
                            ))}
                        </Row>
                        <Press onPress={vm.confirmRecord} style={{ width: '100%', paddingVertical: 16, borderRadius: 999, backgroundColor: t.lime, alignItems: 'center' }}>
                            <T w={700} s={14} lh={1} c={t.on}>{`Confirm ${who.rentFull || ''}`}</T>
                        </Press>
                    </View>
                )}

                {/* ── Pay (tenant) ────────────────────────────────────── */}
                {vm.isPay && (
                    <View>
                        {/* Was `vm.payLabel || 'Pay rent'`. payLabel went away with the
                            prototype's payment wiring, so the fallback was the only
                            thing that ever rendered — the read survived as noise, and
                            an `|| default` on a key that cannot exist hides the fact
                            that it is gone. */}
                        <T w={700} s={20} lh={1} style={{ letterSpacing: -0.8, marginBottom: 16 }}>Pay rent</T>
                        {/* The landlord's real UPI details. Tap either row to copy it. */}
                        {vm.payInfo.missing ? (
                            <Row gap={9} align="flex-start" style={{ paddingVertical: 12, paddingHorizontal: 13, borderRadius: 14, backgroundColor: t.asoft, marginBottom: 16 }}>
                                <Glyph name="information-circle-outline" size={15} color={t.amber} />
                                <T w={500} s={12} lh={1.45} c={t.amber} style={{ flex: 1 }}>{vm.payInfo.missingLine}</T>
                            </Row>
                        ) : null}

                        {vm.payInfo.hasUpiId ? (
                            <Press onPress={vm.payInfo.copyId}>
                                <Row style={{ gap: 13, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: t.line, backgroundColor: t.ink3, marginBottom: 8 }}>
                                    <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: t.vsoft, alignItems: 'center', justifyContent: 'center' }}>
                                        <Glyph name="at" size={18} color={t.accent} />
                                    </View>
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Eyebrow s={9} ls={0.1}>UPI ID</Eyebrow>
                                        <T w={600} s={14} lh={1} numberOfLines={1} style={{ marginTop: 6 }}>{vm.payInfo.upiId}</T>
                                    </View>
                                    <Glyph name="copy-outline" size={17} color={t.fg3} />
                                </Row>
                            </Press>
                        ) : null}

                        {vm.payInfo.hasUpiNumber ? (
                            <Press onPress={vm.payInfo.copyNumber}>
                                <Row style={{ gap: 13, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: t.line, backgroundColor: t.ink3, marginBottom: 8 }}>
                                    <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: t.vsoft, alignItems: 'center', justifyContent: 'center' }}>
                                        <Glyph name="call-outline" size={17} color={t.accent} />
                                    </View>
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Eyebrow s={9} ls={0.1}>UPI NUMBER</Eyebrow>
                                        <T w={600} s={14} lh={1} numberOfLines={1} style={{ marginTop: 6 }}>{vm.payInfo.upiNumber}</T>
                                    </View>
                                    <Glyph name="copy-outline" size={17} color={t.fg3} />
                                </Row>
                            </Press>
                        ) : null}

                        {vm.payInfo.hasQr ? (
                            <View style={{ alignItems: 'center', paddingVertical: 14, borderRadius: 18, borderWidth: 1, borderColor: t.line, backgroundColor: t.ink3, marginBottom: 8 }}>
                                <Eyebrow s={9} ls={0.1} style={{ marginBottom: 10 }}>SCAN TO PAY</Eyebrow>
                                <Image source={{ uri: vm.payInfo.qr }} style={{ width: 168, height: 168, borderRadius: 12, backgroundColor: t.ink2 }} resizeMode="contain" />
                            </View>
                        ) : null}

                        <View style={{ height: 8 }} />

                        <Press
                            onPress={vm.payInfo.open}
                            disabled={vm.payInfo.missing}
                            style={{ width: '100%', paddingVertical: 16, borderRadius: 999, backgroundColor: vm.payInfo.missing ? t.ink3 : t.lime, borderWidth: 1, borderColor: vm.payInfo.missing ? t.line : t.lime, alignItems: 'center' }}
                        >
                            <T w={700} s={14} lh={1} c={vm.payInfo.missing ? t.fg3 : t.on}>Open UPI app</T>
                        </Press>
                        <Eyebrow s={8} ls={0.06} style={{ marginTop: 14, textAlign: 'center' }}>YOUR LANDLORD CONFIRMS IT, THEN IT APPEARS IN YOUR HISTORY</Eyebrow>
                    </View>
                )}

                {/* ── Menu ────────────────────────────────────────────── */}
                {/* ── Tenant request detail ─────────────────────────── */}
                {vm.isRequest && vm.request && (
                    <View>
                        <Row gap={9} align="flex-start" style={{ marginBottom: 4 }}>
                            <View style={{ flex: 1 }}>
                                <T w={700} s={21} lh={1.15} style={{ letterSpacing: -0.6 }}>{vm.request.title}</T>
                                <Eyebrow s={10} ls={0.08} style={{ marginTop: 6 }}>{vm.request.sub}</Eyebrow>
                            </View>
                            <View style={{ paddingVertical: 5, paddingHorizontal: 9, borderRadius: 8, backgroundColor: t.ink3 }}>
                                <T mono w={600} s={9} ls={0.05} c={col(vm.request.dot)}>{vm.request.status}</T>
                            </View>
                        </Row>

                        {/* status ladder */}
                        <Row gap={0} style={{ marginTop: 18, marginBottom: 18 }}>
                            {vm.request.steps.map((st, i) => (
                                <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                                    <Row gap={0} style={{ width: '100%' }}>
                                        <View style={{ flex: 1, height: 2, backgroundColor: i === 0 ? 'transparent' : (st.done ? t.pos : t.line) }} />
                                        <View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: st.done ? col(st.fg) : t.ink3, borderWidth: 1, borderColor: st.done ? col(st.fg) : t.line }} />
                                        <View style={{ flex: 1, height: 2, backgroundColor: i === vm.request.steps.length - 1 ? 'transparent' : (vm.request.steps[i + 1] && vm.request.steps[i + 1].done ? t.pos : t.line) }} />
                                    </Row>
                                    <T mono w={600} s={8} ls={0.08} c={st.current ? t.fg : t.fg3} style={{ marginTop: 7 }}>{st.label}</T>
                                </View>
                            ))}
                        </Row>

                        <View style={{ borderRadius: 18, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, padding: 15, marginBottom: 12 }}>
                            <Eyebrow s={9} ls={0.12} c={t.fg3} style={{ marginBottom: 8 }}>DESCRIPTION</Eyebrow>
                            <T w={400} s={13} lh={1.55} c={t.fg2}>{vm.request.body || 'No description was added.'}</T>
                        </View>

                        <Row gap={8} wrap style={{ marginBottom: 14 }}>
                            <View style={{ paddingVertical: 7, paddingHorizontal: 11, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                                <T mono w={600} s={9} ls={0.08} c={t.fg2}>{`PRIORITY · ${String(vm.request.priority || '').toUpperCase()}`}</T>
                            </View>
                            <View style={{ paddingVertical: 7, paddingHorizontal: 11, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                                <T mono w={600} s={9} ls={0.08} c={t.fg2}>{`RAISED · ${vm.request.raised || '—'}`}</T>
                            </View>
                        </Row>

                        {vm.request.hasPhotos && (
                            <View style={{ marginBottom: 14 }}>
                                <Eyebrow s={9} ls={0.12} c={t.fg3} style={{ marginBottom: 10 }}>ATTACHED</Eyebrow>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 18, paddingBottom: 2 }} style={{ marginHorizontal: -18 }}>
                                    {(vm.request.photos || []).map((ph, i) => (
                                        <Image key={i} source={{ uri: ph }} style={{ width: 168, height: 126, borderRadius: 14, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }} resizeMode="cover" />
                                    ))}
                                </ScrollView>
                            </View>
                        )}

                        <Thread
                            thread={vm.request.thread}
                            composer={vm.composer}
                            canReply={vm.request.canReply}
                            t={t}
                            placeholder="Message your landlord…"
                        />

                        {/* The landlord, reachable from the request itself — the point
                            of a request is usually to get hold of them. */}
                        {vm.request.landlord ? (
                            <Row gap={8} style={{ marginBottom: 10 }}>
                                <Press
                                    onPress={vm.request.landlord.call}
                                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 8, paddingVertical: 15, borderRadius: 999, backgroundColor: t.lsoft, borderWidth: 1, borderColor: t.line }}
                                >
                                    <Glyph name="call" size={16} color={t.pos} />
                                    <T w={600} s={13.5} c={t.fg} numberOfLines={1}>{`Call ${String(vm.request.landlord.name).split(' ')[0]}`}</T>
                                </Press>
                            </Row>
                        ) : null}

                        <Press onPress={vm.closeOverlay} style={{ paddingVertical: 15, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, alignItems: 'center' }}>
                            <T w={600} s={14} c={t.fg}>Close</T>
                        </Press>
                    </View>
                )}

                {/* ── Looking at a property before asking to join it ──── */}
                {/* Asking used to be blind — a name and a locality. Somebody was being
                    asked to photograph their government ID for a place whose rooms,
                    prices and landlord they had never seen. */}
                {vm.isPropView && vm.propView.has && (
                    <View>
                        {vm.propView.img ? (
                            <Image
                                source={{ uri: vm.propView.img }}
                                style={{ width: '100%', height: 150, borderRadius: 20, marginBottom: 14, backgroundColor: t.ink3 }}
                                resizeMode="cover"
                            />
                        ) : null}

                        <Eyebrow s={9} ls={0.12} c={t.fg3}>{vm.propView.type}</Eyebrow>
                        <T w={700} s={24} lh={1.1} style={{ letterSpacing: -1, marginTop: 7 }}>{vm.propView.name}</T>
                        <T w={400} s={13} lh={1.5} c={t.fg2} style={{ marginTop: 7 }}>{vm.propView.where}</T>
                        <T mono w={600} s={9} lh={1} ls={0.1} c={t.fg3} style={{ marginTop: 9 }}>{vm.propView.code}</T>

                        {/* The landlord, with a way to reach them. A stranger being asked
                            to hand over an ID has a fair claim to a phone number first. */}
                        <View style={{ marginTop: 16, paddingVertical: 13, paddingHorizontal: 14, borderRadius: 16, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                            <Eyebrow s={9} ls={0.12} c={t.fg3}>LANDLORD</Eyebrow>
                            <Row justify="space-between" style={{ marginTop: 9 }}>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <T w={600} s={14.5} lh={1.2} numberOfLines={1}>{vm.propView.ownerLabel}</T>
                                    {vm.propView.hasPhone ? (
                                        <T mono w={600} s={10} lh={1.4} ls={0.06} c={t.fg2} style={{ marginTop: 4 }}>{vm.propView.phoneLabel}</T>
                                    ) : (
                                        <T w={400} s={12} lh={1.4} c={t.fg3} style={{ marginTop: 4 }}>No number on file</T>
                                    )}
                                </View>
                                {vm.propView.hasPhone ? (
                                    <Row gap={7}>
                                        <Press onPress={vm.propView.message} style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
                                            <Glyph name="chatbubble-outline" size={16} color={t.fg2} />
                                        </Press>
                                        <Press onPress={vm.propView.call} style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: t.lsoft, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}>
                                            <Glyph name="call" size={16} color={t.pos} />
                                        </Press>
                                    </Row>
                                ) : null}
                            </Row>
                        </View>

                        {/* The rooms, with what ONE BED costs — the figure they will
                            actually be charged, not the whole-room rent. */}
                        <Eyebrow s={9} ls={0.12} c={t.fg3} style={{ marginTop: 20, marginBottom: 10 }}>ROOMS · PICK ONE TO ASK FOR</Eyebrow>

                        {vm.propView.hasRooms ? (
                            <View style={{ rowGap: 8 }}>
                                {vm.propView.rooms.map((r) => (
                                    <Press
                                        key={r.id}
                                        onPress={r.go}
                                        style={{ paddingVertical: 13, paddingHorizontal: 14, borderRadius: 16, backgroundColor: r.on ? t.lsoft : t.ink3, borderWidth: 1, borderColor: r.on ? t.lime : t.line }}
                                    >
                                        <Row justify="space-between">
                                            <View style={{ flex: 1, minWidth: 0 }}>
                                                <Row gap={8}>
                                                    <T w={700} s={15} lh={1.1}>{r.label}</T>
                                                    {r.type ? <T mono w={600} s={8.5} lh={1} ls={0.08} c={t.fg3}>{r.type}</T> : null}
                                                </Row>
                                                {/* Full is stated, not hidden: the landlord may be
                                                    about to free a bed and they decide either way,
                                                    so the choice is informed rather than removed. */}
                                                <T w={400} s={11.5} lh={1.4} c={r.full ? t.amber : t.pos} style={{ marginTop: 5 }}>{r.freeLine}</T>
                                            </View>
                                            <View style={{ alignItems: 'flex-end' }}>
                                                <T w={700} s={16} lh={1.1} c={r.on ? t.lime : t.fg}>{r.price}</T>
                                                <T mono w={600} s={8} lh={1} ls={0.06} c={t.fg3} style={{ marginTop: 4 }}>{r.priceNote.toUpperCase()}</T>
                                            </View>
                                        </Row>
                                    </Press>
                                ))}
                            </View>
                        ) : (
                            <Row gap={9} align="flex-start" style={{ paddingVertical: 12, paddingHorizontal: 13, borderRadius: 14, backgroundColor: t.asoft }}>
                                <Glyph name="information-circle-outline" size={15} color={t.amber} />
                                <T w={500} s={12} lh={1.45} c={t.amber} style={{ flex: 1 }}>{vm.propView.noRoomsLine}</T>
                            </Row>
                        )}

                        {vm.propView.hasChosen ? (
                            <Press onPress={vm.propView.clearRoom} style={{ alignSelf: 'flex-start', marginTop: 10, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: t.line }}>
                                <T w={600} s={11.5} c={t.fg2}>No preference</T>
                            </Press>
                        ) : null}

                        {/* Said in words before they commit, because a chip is not a
                            sentence and "ask for" is not "reserve". */}
                        <Row gap={8} align="flex-start" style={{ marginTop: 14 }}>
                            <Glyph name="information-circle-outline" size={14} color={t.fg3} style={{ marginTop: 1 }} />
                            <T w={400} s={11.5} lh={1.45} c={t.fg3} style={{ flex: 1 }}>{vm.propView.askLine}</T>
                        </Row>

                        <Press
                            onPress={vm.propView.send}
                            disabled={vm.propView.busy}
                            style={{ width: '100%', marginTop: 16, paddingVertical: 16, borderRadius: 999, backgroundColor: t.lime, alignItems: 'center', opacity: vm.propView.busy ? 0.7 : 1 }}
                        >
                            <T w={700} s={15} lh={1} c={t.on}>{vm.propView.busy ? 'Sending…' : vm.propView.cta}</T>
                        </Press>
                        <Press onPress={vm.propView.close} style={{ marginTop: 9, paddingVertical: 15, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, alignItems: 'center' }}>
                            <T w={600} s={14} c={t.fg}>Close</T>
                        </Press>
                    </View>
                )}

                {/* ── ID documents (landlord's view) ──────────────────── */}
                {vm.isDocs && vm.docs && (
                    <View>
                        <Row gap={13} style={{ marginBottom: 16 }}>
                            <Avatar initials={vm.docs.initials} size={46} radius={16} />
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <T w={700} s={19} lh={1.15} style={{ letterSpacing: -0.7 }} numberOfLines={1}>{vm.docs.name}</T>
                                {/* Where they actually are, first. A landlord opening this
                                    wants "room 101" or "no longer here" before anything
                                    about documents — the sheet used to lead with the app's
                                    state instead of the tenancy's. */}
                                <Eyebrow s={9} ls={0.08} c={vm.docs.movedOut ? t.amber : t.fg3} style={{ marginTop: 5 }}>
                                    {vm.docs.tenancyLine}{vm.docs.summaryLine ? ` · ${vm.docs.summaryLine.toUpperCase()}` : ''}
                                </Eyebrow>
                            </View>
                            {vm.docs.verified ? <Glyph name="shield-checkmark" size={20} color={t.pos} /> : null}
                        </Row>

                        {vm.docs.loading ? (
                            <View style={{ alignItems: 'center', paddingVertical: 30, rowGap: 12 }}>
                                <ActivityIndicator color={t.lime} />
                                <Eyebrow s={9} ls={0.12} c={t.fg3}>LOADING DOCUMENTS</Eyebrow>
                            </View>
                        ) : null}

                        {vm.docs.hasError ? (
                            <Row gap={8} align="flex-start" style={{ marginBottom: 14, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 13, backgroundColor: t.csoft }}>
                                <Glyph name="alert-circle" size={15} color={t.coral} />
                                <T w={500} s={12.5} lh={1.45} c={t.coral} style={{ flex: 1 }}>{vm.docs.error}</T>
                            </Row>
                        ) : null}

                        {/* The ID is hidden because the tenancy ended. Stated up front
                            rather than left for the landlord to infer from a smudged
                            thumbnail — an unexplained blur reads as a bug, and this is
                            a deliberate limit worth understanding. The record itself
                            (what was checked, by whom, when) is still below. */}
                        {vm.docs.idHidden ? (
                            <Row gap={10} align="flex-start" style={{ marginBottom: 14, padding: 13, borderRadius: 16, backgroundColor: t.asoft, borderWidth: 1, borderColor: t.amber }}>
                                <Glyph name="lock-closed" size={16} color={t.amber} style={{ marginTop: 1 }} />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <T w={600} s={13} lh={1.4} c={t.amber}>{vm.docs.idHiddenWhy}</T>
                                    {vm.docs.idHiddenNoPreview ? (
                                        <T w={400} s={12} lh={1.45} c={t.fg2} style={{ marginTop: 5 }}>
                                            These were uploaded before secure storage was switched on, so there is no
                                            safe copy to show you — not even a blurred one.
                                        </T>
                                    ) : null}
                                </View>
                            </Row>
                        ) : null}

                        {vm.docs.noAccount ? (
                            <View style={{ paddingVertical: 18, paddingHorizontal: 14, borderRadius: 16, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, marginBottom: 14 }}>
                                <Glyph name="person-outline" size={20} color={t.fg3} />
                                <T w={400} s={13} lh={1.5} c={t.fg2} style={{ marginTop: 10 }}>{vm.docs.noAccountLine}</T>
                            </View>
                        ) : null}

                        {vm.docs.empty ? (
                            <View style={{ alignItems: 'center', paddingVertical: 22, paddingHorizontal: 10, marginBottom: 8 }}>
                                <View style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: t.ink3, alignItems: 'center', justifyContent: 'center', marginBottom: 13 }}>
                                    <Glyph name="shield-outline" size={23} color={t.fg3} />
                                </View>
                                <T w={400} s={13} lh={1.5} c={t.fg2} style={{ textAlign: 'center' }}>{vm.docs.emptyLine}</T>
                            </View>
                        ) : null}

                        <View style={{ rowGap: 8, marginBottom: 14 }}>
                            {vm.docs.rows.map((d) => (
                                <View
                                    key={d.id}
                                    style={{ borderRadius: 18, backgroundColor: t.ink3, borderWidth: 1, borderColor: d.verified ? t.pos : t.line, padding: 14 }}
                                >
                                    {/* Tapping opens the ID full screen IN the app, where it
                                        pinches and double-taps to zoom — reading a number off
                                        a photographed card needs that. It used to hand the file
                                        to the browser, which took the landlord away from the
                                        Verify and Reject buttons they were about to press. */}
                                    <Press onPress={d.open}>
                                        <Row gap={12}>
                                            {/* The actual picture, not a glyph. A generic icon
                                                looks the same whether the upload arrived or
                                                not, so a missing file was indistinguishable
                                                from one nobody had opened yet — DocThumb draws
                                                a failed fetch as a failure. */}
                                            <DocThumb uri={d.thumb} isPdf={d.isPdf || !d.canPreview} size={42} radius={14} />
                                            <View style={{ flex: 1, minWidth: 0 }}>
                                                <Row gap={6} align="center">
                                                    <T w={600} s={14.5} lh={1.2} numberOfLines={1} style={{ flexShrink: 1 }}>{d.label}</T>
                                                    {/* The lock, on the row itself. The banner
                                                        above explains the rule once; this says
                                                        which rows it applies to, so a blurred
                                                        thumbnail never reads as a bad upload. */}
                                                    {d.blurred ? <Glyph name="lock-closed" size={12} color={t.amber} /> : null}
                                                </Row>
                                                {d.hasNumber ? (
                                                    <T mono w={600} s={9} lh={1.4} ls={0.08} c={t.fg2} numberOfLines={1} style={{ marginTop: 4 }}>{d.number}</T>
                                                ) : null}
                                                <Eyebrow s={9} ls={0.06} c={t.fg3} style={{ marginTop: 3 }}>{d.age}</Eyebrow>
                                            </View>
                                            <T mono w={600} s={8} lh={1} ls={0.08} c={col(d.statusFg)}>{d.status}</T>
                                        </Row>
                                    </Press>

                                    {d.by ? (
                                        <Eyebrow s={9} ls={0.06} c={t.fg3} style={{ marginTop: 10 }}>{d.by}</Eyebrow>
                                    ) : null}

                                    {d.busy ? (
                                        <View style={{ paddingVertical: 12 }}><ActivityIndicator color={t.lime} /></View>
                                    ) : (
                                        <Row gap={7} style={{ marginTop: 11 }}>
                                            <Press onPress={d.open} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 6, paddingVertical: 11, borderRadius: 13, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line }}>
                                                <Glyph name={d.blurred ? 'lock-closed-outline' : 'eye-outline'} size={14} color={d.blurred ? t.fg3 : t.accent} />
                                                <T w={600} s={12} c={d.blurred ? t.fg2 : t.fg}>{d.blurred ? 'Hidden' : 'Open'}</T>
                                            </Press>
                                            {!d.canDecide ? (
                                                /* No Verify/Reject/Undo on a hidden ID. A
                                                   verdict is a statement that you looked at
                                                   the document, and there is nothing to look
                                                   at — the server refuses these too, so
                                                   showing them would be offering an action
                                                   already known to fail. */
                                                null
                                            ) : d.verified || d.rejected ? (
                                                <Press onPress={d.reopen} style={{ paddingVertical: 11, paddingHorizontal: 15, borderRadius: 13, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line }}>
                                                    <T w={600} s={12} c={t.fg2}>Undo</T>
                                                </Press>
                                            ) : (
                                                <>
                                                    <Press onPress={d.reject} style={{ paddingVertical: 11, paddingHorizontal: 15, borderRadius: 13, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line }}>
                                                        <T w={600} s={12} c={t.fg2}>Reject</T>
                                                    </Press>
                                                    <Press onPress={d.verify} style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 13, backgroundColor: t.lime }}>
                                                        <T w={700} s={12.5} c={t.on}>Verify</T>
                                                    </Press>
                                                </>
                                            )}
                                        </Row>
                                    )}

                                    {d.hasNote ? (
                                        <T w={400} s={12} lh={1.45} c={t.fg2} style={{ marginTop: 10 }}>{d.note}</T>
                                    ) : null}
                                </View>
                            ))}
                        </View>

                        <Press onPress={vm.docs.close} style={{ paddingVertical: 15, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, alignItems: 'center' }}>
                            <T w={600} s={14} c={t.fg}>Close</T>
                        </Press>
                    </View>
                )}

                {/* ── Requests to join (owner inbox) ──────────────────── */}
                {vm.isJoins && vm.joins && (
                    <View>
                        <Row justify="space-between" align="flex-start" style={{ marginBottom: 16 }}>
                            <View style={{ flex: 1 }}>
                                <T w={700} s={20} lh={1.1} style={{ letterSpacing: -0.8 }}>{vm.joins.title}</T>
                                <Eyebrow s={10} ls={0.08} style={{ marginTop: 7 }}>REQUESTS TO JOIN YOUR PROPERTIES</Eyebrow>
                            </View>
                            <Glyph name="person-add" size={20} color={vm.joins.count ? t.accent : t.fg3} />
                        </Row>

                        {vm.joins.empty ? (
                            <View style={{ alignItems: 'center', paddingVertical: 24, paddingHorizontal: 10, marginBottom: 8 }}>
                                <View style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: t.ink3, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                                    <Glyph name="person-add-outline" size={24} color={t.fg3} />
                                </View>
                                <T w={400} s={13} lh={1.5} c={t.fg2} style={{ textAlign: 'center' }}>{vm.joins.emptyLine}</T>
                            </View>
                        ) : (
                            <View style={{ rowGap: 8, marginBottom: 14 }}>
                                {vm.joins.rows.map((j) => (
                                    <View
                                        key={j.id}
                                        style={{
                                            borderRadius: 18,
                                            backgroundColor: j.pending ? t.ink3 : t.ink2,
                                            borderWidth: 1,
                                            borderColor: j.pending ? t.accent : t.line,
                                            padding: 14
                                        }}
                                    >
                                        {/* Who they are, first — this is the question a
                                            landlord is actually answering. */}
                                        <Press onPress={j.pending ? j.open : undefined}>
                                            <Row gap={12}>
                                                <Avatar initials={j.initials} size={44} radius={15} />
                                                <View style={{ flex: 1, minWidth: 0 }}>
                                                    <T w={600} s={15} lh={1.2} c={t.fg} numberOfLines={1}>{j.name}</T>
                                                    <T mono w={600} s={9} lh={1.4} ls={0.08} c={t.fg3} numberOfLines={1} style={{ marginTop: 4 }}>
                                                        {j.phoneLabel}
                                                    </T>
                                                    <T mono w={600} s={9} lh={1.4} ls={0.06} c={t.fg3} numberOfLines={1} style={{ marginTop: 3 }}>
                                                        {`${String(j.property).toUpperCase()} · ${j.age}`}
                                                    </T>
                                                </View>
                                                <T mono w={600} s={8} lh={1} ls={0.08} c={col(j.statusFg)}>{j.status}</T>
                                            </Row>
                                        </Press>

                                        {/* Why this row is here at all. Only for a phone
                                            match: a landlord who typed this person in
                                            themselves did not ask for anything, and a
                                            request with no explanation gets declined. */}
                                        {j.matched ? (
                                            <View style={{ marginTop: 11, padding: 11, borderRadius: 13, backgroundColor: t.vsoft, borderWidth: 1, borderColor: t.line }}>
                                                <T w={600} s={12.5} lh={1.4} c={t.fg}>{j.lead}</T>
                                                <T w={400} s={11.5} lh={1.45} c={t.fg2} style={{ marginTop: 3 }}>{j.why}</T>
                                            </View>
                                        ) : null}

                                        {j.hasNote ? (
                                            <T w={400} s={12.5} lh={1.5} c={t.fg2} style={{ marginTop: 11 }}>{`“${j.note}”`}</T>
                                        ) : null}

                                        {/* Reach them before deciding. */}
                                        <Row gap={7} style={{ marginTop: 12 }}>
                                            <Press onPress={j.call} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 6, paddingVertical: 11, borderRadius: 13, backgroundColor: t.lsoft, borderWidth: 1, borderColor: t.line }}>
                                                <Glyph name="call" size={14} color={t.pos} />
                                                <T w={600} s={12} c={t.fg}>Call</T>
                                            </Press>
                                            <Press onPress={j.message} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 6, paddingVertical: 11, borderRadius: 13, backgroundColor: t.vsoft, borderWidth: 1, borderColor: t.line }}>
                                                <Glyph name="chatbubble-ellipses" size={14} color={t.accent} />
                                                <T w={600} s={12} c={t.fg}>Message</T>
                                            </Press>
                                        </Row>

                                        {/* And check who they are. A stranger asking for a
                                            room is exactly who an ID proof is for. */}
                                        <Press
                                            onPress={j.seeId}
                                            style={{ marginTop: 7, flexDirection: 'row', alignItems: 'center', columnGap: 7, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 13, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line }}
                                        >
                                            <Glyph name={j.idIcon} size={14} color={col(j.idFg)} />
                                            <T mono w={600} s={9} ls={0.08} c={col(j.idFg)} style={{ flex: 1 }}>{j.idLabel}</T>
                                            <T w={600} s={11.5} c={t.fg2}>See ID</T>
                                            <Glyph name="chevron-forward" size={13} color={t.fg3} />
                                        </Press>

                                        {j.pending ? (
                                            <Row gap={7} style={{ marginTop: 7 }}>
                                                <Press onPress={j.decline} style={{ paddingVertical: 11, paddingHorizontal: 16, borderRadius: 13, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line }}>
                                                    <T w={600} s={12} c={t.fg2}>{j.declineLabel}</T>
                                                </Press>
                                                <Press onPress={j.open} style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 13, backgroundColor: t.lime }}>
                                                    <T w={700} s={12.5} c={t.on}>{j.acceptLabel}</T>
                                                </Press>
                                            </Row>
                                        ) : null}
                                    </View>
                                ))}
                            </View>
                        )}

                        <Press onPress={vm.closeOverlay} style={{ paddingVertical: 15, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, alignItems: 'center' }}>
                            <T w={600} s={14} c={t.fg}>Close</T>
                        </Press>
                    </View>
                )}

                {/* ── Accept a join request ───────────────────────────── */}
                {vm.isJoinDecide && vm.joinDecide && (
                    <View>
                        <Row gap={13} style={{ marginBottom: 16 }}>
                            <Avatar initials={vm.joinDecide.initials} size={52} radius={18} />
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <T w={700} s={19} lh={1.15} style={{ letterSpacing: -0.6 }} numberOfLines={1}>{vm.joinDecide.name}</T>
                                <Eyebrow s={9} ls={0.08} style={{ marginTop: 6 }}>
                                    {`WANTS TO JOIN ${String(vm.joinDecide.property).toUpperCase()}`}
                                </Eyebrow>
                            </View>
                        </Row>

                        <View style={{ rowGap: 8, marginBottom: 14 }}>
                            <Row gap={11} style={{ padding: 13, borderRadius: 16, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                                <Glyph name="call-outline" size={16} color={t.pos} />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Eyebrow s={9} ls={0.1}>MOBILE</Eyebrow>
                                    <T w={600} s={13.5} lh={1} style={{ marginTop: 5 }}>{vm.joinDecide.phoneLabel}</T>
                                </View>
                                <Press onPress={vm.joinDecide.call} style={{ width: 32, height: 32, borderRadius: 11, backgroundColor: t.lsoft, alignItems: 'center', justifyContent: 'center' }}>
                                    <Glyph name="call" size={14} color={t.pos} />
                                </Press>
                                <Press onPress={vm.joinDecide.message} style={{ width: 32, height: 32, borderRadius: 11, backgroundColor: t.vsoft, alignItems: 'center', justifyContent: 'center' }}>
                                    <Glyph name="chatbubble-ellipses" size={14} color={t.accent} />
                                </Press>
                            </Row>
                            {vm.joinDecide.email ? (
                                <Row gap={11} style={{ padding: 13, borderRadius: 16, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                                    <Glyph name="mail-outline" size={16} color={t.accent} />
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Eyebrow s={9} ls={0.1}>EMAIL</Eyebrow>
                                        <T w={600} s={13.5} lh={1} numberOfLines={1} style={{ marginTop: 5 }}>{vm.joinDecide.email}</T>
                                    </View>
                                </Row>
                            ) : null}
                            <Row gap={11} style={{ padding: 13, borderRadius: 16, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                                <Glyph name="time-outline" size={16} color={t.fg2} />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Eyebrow s={9} ls={0.1}>ASKED</Eyebrow>
                                    <T w={600} s={13.5} lh={1} style={{ marginTop: 5 }}>{`${vm.joinDecide.askedOn} · ${vm.joinDecide.age}`}</T>
                                </View>
                            </Row>
                        </View>

                        {vm.joinDecide.hasNote ? (
                            <View style={{ borderRadius: 16, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, padding: 14, marginBottom: 14 }}>
                                <Eyebrow s={9} ls={0.12} style={{ marginBottom: 8 }}>THEY SAID</Eyebrow>
                                <T w={400} s={13} lh={1.5} c={t.fg2}>{vm.joinDecide.note}</T>
                            </View>
                        ) : null}

                        {/* Who is this? The ID goes ABOVE the room picker, because it is
                            the question that decides whether to place them at all. */}
                        <Press
                            onPress={vm.joinDecide.seeId}
                            style={{ marginBottom: 14, padding: 14, borderRadius: 16, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}
                        >
                            <Row gap={10}>
                                <Glyph name={vm.joinDecide.idIcon} size={16} color={col(vm.joinDecide.idFg)} />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Eyebrow s={9} ls={0.1} c={col(vm.joinDecide.idFg)}>{vm.joinDecide.idLabel}</Eyebrow>
                                    <T w={400} s={12.5} lh={1.45} c={t.fg2} style={{ marginTop: 6 }}>{vm.joinDecide.idHint}</T>
                                </View>
                                <Glyph name="chevron-forward" size={15} color={t.fg3} />
                            </Row>
                        </Press>

                        <Eyebrow s={9} ls={0.12} c={t.fg3} style={{ marginBottom: 9 }}>PUT THEM IN A ROOM — OPTIONAL</Eyebrow>
                        {/* Which room they asked for, above the chips rather than inside
                            them: it is a fact about the request, and the chip that
                            matches it is already selected below. */}
                        <Row gap={8} align="flex-start" style={{ marginBottom: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 13, backgroundColor: vm.joinDecide.hasAskedUnit ? t.lsoft : t.ink3 }}>
                            <Glyph name="bed-outline" size={14} color={vm.joinDecide.hasAskedUnit ? t.lime : t.fg3} style={{ marginTop: 1 }} />
                            <T w={500} s={11.5} lh={1.45} c={vm.joinDecide.hasAskedUnit ? t.fg : t.fg3} style={{ flex: 1 }}>{vm.joinDecide.askedRoomLine}</T>
                        </Row>
                        {vm.joinDecide.hasRooms ? (
                            <Chips items={vm.joinDecide.rooms} t={t} />
                        ) : (
                            <Row gap={9} align="flex-start" style={{ paddingVertical: 12, paddingHorizontal: 13, borderRadius: 14, backgroundColor: t.asoft, marginBottom: 12 }}>
                                <Glyph name="information-circle-outline" size={15} color={t.amber} />
                                <T w={500} s={12} lh={1.45} c={t.amber} style={{ flex: 1 }}>{vm.joinDecide.noRoomsLine}</T>
                            </Row>
                        )}

                        {/* How long the guest ID lasts. Shown before Accept, not buried
                            in settings afterwards, because it is part of the decision
                            being made — and the resulting date is spelled out so the
                            landlord is not choosing an abstraction. */}
                        <Eyebrow s={9} ls={0.12} c={t.fg3} style={{ marginTop: 4, marginBottom: 9 }}>HOW LONG IS THIS STAY?</Eyebrow>
                        {/* What the applicant themselves said, above the chips rather
                            than inside them, because it is a fact about the request and
                            not one of the options — the option that matches it is
                            already preselected below. */}
                        <Row gap={8} align="flex-start" style={{ marginBottom: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 13, backgroundColor: vm.joinDecide.hasAsked ? t.lsoft : t.ink3 }}>
                            <Glyph name="person-outline" size={14} color={vm.joinDecide.hasAsked ? t.lime : t.fg3} style={{ marginTop: 1 }} />
                            <T w={500} s={11.5} lh={1.45} c={vm.joinDecide.hasAsked ? t.fg : t.fg3} style={{ flex: 1 }}>{vm.joinDecide.askedLine}</T>
                        </Row>
                        <Chips items={vm.joinDecide.stayOptions} t={t} />
                        <Row gap={8} align="flex-start" style={{ marginBottom: 14 }}>
                            <Glyph name="time-outline" size={14} color={t.fg3} style={{ marginTop: 1 }} />
                            <T w={400} s={11.5} lh={1.45} c={t.fg3} style={{ flex: 1 }}>{vm.joinDecide.stayLine}</T>
                        </Row>

                        <Row gap={8}>
                            <Press onPress={vm.joinDecide.decline} disabled={vm.joinDecide.busy} style={{ paddingVertical: 15, paddingHorizontal: 18, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                                <T w={600} s={13.5} c={t.fg2}>Decline</T>
                            </Press>
                            <Press
                                onPress={vm.joinDecide.accept}
                                disabled={vm.joinDecide.busy}
                                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 8, paddingVertical: 15, borderRadius: 999, backgroundColor: t.lime, opacity: vm.joinDecide.busy ? 0.7 : 1 }}
                            >
                                {vm.joinDecide.busy ? <ActivityIndicator size="small" color={t.on} /> : <Glyph name="checkmark" size={16} color={t.on} />}
                                <T w={700} s={14} c={t.on}>
                                    {vm.joinDecide.chosen ? `Accept into ${vm.joinDecide.chosen.no}` : 'Accept'}
                                </T>
                            </Press>
                        </Row>
                    </View>
                )}

                {/* ── Leaving a property ───────────────────────────────── */}
                {/* The confirmation the old button never had. It flashed "You have
                    left this property" on ONE tap, changed nothing on the server, and
                    sat under a caption promising a 30-day notice period that did not
                    exist. Everything here comes from the server, including the wording
                    of the terms — so the tenant's copy of the rules and the landlord's
                    cannot drift apart. */}
                {vm.leaveSheet.open && (
                    <View>
                        <Row justify="space-between" align="flex-start" style={{ marginBottom: 14 }}>
                            <View style={{ flex: 1 }}>
                                <T w={700} s={20} lh={1.15} style={{ letterSpacing: -0.8 }}>{vm.leaveSheet.title}</T>
                                {vm.leaveSheet.place ? (
                                    <Eyebrow s={10} ls={0.08} style={{ marginTop: 7 }}>{vm.leaveSheet.place.toUpperCase()}</Eyebrow>
                                ) : null}
                            </View>
                            <Glyph name="exit-outline" size={20} color={t.amber} />
                        </Row>

                        {vm.leaveSheet.loading ? (
                            <T w={400} s={13} lh={1.5} c={t.fg2}>Working out your notice period…</T>
                        ) : vm.leaveSheet.unavailable ? (
                            /* The preview never arrived, so there is no date and no
                               terms. This used to fall through to the branch below and
                               draw a confirm button over an empty date — pressing it
                               failed, which made an undeployed backend look like a
                               broken button and cost a bug report. Now it says what
                               happened and offers the only thing that can help. */
                            <View>
                                <Row gap={9} align="flex-start" style={{ padding: 13, borderRadius: 16, backgroundColor: t.csoft }}>
                                    <Glyph name="alert-circle-outline" size={16} color={t.coral} style={{ marginTop: 1 }} />
                                    <T w={500} s={13} lh={1.5} c={t.coral} style={{ flex: 1 }}>
                                        {vm.leaveSheet.error || 'Could not work out your notice period.'}
                                    </T>
                                </Row>
                                <Press onPress={vm.leaveSheet.retry} style={{ marginTop: 14, paddingVertical: 14, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, alignItems: 'center' }}>
                                    <T w={600} s={13.5} c={t.fg}>Try again</T>
                                </Press>
                            </View>
                        ) : vm.leaveSheet.blocked ? (
                            <Row gap={9} align="flex-start" style={{ padding: 13, borderRadius: 16, backgroundColor: t.ink3 }}>
                                <Glyph name="information-circle-outline" size={16} color={t.fg2} style={{ marginTop: 1 }} />
                                <T w={500} s={13} lh={1.5} c={t.fg2} style={{ flex: 1 }}>{vm.leaveSheet.blockedWhy}</T>
                            </Row>
                        ) : (
                            <>
                                {/* The date, big, because it is the single fact that
                                    matters and the old flow never produced one. */}
                                <View style={{ padding: 15, borderRadius: 18, backgroundColor: vm.leaveSheet.earlyExit ? t.asoft : t.ink3, borderWidth: 1, borderColor: vm.leaveSheet.earlyExit ? t.amber : t.line, marginBottom: 14 }}>
                                    <Eyebrow s={9} ls={0.12} c={t.fg3}>YOUR LAST DAY</Eyebrow>
                                    <T w={700} s={26} lh={1.1} style={{ letterSpacing: -1, marginTop: 7 }}>{vm.leaveSheet.leavingOn}</T>
                                    {vm.leaveSheet.noticeDays > 0 ? (
                                        <Eyebrow s={9} ls={0.08} c={t.fg3} style={{ marginTop: 7 }}>
                                            {`${vm.leaveSheet.noticeDays} DAYS FROM TODAY`}
                                        </Eyebrow>
                                    ) : null}
                                </View>

                                {/* Every disclosure, in the server's words. */}
                                {vm.leaveSheet.terms.map((term, i) => (
                                    <Row key={i} gap={10} align="flex-start" style={{ paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: t.line }}>
                                        <Glyph name="ellipse" size={6} color={t.fg3} style={{ marginTop: 6 }} />
                                        <T w={400} s={13} lh={1.5} c={t.fg} style={{ flex: 1 }}>{term}</T>
                                    </Row>
                                ))}

                                {vm.leaveSheet.tellsWho ? (
                                    <Eyebrow s={9} ls={0.08} c={t.fg3} style={{ marginTop: 12 }}>
                                        {`WE TELL ${vm.leaveSheet.tellsWho.toUpperCase()}`}
                                    </Eyebrow>
                                ) : null}

                                {vm.leaveSheet.hasError ? (
                                    <Row gap={8} align="flex-start" style={{ marginTop: 13, padding: 11, borderRadius: 13, backgroundColor: t.csoft }}>
                                        <Glyph name="alert-circle-outline" size={15} color={t.coral} style={{ marginTop: 1 }} />
                                        <T w={500} s={12} lh={1.45} c={t.coral} style={{ flex: 1 }}>{vm.leaveSheet.error}</T>
                                    </Row>
                                ) : null}

                                {/* Notice already given → the only action is undoing
                                    it. Offering "give notice" twice would be a second
                                    chance to do something already done. */}
                                {vm.leaveSheet.already ? (
                                    <Press
                                        onPress={vm.leaveSheet.withdraw}
                                        disabled={vm.leaveSheet.busy}
                                        style={{ marginTop: 18, paddingVertical: 15, borderRadius: 999, backgroundColor: t.lime, alignItems: 'center', opacity: vm.leaveSheet.busy ? 0.7 : 1 }}
                                    >
                                        <T w={700} s={14} c={t.on}>{vm.leaveSheet.withdrawLabel}</T>
                                    </Press>
                                ) : vm.leaveSheet.canConfirm || vm.leaveSheet.busy ? (
                                    <Press
                                        onPress={vm.leaveSheet.confirm}
                                        disabled={vm.leaveSheet.busy}
                                        style={{ marginTop: 18, paddingVertical: 15, borderRadius: 999, backgroundColor: t.csoft, borderWidth: 1, borderColor: t.coral, alignItems: 'center', opacity: vm.leaveSheet.busy ? 0.7 : 1 }}
                                    >
                                        <T w={700} s={14} c={t.coral}>{vm.leaveSheet.confirmLabel}</T>
                                    </Press>
                                ) : null}
                            </>
                        )}

                        <Press onPress={vm.leaveSheet.close} hitSlop={8} style={{ marginTop: 13, alignSelf: 'center' }}>
                            <T w={600} s={13} c={t.fg2}>{vm.leaveSheet.already ? 'Close' : 'Never mind, I am staying'}</T>
                        </Press>
                    </View>
                )}

                {/* ── Payments a tenant says they made ─────────────────── */}
                {/* The queue. These arrive in batches — rent week produces several in
                    a day — so deciding them should not mean six trips through the
                    bell. Each row taps into the decision sheet. */}
                {vm.isDeclared && vm.declaredQueue && (
                    <View>
                        <Row justify="space-between" align="flex-start" style={{ marginBottom: 16 }}>
                            <View style={{ flex: 1 }}>
                                <T w={700} s={20} lh={1.1} style={{ letterSpacing: -0.8 }}>{vm.declaredQueue.title}</T>
                                <Eyebrow s={10} ls={0.08} style={{ marginTop: 7 }}>TENANTS SAY THEY HAVE PAID</Eyebrow>
                            </View>
                            <Glyph name="cash" size={20} color={vm.declaredQueue.count ? t.lime : t.fg3} />
                        </Row>

                        {vm.declaredQueue.empty ? (
                            <View style={{ alignItems: 'center', paddingVertical: 24, paddingHorizontal: 10, marginBottom: 8 }}>
                                <View style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: t.ink3, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                                    <Glyph name="cash-outline" size={24} color={t.fg3} />
                                </View>
                                <T w={400} s={13} lh={1.5} c={t.fg2} style={{ textAlign: 'center' }}>{vm.declaredQueue.emptyLine}</T>
                            </View>
                        ) : (
                            <View>
                                {/* Money the books do not yet show — the reason to
                                    care about this queue at all. */}
                                <Row gap={9} style={{ padding: 13, borderRadius: 16, backgroundColor: t.lsoft, marginBottom: 10 }}>
                                    <Glyph name="information-circle" size={16} color={t.pos} />
                                    <T w={500} s={12} lh={1.4} c={t.pos} style={{ flex: 1 }}>{vm.declaredQueue.totalLine}</T>
                                </Row>

                                <View style={{ rowGap: 8, marginBottom: 14 }}>
                                    {vm.declaredQueue.rows.map((p) => (
                                        <Press key={p.id} onPress={p.open}>
                                            <View style={{ borderRadius: 18, backgroundColor: t.ink3, borderWidth: 1, borderColor: p.odd ? t.amber : t.line, padding: 14 }}>
                                                <Row gap={12}>
                                                    <Avatar uri={p.img} initials={p.initials} size={44} radius={15} />
                                                    <View style={{ flex: 1, minWidth: 0 }}>
                                                        <T w={600} s={15} lh={1.2} c={t.fg} numberOfLines={1}>{p.name}</T>
                                                        <T mono w={600} s={9} lh={1.4} ls={0.08} c={t.fg3} numberOfLines={1} style={{ marginTop: 4 }}>
                                                            {p.where}
                                                        </T>
                                                        <T mono w={600} s={9} lh={1.4} ls={0.06} c={t.fg3} numberOfLines={1} style={{ marginTop: 3 }}>
                                                            {`${p.method} · ${p.paidOn} · ${p.age}`}
                                                        </T>
                                                    </View>
                                                    <View style={{ alignItems: 'flex-end' }}>
                                                        <T w={700} s={17} lh={1} c={t.fg} style={{ letterSpacing: -0.5 }}>{p.amount}</T>
                                                        <Glyph name="chevron-forward" size={15} color={t.fg3} style={{ marginTop: 7 }} />
                                                    </View>
                                                </Row>
                                                {/* An amount that is not the expected one, flagged
                                                    while skimming rather than only inside the sheet. */}
                                                {p.odd && p.oddLine ? (
                                                    <Row gap={7} style={{ marginTop: 11, paddingTop: 11, borderTopWidth: 1, borderTopColor: t.line }}>
                                                        <Glyph name="alert-circle" size={13} color={t.amber} />
                                                        <T w={500} s={11.5} lh={1.3} c={t.amber} style={{ flex: 1 }}>{p.oddLine}</T>
                                                    </Row>
                                                ) : null}
                                            </View>
                                        </Press>
                                    ))}
                                </View>
                            </View>
                        )}

                        <Press onPress={vm.declaredQueue.close} style={{ width: '100%', paddingVertical: 15, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, alignItems: 'center' }}>
                            <T w={600} s={13} c={t.fg2}>Close</T>
                        </Press>
                    </View>
                )}

                {/* The decision itself. Everything it takes to answer "did this money
                    actually arrive" — amount, date, method, and the reference to check
                    against a bank statement — then Confirm or Reject. */}
                {vm.isPayDecide && vm.payDecide && (
                    <View>
                        <Row gap={13} style={{ marginBottom: 16 }}>
                            <Avatar uri={vm.payDecide.img} initials={vm.payDecide.initials} size={52} radius={18} />
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <T w={700} s={19} lh={1.15} style={{ letterSpacing: -0.6 }} numberOfLines={1}>{vm.payDecide.name}</T>
                                <Eyebrow s={9} ls={0.08} style={{ marginTop: 6 }}>{vm.payDecide.where}</Eyebrow>
                            </View>
                        </Row>

                        {/* The amount, given the weight it deserves — it is the whole
                            question. */}
                        <View style={{ padding: 16, borderRadius: 20, backgroundColor: t.ink3, borderWidth: 1, borderColor: vm.payDecide.matches === false ? t.amber : t.line, marginBottom: 8 }}>
                            <Eyebrow s={9} ls={0.12} c={t.fg3}>THEY SAY THEY PAID</Eyebrow>
                            <T w={700} s={34} lh={1} style={{ letterSpacing: -1.6, marginTop: 9 }}>{vm.payDecide.amount}</T>
                            {vm.payDecide.hasAmountNote ? (
                                <Row gap={7} align="flex-start" style={{ marginTop: 11 }}>
                                    <Glyph
                                        name={vm.payDecide.matches ? 'checkmark-circle' : 'alert-circle'}
                                        size={14}
                                        color={vm.payDecide.matches ? t.pos : t.amber}
                                        style={{ marginTop: 1 }}
                                    />
                                    <T w={500} s={12} lh={1.4} c={vm.payDecide.matches ? t.pos : t.amber} style={{ flex: 1 }}>
                                        {vm.payDecide.amountNote}
                                    </T>
                                </Row>
                            ) : null}
                        </View>

                        <View style={{ rowGap: 8, marginBottom: 14 }}>
                            <Row gap={11} style={{ padding: 13, borderRadius: 16, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                                <Glyph name="calendar-outline" size={16} color={t.accent} />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Eyebrow s={9} ls={0.1}>PAID ON</Eyebrow>
                                    <T w={600} s={13.5} lh={1} style={{ marginTop: 5 }}>{vm.payDecide.paidOn}</T>
                                </View>
                                <Eyebrow s={9} ls={0.06} c={t.fg3}>{vm.payDecide.method}</Eyebrow>
                            </Row>

                            {/* Only when there is one — a cash payment has no reference,
                                and a row reading "REFERENCE —" is worse than no row. */}
                            {vm.payDecide.hasReference ? (
                                <Row gap={11} style={{ padding: 13, borderRadius: 16, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                                    <Glyph name="barcode-outline" size={16} color={t.fg2} />
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Eyebrow s={9} ls={0.1}>REFERENCE</Eyebrow>
                                        <T mono w={600} s={12.5} lh={1.2} numberOfLines={1} style={{ marginTop: 5 }}>{vm.payDecide.reference}</T>
                                    </View>
                                </Row>
                            ) : null}

                            <Row gap={11} style={{ padding: 13, borderRadius: 16, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                                <Glyph name="time-outline" size={16} color={t.fg2} />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Eyebrow s={9} ls={0.1}>WAITING</Eyebrow>
                                    <T w={600} s={13.5} lh={1} style={{ marginTop: 5 }}>{vm.payDecide.age}</T>
                                </View>
                            </Row>
                        </View>

                        {/* A rejection is a message to somebody who believes they have
                            paid, so the note travels with it. Optional on purpose. */}
                        <TextInput
                            value={vm.payDecide.note}
                            onChangeText={vm.payDecide.setNote}
                            placeholder={vm.payDecide.notePlaceholder}
                            placeholderTextColor={t.fg3}
                            multiline
                            style={{
                                // grotesk is a FUNCTION of weight — grotesk(400) — and
                                // passing the function itself handed React Native a
                                // callable where it expected a font name. It calls
                                // .indexOf on that string while resolving the family,
                                // so the whole sheet died with "i.indexOf is not a
                                // function" the instant a landlord opened a payment to
                                // confirm it. Every other call site in the app passes a
                                // weight; this was the only one that did not.
                                fontFamily: grotesk(400),
                                fontSize: 13,
                                color: t.fg,
                                backgroundColor: t.ink3,
                                borderWidth: 1,
                                borderColor: t.line,
                                borderRadius: 16,
                                paddingHorizontal: 14,
                                paddingTop: 12,
                                paddingBottom: 12,
                                minHeight: 62,
                                textAlignVertical: 'top',
                                marginBottom: 12
                            }}
                        />

                        <Row gap={8} align="flex-start" style={{ marginBottom: 14 }}>
                            <Glyph name="information-circle-outline" size={14} color={t.fg3} style={{ marginTop: 1 }} />
                            <T w={400} s={11.5} lh={1.45} c={t.fg3} style={{ flex: 1 }}>{vm.payDecide.confirmLine}</T>
                        </Row>

                        <Row gap={8}>
                            <Press
                                onPress={vm.payDecide.reject}
                                disabled={vm.payDecide.busy}
                                style={{ flex: 1, paddingVertical: 15, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, alignItems: 'center', opacity: vm.payDecide.busy ? 0.7 : 1 }}
                            >
                                <T w={600} s={13} c={t.coral}>{vm.payDecide.rejectLabel}</T>
                            </Press>
                            <Press
                                onPress={vm.payDecide.confirm}
                                disabled={vm.payDecide.busy}
                                style={{ flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 8, paddingVertical: 15, borderRadius: 999, backgroundColor: t.lime, opacity: vm.payDecide.busy ? 0.7 : 1 }}
                            >
                                {vm.payDecide.busy ? <ActivityIndicator size="small" color={t.on} /> : <Glyph name="checkmark" size={16} color={t.on} />}
                                <T w={700} s={14} c={t.on}>{vm.payDecide.confirmLabel}</T>
                            </Press>
                        </Row>
                    </View>
                )}

                {/* ── Your landlord (tenant) ──────────────────────────── */}
                {vm.isLandlordCard && (
                    <View>
                        <View style={{ alignItems: 'center', paddingBottom: 18 }}>
                            <Avatar uri={vm.landlord.img} initials={vm.landlord.initials} size={78} radius={26} />
                            <T w={700} s={22} lh={1.15} style={{ letterSpacing: -0.8, marginTop: 14, textAlign: 'center' }}>{vm.landlord.name}</T>
                            <Eyebrow s={9} ls={0.14} c={t.accent} style={{ marginTop: 7 }}>YOUR LANDLORD</Eyebrow>
                        </View>

                        <Press onPress={vm.landlord.copyPhone}>
                            <Row gap={13} style={{ padding: 14, borderRadius: 18, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, marginBottom: 8 }}>
                                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: t.lsoft, alignItems: 'center', justifyContent: 'center' }}>
                                    <Glyph name="call-outline" size={17} color={t.pos} />
                                </View>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Eyebrow s={9} ls={0.1}>MOBILE</Eyebrow>
                                    <T w={600} s={14} lh={1} style={{ marginTop: 6 }}>{vm.landlord.phoneLabel}</T>
                                </View>
                                <Glyph name="copy-outline" size={17} color={t.fg3} />
                            </Row>
                        </Press>

                        {vm.landlord.email ? (
                            <Press onPress={vm.landlord.copyEmail}>
                                <Row gap={13} style={{ padding: 14, borderRadius: 18, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, marginBottom: 14 }}>
                                    <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: t.vsoft, alignItems: 'center', justifyContent: 'center' }}>
                                        <Glyph name="mail-outline" size={17} color={t.accent} />
                                    </View>
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <Eyebrow s={9} ls={0.1}>EMAIL</Eyebrow>
                                        <T w={600} s={14} lh={1} numberOfLines={1} style={{ marginTop: 6 }}>{vm.landlord.email}</T>
                                    </View>
                                    <Glyph name="copy-outline" size={17} color={t.fg3} />
                                </Row>
                            </Press>
                        ) : null}

                        <Row gap={8}>
                            <Press onPress={vm.closeOverlay} style={{ paddingVertical: 15, paddingHorizontal: 20, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                                <T w={600} s={13.5} c={t.fg2}>Close</T>
                            </Press>
                            <Press
                                onPress={vm.landlord.call}
                                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 8, paddingVertical: 15, borderRadius: 999, backgroundColor: t.lime }}
                            >
                                <Glyph name="call" size={16} color={t.on} />
                                <T w={700} s={14} c={t.on}>{`Call ${String(vm.landlord.name).split(' ')[0]}`}</T>
                            </Press>
                        </Row>
                    </View>
                )}

                {/* ── Notifications ───────────────────────────────────── */}
                {vm.isAlerts && (
                    <View>
                        <Row justify="space-between" align="flex-start" style={{ marginBottom: 16 }}>
                            <View style={{ flex: 1 }}>
                                <T w={700} s={20} lh={1} style={{ letterSpacing: -0.8 }}>Needs you</T>
                                <Eyebrow s={10} ls={0.08} style={{ marginTop: 7 }}>
                                    {vm.hasAlerts ? `${vm.alertCount} ${Number(vm.alertCount) === 1 ? 'THING' : 'THINGS'} TO LOOK AT` : 'ALL CLEAR'}
                                </Eyebrow>
                            </View>
                            <Glyph name={vm.hasAlerts ? 'notifications' : 'notifications-off-outline'} size={20} color={vm.hasAlerts ? t.accent : t.fg3} />
                        </Row>

                        {vm.hasAlerts ? (
                            <View style={{ rowGap: 8, marginBottom: 14 }}>
                                {vm.alerts.map((a, i) => (
                                    <Press key={i} onPress={a.go}>
                                        <Row gap={13} style={{ padding: 14, borderRadius: 18, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                                            <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: col(a.tone) === t.coral ? t.csoft : col(a.tone) === t.amber ? t.asoft : t.vsoft, alignItems: 'center', justifyContent: 'center' }}>
                                                <Glyph name={a.icon} size={17} color={col(a.tone)} />
                                            </View>
                                            <View style={{ flex: 1, minWidth: 0 }}>
                                                <T w={600} s={14} lh={1.25} c={t.fg}>{a.title}</T>
                                                <T w={400} s={12} lh={1.4} c={t.fg2} style={{ marginTop: 4 }}>{a.sub}</T>
                                            </View>
                                            <Glyph name="chevron-forward" size={16} color={t.fg3} />
                                        </Row>
                                    </Press>
                                ))}
                            </View>
                        ) : (
                            <View style={{ alignItems: 'center', paddingVertical: 26, paddingHorizontal: 10, marginBottom: 6 }}>
                                <View style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: t.lsoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                                    <Glyph name="checkmark-circle" size={26} color={t.pos} />
                                </View>
                                <T w={400} s={13} lh={1.5} c={t.fg2} style={{ textAlign: 'center' }}>{vm.alertsEmptyLine}</T>
                            </View>
                        )}

                        <Press onPress={vm.closeOverlay} style={{ paddingVertical: 15, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, alignItems: 'center' }}>
                            <T w={600} s={14} c={t.fg}>Close</T>
                        </Press>
                    </View>
                )}

                {/* ── Add a property ──────────────────────────────────── */}
                {/* ── Edit a property ────────────────────────────────── */}
                {vm.isEditProperty && vm.editProperty && (
                    <View>
                        <T w={700} s={20} lh={1} style={{ letterSpacing: -0.8 }}>{vm.editProperty.title}</T>
                        <Eyebrow s={10} ls={0.08} style={{ marginTop: 7, marginBottom: 16 }}>NAME, ADDRESS, TYPE AND PHOTO</Eyebrow>

                        <FormError form={vm.editProperty} t={t} />

                        <Field label="NAME" icon="business-outline" value={vm.editProperty.name} onChangeText={vm.editProperty.setName} placeholder="Sunrise PG" autoCapitalize="words" editable={!vm.editProperty.busy} style={{ marginBottom: 12 }} />

                        <Eyebrow s={9} ls={0.12} c={t.fg3} style={{ marginBottom: 9 }}>TYPE</Eyebrow>
                        <Chips items={vm.editProperty.types} t={t} />

                        <Field label="ADDRESS" icon="location-outline" value={vm.editProperty.address} onChangeText={vm.editProperty.setAddress} placeholder="12, 5th Cross" autoCapitalize="words" editable={!vm.editProperty.busy} style={{ marginBottom: 10 }} />
                        <Field label="LOCALITY" icon="map-outline" value={vm.editProperty.locality} onChangeText={vm.editProperty.setLocality} placeholder="Koramangala" autoCapitalize="words" editable={!vm.editProperty.busy} style={{ marginBottom: 10 }} />
                        <Field label="CITY" icon="business-outline" value={vm.editProperty.city} onChangeText={vm.editProperty.setCity} placeholder="Bengaluru" autoCapitalize="words" editable={!vm.editProperty.busy} style={{ marginBottom: 10 }} />
                        <Field label="PINCODE" icon="mail-outline" value={vm.editProperty.pincode} onChangeText={vm.editProperty.setPincode} placeholder="560034" keyboardType="number-pad" maxLength={6} editable={!vm.editProperty.busy} style={{ marginBottom: 12 }} />

                        {/* Where it is, on a map. A dashed row until it is pinned,
                            because an unpinned property is an empty state — a tenant
                            has no way to get here — not a disabled control. */}
                        <Press onPress={vm.editProperty.openPin} style={{ marginBottom: 12 }}>
                            <Row gap={11} style={{ paddingVertical: 13, paddingHorizontal: 14, borderRadius: 16, backgroundColor: vm.editProperty.pinned ? t.ink3 : t.ink2, borderWidth: 1, borderStyle: vm.editProperty.pinned ? 'solid' : 'dashed', borderColor: vm.editProperty.pinned ? t.line : t.line2 }}>
                                <Glyph name={vm.editProperty.pinned ? 'location' : 'map-outline'} size={16} color={vm.editProperty.pinned ? t.accent : t.fg3} />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <T w={600} s={13} lh={1.2} c={t.fg}>{vm.editProperty.pinLabel}</T>
                                    <T mono w={600} s={9} lh={1.5} ls={0.06} c={t.fg3} numberOfLines={1} style={{ marginTop: 3 }}>{vm.editProperty.pinned ? vm.editProperty.pinLine : vm.editProperty.pinHint}</T>
                                </View>
                                <Glyph name="chevron-forward" size={15} color={t.fg3} />
                            </Row>
                        </Press>

                        {/* The current photo shows until a new one is picked, so it is
                            obvious that leaving it alone keeps it. */}
                        {vm.editProperty.hasPhoto ? (
                            <Row gap={10} style={{ marginBottom: 12 }}>
                                <Image source={{ uri: vm.editProperty.photo }} style={{ width: 72, height: 72, borderRadius: 16, backgroundColor: t.ink3 }} resizeMode="cover" />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <T w={400} s={12} lh={1.45} c={t.fg2}>{vm.editProperty.photoNote}</T>
                                    <Row gap={8} style={{ marginTop: 9 }}>
                                        <Press onPress={vm.editProperty.takePhoto} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 11, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                                            <T w={600} s={11.5} c={t.fg2}>Take one</T>
                                        </Press>
                                        <Press onPress={vm.editProperty.pickPhoto} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 11, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                                            <T w={600} s={11.5} c={t.fg2}>Choose one</T>
                                        </Press>
                                    </Row>
                                </View>
                            </Row>
                        ) : (
                            <PhotoPick form={vm.editProperty} t={t} label="Add a photo of the building" />
                        )}

                        <FormActions form={vm.editProperty} onCancel={vm.editProperty.cancel} label="Save changes" t={t} />
                    </View>
                )}

                {/* ── Delete a property ──────────────────────────────── */}
                {vm.isDeleteProperty && vm.deleteProperty && (
                    <View>
                        <Row align="flex-start" style={{ gap: 12, marginBottom: 16 }}>
                            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: t.csoft, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                                <Glyph name="trash-outline" size={20} color={t.coral} />
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <T w={700} s={20} lh={1.15} numberOfLines={2} style={{ letterSpacing: -0.7 }}>
                                    {`Delete ${vm.deleteProperty.name}?`}
                                </T>
                                <T w={400} s={13} lh={1.5} c={t.fg2} style={{ marginTop: 7 }}>{vm.deleteProperty.line}</T>
                            </View>
                        </Row>

                        {/* Said before the request rather than after it fails. */}
                        {vm.deleteProperty.blocked ? (
                            <Row gap={9} align="flex-start" style={{ paddingVertical: 12, paddingHorizontal: 13, borderRadius: 14, backgroundColor: t.asoft, marginBottom: 14 }}>
                                <Glyph name="information-circle-outline" size={15} color={t.amber} />
                                <T w={500} s={12} lh={1.45} c={t.amber} style={{ flex: 1 }}>{vm.deleteProperty.blockedLine}</T>
                            </Row>
                        ) : null}

                        <Row style={{ gap: 8 }}>
                            <Press onPress={vm.deleteProperty.cancel} style={{ flex: 1, paddingVertical: 15, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, alignItems: 'center' }}>
                                <T w={600} s={14} lh={1} c={t.fg}>Keep it</T>
                            </Press>
                            <Press
                                onPress={vm.deleteProperty.blocked ? undefined : vm.deleteProperty.confirm}
                                disabled={vm.deleteProperty.blocked}
                                style={{ flex: 1, paddingVertical: 15, borderRadius: 999, backgroundColor: vm.deleteProperty.blocked ? t.ink3 : t.coral, borderWidth: 1, borderColor: vm.deleteProperty.blocked ? t.line : t.coral, alignItems: 'center' }}
                            >
                                <T w={700} s={14} lh={1} c={vm.deleteProperty.blocked ? t.fg3 : '#fff'}>Delete</T>
                            </Press>
                        </Row>
                    </View>
                )}

                {vm.isDemoReset && vm.demoReset && (
                    <View>
                        <Row align="flex-start" style={{ gap: 12, marginBottom: 16 }}>
                            <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: t.asoft, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                                <Glyph name="refresh-outline" size={20} color={t.amber} />
                            </View>
                            <View style={{ flex: 1, minWidth: 0 }}>
                                <T w={700} s={20} lh={1.15} numberOfLines={2} style={{ letterSpacing: -0.7 }}>Rebuild the demo?</T>
                                <T w={400} s={13} lh={1.5} c={t.fg2} style={{ marginTop: 7 }}>{vm.demoReset.line}</T>
                            </View>
                        </Row>

                        {/* Counted, not described, so it is clear what is about to go. */}
                        <Row gap={9} align="flex-start" style={{ paddingVertical: 12, paddingHorizontal: 13, borderRadius: 14, backgroundColor: t.asoft, marginBottom: 10 }}>
                            <Glyph name="information-circle-outline" size={15} color={t.amber} />
                            <T w={500} s={12} lh={1.45} c={t.amber} style={{ flex: 1 }}>{vm.demoReset.holds}</T>
                        </Row>

                        {/* The reassurance that matters if this is ever tapped by mistake. */}
                        <Row gap={9} align="flex-start" style={{ paddingVertical: 12, paddingHorizontal: 13, borderRadius: 14, backgroundColor: t.lsoft, marginBottom: 14 }}>
                            <Glyph name="shield-checkmark-outline" size={15} color={t.pos} />
                            <T w={500} s={12} lh={1.45} c={t.pos} style={{ flex: 1 }}>{vm.demoReset.safe}</T>
                        </Row>

                        <Row style={{ gap: 8 }}>
                            <Press onPress={vm.demoReset.cancel} disabled={vm.demoReset.busy} style={{ flex: 1, paddingVertical: 15, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, alignItems: 'center' }}>
                                <T w={600} s={14} lh={1} c={t.fg}>Leave it</T>
                            </Press>
                            <Press
                                onPress={vm.demoReset.busy ? undefined : vm.demoReset.confirm}
                                disabled={vm.demoReset.busy}
                                style={{ flex: 1, paddingVertical: 15, borderRadius: 999, backgroundColor: vm.demoReset.busy ? t.ink3 : t.amber, borderWidth: 1, borderColor: vm.demoReset.busy ? t.line : t.amber, alignItems: 'center' }}
                            >
                                <T w={700} s={14} lh={1} c={vm.demoReset.busy ? t.fg3 : t.on}>{vm.demoReset.busy ? 'Rebuilding\u2026' : 'Rebuild'}</T>
                            </Press>
                        </Row>
                    </View>
                )}

                {vm.isNewProperty && vm.newProperty && (
                    <View>
                        <T w={700} s={20} lh={1} style={{ letterSpacing: -0.8 }}>Add a property</T>
                        <Eyebrow s={10} ls={0.08} style={{ marginTop: 7, marginBottom: 16 }}>A BUILDING, PG OR FLAT YOU LET OUT</Eyebrow>

                        <FormError form={vm.newProperty} t={t} />

                        <Field label="NAME" icon="business-outline" value={vm.newProperty.name} onChangeText={vm.newProperty.setName} placeholder="Sunrise PG" autoCapitalize="words" editable={!vm.newProperty.busy} style={{ marginBottom: 12 }} />

                        <Eyebrow s={9} ls={0.12} c={t.fg3} style={{ marginBottom: 9 }}>TYPE</Eyebrow>
                        <Chips items={vm.newProperty.types} t={t} />

                        <Field label="ADDRESS" icon="location-outline" value={vm.newProperty.address} onChangeText={vm.newProperty.setAddress} placeholder="12, 5th Cross" autoCapitalize="words" editable={!vm.newProperty.busy} style={{ marginBottom: 10 }} />
                        <Field label="LOCALITY" icon="map-outline" value={vm.newProperty.locality} onChangeText={vm.newProperty.setLocality} placeholder="Koramangala" autoCapitalize="words" editable={!vm.newProperty.busy} style={{ marginBottom: 10 }} />
                        <Field label="CITY" icon="business-outline" value={vm.newProperty.city} onChangeText={vm.newProperty.setCity} placeholder="Bengaluru" autoCapitalize="words" editable={!vm.newProperty.busy} style={{ marginBottom: 10 }} />
                        <Field label="PINCODE" icon="mail-outline" value={vm.newProperty.pincode} onChangeText={vm.newProperty.setPincode} placeholder="560034" keyboardType="number-pad" maxLength={6} editable={!vm.newProperty.busy} style={{ marginBottom: 12 }} />

                        {/* Where it is, on a map. A dashed row until it is pinned,
                            because an unpinned property is an empty state — a tenant
                            has no way to get here — not a disabled control. */}
                        <Press onPress={vm.newProperty.openPin} style={{ marginBottom: 12 }}>
                            <Row gap={11} style={{ paddingVertical: 13, paddingHorizontal: 14, borderRadius: 16, backgroundColor: vm.newProperty.pinned ? t.ink3 : t.ink2, borderWidth: 1, borderStyle: vm.newProperty.pinned ? 'solid' : 'dashed', borderColor: vm.newProperty.pinned ? t.line : t.line2 }}>
                                <Glyph name={vm.newProperty.pinned ? 'location' : 'map-outline'} size={16} color={vm.newProperty.pinned ? t.accent : t.fg3} />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <T w={600} s={13} lh={1.2} c={t.fg}>{vm.newProperty.pinLabel}</T>
                                    <T mono w={600} s={9} lh={1.5} ls={0.06} c={t.fg3} numberOfLines={1} style={{ marginTop: 3 }}>{vm.newProperty.pinned ? vm.newProperty.pinLine : vm.newProperty.pinHint}</T>
                                </View>
                                <Glyph name="chevron-forward" size={15} color={t.fg3} />
                            </Row>
                        </Press>

                        <PhotoPick form={vm.newProperty} t={t} label="Add a photo of the building" />
                        <FormActions form={vm.newProperty} onCancel={vm.closeOverlay} label="Add property" t={t} />
                    </View>
                )}

                {/* ── Add a unit ──────────────────────────────────────── */}
                {vm.isNewUnit && vm.newUnit && (
                    <View>
                        <T w={700} s={20} lh={1} style={{ letterSpacing: -0.8 }}>Add a room</T>
                        <Eyebrow s={10} ls={0.08} style={{ marginTop: 7, marginBottom: 16 }}>
                            {vm.newUnit.noProperties ? 'ADD A PROPERTY FIRST' : `IN ${String(vm.newUnit.propertyName).toUpperCase()}`}
                        </Eyebrow>

                        <FormError form={vm.newUnit} t={t} />

                        {vm.newUnit.noProperties ? (
                            <>
                                <Row gap={9} align="flex-start" style={{ paddingVertical: 12, paddingHorizontal: 13, borderRadius: 14, backgroundColor: t.asoft, marginBottom: 14 }}>
                                    <Glyph name="information-circle-outline" size={15} color={t.amber} />
                                    <T w={500} s={12} lh={1.45} c={t.amber} style={{ flex: 1 }}>
                                        A room has to belong to a property. Add one first, then come back.
                                    </T>
                                </Row>
                                <Press onPress={vm.addProperty} style={{ paddingVertical: 15, borderRadius: 999, backgroundColor: t.lime, alignItems: 'center' }}>
                                    <T w={700} s={14} c={t.on}>Add a property</T>
                                </Press>
                            </>
                        ) : (
                            <>
                                <Eyebrow s={9} ls={0.12} c={t.fg3} style={{ marginBottom: 9 }}>PROPERTY</Eyebrow>
                                <Chips items={vm.newUnit.properties} t={t} />

                                <Field label="ROOM NUMBER" icon="grid-outline" value={vm.newUnit.number} onChangeText={vm.newUnit.setNumber} placeholder="101" autoCapitalize="characters" editable={!vm.newUnit.busy} style={{ marginBottom: 12 }} />

                                <Eyebrow s={9} ls={0.12} c={t.fg3} style={{ marginBottom: 9 }}>ROOM TYPE</Eyebrow>
                                <Chips items={vm.newUnit.roomTypes} t={t} />

                                <Field label="MONTHLY RENT" icon="cash-outline" value={vm.newUnit.rent} onChangeText={vm.newUnit.setRent} placeholder="16000" keyboardType="number-pad" editable={!vm.newUnit.busy} style={{ marginBottom: 10 }} />
                                <Field label="BEDS" icon="bed-outline" value={vm.newUnit.capacity} onChangeText={vm.newUnit.setCapacity} placeholder="1" keyboardType="number-pad" maxLength={2} editable={!vm.newUnit.busy} style={{ marginBottom: 12 }} />

                                <PhotoPick form={vm.newUnit} t={t} label="Add a photo of the room" />
                                <FormActions form={vm.newUnit} onCancel={vm.closeOverlay} label="Add room" t={t} />
                            </>
                        )}
                    </View>
                )}

                {/* ── Add a tenant ────────────────────────────────────── */}
                {vm.isNewTenant && vm.newTenant && (
                    <View>
                        <T w={700} s={20} lh={1} style={{ letterSpacing: -0.8 }}>Add a tenant</T>
                        <Eyebrow s={10} ls={0.08} style={{ marginTop: 7, marginBottom: 16 }}>NAME AND MOBILE ARE ENOUGH TO START</Eyebrow>

                        <FormError form={vm.newTenant} t={t} />

                        <Field label="FULL NAME" icon="person-outline" value={vm.newTenant.name} onChangeText={vm.newTenant.setName} placeholder="Rahul Sharma" autoCapitalize="words" editable={!vm.newTenant.busy} style={{ marginBottom: 10 }} />
                        <Field label="MOBILE" icon="call-outline" value={vm.newTenant.phone} onChangeText={vm.newTenant.setPhone} placeholder="98123 45670" keyboardType="phone-pad" maxLength={10} editable={!vm.newTenant.busy} style={{ marginBottom: 10 }} />
                        <Field label="EMAIL" icon="mail-outline" value={vm.newTenant.email} onChangeText={vm.newTenant.setEmail} placeholder="Optional" keyboardType="email-address" editable={!vm.newTenant.busy} style={{ marginBottom: 10 }} />
                        <Field label="COMPANY" icon="briefcase-outline" value={vm.newTenant.company} onChangeText={vm.newTenant.setCompany} placeholder="Optional" autoCapitalize="words" editable={!vm.newTenant.busy} style={{ marginBottom: 12 }} />

                        {vm.newTenant.hasRooms ? (
                            <>
                                <Eyebrow s={9} ls={0.12} c={t.fg3} style={{ marginBottom: 9 }}>
                                    {vm.newTenant.unassigned ? 'ROOM — OPTIONAL, CAN BE SET LATER' : 'ROOM'}
                                </Eyebrow>
                                <Chips items={vm.newTenant.rooms} t={t} />
                            </>
                        ) : null}

                        <Row gap={10} style={{ marginBottom: 12 }}>
                            <Field label="RENT" icon="cash-outline" value={vm.newTenant.rent} onChangeText={vm.newTenant.setRent} placeholder="16000" keyboardType="number-pad" editable={!vm.newTenant.busy} style={{ flex: 1 }} />
                            <Field label="DEPOSIT" icon="lock-closed-outline" value={vm.newTenant.deposit} onChangeText={vm.newTenant.setDeposit} placeholder="8000" keyboardType="number-pad" editable={!vm.newTenant.busy} style={{ flex: 1 }} />
                        </Row>

                        <PhotoPick form={vm.newTenant} t={t} label="Add their photo" />
                        <FormActions form={vm.newTenant} onCancel={vm.closeOverlay} label="Add tenant" t={t} />
                    </View>
                )}

                {/* ── Payment settings (owner) ────────────────────────── */}
                {vm.isPaySettings && vm.paySettings && (
                    <View>
                        <T w={700} s={20} lh={1} style={{ letterSpacing: -0.8 }}>Payment settings</T>
                        <T w={400} s={12.5} lh={1.45} c={t.fg2} style={{ marginTop: 7, marginBottom: 16 }}>
                            {vm.paySettings.current}
                        </T>

                        {vm.paySettings.hasError ? (
                            <Row gap={9} align="flex-start" style={{ paddingVertical: 11, paddingHorizontal: 13, borderRadius: 14, backgroundColor: t.csoft, marginBottom: 12 }}>
                                <Glyph name="alert-circle-outline" size={15} color={t.coral} />
                                <T w={500} s={12} lh={1.45} c={t.coral} style={{ flex: 1 }}>{vm.paySettings.error}</T>
                            </Row>
                        ) : null}

                        <Field
                            label="UPI ID"
                            icon="at"
                            value={vm.paySettings.upiId}
                            onChangeText={vm.paySettings.setUpiId}
                            placeholder="you@okhdfcbank"
                            editable={!vm.paySettings.busy}
                            style={{ marginBottom: 10 }}
                        />
                        <Field
                            label="UPI NUMBER"
                            icon="call-outline"
                            value={vm.paySettings.upiNumber}
                            onChangeText={vm.paySettings.setUpiNumber}
                            placeholder="10-digit mobile"
                            keyboardType="number-pad"
                            maxLength={10}
                            editable={!vm.paySettings.busy}
                            style={{ marginBottom: 14 }}
                        />

                        <Row gap={8}>
                            <Press onPress={vm.closeOverlay} style={{ paddingVertical: 15, paddingHorizontal: 20, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                                <T w={600} s={13.5} c={t.fg2}>Cancel</T>
                            </Press>
                            <Press
                                onPress={vm.paySettings.save}
                                disabled={vm.paySettings.busy}
                                style={{ flex: 1, paddingVertical: 15, borderRadius: 999, backgroundColor: t.lime, alignItems: 'center', opacity: vm.paySettings.busy ? 0.7 : 1 }}
                            >
                                <T w={700} s={14} c={t.on}>{vm.paySettings.busy ? 'Saving…' : 'Save'}</T>
                            </Press>
                        </Row>
                    </View>
                )}

                {/* ── Finish a guest profile ──────────────────────────── */}
                {/* Reached from the prompt on the tenant's own profile tab. Three
                    fields, because three is what turns a guest into an account that
                    outlives the stay: a name the landlord sees instead of
                    "Guest 7K2QFH", and an email and password to sign in with. */}
                {vm.isClaim && vm.claim && (
                    <View>
                        <T w={700} s={21} lh={1.1} style={{ letterSpacing: -0.7 }}>{vm.claim.title}</T>
                        <T w={400} s={13} lh={1.5} c={t.fg2} style={{ marginTop: 8, marginBottom: 16 }}>{vm.claim.line}</T>

                        <Field
                            label="YOUR NAME"
                            icon="person-outline"
                            value={vm.claim.name}
                            onChangeText={vm.claim.setName}
                            placeholder="Your full name"
                            autoCapitalize="words"
                            style={{ marginBottom: 10 }}
                        />
                        <Field
                            label="EMAIL"
                            icon="mail-outline"
                            value={vm.claim.email}
                            onChangeText={vm.claim.setEmail}
                            placeholder="you@gmail.com"
                            keyboardType="email-address"
                            style={{ marginBottom: 10 }}
                        />
                        <Field
                            label="CREATE A PASSWORD"
                            icon="lock-closed-outline"
                            value={vm.claim.password}
                            onChangeText={vm.claim.setPassword}
                            placeholder="At least 6 characters"
                            secure
                            onSubmitEditing={vm.claim.submit}
                            returnKeyType="go"
                            style={{ marginBottom: 14 }}
                        />

                        {vm.claim.hasError ? (
                            <Row gap={9} align="flex-start" style={{ paddingVertical: 11, paddingHorizontal: 13, borderRadius: 14, backgroundColor: t.csoft, marginBottom: 12 }}>
                                <Glyph name="alert-circle-outline" size={15} color={t.coral} />
                                <T w={500} s={12} lh={1.45} c={t.coral} style={{ flex: 1 }}>{vm.claim.error}</T>
                            </Row>
                        ) : null}

                        <Press
                            onPress={vm.claim.submit}
                            disabled={!vm.claim.canSubmit}
                            style={{ paddingVertical: 16, borderRadius: 999, backgroundColor: vm.claim.canSubmit ? t.lime : t.ink3, borderWidth: 1, borderColor: vm.claim.canSubmit ? t.lime : t.line, alignItems: 'center' }}
                        >
                            <T w={700} s={14.5} c={vm.claim.canSubmit ? t.on : t.fg3}>{vm.claim.submitLabel}</T>
                        </Press>

                        <Press onPress={vm.claim.close} style={{ marginTop: 11, paddingVertical: 13, alignItems: 'center' }}>
                            <T w={600} s={13} c={t.fg3}>Not now</T>
                        </Press>
                    </View>
                )}

                {/* ── Raise a request (tenant) ────────────────────────── */}
                {vm.isNewRequest && vm.newRequest && (
                    <View>
                        <T w={700} s={21} lh={1.1} style={{ letterSpacing: -0.7 }}>Raise a request</T>
                        <Eyebrow s={10} ls={0.08} style={{ marginTop: 7, marginBottom: 16 }}>
                            REPORT AN ISSUE TO YOUR LANDLORD
                        </Eyebrow>

                        {vm.newRequest.error ? (
                            <Row gap={9} align="flex-start" style={{ paddingVertical: 11, paddingHorizontal: 13, borderRadius: 14, backgroundColor: t.csoft, marginBottom: 12 }}>
                                <Glyph name="alert-circle-outline" size={15} color={t.coral} />
                                <T w={500} s={12} lh={1.45} c={t.coral} style={{ flex: 1 }}>{vm.newRequest.error}</T>
                            </Row>
                        ) : null}

                        <Eyebrow s={9} ls={0.12} c={t.fg3} style={{ marginBottom: 9 }}>CATEGORY</Eyebrow>
                        <Row gap={7} wrap style={{ marginBottom: 14 }}>
                            {vm.newRequest.categories.map((c) => (
                                <Press
                                    key={c.label}
                                    onPress={c.go}
                                    style={{ paddingVertical: 9, paddingHorizontal: 13, borderRadius: 999, backgroundColor: c.on ? t.lsoft : t.ink3, borderWidth: 1, borderColor: c.on ? t.accent : t.line }}
                                >
                                    <T w={600} s={12} lh={1} c={c.on ? t.accent : t.fg2}>{c.label}</T>
                                </Press>
                            ))}
                        </Row>

                        <Composer
                            value={vm.newRequest.title}
                            onChangeText={vm.newRequest.setTitle}
                            placeholder="Title (e.g. Leaking tap)"
                            editable={!vm.newRequest.busy}
                            multiline={false}
                            minHeight={50}
                            size={14}
                            style={{ paddingHorizontal: 15, marginBottom: 9 }}
                        />
                        <Composer
                            value={vm.newRequest.body}
                            onChangeText={vm.newRequest.setBody}
                            placeholder="Describe the issue (optional)"
                            editable={!vm.newRequest.busy}
                            minHeight={88}
                            maxHeight={150}
                            style={{ paddingHorizontal: 15, marginBottom: 14 }}
                        />

                        <Eyebrow s={9} ls={0.12} c={t.fg3} style={{ marginBottom: 9 }}>PRIORITY</Eyebrow>
                        <Row gap={7} style={{ marginBottom: 14 }}>
                            {vm.newRequest.priorities.map((p) => (
                                <Press
                                    key={p.label}
                                    onPress={p.go}
                                    style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 14, backgroundColor: p.on ? t.fg : t.ink3, borderWidth: 1, borderColor: p.on ? t.fg : t.line }}
                                >
                                    <T w={600} s={12.5} lh={1} c={p.on ? t.ink : t.fg2}>{p.label}</T>
                                </Press>
                            ))}
                        </Row>

                        {/* A photo of the problem — one tap, and the landlord can see
                            what you are describing. */}
                        {vm.newRequest.hasPhoto ? (
                            <Row gap={10} style={{ marginBottom: 14 }}>
                                <Image source={{ uri: vm.newRequest.photo }} style={{ width: 76, height: 76, borderRadius: 16, backgroundColor: t.ink3 }} resizeMode="cover" />
                                <View style={{ flex: 1 }}>
                                    <T w={600} s={13} lh={1.2} c={t.fg}>Photo attached</T>
                                    <Press onPress={vm.newRequest.clearPhoto} style={{ marginTop: 7 }}>
                                        <T mono w={600} s={9} ls={0.12} c={t.coral}>REMOVE</T>
                                    </Press>
                                </View>
                            </Row>
                        ) : (
                            <Row gap={8} align="stretch" style={{ marginBottom: 14 }}>
                                <Press
                                    onPress={vm.newRequest.takePhoto}
                                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 7, paddingVertical: 14, borderRadius: 16, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}
                                >
                                    <Glyph name="camera-outline" size={17} color={t.accent} />
                                    <T w={600} s={12.5} c={t.fg2}>Take a photo</T>
                                </Press>
                                <Press
                                    onPress={vm.newRequest.pickPhoto}
                                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 7, paddingVertical: 14, borderRadius: 16, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}
                                >
                                    <Glyph name="image-outline" size={17} color={t.fg2} />
                                    <T w={600} s={12.5} c={t.fg2}>Choose one</T>
                                </Press>
                            </Row>
                        )}

                        {!vm.newRequest.canSubmitAtAll ? (
                            <Row gap={9} align="flex-start" style={{ paddingVertical: 12, paddingHorizontal: 13, borderRadius: 14, backgroundColor: t.asoft, marginBottom: 12 }}>
                                <Glyph name="information-circle-outline" size={15} color={t.amber} />
                                <T w={500} s={12} lh={1.45} c={t.amber} style={{ flex: 1 }}>
                                    This is the walk-through — sign in to your tenancy to raise a real request.
                                </T>
                            </Row>
                        ) : null}

                        <Row gap={8}>
                            <Press onPress={vm.closeOverlay} style={{ paddingVertical: 15, paddingHorizontal: 20, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                                <T w={600} s={13.5} c={t.fg2}>Cancel</T>
                            </Press>
                            <Press
                                onPress={vm.newRequest.submit}
                                disabled={!vm.newRequest.canSubmit || !vm.newRequest.canSubmitAtAll}
                                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 8, paddingVertical: 15, borderRadius: 999, backgroundColor: (vm.newRequest.canSubmit && vm.newRequest.canSubmitAtAll) ? t.lime : t.ink3, borderWidth: 1, borderColor: (vm.newRequest.canSubmit && vm.newRequest.canSubmitAtAll) ? t.lime : t.line }}
                            >
                                {vm.newRequest.busy ? <ActivityIndicator size="small" color={t.on} /> : null}
                                <T w={700} s={14} c={(vm.newRequest.canSubmit && vm.newRequest.canSubmitAtAll) ? t.on : t.fg3}>
                                    {vm.newRequest.busy ? 'Submitting…' : 'Submit request'}
                                </T>
                            </Press>
                        </Row>
                    </View>
                )}

                {vm.isMenu && (
                    <View>
                        <Row style={{ gap: 13, marginBottom: 18 }}>
                            {vm.ownerImg ? (
                                <Image source={{ uri: vm.ownerImg }} style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: t.ink3 }} resizeMode="cover" />
                            ) : (
                                <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: t.lsoft, alignItems: 'center', justifyContent: 'center' }}>
                                    <Glyph name="person" size={22} color={t.accent} />
                                </View>
                            )}
                            <View style={{ flex: 1 }}>
                                <T w={600} s={16} lh={1.2} numberOfLines={1}>{vm.ownerName || 'Your account'}</T>
                                <Eyebrow s={10} ls={0.08} style={{ marginTop: 4 }} numberOfLines={1}>{(vm.ownerEmail || '').toUpperCase()}</Eyebrow>
                            </View>
                        </Row>
                        {(vm.menuRows || []).map((m, i) => (
                            <Press key={i} onPress={m.go} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, width: '100%', paddingVertical: 13, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: t.line, backgroundColor: t.ink3, marginBottom: 8 }}>
                                <View style={{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: col(m.bg) }}>
                                    <Glyph name={m.icon} size={16} color={col(m.ifg)} />
                                </View>
                                <T w={500} s={14} lh={1} c={col(m.fg)} style={{ flex: 1 }}>{m.label}</T>
                                <Glyph name="chevron-forward" size={16} color={t.fg3} />
                            </Press>
                        ))}
                    </View>
                )}
            </KeyboardScroll>
            </Animated.View>
        </View>
    );
}
