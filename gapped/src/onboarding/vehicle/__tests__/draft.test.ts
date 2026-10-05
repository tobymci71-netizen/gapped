/**
 * The ride step's draft: what counts as chosen, what gets saved, and how a
 * saved vehicle is named on a card.
 */

import {
  cleanName,
  draftReady,
  EMPTY_DRAFT,
  finishDraft,
  makeRefused,
  vehicleName,
  vehicleTitle,
  withMake,
} from '../draft';

describe('cleanName', () => {
  it('trims and collapses whitespace', () => {
    expect(cleanName('  Golf   GTI ')).toBe('Golf GTI');
    expect(cleanName('\tMX-5\n')).toBe('MX-5');
  });

  it('treats missing values as empty', () => {
    expect(cleanName(null)).toBe('');
    expect(cleanName(undefined)).toBe('');
  });

  it('removes the invisible characters the server refuses (0019), which a paste brings', () => {
    expect(cleanName('Golf\u200B GTI')).toBe('Golf GTI');
    expect(cleanName('\uFEFFBMW')).toBe('BMW');
    expect(cleanName('M\u202E3')).toBe('M3');
    expect(cleanName('Mini\u0007')).toBe('Mini');
    // Ordinary letters and punctuation stay.
    expect(cleanName('Citroën – DS')).toBe('Citroën – DS');
  });
});

describe('a make the server would refuse', () => {
  it('holds Continue back and is never saved', () => {
    const draft = { make: 'Shitbox Motors', model: 'Mk1' };
    expect(makeRefused(draft.make)).toBe(true);
    expect(draftReady(draft)).toBe(false);
    expect(finishDraft(draft, 'car')).toBeNull();
  });

  it('an empty make is not refused, only not chosen', () => {
    expect(makeRefused('')).toBe(false);
    expect(makeRefused(null)).toBe(false);
  });

  it('catalogue makes pass', () => {
    expect(makeRefused('BMW')).toBe(false);
    expect(draftReady({ make: 'BAD ASS Choppers', model: 'Custom' })).toBe(true);
  });
});

describe('draftReady / finishDraft', () => {
  it('needs both make and model', () => {
    expect(draftReady(EMPTY_DRAFT)).toBe(false);
    expect(draftReady({ make: 'BMW', model: '' })).toBe(false);
    expect(draftReady({ make: '', model: 'M3' })).toBe(false);
    expect(draftReady({ make: 'BMW', model: 'M3' })).toBe(true);
  });

  it('does not count whitespace as a choice', () => {
    expect(draftReady({ make: '   ', model: 'M3' })).toBe(false);
    expect(finishDraft({ make: 'BMW', model: '  ' }, 'car')).toBeNull();
  });

  it('saves the cleaned names', () => {
    expect(finishDraft({ make: ' Mercedes-Benz ', model: 'C  63 ' }, 'car')).toEqual({
      make: 'Mercedes-Benz',
      model: 'C 63',
    });
  });

  it('saves a typed name the catalogue has in the catalogue’s spelling', () => {
    // One badge, one spelling wherever the stored make is printed.
    expect(finishDraft({ make: 'bmw', model: '1m' }, 'car')).toEqual({ make: 'BMW', model: '1M' });
    expect(finishDraft({ make: ' ducati ', model: '1199 panigale' }, 'motorbike')).toEqual({
      make: 'Ducati',
      model: '1199 Panigale',
    });
  });

  it('keeps a name the catalogue does not have as typed', () => {
    expect(finishDraft({ make: 'bmw', model: 'my  project car' }, 'car')).toEqual({
      make: 'BMW',
      model: 'my project car',
    });
    expect(finishDraft({ make: 'Garage Special', model: 'Mk1' }, 'car')).toEqual({
      make: 'Garage Special',
      model: 'Mk1',
    });
  });

  it('matches against the kind being chosen', () => {
    // A car-only make typed on the bike side stays as typed, rather than
    // borrowing a spelling from the other kind's list.
    expect(finishDraft({ make: 'mercedes-benz', model: 'x' }, 'motorbike')?.make).toBe(
      'mercedes-benz',
    );
  });
});

describe('withMake', () => {
  it('clears the model when the make changes', () => {
    expect(withMake({ make: 'Volkswagen', model: 'Golf' }, 'Ford')).toEqual({
      make: 'Ford',
      model: '',
    });
  });

  it('keeps the model when the same make is picked again', () => {
    expect(withMake({ make: 'BMW', model: 'M3' }, 'bmw ')).toEqual({ make: 'bmw ', model: 'M3' });
  });

  it('starts an empty draft', () => {
    expect(withMake(EMPTY_DRAFT, 'Ducati')).toEqual({ make: 'Ducati', model: '' });
  });
});

describe('vehicleName / vehicleTitle', () => {
  it('names a vehicle by make and model', () => {
    expect(vehicleName('BMW', 'M3')).toBe('BMW M3');
    expect(vehicleName('BMW', null)).toBe('BMW');
    expect(vehicleName(null, null)).toBe('');
  });

  it('leads with the nickname and keeps the vehicle underneath', () => {
    expect(vehicleTitle({ nickname: 'The Beast', make: 'BMW', model: 'M3' })).toEqual({
      title: 'The Beast',
      subtitle: 'BMW M3',
    });
  });

  it('does not repeat a nickname that is just the vehicle', () => {
    expect(vehicleTitle({ nickname: 'bmw m3', make: 'BMW', model: 'M3' })).toEqual({
      title: 'BMW M3',
      subtitle: null,
    });
  });

  it('ignores a blank nickname', () => {
    expect(vehicleTitle({ nickname: '  ', make: 'BSA', model: 'A7' })).toEqual({
      title: 'BSA A7',
      subtitle: null,
    });
    expect(vehicleTitle({ make: 'BSA', model: 'A7' }).title).toBe('BSA A7');
  });
});
