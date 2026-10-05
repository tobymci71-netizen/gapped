import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { FilmGrain } from '@/components/brand/FilmGrain';
import { SlantTag } from '@/components/brand/SlantTag';
import { Skeleton } from '@/components/Skeleton';
import { Numeral, Text } from '@/components/Text';
import { EMPTY_ROAD, type HeroView } from '@/board/present';
import { color, font, maxFontScale, space, textStyle, type } from '@/theme/tokens';
import { EDGE } from './layout';
import { RoadAhead, SCENE, sceneLeft, YOU_TAG_LEFT } from './RoadAhead';

/** The mock's hero band: the road scene's height. */
export const HERO_HEIGHT = SCENE.height;

/**
 * The position figure: "P3" at the mock's 76pt (type.position). It shrinks to
 * fit the text column rather than run under the scene, down to 40% (30pt),
 * so a five-figure position on the World board still reads whole.
 */
const POSITION = type.position;

/**
 * The placed hero's text column at its narrowest: "33.8 mi · last 7 days" in
 * Martian Mono (0.65 em a character): the figure and unit at 13pt (7
 * characters, 59pt), the window at 11pt (14, 100pt). The scene moves right on
 * a narrow phone rather than run its "You" tag under this.
 */
const TEXT_MIN = 160;
/** The absent hero's invitation may run further: there is no tag to clear. */
const ABSENT_SHARE = 0.62;

/** What to show is decided in src/board/present.ts (heroView), where it is tested. */
type Props = (HeroView | { kind: 'loading' }) & {
  /** Large text: the scene steps aside and the text takes the width. */
  compact: boolean;
};

/**
 * The viewer's own position, at the head of the Ranks list (Nightrun-Ranks).
 *
 * Placed: a huge "P3" in the wide italic, the value and window in mono, and
 * — on Distance and Drives only — the gap to the driver directly ahead, beside
 * a road scene with the tail lights of the drivers ahead. Absent (not on this
 * board, or the SAMPLE board): a calm invitation over an empty road. Loading:
 * a skeleton the shape of the placed hero.
 *
 * VoiceOver hears a placed hero as one sentence; the scene is decorative.
 */
export function BoardHero(props: Props): React.JSX.Element {
  const { compact } = props;
  const { width } = useWindowDimensions();
  if (props.kind === 'loading') {
    return (
      <View
        style={[styles.hero, styles.loading]}
        accessible
        accessibilityLabel="Loading your position"
      >
        <Skeleton style={styles.skPosition} />
        <Skeleton style={styles.skLine} />
        <Skeleton style={styles.skLineShort} />
      </View>
    );
  }

  const scene = compact ? null : props.kind === 'placed' ? props.scene : EMPTY_ROAD;
  // The scene sits right of the text, and the text may grow to meet it.
  // maxWidth is the column's whole box, its EDGE padding included.
  const left = sceneLeft(width, EDGE + TEXT_MIN + space.sm);
  const textMax =
    props.kind === 'placed'
      ? left + YOU_TAG_LEFT - space.sm
      : Math.round(width * ABSENT_SHARE);

  return (
    <View
      style={[styles.hero, compact && styles.heroCompact]}
      accessible={props.kind === 'placed'}
      accessibilityRole={props.kind === 'placed' ? 'summary' : undefined}
      accessibilityLabel={props.kind === 'placed' ? props.accessibilityLabel : undefined}
    >
      {scene ? (
        <View style={styles.scene} pointerEvents="none">
          <RoadAhead left={left} ahead={scene.ahead} leader={scene.leader} you={scene.you} />
          <FilmGrain />
        </View>
      ) : null}

      {props.kind === 'placed' ? (
        <View style={[styles.text, compact ? styles.textCompact : { maxWidth: textMax }]}>
          <Numeral
            size={POSITION.size}
            maxFontSizeMultiplier={maxFontScale.numeral}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.4}
            style={styles.position}
          >
            P{props.position}
          </Numeral>
          <Text variant="mono" style={styles.valueLine}>
            <Text variant="mono" style={styles.value}>
              {props.value}
            </Text>
            {` · ${props.period}`}
          </Text>
          {props.gap ? (
            <Text variant="mono" style={styles.gap} numberOfLines={2}>
              {props.gap}
            </Text>
          ) : null}
        </View>
      ) : (
        <View
          style={[styles.text, styles.absent, compact ? styles.textCompact : { maxWidth: textMax }]}
        >
          {props.sample ? <SlantTag label="SAMPLE" variant="white-outline" size="sm" /> : null}
          <Text variant="title" accessibilityRole="header">
            {props.title}
          </Text>
          <Text variant="mono" style={styles.detail}>
            {props.detail}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    minHeight: HERO_HEIGHT,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroCompact: { minHeight: 0, paddingVertical: space.lg },
  // The scene runs the full width under the text; the road sits right.
  scene: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  text: {
    paddingLeft: EDGE,
    paddingVertical: space.sm,
  },
  textCompact: { maxWidth: '100%', paddingRight: EDGE },
  position: { alignSelf: 'flex-start' },
  // The line takes the figure's height: iOS sets one line height per
  // paragraph, so it is given here rather than left to the nested figure.
  valueLine: { marginTop: space.xs, color: color.text3, lineHeight: type.legal.lineHeight },
  // The rows' figure size (type.legal) in the bold cut, as your own row sets
  // it: at the 11pt of the window beside it, the screen's headline value was
  // smaller than every row's.
  value: { fontFamily: font.monoBold, ...textStyle(type.legal), color: color.text1 },
  gap: { marginTop: space.xs, color: color.text3 },
  absent: { gap: space.sm },
  detail: { color: color.text3 },
  loading: { paddingLeft: EDGE, gap: space.sm },
  skPosition: { width: 124, height: POSITION.lineHeight - 12 },
  skLine: { width: 150, height: textStyle(type.mono).lineHeight - 4 },
  skLineShort: { width: 110, height: textStyle(type.mono).lineHeight - 4 },
});
