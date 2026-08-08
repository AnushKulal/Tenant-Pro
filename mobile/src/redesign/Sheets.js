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
import { T, Eyebrow, Row, Press, Glyph, Field, Avatar } from './ui';
import { useSheetIn, useFadeIn } from './motion';

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
                    <TextInput
                        value={composer.value}
                        onChangeText={composer.set}
                        placeholder={placeholder}
                        placeholderTextColor={t.fg3}
                        multiline
                        editable={!composer.sending}
                        style={{
                            flex: 1,
                            minHeight: 46,
                            maxHeight: 110,
                            borderRadius: 16,
                            backgroundColor: t.ink3,
                            borderWidth: 1,
                            borderColor: t.line,
                            paddingHorizontal: 14,
                            paddingTop: 13,
                            paddingBottom: 13,
                            color: t.fg,
                            fontFamily: grotesk(400),
                            fontSize: 13.5
                        }}
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
function Chips({ items, t, wrap = true }) {
    return (
        <Row gap={7} wrap={wrap} style={{ marginBottom: 12 }}>
            {(items || []).map((c) => (
                <Press
                    key={c.label}
                    onPress={c.go}
                    style={{ paddingVertical: 9, paddingHorizontal: 13, borderRadius: 999, backgroundColor: c.on ? t.lsoft : t.ink3, borderWidth: 1, borderColor: c.on ? t.accent : t.line }}
                >
                    <T w={600} s={12} lh={1} c={c.on ? t.accent : t.fg2}>{c.label}</T>
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
    return (
        <Press
            onPress={form.pickPhoto}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 8, paddingVertical: 14, borderRadius: 16, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, marginBottom: 12 }}
        >
            <Glyph name="image-outline" size={17} color={t.fg2} />
            <T w={600} s={13} c={t.fg2}>{label}</T>
        </Press>
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
    // `animation: tpsheet .26s cubic-bezier(.2,.8,.2,1)` — slide the sheet up from
    // off-screen while the scrim fades in. Keyed on which overlay is open so each
    // sheet replays the motion (see the key on <Sheets/> usage in RedesignRoot).
    const H = Dimensions.get('window').height;
    const SHEET_MAX = Math.round(H * 0.88);
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

            <Animated.View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: SHEET_MAX }, sheetIn]}>
            <ScrollView
                bounces={false}
                style={{
                    maxHeight: SHEET_MAX,
                    backgroundColor: t.ink2,
                    borderTopLeftRadius: 28,
                    borderTopRightRadius: 28,
                    borderTopWidth: 1,
                    borderColor: t.line2
                }}
                contentContainerStyle={{ paddingTop: 10, paddingHorizontal: 18, paddingBottom: 26 + insets.bottom }}
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

                {/* ── All tickets ─────────────────────────────────────── */}
                {vm.isTickets && (
                    <View>
                        <T w={700} s={20} lh={1} style={{ letterSpacing: -0.8 }}>All tickets</T>
                        <Eyebrow s={10} ls={0.08} style={{ marginTop: 7, marginBottom: 16 }}>{`SORTED BY PRIORITY · ${vm.ticketTotal || ''}`}</Eyebrow>
                        <View style={{ gap: 8 }}>
                            {(vm.allTickets || []).map((at, i) => (
                                <View key={i} style={{ borderRadius: 20, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, padding: 14, position: 'relative', overflow: 'hidden' }}>
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
                                        <Press onPress={at.read} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 11, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                                            <T w={600} s={11} lh={1} c={t.fg}>Read</T>
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
                                </View>
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
                                <Press key={i} onPress={io.go} style={{ flex: 1, paddingVertical: 11, borderRadius: 13, alignItems: 'center', borderWidth: 1, borderColor: col(io.bd), backgroundColor: col(io.bg) }}>
                                    <T w={600} s={12} lh={1.2} c={col(io.fg)}>{io.name}</T>
                                    <T mono w={600} s={9} lh={1} ls={0.06} c={col(io.fg)} style={{ opacity: 0.62, marginTop: 5 }}>{io.code}</T>
                                </Press>
                            ))}
                        </Row>

                        <View style={{ borderRadius: 20, backgroundColor: '#FFFFFF', padding: 18, alignItems: 'center', marginBottom: 10 }}>
                            <Image source={{ uri: vm.invite.qr }} style={{ width: 196, height: 196 }} resizeMode="contain" />
                            <T w={700} s={15} lh={1} c="#0A0A0C" style={{ marginTop: 14 }}>{vm.invite.name}</T>
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
                                    <T w={600} s={13} lh={1} c={t.fg}>{mt.name}</T>
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
                        <T w={700} s={20} lh={1} style={{ letterSpacing: -0.8, marginBottom: 16 }}>{vm.payLabel || 'Pay ₹8,000'}</T>
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

                                        {j.pending ? (
                                            <Row gap={7} style={{ marginTop: 7 }}>
                                                <Press onPress={j.decline} style={{ paddingVertical: 11, paddingHorizontal: 16, borderRadius: 13, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line }}>
                                                    <T w={600} s={12} c={t.fg2}>Decline</T>
                                                </Press>
                                                <Press onPress={j.open} style={{ flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 13, backgroundColor: t.lime }}>
                                                    <T w={700} s={12.5} c={t.on}>Accept…</T>
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

                        <Eyebrow s={9} ls={0.12} c={t.fg3} style={{ marginBottom: 9 }}>PUT THEM IN A ROOM — OPTIONAL</Eyebrow>
                        {vm.joinDecide.hasRooms ? (
                            <Chips items={vm.joinDecide.rooms} t={t} />
                        ) : (
                            <Row gap={9} align="flex-start" style={{ paddingVertical: 12, paddingHorizontal: 13, borderRadius: 14, backgroundColor: t.asoft, marginBottom: 12 }}>
                                <Glyph name="information-circle-outline" size={15} color={t.amber} />
                                <T w={500} s={12} lh={1.45} c={t.amber} style={{ flex: 1 }}>{vm.joinDecide.noRoomsLine}</T>
                            </Row>
                        )}

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

                        <TextInput
                            value={vm.newRequest.title}
                            onChangeText={vm.newRequest.setTitle}
                            placeholder="Title (e.g. Leaking tap)"
                            placeholderTextColor={t.fg3}
                            editable={!vm.newRequest.busy}
                            style={{ height: 50, borderRadius: 16, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, paddingHorizontal: 15, color: t.fg, fontFamily: grotesk(500), fontSize: 14, marginBottom: 9 }}
                        />
                        <TextInput
                            value={vm.newRequest.body}
                            onChangeText={vm.newRequest.setBody}
                            placeholder="Describe the issue (optional)"
                            placeholderTextColor={t.fg3}
                            multiline
                            editable={!vm.newRequest.busy}
                            style={{ minHeight: 88, maxHeight: 150, borderRadius: 16, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, paddingHorizontal: 15, paddingTop: 14, paddingBottom: 14, color: t.fg, fontFamily: grotesk(400), fontSize: 13.5, marginBottom: 14 }}
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
                            <Press
                                onPress={vm.newRequest.pickPhoto}
                                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 8, paddingVertical: 14, borderRadius: 16, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, marginBottom: 14 }}
                            >
                                <Glyph name="camera-outline" size={17} color={t.fg2} />
                                <T w={600} s={13} c={t.fg2}>Attach a photo</T>
                            </Press>
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
            </ScrollView>
            </Animated.View>
        </View>
    );
}
