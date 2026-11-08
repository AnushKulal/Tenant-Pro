// File: mobile/src/redesign/tourTargets.js
//
// Where the tour's light should actually fall.
//
// ── The problem with bands ───────────────────────────────────────────────────
//
// The tour lit a BAND: the header, the top of the body, the middle, the dock.
// That was a deliberate trade — a step that points at a real component means
// every component it can point at has to report its position, which is a wire
// into a dozen files for a feature that moves on, and the first screen somebody
// redesigns breaks the tour silently.
//
// It is also, as reported, not sharp. "The top 210 pixels of the body" is not
// the rent card; it is a rectangle that currently contains most of the rent
// card. It drifts the moment a screen's spacing changes, and on a screen whose
// first element is short it lights a band of mostly nothing.
//
// ── What this does instead ───────────────────────────────────────────────────
//
// A component opts in with one line. It measures itself in WINDOW coordinates —
// not parent-relative, which is what onLayout gives and which is useless for a
// full-screen overlay — and publishes that rectangle under a name. The tour
// asks for the name its current step wants.
//
// The silent-breakage worry is answered by what happens when nobody answers: a
// step whose target is not registered falls back to its band, which is exactly
// the behaviour it had before. So a screen that stops registering degrades to
// the old, coarser spotlight rather than to a highlight over nothing. There is
// no state in which the tour points at a rectangle that is not there.
//
// Targets unregister on unmount, so a rectangle measured on a screen you have
// navigated away from cannot be handed to a step about a different screen.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

const rects = new Map();
const listeners = new Set();

const emit = () => { listeners.forEach((fn) => { try { fn(); } catch (e) {} }); };

export function setTourTarget(name, rect) {
    if (!name || !rect) return;
    const prev = rects.get(name);
    // Measurement fires on every layout pass. Re-publishing an identical
    // rectangle would wake every subscriber for nothing, and during an
    // animation that is every frame.
    if (prev
        && Math.abs(prev.top - rect.top) < 0.5
        && Math.abs(prev.height - rect.height) < 0.5
        && Math.abs(prev.left - rect.left) < 0.5
        && Math.abs(prev.width - rect.width) < 0.5) return;
    rects.set(name, rect);
    emit();
}

export function clearTourTarget(name) {
    if (rects.delete(name)) emit();
}

export const getTourTarget = (name) => (name ? rects.get(name) || null : null);

/** Subscribe to the rectangle registered under `name`, or null. */
export function useTourTarget(name) {
    const [, bump] = useState(0);
    useEffect(() => {
        const fn = () => bump((n) => n + 1);
        listeners.add(fn);
        return () => listeners.delete(fn);
    }, []);
    return getTourTarget(name);
}

/**
 * Wrap the thing a tour step talks about.
 *
 *   <TourTarget name="rent-card">
 *     <RentCard />
 *   </TourTarget>
 *
 * Adds no layout of its own — it is a plain View that measures itself, so
 * wrapping something cannot change how that something looks.
 */
export function TourTarget({ name, children, style }) {
    const ref = useRef(null);

    const measure = useCallback(() => {
        const node = ref.current;
        if (!node || typeof node.measureInWindow !== 'function') return;
        node.measureInWindow((x, y, width, height) => {
            // A collapsed or off-screen measurement is not a target. Publishing
            // it would light a zero-height ring, which reads as a bug.
            if (!(width > 0) || !(height > 0)) return;
            setTourTarget(name, { left: x, top: y, width, height });
        });
    }, [name]);

    useEffect(() => () => clearTourTarget(name), [name]);

    return (
        <View ref={ref} style={style} onLayout={measure} collapsable={false}>
            {children}
        </View>
    );
}
