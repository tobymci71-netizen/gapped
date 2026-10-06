import { boxToPoints, fitInFrame, placeOnGround, pointToPoints } from '../place';
import type { ViewRender } from '../types';

// A 1000 × 500 image whose vehicle fills x 100..900, y 100..400, tyres at 400.
const R: ViewRender = {
  body: 1,
  lights: 2,
  bodySmall: 3,
  lightsSmall: 4,
  w: 1000,
  h: 500,
  box: [100, 100, 800, 300],
  groundY: 400,
  tailLights: [
    [200, 250],
    [800, 250],
  ],
};

describe('placeOnGround', () => {
  test('stands the tyres on the floor, centred, at the asked height', () => {
    const p = placeOnGround(R, { cx: 200, groundY: 300, vehicleHeight: 150 });
    expect(p.scale).toBeCloseTo(0.5);
    const box = boxToPoints(p, R.box);
    expect(box.h).toBeCloseTo(150);
    expect(box.x + box.w / 2).toBeCloseTo(200);
    expect(p.top + R.groundY * p.scale).toBeCloseTo(300);
    expect(p.width).toBeCloseTo(500);
    expect(p.height).toBeCloseTo(250);
  });

  test('a width cap shrinks it, still on the floor', () => {
    const p = placeOnGround(R, { cx: 0, groundY: 100, vehicleHeight: 300, maxWidth: 200 });
    expect(boxToPoints(p, R.box).w).toBeCloseTo(200);
    expect(p.top + R.groundY * p.scale).toBeCloseTo(100);
  });

  test('a height cap shrinks it too', () => {
    const p = placeOnGround(R, { cx: 0, groundY: 100, vehicleHeight: 300, maxHeight: 60 });
    expect(boxToPoints(p, R.box).h).toBeCloseTo(60);
  });
});

describe('fitInFrame', () => {
  test('contains the vehicle with the margin, centred', () => {
    const p = fitInFrame(R, 400, 400, 0.05);
    const box = boxToPoints(p, R.box);
    expect(box.w).toBeCloseTo(360);
    expect(box.x).toBeCloseTo(20);
    expect(box.y + box.h / 2).toBeCloseTo(200);
  });

  test('a short frame is limited by height', () => {
    const p = fitInFrame(R, 400, 100, 0);
    expect(boxToPoints(p, R.box).h).toBeCloseTo(100);
  });
});

test('points map through the placement', () => {
  const p = placeOnGround(R, { cx: 500, groundY: 400, vehicleHeight: 300 });
  expect(pointToPoints(p, [200, 250])).toEqual({ x: 200, y: 250 });
});
