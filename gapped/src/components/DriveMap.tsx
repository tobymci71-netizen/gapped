import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform, StyleSheet, View, ViewStyle } from 'react-native';
import type { Camera, MapType, Provider, Region } from 'react-native-maps';
import { Text } from '@/components/Text';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { duration } from '@/theme/motion';
import { color } from '@/theme/tokens';

/**
 * Full-bleed map surface for the Driving tab. react-native-maps 1.27.2 is
 * bundled in Expo Go for SDK 57, so PROVIDER_DEFAULT (Apple Maps on iOS)
 * renders in the simulator with no dev build.
 *
 * We draw our own heading marker rather than showsUserLocation so the puck is
 * on-brand, and we throttle camera commands — the recorder is sampling GPS at
 * the same time and we must not compete with it for CPU.
 */

type MapsModule = typeof import('react-native-maps');
type MapInstance = InstanceType<MapsModule['default']>;

// Resolved at runtime, not statically imported: a missing/broken native module
// must degrade to an inert dark surface rather than take the bundle down. The
// type-only import above is erased, so it adds no runtime edge.
const maps: MapsModule | null = (() => {
  try {
    return require('react-native-maps') as MapsModule;
  } catch {
    return null;
  }
})();

const MapView = maps?.default ?? null;
const Marker = maps?.Marker ?? null;
const Polyline = maps?.Polyline ?? null;
const PROVIDER_DEFAULT: Provider = maps?.PROVIDER_DEFAULT;

/** Camera follow rate. One command per second, regardless of fix rate. */
const FOLLOW_INTERVAL_MS = 1000;
/** Zoom applied on first fix and on recentre() — street level, not rooftop. */
const RECENTRE_ZOOM = 16.5; // Google Maps
const RECENTRE_ALTITUDE_M = 1200; // Apple Maps
const INITIAL_DELTA = 0.012;

// Apple's muted standard is desaturated and reads well under the acid overlay;
// Google has no equivalent, so Android gets standard.
const MAP_TYPE: MapType = Platform.OS === 'ios' ? 'mutedStandard' : 'standard';

type Props = {
  /** Live position, or null before the first fix. */
  position: { lat: number; lon: number; heading: number | null } | null;
  /** Polyline of the drive currently being recorded (may be empty). */
  route: { lat: number; lon: number }[];
  /** True while a drive is recording — the camera follows the position. */
  following: boolean;
  style?: ViewStyle;
};

export type DriveMapHandle = { recentre: () => void };

export const DriveMap = forwardRef<DriveMapHandle, Props>(function DriveMap(
  { position, route, following, style },
  ref,
) {
  const reduced = useReducedMotion();
  const mapRef = useRef<MapInstance | null>(null);
  const lastMoveAt = useRef(0);
  const centred = useRef(false);
  const [ready, setReady] = useState(false);

  // Mount-time only. Null position leaves initialRegion undefined so the map
  // sits at its own default rather than snapping to 0,0.
  const [initialRegion] = useState<Region | undefined>(() =>
    position
      ? {
          latitude: position.lat,
          longitude: position.lon,
          latitudeDelta: INITIAL_DELTA,
          longitudeDelta: INITIAL_DELTA,
        }
      : undefined,
  );

  const moveCamera = useCallback(
    (lat: number, lon: number, withZoom: boolean) => {
      const map = mapRef.current;
      if (!map) return;
      const camera: Partial<Camera> = { center: { latitude: lat, longitude: lon } };
      if (withZoom) {
        camera.zoom = RECENTRE_ZOOM;
        camera.altitude = RECENTRE_ALTITUDE_M;
      }
      if (reduced) map.setCamera(camera);
      else map.animateCamera(camera, { duration: duration.slow });
    },
    [reduced],
  );

  useEffect(() => {
    if (!ready || !position) return;
    const now = Date.now();
    // First fix always frames the driver, whether or not a drive is running.
    if (!centred.current) {
      centred.current = true;
      lastMoveAt.current = now;
      moveCamera(position.lat, position.lon, true);
      return;
    }
    if (!following) return;
    if (now - lastMoveAt.current < FOLLOW_INTERVAL_MS) return;
    lastMoveAt.current = now;
    moveCamera(position.lat, position.lon, false);
  }, [ready, position, following, moveCamera]);

  useImperativeHandle(
    ref,
    () => ({
      recentre: () => {
        if (!position) return;
        lastMoveAt.current = Date.now();
        moveCamera(position.lat, position.lon, true);
      },
    }),
    [position, moveCamera],
  );

  // iOS caches the marker's rasterised view; tracking every change for the
  // first frames avoids a blank puck, after which it is pure overhead.
  const [tracksMarker, setTracksMarker] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setTracksMarker(false), 1500);
    return () => clearTimeout(t);
  }, []);

  const routeCoords = useMemo(
    () => route.map((p) => ({ latitude: p.lat, longitude: p.lon })),
    [route],
  );

  if (!MapView || !Marker || !Polyline) {
    return <MapUnavailable style={style} />;
  }

  return (
    <View style={[styles.container, style]}>
      <MapBoundary fallback={<MapUnavailable />}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          provider={PROVIDER_DEFAULT}
          mapType={MAP_TYPE}
          userInterfaceStyle="dark"
          initialRegion={initialRegion}
          onMapReady={() => setReady(true)}
          showsUserLocation={false}
          showsMyLocationButton={false}
          showsCompass={false}
          showsScale={false}
          showsBuildings={false}
          showsIndoors={false}
          showsTraffic={false}
          showsPointsOfInterests={false}
          pitchEnabled={false}
          rotateEnabled={false}
          toolbarEnabled={false}
          loadingEnabled
          loadingBackgroundColor={color.canvas}
          loadingIndicatorColor={color.accent}
        >
          {routeCoords.length > 1 && (
            <Polyline
              coordinates={routeCoords}
              strokeColor={color.accent}
              strokeWidth={4}
              lineCap="round"
              lineJoin="round"
            />
          )}
          {position && (
            <Marker
              // Swapping the arrow for the dot changes the rasterised view, and
              // tracksViewChanges is off by then — remount instead.
              key={position.heading == null ? 'puck-dot' : 'puck-arrow'}
              coordinate={{ latitude: position.lat, longitude: position.lon }}
              anchor={{ x: 0.5, y: 0.5 }}
              flat
              // Native rotation — rotating the child view instead would force a
              // marker re-rasterisation on every fix.
              rotation={position.heading ?? 0}
              tracksViewChanges={tracksMarker}
              zIndex={2}
            >
              <View style={styles.puck}>
                <View style={styles.disc} />
                {/* No bearing, no arrow: pointing north when the device has
                    not reported a course would be an invented heading. */}
                {position.heading != null ? (
                  <View style={styles.arrow} />
                ) : (
                  <View style={styles.dot} />
                )}
              </View>
            </Marker>
          )}
        </MapView>
      </MapBoundary>
    </View>
  );
});

/**
 * Honest empty surface. Deliberately not a stand-in map: inventing streets
 * would be indistinguishable from a working map that is showing the wrong
 * place.
 */
function MapUnavailable({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.container, styles.unavailable, style]}>
      <Text variant="caption" style={styles.unavailableLabel}>
        Map unavailable
      </Text>
    </View>
  );
}

type BoundaryProps = { children: React.ReactNode; fallback: React.ReactNode };

class MapBoundary extends React.Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.warn('[DriveMap] map view failed to render', error.message);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const PUCK = 42;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.canvas,
    overflow: 'hidden',
  },
  unavailable: {
    alignItems: 'center',
    justifyContent: 'center',
    // Sits clear of the drives panel that overlays the lower half.
    paddingBottom: '45%',
  },
  unavailableLabel: {
    color: color.text3,
  },
  puck: {
    width: PUCK,
    height: PUCK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disc: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: PUCK / 2,
    backgroundColor: 'rgba(10,10,10,0.72)',
    borderWidth: 1,
    borderColor: color.hairline,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: color.accent,
  },
  arrow: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 15,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: color.accent,
    // Optical centring: a triangle's visual mass sits below its bounding box.
    marginTop: -2,
  },
});
