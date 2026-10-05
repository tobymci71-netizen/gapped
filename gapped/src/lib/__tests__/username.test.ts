import {
  isMakeAllowed,
  isUsernameAllowed,
  isValidUsername,
  MAKE_NOT_ALLOWED,
  normaliseUsername,
  USERNAME_NOT_ALLOWED,
  USERNAME_SAVE_FAILED,
  USERNAME_TAKEN,
  usernameErrorMessage,
  usernameRefusal,
  usernameRejection,
  vehicleRejected,
} from '../username';

describe('the format', () => {
  test('3–20 lowercase letters, numbers or underscores', () => {
    expect(isValidUsername('toby_m')).toBe(true);
    expect(isValidUsername('ab')).toBe(false);
    expect(isValidUsername('a'.repeat(21))).toBe(false);
    expect(isValidUsername('Toby')).toBe(false);
    expect(normaliseUsername('  Toby_M ')).toBe('toby_m');
  });
});

describe('the denylist mirror (0019 blocked_terms, same matching rules)', () => {
  test('a contains term is refused anywhere, separators and lookalike digits or not', () => {
    for (const name of ['fuckface', 'big_shit_energy', 'f_u_c_k', 'sh1tbox', '5h1t', 'xgappedx']) {
      expect([name, usernameRefusal(name)]).toEqual([name, 'contains']);
    }
  });

  test("the app's and its staff's names are refused anywhere in a name", () => {
    expect(usernameRefusal('gapped')).toBe('contains');
    expect(usernameRefusal('gapped_official')).toBe('contains');
    expect(usernameRefusal('the_moderator')).toBe('contains');
  });

  test('a word term is refused only as a whole word, or the whole name run together', () => {
    for (const name of ['admin', 'admin_bob', 'admin123', '4dm1n', 'a_d_m_i_n', 'support', 'null']) {
      expect([name, usernameRefusal(name)]).toEqual([name, 'word']);
    }
  });

  test('digits at one end of a word and a lookalike at the other still make the word', () => {
    // "4dmin1": the 4 is an a, the 1 is padding. Trimming both ends lost the
    // a; trimming one end at a time keeps it (0019 does the same).
    for (const name of ['4dmin1', '4dm1n7', 'x_4dmin1', '5upport9']) {
      expect([name, usernameRefusal(name)]).toEqual([name, 'word']);
    }
  });

  test('a word term inside an ordinary word is fine', () => {
    for (const name of ['badminton', 'admiral_ace', 'staffordshire', 'rootbeer', 'applepie_1']) {
      expect([name, usernameRefusal(name)]).toEqual([name, null]);
    }
  });

  test("innocent hosts are cut out first, as on the server", () => {
    for (const name of ['scunthorpe_gti', 'penistone_fc', 'milford_haven', 'snigger']) {
      expect([name, isUsernameAllowed(name)]).toEqual([name, true]);
    }
    expect(usernameRefusal('scunthorpe_cunt')).toBe('contains');
  });

  test('a term at the start of an innocent host being typed waits for a pause', () => {
    // Every step of typing "scunthorpe" from "scunt" on holds "cunt", and
    // finishing the word cuts it out again: refused, but not yet final.
    for (const name of ['scunt', 'scunth', 's_cunth', '5cunthorp']) {
      expect([name, usernameRefusal(name)]).toEqual([name, 'word']);
    }
    expect(isUsernameAllowed('scunthorpe')).toBe(true);
    // Only when finishing the host would take every term out: a second one
    // elsewhere in the name is final at once.
    expect(usernameRefusal('shit_scunt')).toBe('contains');
    // A name that merely ends in a host's first letters is not let off.
    expect(usernameRefusal('shits')).toBe('contains');
    expect(usernameRefusal('cunts')).toBe('contains');
  });

  test('ordinary names pass', () => {
    for (const name of ['toby_m', 'model_3_owner', 'drivers_club', 'swanky_golf', 'therapist_tom']) {
      expect([name, isUsernameAllowed(name)]).toEqual([name, true]);
    }
  });
});

describe('the make mirror (profanity and slurs only, as 0019 holds makes)', () => {
  test('a make holding profanity is refused, however it is spaced or spelt', () => {
    for (const make of ['Shitbox Motors', 'F.U.C.K Racing', 'Sh!t Cars', 'Twat-Mobile', 'c u n t']) {
      expect([make, isMakeAllowed(make)]).toEqual([make, false]);
    }
  });

  test('real makes pass, reserved words included: a make called Apple impersonates nobody', () => {
    for (const make of ['BMW', 'Citroën', 'Škoda', 'Mercedes-Benz', 'Apple', 'Gapped Customs']) {
      expect([make, isMakeAllowed(make)]).toEqual([make, true]);
    }
  });

  test('innocent hosts are cut out first, and so are the catalogue makes that hold a term', () => {
    expect(isMakeAllowed('Scunthorpe Kit Cars')).toBe(true);
    expect(isMakeAllowed('BAD ASS Choppers')).toBe(true);
    expect(isMakeAllowed('Crazy Dago Customs')).toBe(true);
  });

  test('says so in plain words', () => {
    expect(MAKE_NOT_ALLOWED).toBe("That make isn't allowed. Enter another.");
  });
});

describe('a refused vehicles write', () => {
  test("23514 is the server refusing the row: the make filter or a text CHECK", () => {
    expect(vehicleRejected({ code: '23514', message: 'make_not_allowed' })).toBe(true);
    expect(
      vehicleRejected({
        code: '23514',
        message: 'new row for relation "vehicles" violates check constraint "vehicles_make_text"',
      }),
    ).toBe(true);
    expect(vehicleRejected({ code: 'P0001', message: 'make_not_allowed' })).toBe(true);
  });

  test('anything else is not a verdict', () => {
    expect(vehicleRejected({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(vehicleRejected({ message: 'TypeError: Network request failed' })).toBe(false);
    expect(vehicleRejected(null)).toBe(false);
  });
});

describe('a refused username write', () => {
  test('23505 is another driver holding it', () => {
    expect(usernameRejection({ code: '23505', message: 'duplicate key value' })).toBe('taken');
  });

  test("23514 is the server's filter, with or without its message", () => {
    expect(usernameRejection({ code: '23514', message: 'username_not_allowed' })).toBe('not_allowed');
    expect(usernameRejection({ code: '23514', message: 'violates check constraint' })).toBe(
      'not_allowed',
    );
    expect(usernameRejection({ code: 'P0001', message: 'username_not_allowed' })).toBe(
      'not_allowed',
    );
  });

  test('anything else is not a verdict on the name', () => {
    expect(usernameRejection({ code: '42501', message: 'permission denied' })).toBeNull();
    expect(usernameRejection({ code: '', message: 'TypeError: Network request failed' })).toBeNull();
    expect(usernameRejection(null)).toBeNull();
    expect(usernameRejection('username_not_allowed')).toBeNull();
  });

  test('reads as plain copy, never as the server message', () => {
    expect(usernameErrorMessage({ code: '23514', message: 'username_not_allowed' })).toBe(
      "That username isn't allowed. Pick another.",
    );
    expect(usernameErrorMessage({ code: '23514', message: 'x' })).toBe(USERNAME_NOT_ALLOWED);
    expect(usernameErrorMessage({ code: '23505', message: 'duplicate key value' })).toBe(
      USERNAME_TAKEN,
    );
    expect(usernameErrorMessage({ code: '', message: 'TypeError: Network request failed' })).toBe(
      USERNAME_SAVE_FAILED,
    );
  });
});
