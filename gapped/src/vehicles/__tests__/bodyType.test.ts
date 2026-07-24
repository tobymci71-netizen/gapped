import { allMakes, modelsForMake, popularMakes } from '../catalog';
import type { BodyType } from '../bodyType';
import { bodyTypeLabel, inferBodyType } from '../bodyType';

const CAR_BODIES: BodyType[] = [
  'hatchback',
  'saloon',
  'estate',
  'coupe',
  'roadster',
  'supercar',
  'suv',
  'pickup',
  'van',
];
const BIKE_BODIES: BodyType[] = ['motorbike', 'cruiser', 'scooter'];

describe('curated model overrides', () => {
  const cases: Array<[string, string, BodyType]> = [
    ['Volkswagen', 'Golf', 'hatchback'],
    ['Volkswagen', 'Golf R', 'hatchback'],
    ['Volkswagen', 'Golf SportWagen', 'estate'],
    ['Volkswagen', 'Touareg', 'suv'],
    ['Volkswagen', 'ID. Buzz', 'van'],
    ['Mazda', 'MX-5', 'roadster'],
    ['Mazda', 'Miata', 'roadster'],
    ['Mazda', 'CX-5', 'suv'],
    ['Mazda', 'RX-7', 'coupe'],
    ['Land Rover', 'Range Rover', 'suv'],
    ['Ford', 'F-150', 'pickup'],
    ['Ford', 'Transit', 'van'],
    ['Ford', 'Mustang', 'coupe'],
    ['Ford', 'GT', 'supercar'],
    ['Porsche', '911', 'coupe'],
    ['Porsche', 'Boxster', 'roadster'],
    ['Porsche', 'Cayenne', 'suv'],
    ['Porsche', 'Panamera', 'saloon'],
    ['Tesla', 'Model 3', 'saloon'],
    ['Tesla', 'Model Y', 'suv'],
    ['Tesla', 'Cybertruck', 'pickup'],
    ['Lamborghini', 'Huracan', 'supercar'],
    ['Lamborghini', 'Urus', 'suv'],
    ['Ferrari', 'Purosangue', 'suv'],
    ['Toyota', 'Hilux', 'pickup'],
    ['Toyota', 'RAV4', 'suv'],
    ['Honda', 'Civic', 'hatchback'],
    ['Honda', 'S2000', 'roadster'],
    ['Honda', 'Odyssey', 'van'],
    ['Nissan', 'GT-R', 'coupe'],
    ['Subaru', 'Outback', 'estate'],
    ['Jeep', 'Comanche', 'pickup'],
  ];

  test.each(cases)('%s %s', (make, model, expected) => {
    expect(inferBodyType('car', make, model)).toBe(expected);
  });
});

describe('make-level defaults', () => {
  test('supercar-only marques', () => {
    expect(inferBodyType('car', 'Ferrari', 'F40')).toBe('supercar');
    expect(inferBodyType('car', 'Lamborghini', 'Revuelto')).toBe('supercar');
    expect(inferBodyType('car', 'Mclaren', '720S')).toBe('supercar');
    expect(inferBodyType('car', 'Bugatti', 'Chiron')).toBe('supercar');
  });

  test('SUV-only marques', () => {
    expect(inferBodyType('car', 'Land Rover', 'Discovery')).toBe('suv');
    expect(inferBodyType('car', 'Jeep', 'Wrangler JK')).toBe('suv');
    expect(inferBodyType('car', 'Hummer', 'H2')).toBe('suv');
  });

  test('single-shape outliers', () => {
    expect(inferBodyType('car', 'Morgan', 'Plus Four')).toBe('roadster');
    expect(inferBodyType('car', 'RAM', '1500')).toBe('pickup');
  });

  test('a model override beats the make default', () => {
    expect(inferBodyType('car', 'Ferrari', 'Purosangue')).toBe('suv');
    expect(inferBodyType('car', 'Jeep', 'J-10')).toBe('pickup');
    // Lamborghini's open-top halo car stays a supercar, not a generic roadster
    expect(inferBodyType('car', 'Lamborghini', 'Roadster')).toBe('supercar');
    expect(inferBodyType('car', 'Tesla', 'Roadster')).toBe('roadster');
  });
});

describe('alphanumeric naming schemes', () => {
  test('BMW series digit drives the shape', () => {
    expect(inferBodyType('car', 'BMW', '320i')).toBe('saloon');
    expect(inferBodyType('car', 'BMW', '128i')).toBe('hatchback');
    expect(inferBodyType('car', 'BMW', '440i')).toBe('coupe');
    expect(inferBodyType('car', 'BMW', 'M340i')).toBe('saloon');
    expect(inferBodyType('car', 'BMW', 'X5')).toBe('suv');
    expect(inferBodyType('car', 'BMW', 'Z4')).toBe('roadster');
    expect(inferBodyType('car', 'BMW', 'i8')).toBe('supercar');
    expect(inferBodyType('car', 'BMW', 'iX')).toBe('suv');
  });

  test('Audi Q/A/RS scheme', () => {
    expect(inferBodyType('car', 'Audi', 'Q7')).toBe('suv');
    expect(inferBodyType('car', 'Audi', 'SQ5')).toBe('suv');
    expect(inferBodyType('car', 'Audi', 'A4')).toBe('saloon');
    expect(inferBodyType('car', 'Audi', 'A3')).toBe('hatchback');
    expect(inferBodyType('car', 'Audi', 'RS 6 Avant')).toBe('estate');
    expect(inferBodyType('car', 'Audi', 'A6 allroad')).toBe('estate');
    expect(inferBodyType('car', 'Audi', 'R8')).toBe('supercar');
    expect(inferBodyType('car', 'Audi', 'TT')).toBe('coupe');
  });

  test('Mercedes class letters', () => {
    expect(inferBodyType('car', 'Mercedes-Benz', 'C-Class')).toBe('saloon');
    expect(inferBodyType('car', 'Mercedes-Benz', 'GLE-Class')).toBe('suv');
    expect(inferBodyType('car', 'Mercedes-Benz', 'G-Class')).toBe('suv');
    expect(inferBodyType('car', 'Mercedes-Benz', 'EQS-Class SUV')).toBe('suv');
    expect(inferBodyType('car', 'Mercedes-Benz', 'SL-Class')).toBe('roadster');
    expect(inferBodyType('car', 'Mercedes-Benz', 'Sprinter')).toBe('van');
  });

  test('Volvo and Lexus letter prefixes', () => {
    expect(inferBodyType('car', 'Volvo', 'XC90')).toBe('suv');
    expect(inferBodyType('car', 'Volvo', 'V60')).toBe('estate');
    expect(inferBodyType('car', 'Volvo', 'S90')).toBe('saloon');
    expect(inferBodyType('car', 'Lexus', 'RX')).toBe('suv');
    expect(inferBodyType('car', 'Lexus', 'IS')).toBe('saloon');
    expect(inferBodyType('car', 'Lexus', 'LC')).toBe('coupe');
  });

  test('the same shorthand means different things at different marques', () => {
    expect(inferBodyType('car', 'Lexus', 'RX')).toBe('suv');
    expect(inferBodyType('car', 'Subaru', 'RX')).toBe('saloon');
    expect(inferBodyType('car', 'Lexus', 'NX')).toBe('suv');
    expect(inferBodyType('car', 'Nissan', 'NX')).toBe('coupe');
  });
});

describe('keyword heuristics', () => {
  const cases: Array<[string, BodyType]> = [
    ['Whatever Wagon', 'estate'],
    ['Something Touring', 'estate'],
    ['Mystery Variant', 'estate'],
    ['Unknown Crossover', 'suv'],
    ['Unknown SUV', 'suv'],
    ['Some Pickup', 'pickup'],
    ['Some Truck', 'pickup'],
    ['Grand Caravan', 'van'],
    ['Big Minivan', 'van'],
    ['Something Coupe', 'coupe'],
    ['Something Convertible', 'roadster'],
    ['Something Cabriolet', 'roadster'],
    ['Something Sportback', 'hatchback'],
    ['Something Sedan', 'saloon'],
  ];

  test.each(cases)('%s -> %s', (model, expected) => {
    expect(inferBodyType('car', 'Unknown Marque', model)).toBe(expected);
  });

  test('van wins over estate when both words appear', () => {
    expect(inferBodyType('car', 'Dodge', 'Ram Wagon')).toBe('van');
  });

  test('a trim suffix does not derail the base model', () => {
    expect(inferBodyType('car', 'Ford', 'Explorer Sport')).toBe('suv');
    expect(inferBodyType('car', 'Ford', 'Expedition EL')).toBe('suv');
    expect(inferBodyType('car', 'Rolls-Royce', 'Touring Limousine')).toBe('saloon');
  });
});

describe('motorbikes', () => {
  test('cruisers', () => {
    expect(inferBodyType('motorbike', 'Harley-Davidson', 'Street Glide')).toBe('cruiser');
    expect(inferBodyType('motorbike', 'Harley-Davidson', 'Fat Boy 114')).toBe('cruiser');
    expect(inferBodyType('motorbike', 'Yamaha', 'V Star 1100')).toBe('cruiser');
    expect(inferBodyType('motorbike', 'Suzuki', 'Boulevard C50')).toBe('cruiser');
    expect(inferBodyType('motorbike', 'Kawasaki', 'Vulcan S')).toBe('cruiser');
    expect(inferBodyType('motorbike', 'Honda', 'Rebel 500')).toBe('cruiser');
    expect(inferBodyType('motorbike', 'Triumph', 'Bonneville Bobber')).toBe('cruiser');
    expect(inferBodyType('motorbike', 'Moto Guzzi', 'V7 III Stone')).toBe('cruiser');
    expect(inferBodyType('motorbike', 'Ducati', 'XDiavel')).toBe('cruiser');
  });

  test('scooters', () => {
    expect(inferBodyType('motorbike', 'Vespa', 'GTS 300')).toBe('scooter');
    expect(inferBodyType('motorbike', 'Piaggio', 'Liberty 125')).toBe('scooter');
    expect(inferBodyType('motorbike', 'Honda', 'PCX')).toBe('scooter');
    expect(inferBodyType('motorbike', 'Honda', 'NSS300 (Forza)')).toBe('scooter');
    expect(inferBodyType('motorbike', 'Yamaha', 'XMAX 300')).toBe('scooter');
    expect(inferBodyType('motorbike', 'Yamaha', 'TMAX 530')).toBe('scooter');
    expect(inferBodyType('motorbike', 'Suzuki', 'Burgman 400')).toBe('scooter');
    expect(inferBodyType('motorbike', 'BMW', 'C 650 GT')).toBe('scooter');
    expect(inferBodyType('motorbike', 'BMW', 'CE 04')).toBe('scooter');
    // capacity suffixes must not break the keyword boundary
    expect(inferBodyType('motorbike', 'Honda', 'PCX125')).toBe('scooter');
    expect(inferBodyType('motorbike', 'Honda', 'ADV150')).toBe('scooter');
  });

  test('BMW boxer cruisers are not lumped in with the GS range', () => {
    expect(inferBodyType('motorbike', 'BMW', 'R 18 Classic')).toBe('cruiser');
    expect(inferBodyType('motorbike', 'BMW', 'R 1200 C')).toBe('cruiser');
    expect(inferBodyType('motorbike', 'BMW', 'R 1200 GS')).toBe('motorbike');
  });

  test('everything else is a plain motorbike', () => {
    expect(inferBodyType('motorbike', 'Kawasaki', 'Ninja ZX-6R')).toBe('motorbike');
    expect(inferBodyType('motorbike', 'Yamaha', 'MT-09')).toBe('motorbike');
    expect(inferBodyType('motorbike', 'Ducati', 'Panigale V4')).toBe('motorbike');
    expect(inferBodyType('motorbike', 'BMW', 'R 1250 GS')).toBe('motorbike');
    expect(inferBodyType('motorbike', 'KTM', '390 Duke')).toBe('motorbike');
    expect(inferBodyType('motorbike', 'Triumph', 'Tiger 900')).toBe('motorbike');
    // Harley's adventure bike is the exception to the cruiser default
    expect(inferBodyType('motorbike', 'Harley-Davidson', 'Pan America')).toBe('motorbike');
  });

  test('bike models that share a name with a car body never leak a car type', () => {
    for (const model of ['Golf', 'Transit', 'Range Rover', 'Estate Wagon', 'Pickup', 'Coupe']) {
      expect(BIKE_BODIES).toContain(inferBodyType('motorbike', 'Honda', model));
    }
  });

  test('every real bike model in the dataset yields a bike body type', () => {
    let checked = 0;
    for (const make of allMakes('motorbike')) {
      for (const model of modelsForMake('motorbike', make)) {
        const body = inferBodyType('motorbike', make, model);
        expect(BIKE_BODIES).toContain(body);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});

describe('robustness', () => {
  test('every real car model in the dataset yields a car body type', () => {
    let checked = 0;
    for (const make of allMakes('car')) {
      for (const model of modelsForMake('car', make)) {
        const body = inferBodyType('car', make, model);
        expect(CAR_BODIES).toContain(body);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  test('empty strings are safe', () => {
    expect(inferBodyType('car', '', '')).toBe('saloon');
    expect(inferBodyType('motorbike', '', '')).toBe('motorbike');
  });

  test('garbage input falls back instead of throwing', () => {
    expect(() => inferBodyType('car', '???', '  !!')).not.toThrow();
    expect(inferBodyType('car', '???', '  !!')).toBe('saloon');
    expect(inferBodyType('car', 'zzzz', 'qqqqqqq')).toBe('saloon');
    expect(inferBodyType('motorbike', 'zzzz', 'qqqqqqq')).toBe('motorbike');
  });

  test('prototype keys do not leak through the lookup tables', () => {
    expect(CAR_BODIES).toContain(inferBodyType('car', 'constructor', 'constructor'));
    expect(CAR_BODIES).toContain(inferBodyType('car', '__proto__', 'valueOf'));
    expect(BIKE_BODIES).toContain(inferBodyType('motorbike', 'constructor', 'constructor'));
  });

  test('casing and whitespace do not change the answer', () => {
    const variants = ['Golf R', '  GOLF r ', 'golf   r', 'gOlF-R', 'Golf  R  '];
    for (const v of variants) {
      expect(inferBodyType('car', '  VolksWagen ', v)).toBe('hatchback');
    }
    expect(inferBodyType('car', 'mercedes-benz', '  gle-class  ')).toBe('suv');
    expect(inferBodyType('motorbike', ' HARLEY-DAVIDSON ', ' street glide ')).toBe('cruiser');
  });

  test('the same input always gives the same output', () => {
    for (const make of popularMakes('car')) {
      for (const model of modelsForMake('car', make).slice(0, 20)) {
        const first = inferBodyType('car', make, model);
        expect(inferBodyType('car', make, model)).toBe(first);
        expect(inferBodyType('car', make, model)).toBe(first);
      }
    }
  });
});

describe('bodyTypeLabel', () => {
  test('labels every member of the union', () => {
    for (const b of [...CAR_BODIES, ...BIKE_BODIES]) {
      const label = bodyTypeLabel(b);
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    }
  });

  test('reads the way a user would say it', () => {
    expect(bodyTypeLabel('suv')).toBe('SUV');
    expect(bodyTypeLabel('coupe')).toBe('Coupe');
    expect(bodyTypeLabel('estate')).toBe('Estate');
    expect(bodyTypeLabel('motorbike')).toBe('Motorbike');
    expect(bodyTypeLabel('scooter')).toBe('Scooter');
  });

  test('an unknown value still returns a usable string', () => {
    expect(bodyTypeLabel('nonsense' as BodyType)).toBe('Saloon');
  });
});
