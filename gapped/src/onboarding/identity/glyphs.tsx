import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import type { Attribution } from '@/state/profile';
import { BRAND_MARKS } from './brandMarks';

/**
 * The small icons for the identity steps (username to paywall), drawn rather
 * than typed.
 *
 * The reference uses SF Symbols: line icons, round caps, one weight. These are
 * that, on a 24×24 grid with a 2pt stroke at 24pt, so they scale with the
 * size they are drawn at and sit level with the type beside them. They replace
 * the emoji the safety step used to use (docs/ONBOARDING.md, rule 2: no emoji
 * in UI chrome), and they are all decorative: every one sits next to words
 * that already say what it means, so none of them is exposed to VoiceOver.
 */

type GlyphProps = { size?: number; color: string };

/** Stroked line art on the 24×24 grid. */
function Line({
  size = 20,
  color,
  children,
}: GlyphProps & { children: (stroke: StrokeProps) => React.ReactNode }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {children({
        stroke: color,
        strokeWidth: 2,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        fill: 'none',
      })}
    </Svg>
  );
}

type StrokeProps = {
  stroke: string;
  strokeWidth: number;
  strokeLinecap: 'round';
  strokeLinejoin: 'round';
  fill: 'none';
};

/** The username step's empty avatar: a person inside a ring. */
export function PersonGlyph(p: GlyphProps) {
  return (
    <Line {...p}>
      {(s) => (
        <>
          <Circle cx={12} cy={12} r={10} {...s} />
          <Circle cx={12} cy={9.5} r={3.25} {...s} />
          <Path d="M5.75 18.75c1.3-2.15 3.6-3.5 6.25-3.5s4.95 1.35 6.25 3.5" {...s} />
        </>
      )}
    </Line>
  );
}

export function ShieldGlyph(p: GlyphProps) {
  return (
    <Line {...p}>
      {(s) => <Path d="M12 2.75 19.5 5.6v5.6c0 4.7-3.2 8.6-7.5 10.1-4.3-1.5-7.5-5.4-7.5-10.1V5.6z" {...s} />}
    </Line>
  );
}

export function ShieldCheckGlyph(p: GlyphProps) {
  return (
    <Line {...p}>
      {(s) => (
        <>
          <Path d="M12 2.75 19.5 5.6v5.6c0 4.7-3.2 8.6-7.5 10.1-4.3-1.5-7.5-5.4-7.5-10.1V5.6z" {...s} />
          <Path d="m8.75 12 2.25 2.25 4.25-4.5" {...s} />
        </>
      )}
    </Line>
  );
}

export function LockGlyph(p: GlyphProps) {
  return (
    <Line {...p}>
      {(s) => (
        <>
          <Path d="M6 10.5h12a1.5 1.5 0 0 1 1.5 1.5v7.5a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5V12A1.5 1.5 0 0 1 6 10.5z" {...s} />
          <Path d="M8 10.5v-3a4 4 0 0 1 8 0v3" {...s} />
        </>
      )}
    </Line>
  );
}

export function CheckGlyph(p: GlyphProps) {
  return <Line {...p}>{(s) => <Path d="m5 12.5 4.5 4.5L19 7.5" {...s} />}</Line>;
}

export function CloseGlyph(p: GlyphProps) {
  return <Line {...p}>{(s) => <Path d="M6.5 6.5l11 11m0-11-11 11" {...s} />}</Line>;
}

export function ArrowRightGlyph(p: GlyphProps) {
  return <Line {...p}>{(s) => <Path d="M5 12h14m-6-6 6 6-6 6" {...s} />}</Line>;
}

/** Safety: speed limits — a gauge with the needle low. */
export function GaugeGlyph(p: GlyphProps) {
  return (
    <Line {...p}>
      {(s) => (
        <>
          <Path d="M4.64 17.25A8.5 8.5 0 1 1 19.36 17.25" {...s} />
          <Path d="m12 13-3.75-3.25" {...s} />
          <Circle cx={12} cy={13} r={1} {...s} />
        </>
      )}
    </Line>
  );
}

/** Safety: only while parked — a parking sign. */
export function ParkGlyph(p: GlyphProps) {
  return (
    <Line {...p}>
      {(s) => (
        <>
          <Path d="M5.5 3.5h13a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z" {...s} />
          <Path d="M9.75 16.5v-9H13a2.75 2.75 0 0 1 0 5.5H9.75" {...s} />
        </>
      )}
    </Line>
  );
}

/** Safety: use a holder — a phone. */
export function PhoneGlyph(p: GlyphProps) {
  return (
    <Line {...p}>
      {(s) => (
        <>
          <Path d="M8 2.75h8a1.75 1.75 0 0 1 1.75 1.75v15A1.75 1.75 0 0 1 16 21.25H8a1.75 1.75 0 0 1-1.75-1.75v-15A1.75 1.75 0 0 1 8 2.75z" {...s} />
          <Path d="M10.5 18h3" {...s} />
        </>
      )}
    </Line>
  );
}

/** Safety: eyes on the road. */
export function EyeGlyph(p: GlyphProps) {
  return (
    <Line {...p}>
      {(s) => (
        <>
          <Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" {...s} />
          <Circle cx={12} cy={12} r={2.75} {...s} />
        </>
      )}
    </Line>
  );
}

/** Setup: "Your car". */
export function CarGlyph(p: GlyphProps) {
  return (
    <Line {...p}>
      {(s) => (
        <>
          <Path d="M5.25 16.5H3.5a.75.75 0 0 1-.75-.75V13c0-.7.45-1.3 1.1-1.5L6 10.75 8.1 7.4c.35-.55.95-.9 1.6-.9h4.9c.6 0 1.15.28 1.5.75l2.65 3.5 2.2.55c.7.17 1.2.8 1.2 1.5v3a.75.75 0 0 1-.75.75h-1.65M9.25 16.5h5.5" {...s} />
          <Circle cx={7.25} cy={16.5} r={2} {...s} />
          <Circle cx={16.75} cy={16.5} r={2} {...s} />
        </>
      )}
    </Line>
  );
}

/** Setup: "Your bike" — a motorbike (engine block, raked fork), not a bicycle. */
export function BikeGlyph(p: GlyphProps) {
  return (
    <Line {...p}>
      {(s) => (
        <>
          <Circle cx={5} cy={16.5} r={3.25} {...s} />
          <Circle cx={19} cy={16.5} r={3.25} {...s} />
          <Path d="M19 16.5 16 9.5h-2.25M16.9 11.6 13 12.5H9.5l-2-2h-3m5 2 1.5 4h2.5l1-4" {...s} />
        </>
      )}
    </Line>
  );
}

/** Setup: "Your drive preferences". */
export function SlidersGlyph(p: GlyphProps) {
  return (
    <Line {...p}>
      {(s) => (
        <>
          <Path d="M4 7h9m4 0h3M4 17h3m4 0h9" {...s} />
          <Circle cx={15} cy={7} r={2} {...s} />
          <Circle cx={9} cy={17} r={2} {...s} />
        </>
      )}
    </Line>
  );
}

/** Setup: "Your stats". */
export function BarsGlyph(p: GlyphProps) {
  return <Line {...p}>{(s) => <Path d="M6 19.5v-6m6 6v-14m6 14v-10" {...s} />}</Line>;
}

/** Setup: "Your rankings". */
export function TrophyGlyph(p: GlyphProps) {
  return (
    <Line {...p}>
      {(s) => (
        <>
          <Path d="M7.5 4h9v5.25a4.5 4.5 0 0 1-9 0z" {...s} />
          <Path d="M16.5 6h2.75v.5a3.75 3.75 0 0 1-3.2 3.7M7.5 6H4.75v.5a3.75 3.75 0 0 0 3.2 3.7M12 13.75v3.25m-3.25 3.25h6.5M10 17h4v3.25h-4z" {...s} />
        </>
      )}
    </Line>
  );
}

/**
 * A ticked row: lime disc, black tick. The one filled glyph in the set, because
 * "done" has to read at a glance down a list of outlines.
 */
export function DoneGlyph({ size = 20, color, tick }: GlyphProps & { tick: string }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Circle cx={12} cy={12} r={11} fill={color} />
      <Path
        d="m7.25 12.25 3.25 3.25 6.25-6.5"
        stroke={tick}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/** An answer's mark (src/onboarding/identity/brandMarks.ts), filled in one colour. */
export function BrandMark({ mark, size = 20, color }: GlyphProps & { mark: Attribution }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {BRAND_MARKS[mark].map((d) => (
        <Path key={d} d={d} fill={color} />
      ))}
    </Svg>
  );
}
