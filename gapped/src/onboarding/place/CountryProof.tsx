import React, { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { PressableScale } from '@/components/PressableScale';
import { Skeleton } from '@/components/Skeleton';
import { Numeral, Text } from '@/components/Text';
import { countryByCode, type Country } from '@/data/countries';
import { duration } from '@/theme/motion';
import { color, glyph, radius, space, textStyle, type } from '@/theme/tokens';
import type { CountryProof as Proof } from '../proofVariants';
import {
  countryInSentence,
  countryLine,
  formatCount,
  spokenCountryLine,
  type CountryLine,
} from './countryCopy';
import { countryDots, discDots } from './countryDots';
import { Crossfade } from './Crossfade';
import { DotMap } from './DotMap';
import { ChevronDownIcon } from './icons';
import { useCountUp } from './useCountUp';

/**
 * Room kept for the count line at the default text size: a hero numeral
 * (60pt line) over two lines of body (2 × 24), or a two-line title over a
 * two-line detail — whichever it is, much the same. Reserved, so the map
 * above does not resize every time the line changes variant mid-crossfade.
 * Scaled by the text size, which scales the line itself.
 */
const LINE_MIN_HEIGHT = 112;

/** The empty state's dotted disc, in cells across. */
const DISC_CELLS = 26;

/** The map's crossfade id before a country is chosen: the disc. */
const NO_COUNTRY = '';

/**
 * Ceiling on how far the count's hero numeral scales with the text size. A
 * display figure sized by its layout, as on the make proof: uncapped, a
 * six-digit count at the largest sizes was wider than the screen and broke
 * mid-number. The sentence under it scales freely.
 */
const FIGURE_MAX_SCALE = 1.3;

/**
 * The flag-only tile's glyph is a picture in a fixed 132pt circle, not text
 * anyone reads (the chip above names the country), so it scales only a little.
 */
const FLAG_TILE_MAX_SCALE = 1.5;

/**
 * The country step's body (docs/ONBOARDING.md, "Country"): the chosen country
 * in lime — which is also the way back into the sheet — its dotted map, and
 * the count line. A change of country crossfades the map and the line, and
 * the line's variant comes only from `country_activity` through
 * `countryProof`: a number when there are enough drivers behind it, the early
 * variant otherwise. Never a number made up for the occasion.
 *
 * Before a country is chosen it is the map alone, as a grey dotted disc. The
 * map keeps its place in the tree either way, so the first choice crossfades
 * the disc into the country just as every later change does, rather than
 * cutting from one to the other.
 *
 * `play` holds the count at its start until the step has arrived, so the
 * figure is seen counting rather than finishing under the push transition.
 *
 * `proof` is the step's (useCountryProof), not fetched here: the headline
 * above is worded from the same answer (countryTitle), and one fetch keeps
 * the two from ever disagreeing.
 */
export function CountryProof({
  country,
  proof,
  onChange,
  play,
}: {
  country: Country | null;
  proof: Proof | 'loading' | null;
  onChange: () => void;
  play: boolean;
}) {
  return (
    <>
      {country ? (
        <PressableScale
          onPress={onChange}
          accessibilityRole="button"
          accessibilityLabel={`Country: ${country.name}`}
          accessibilityHint="Opens the country list"
          style={styles.chip}
        >
          <Text style={styles.chipFlag} importantForAccessibility="no">
            {country.flag}
          </Text>
          <Text variant="cardTitle" style={styles.chipName} numberOfLines={2}>
            {country.name}
          </Text>
          <ChevronDownIcon color={color.text2} />
        </PressableScale>
      ) : null}
      <MapBox code={country?.code ?? NO_COUNTRY} />
      {country ? <CountLine country={country} proof={proof} play={play} /> : null}
    </>
  );
}

const DISC = discDots(DISC_CELLS);

function useBox(): [{ w: number; h: number }, (e: { nativeEvent: { layout: { width: number; height: number } } }) => void] {
  const [box, setBox] = useState({ w: 0, h: 0 });
  return [
    box,
    (e) => {
      const { width, height } = e.nativeEvent.layout;
      setBox((b) => (b.w === width && b.h === height ? b : { w: width, h: height }));
    },
  ];
}

/**
 * The map, filling whatever height the step has left, crossfading when the
 * country changes. Hidden from VoiceOver: the chip above already says which
 * country it is, and "map of Italy" adds nothing a listener can use.
 */
function MapBox({ code }: { code: string }) {
  const [box, onLayout] = useBox();
  return (
    <View style={styles.map} onLayout={onLayout} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <Crossfade id={code} style={StyleSheet.absoluteFill}>
        {(c) => <MapLayer code={c} width={box.w} height={box.h} />}
      </Crossfade>
    </View>
  );
}

function MapLayer({ code, width, height }: { code: string; width: number; height: number }) {
  // No country yet: the same dot language in the hairline grey, which the
  // first choice resolves into a country.
  if (code === NO_COUNTRY) return <DotMap dots={DISC} width={width} height={height} mainColor={color.hairline} />;
  const dots = countryDots(code);
  if (dots) return <DotMap dots={dots} width={width} height={height} />;
  // Too small for the source's 1:50m scale (Gibraltar, Bouvet Island, the US
  // Outlying Islands): the flag alone, in a tile, rather than an empty box.
  const flag = countryByCode(code)?.flag;
  return (
    <View style={[styles.flagOnly, { width, height }]}>
      <View style={styles.flagTile}>
        <Text style={styles.flagGlyph} maxFontSizeMultiplier={FLAG_TILE_MAX_SCALE}>
          {flag}
        </Text>
      </View>
    </View>
  );
}

/** One crossfade id per thing the line can say, so it fades only when the words change. */
function lineKey(code: string, proof: Proof | 'loading' | null): string {
  if (!proof || proof === 'loading') return `${code}:loading`;
  return `${code}:${proof.kind}:${proof.kind === 'early' ? '' : proof.n}`;
}

/** The inverse of lineKey, so an outgoing layer can still render what it said. */
function lineFromKey(key: string): CountryLine | null {
  const [code, kind, n] = key.split(':');
  const country = countryByCode(code);
  if (!country || kind === 'loading') return null;
  const proof: Proof =
    kind === 'yesterday' || kind === 'onBoard' ? { kind, n: Number(n) } : { kind: 'early' };
  return countryLine(proof, country);
}

function CountLine({
  country,
  proof,
  play,
}: {
  country: Country;
  proof: Proof | 'loading' | null;
  play: boolean;
}) {
  const { fontScale } = useWindowDimensions();
  const key = lineKey(country.code, proof);
  const line = lineFromKey(key);
  return (
    <View
      style={{ minHeight: LINE_MIN_HEIGHT * fontScale }}
      accessible
      accessibilityLabel={
        line ? spokenCountryLine(line) : `Counting drivers from ${countryInSentence(country)}`
      }
      accessibilityLiveRegion="polite"
    >
      <Crossfade id={key}>{(k) => <LineLayer line={lineFromKey(k)} play={play} />}</Crossfade>
    </View>
  );
}

function LineLayer({ line, play }: { line: CountryLine | null; play: boolean }) {
  if (!line) {
    // Shaped like the early variant, which is what most countries will show.
    return (
      <View style={styles.line}>
        <Skeleton style={styles.skeletonTitle} />
        <Skeleton style={styles.skeletonDetail} />
      </View>
    );
  }
  if (line.kind === 'count') return <CountedLine n={line.n} text={line.text} play={play} />;
  return (
    <View style={styles.line}>
      <Text variant="cardTitle" style={styles.center}>
        {line.text}
      </Text>
      <Text variant="body" style={styles.center}>
        {line.detail}
      </Text>
    </View>
  );
}

function CountedLine({ n, text, play }: { n: number; text: string; play: boolean }) {
  // Counts up as it arrives, the way the reference's figure ticks in, on the
  // flow's appear duration (docs/ONBOARDING.md: ease-out, 350–550 ms).
  const shown = useCountUp(n, duration.slow, play);
  return (
    <View style={styles.line}>
      <Numeral
        size={type.heroNumeral.size}
        numberOfLines={1}
        adjustsFontSizeToFit
        maxFontSizeMultiplier={FIGURE_MAX_SCALE}
        style={styles.center}
      >
        {formatCount(shown)}
      </Numeral>
      <Text variant="body" style={styles.center}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: space.sm,
    minHeight: 44,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
  },
  chipFlag: textStyle(glyph.huge),
  // flexShrink so a long name wraps inside the screen instead of pushing the
  // chevron off it.
  chipName: { color: color.accent, flexShrink: 1, textAlign: 'center' },
  map: { flex: 1, minHeight: 140 },
  flagOnly: { alignItems: 'center', justifyContent: 'center' },
  flagTile: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: color.surface1,
    borderWidth: 1,
    borderColor: color.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flagGlyph: textStyle(glyph.hero),
  line: { alignItems: 'center', gap: space.xs },
  // alignSelf so a numeral that shrinks to fit still has the line's width to fit.
  center: { textAlign: 'center', alignSelf: 'stretch' },
  skeletonTitle: { width: '70%', height: 22, marginTop: space.xs },
  skeletonDetail: { width: '85%', height: 16, marginTop: space.sm },
});
