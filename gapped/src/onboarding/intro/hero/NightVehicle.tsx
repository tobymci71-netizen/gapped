import {
  BlurMask,
  Circle,
  Group,
  LinearGradient,
  Oval,
  Path,
  Rect,
  RoundedRect,
  vec,
  type Transforms3d,
} from '@shopify/react-native-skia';
import React from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { pigment, tint } from './pigments';

/**
 * A vehicle seen from behind at night, as Skia elements: the welcome hero's
 * car (Nightrun-Welcome, drawn as the mock draws it) and a motorbike in the
 * same light, for someone who has said they ride.
 *
 * Both are drawn in one local frame, 200 wide with the ground at y ≈ 124 and
 * the centreline at x = 100; the parent places and scales the group. No
 * manufacturer is drawn: a generic shape, as CarSilhouette is.
 *
 * Only the lights are red, and only the lights glow. `lit` brings the tail
 * lights on (the hero's ignite flicker); `halo` breathes their glow; `streak`
 * is the anamorphic flare a camera draws across a bright light at night.
 * `roll` turns the body (not the tyres, which stay planted) about a point
 * near axle height: the cornering demo's body roll.
 */

type Animated<T> = T | SharedValue<T>;

export type NightVehicleProps = {
  lit?: Animated<number>;
  halo?: Animated<number>;
  streak?: Animated<number>;
  roll?: Animated<Transforms3d>;
  /**
   * A faint edge round the body and tyres, for a car drawn on the bare night
   * (the cornering gauge) rather than against a lit road: the rim light
   * alone leaves the lower body and the tyres black on black.
   */
  outline?: boolean;
};

/** The point the body rolls about, in the vehicle's frame. */
export const ROLL_ORIGIN = vec(100, 100);
/** A motorbike leans about its contact patch. */
const BIKE_ROLL_ORIGIN = vec(100, 124);

/**
 * The origin to hand a Group whose transform may be absent. Skia 2.x
 * restores the canvas after any group with an `origin`, but only saves it
 * when there is a transform, a matrix, a clip or a layer: an origin with no
 * transform pops the PARENT's save, and everything drawn after it loses the
 * parent's transform (seen in a headless render: the hero's reticle and
 * flare drawn in raw scene coordinates). So no transform, no origin.
 */
function originFor(roll: NightVehicleProps['roll'], origin: ReturnType<typeof vec>) {
  return roll === undefined ? undefined : origin;
}

/** A polygon from flat x, y pairs, as an SVG path. */
export const poly = (pts: readonly number[]): string => {
  let d = `M${pts[0]} ${pts[1]}`;
  for (let i = 2; i < pts.length; i += 2) d += ` L${pts[i]} ${pts[i + 1]}`;
  return `${d} Z`;
};

/** The anamorphic red streak through a tail light, as the mock's #wAnaR. */
function Streak({
  x,
  y,
  w,
  h,
  blur,
  opacity,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  blur?: number;
  opacity: number;
}) {
  return (
    <Rect x={x} y={y} width={w} height={h} opacity={opacity}>
      <LinearGradient
        start={vec(x, 0)}
        end={vec(x + w, 0)}
        colors={[tint(pigment.red, 0), pigment.redHot, tint(pigment.red, 0)]}
        positions={[0, 0.5, 1]}
      />
      {blur ? <BlurMask blur={blur} style="normal" /> : null}
    </Rect>
  );
}

// ─── The car ─────────────────────────────────────────────────────────────────

const CAR_BODY =
  'M6 104 C3 92 1 78 2 66 C3 57 8 51 18 49 L42 46 L60 15 C62 11 66 9 72 9 L128 9 C134 9 138 11 140 15 L158 46 L182 49 C192 51 197 57 198 66 C199 78 197 92 194 104 Z';
const CAR_LAMP_L = [8, 55, 58, 52, 62, 56.5, 60, 62.5, 34, 63.5, 32, 59.5, 9, 61.5];
const CAR_LAMP_R = [192, 55, 142, 52, 138, 56.5, 140, 62.5, 166, 63.5, 168, 59.5, 191, 61.5];

function CarRear({ lit = 1, halo = 1, streak = 1, roll, outline = false }: NightVehicleProps) {
  return (
    <>
      {/* Planted: the contact shadow and the tyres. */}
      <Oval x={-6} y={118} width={212} height={11} color={tint(pigment.shadow, 0.9)}>
        <BlurMask blur={4} style="normal" />
      </Oval>
      <RoundedRect x={11} y={86} width={35} height={39} r={6} color={pigment.tyre} />
      <RoundedRect x={154} y={86} width={35} height={39} r={6} color={pigment.tyre} />
      {outline ? (
        <>
          <RoundedRect
            x={11}
            y={86}
            width={35}
            height={39}
            r={6}
            style="stroke"
            strokeWidth={1}
            color={tint(pigment.exhaustRim, 0.7)}
          />
          <RoundedRect
            x={154}
            y={86}
            width={35}
            height={39}
            r={6}
            style="stroke"
            strokeWidth={1}
            color={tint(pigment.exhaustRim, 0.7)}
          />
        </>
      ) : null}

      <Group transform={roll} origin={originFor(roll, ROLL_ORIGIN)}>
        <Path path="M20 49 L5 44.5 Q2 44 2.5 47.5 L4 51 Z" color={pigment.mirror} />
        <Path path="M180 49 L195 44.5 Q198 44 197.5 47.5 L196 51 Z" color={pigment.mirror} />
        <Path path={CAR_BODY}>
          <LinearGradient
            start={vec(0, 9)}
            end={vec(0, 104)}
            colors={[pigment.bodyTop, pigment.bodyMid, pigment.bodyLow]}
            positions={[0, 0.42, 1]}
          />
        </Path>
        {outline ? (
          <Path
            path={CAR_BODY}
            style="stroke"
            strokeWidth={1.2}
            strokeJoin="round"
            color={tint(pigment.rimLight, 0.4)}
          />
        ) : null}
        <Path path="M66 16 L134 16 L152 44 L48 44 Z">
          <LinearGradient
            start={vec(0, 16)}
            end={vec(0, 44)}
            colors={[pigment.glassTop, pigment.glassLow]}
          />
        </Path>
        <Path path="M86 16 L99 16 L79 44 L64 44 Z" color={tint(pigment.glassGlare, 0.07)} />
        {/* The sky caught along the roof and the shoulders: the only light on the body. */}
        <Path
          path="M60 15 C62 11 66 9 72 9 L128 9 C134 9 138 11 140 15"
          style="stroke"
          strokeWidth={1.1}
          color={tint(pigment.rimLight, 0.65)}
        />
        <Path
          path="M3 72 C3 59 9 51 19 49.5 L43 46.6"
          style="stroke"
          strokeWidth={1}
          color={tint(pigment.shoulderLight, 0.38)}
        />
        <Path
          path="M197 72 C197 59 191 51 181 49.5 L157 46.6"
          style="stroke"
          strokeWidth={1}
          color={tint(pigment.shoulderLight, 0.38)}
        />
        <Path
          path="M44 48 Q100 43.5 156 48"
          style="stroke"
          strokeWidth={1.4}
          color={pigment.shutline}
        />
        {/* The tail lights' own glow on the boot lid. */}
        <Group opacity={lit}>
          <Oval x={2} y={56} width={196} height={32} color={tint(pigment.red, 0.08)} />
        </Group>
        <RoundedRect x={80} y={68} width={40} height={11} r={1.5} color={pigment.plate} />
        <RoundedRect
          x={80}
          y={68}
          width={40}
          height={11}
          r={1.5}
          style="stroke"
          strokeWidth={0.6}
          color={pigment.plateEdge}
        />
        <Path path="M24 92 L176 92 L171 106 L29 106 Z" color={pigment.diffuser} />
        <Path
          path="M84 93.5 V105 M92 93.5 V105 M108 93.5 V105 M116 93.5 V105"
          style="stroke"
          strokeWidth={0.8}
          color={pigment.fins}
        />
        <Path path="M26 92 H174" style="stroke" strokeWidth={0.8} color={tint(pigment.red, 0.25)} />
        {[41, 53, 147, 159].map((cx) => (
          <React.Fragment key={cx}>
            <Circle cx={cx} cy={99} r={4.3} color={pigment.exhaust} />
            <Circle
              cx={cx}
              cy={99}
              r={4.3}
              style="stroke"
              strokeWidth={0.9}
              color={pigment.exhaustRim}
            />
          </React.Fragment>
        ))}

        {/* The lights. */}
        <Group opacity={lit}>
          <Group opacity={halo}>
            <Oval x={-8} y={43} width={84} height={30} color={tint(pigment.red, 0.38)}>
              <BlurMask blur={10} style="normal" />
            </Oval>
            <Oval x={124} y={43} width={84} height={30} color={tint(pigment.red, 0.38)}>
              <BlurMask blur={10} style="normal" />
            </Oval>
          </Group>
          <Path path={poly(CAR_LAMP_L)} color={pigment.redBright}>
            <BlurMask blur={4} style="normal" />
          </Path>
          <Path path={poly(CAR_LAMP_R)} color={pigment.redBright}>
            <BlurMask blur={4} style="normal" />
          </Path>
          <Path path={poly(CAR_LAMP_L)} color={pigment.red} />
          <Path path={poly(CAR_LAMP_R)} color={pigment.red} />
          <Path
            path="M12 57.6 L56 54.8 L58.5 57.6 L56.8 60.6 L37 61.2"
            style="stroke"
            strokeWidth={1.1}
            strokeCap="round"
            strokeJoin="round"
            color={pigment.redCore}
          />
          <Path
            path="M188 57.6 L144 54.8 L141.5 57.6 L143.2 60.6 L163 61.2"
            style="stroke"
            strokeWidth={1.1}
            strokeCap="round"
            strokeJoin="round"
            color={pigment.redCore}
          />
          <Group opacity={streak}>
            <Streak x={-95} y={55.5} w={260} h={4} blur={2} opacity={0.28} />
            <Streak x={35} y={55.5} w={260} h={4} blur={2} opacity={0.28} />
            <Streak x={-75} y={57.1} w={220} h={0.9} opacity={0.8} />
            <Streak x={55} y={57.1} w={220} h={0.9} opacity={0.8} />
          </Group>
        </Group>
      </Group>
    </>
  );
}

// ─── The motorbike ───────────────────────────────────────────────────────────

/** Tank and seat unit from behind: wide at the tank, tapering to the tail. */
const BIKE_TANK = 'M72 50 C73 36 86 29 100 29 C114 29 127 36 128 50 L122 62 L78 62 Z';
const BIKE_TAIL = 'M80 58 C82 50 90 46 100 46 C110 46 118 50 120 58 L114 70 L86 70 Z';
const BIKE_FLANKS = 'M68 66 C66 78 72 92 84 98 L116 98 C128 92 134 78 132 66 L118 70 L82 70 Z';
const BIKE_LAMP = [84, 66, 116, 66, 112, 70.5, 88, 70.5];

function BikeRear({ lit = 1, halo = 1, streak = 1, roll }: NightVehicleProps) {
  return (
    <>
      <Oval x={52} y={119} width={96} height={9} color={tint(pigment.shadow, 0.9)}>
        <BlurMask blur={4} style="normal" />
      </Oval>
      <Group transform={roll} origin={originFor(roll, BIKE_ROLL_ORIGIN)}>
        {/* The rear tyre, end on, and the hugger over it. */}
        <RoundedRect x={90} y={84} width={20} height={41} r={8} color={pigment.tyre} />
        <Path path="M92 84 L108 84 L106 92 L94 92 Z" color={pigment.bodyMid} />
        {/* Bars and mirrors, wide at the top. */}
        <Path
          path="M54 36 L146 36"
          style="stroke"
          strokeWidth={3}
          strokeCap="round"
          color={pigment.mirror}
        />
        <Path
          path="M58 36 L50 26 M142 36 L150 26"
          style="stroke"
          strokeWidth={1.4}
          color={pigment.mirror}
        />
        <Oval x={38} y={19} width={20} height={11} color={pigment.mirror} />
        <Oval x={142} y={19} width={20} height={11} color={pigment.mirror} />
        <Path
          path="M40 22 Q48 18 56 22"
          style="stroke"
          strokeWidth={0.9}
          color={tint(pigment.shoulderLight, 0.4)}
        />
        <Path
          path="M144 22 Q152 18 160 22"
          style="stroke"
          strokeWidth={0.9}
          color={tint(pigment.shoulderLight, 0.4)}
        />
        <Path path={BIKE_FLANKS}>
          <LinearGradient
            start={vec(0, 66)}
            end={vec(0, 98)}
            colors={[pigment.bodyMid, pigment.bodyLow]}
          />
        </Path>
        <Path path={BIKE_TANK}>
          <LinearGradient
            start={vec(0, 29)}
            end={vec(0, 62)}
            colors={[pigment.bodyTop, pigment.bodyMid]}
          />
        </Path>
        <Path
          path="M74 48 C75 37 87 30 100 30 C113 30 125 37 126 48"
          style="stroke"
          strokeWidth={1.1}
          color={tint(pigment.rimLight, 0.6)}
        />
        <Path path={BIKE_TAIL}>
          <LinearGradient
            start={vec(0, 46)}
            end={vec(0, 70)}
            colors={[pigment.bodyTop, pigment.bodyLow]}
          />
        </Path>
        <Path
          path="M82 57 C84 50 91 47 100 47 C109 47 116 50 118 57"
          style="stroke"
          strokeWidth={0.9}
          color={tint(pigment.shoulderLight, 0.45)}
        />
        {/* Indicators, off: dark stalks either side of the plate. */}
        <RoundedRect x={70} y={74} width={12} height={4} r={2} color={pigment.mirror} />
        <RoundedRect x={118} y={74} width={12} height={4} r={2} color={pigment.mirror} />
        <RoundedRect x={88} y={72} width={24} height={17} r={1.5} color={pigment.plate} />
        <RoundedRect
          x={88}
          y={72}
          width={24}
          height={17}
          r={1.5}
          style="stroke"
          strokeWidth={0.6}
          color={pigment.plateEdge}
        />
        {/* The silencer, low on the right. */}
        <RoundedRect x={124} y={80} width={18} height={15} r={6} color={pigment.exhaust} />
        <RoundedRect
          x={124}
          y={80}
          width={18}
          height={15}
          r={6}
          style="stroke"
          strokeWidth={0.9}
          color={pigment.exhaustRim}
        />

        <Group opacity={lit}>
          <Oval x={52} y={55} width={96} height={26} color={tint(pigment.red, 0.1)} />
          <Group opacity={halo}>
            <Oval x={64} y={56} width={72} height={24} color={tint(pigment.red, 0.38)}>
              <BlurMask blur={10} style="normal" />
            </Oval>
          </Group>
          <Path path={poly(BIKE_LAMP)} color={pigment.redBright}>
            <BlurMask blur={4} style="normal" />
          </Path>
          <Path path={poly(BIKE_LAMP)} color={pigment.red} />
          <Path
            path="M88 67.6 L112 67.6"
            style="stroke"
            strokeWidth={1.1}
            strokeCap="round"
            color={pigment.redCore}
          />
          <Group opacity={streak}>
            <Streak x={-30} y={66.2} w={260} h={4} blur={2} opacity={0.28} />
            <Streak x={-10} y={67.8} w={220} h={0.9} opacity={0.8} />
          </Group>
        </Group>
      </Group>
    </>
  );
}

/** The rear of the person's vehicle: their kind, a car until they say otherwise. */
export function NightVehicleRear({
  kind,
  ...props
}: NightVehicleProps & { kind: 'car' | 'motorbike' }) {
  return kind === 'motorbike' ? <BikeRear {...props} /> : <CarRear {...props} />;
}

/**
 * Where each vehicle's tail lights land on a wet road, as polygons in the
 * hero scene's coordinates (the car sits at translate(105, 374) scale 0.9).
 * Long and thin: a reflection on wet tarmac stretches toward the camera.
 */
export const ROAD_REFLECTIONS: Record<'car' | 'motorbike', readonly (readonly number[])[]> = {
  car: [
    [116, 490, 158, 490, 150, 600, 124, 600],
    [232, 490, 274, 490, 266, 600, 240, 600],
    [133, 490, 139, 490, 139, 576, 133, 576],
    [251, 490, 257, 490, 257, 576, 251, 576],
  ],
  motorbike: [
    [178, 490, 212, 490, 206, 600, 184, 600],
    [192, 490, 198, 490, 198, 576, 192, 576],
  ],
};
