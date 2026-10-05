/**
 * The vehicle being chosen, before it is saved — and how a saved one is named.
 *
 * Pure. The ride step and the garage's "Add another car" both edit a draft
 * and only write the profile when it is complete, so a half-chosen vehicle
 * never reaches the store, the server or a board.
 */

import { isMakeAllowed } from '@/lib/username';
import type { VehicleKind } from '@/state/profile';
import { allMakes, exactEntry, modelsForMake } from '@/vehicles/catalog';

/** Make and model as typed or picked. Empty string = not chosen yet. */
export type VehicleDraft = { make: string; model: string };

export const EMPTY_DRAFT: VehicleDraft = { make: '', model: '' };

/**
 * Picks remembered per kind, so flipping Car → Motorbike → Car by accident
 * gives back the car that was chosen instead of two empty fields. The makes
 * differ by kind, so one draft cannot simply carry across.
 */
export type DraftsByKind = Record<VehicleKind, VehicleDraft>;

/** Longest make and model the free-text fields accept. */
export const MAX_MAKE_LENGTH = 40;
export const MAX_MODEL_LENGTH = 60;
/** Longest nickname. Enough for a name, short enough for a board row. */
export const MAX_NICKNAME_LENGTH = 30;

/**
 * Control characters, and the invisible ones used to disguise text: zero-width
 * spaces and joiners, bidirectional overrides, the byte-order mark. The
 * server refuses a make or model holding any of them (0019,
 * vehicles_make_text / vehicles_model_text), and a refused vehicles row holds
 * back every drive in that car, so they are taken out before it is saved. A
 * paste is how they arrive; nobody types one.
 */
const INVISIBLE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;

/**
 * A typed name as it should be stored: trimmed, with runs of whitespace
 * collapsed and invisible characters removed. "  Golf   GTI " and "Golf GTI"
 * are one model, and only the second should ever reach a board.
 */
export function cleanName(value: string | null | undefined): string {
  return typeof value === 'string' ? value.replace(INVISIBLE, '').trim().replace(/\s+/g, ' ') : '';
}

/**
 * Whether a make may be saved: the server's denylist mirror (isMakeAllowed).
 * An empty make is not refused, only not chosen yet.
 */
export function makeRefused(make: string | null | undefined): boolean {
  const m = cleanName(make);
  return m.length > 0 && !isMakeAllowed(m);
}

/**
 * Both make and model are chosen, and the make is one the server will take —
 * what Continue waits for. A make it refuses would hold back every drive in
 * the car, so it is turned away here, where it can still be changed.
 */
export function draftReady(draft: VehicleDraft): boolean {
  return (
    cleanName(draft.make).length > 0 &&
    cleanName(draft.model).length > 0 &&
    !makeRefused(draft.make)
  );
}

/**
 * The draft as it will be saved, or null if it is not ready (draftReady).
 *
 * A typed name the catalogue has, in any case, is saved in the catalogue's
 * spelling. "bmw" typed into "Add it yourself" (or the sheet's "Enter
 * manually") is the catalogue's BMW. `make_popularity` folds case when it
 * counts, so this is not about the numbers; it is about every place that
 * prints the stored make — the proof line, the garage card, the person's
 * board rows — reading "BMW 1M" rather than "bmw 1m". A name the catalogue
 * does not have is kept as typed, cleaned.
 */
export function finishDraft(draft: VehicleDraft, kind: VehicleKind): VehicleDraft | null {
  const typedMake = cleanName(draft.make);
  const typedModel = cleanName(draft.model);
  if (!typedMake || !typedModel || makeRefused(typedMake)) return null;
  const make = exactEntry(allMakes(kind), typedMake) ?? typedMake;
  const model = exactEntry(modelsForMake(kind, make), typedModel) ?? typedModel;
  return { make, model };
}

/**
 * Choosing a make from the list. A new make invalidates the model — a Golf is
 * not a Golf on a Ford — but re-picking the same make keeps it.
 */
export function withMake(draft: VehicleDraft, make: string): VehicleDraft {
  return cleanName(make).toLowerCase() === cleanName(draft.make).toLowerCase()
    ? { ...draft, make }
    : { make, model: '' };
}

/** "BMW M3", or whichever half exists. */
export function vehicleName(make: string | null | undefined, model: string | null | undefined) {
  return [cleanName(make), cleanName(model)].filter(Boolean).join(' ');
}

/**
 * How a vehicle is titled on a card: its nickname when it has one, with the
 * make and model underneath so the name never hides what the car is.
 */
export function vehicleTitle(v: {
  nickname?: string | null;
  make: string | null | undefined;
  model: string | null | undefined;
}): { title: string; subtitle: string | null } {
  const name = vehicleName(v.make, v.model);
  const nickname = cleanName(v.nickname);
  if (nickname && nickname.toLowerCase() !== name.toLowerCase()) {
    return { title: nickname, subtitle: name || null };
  }
  return { title: name, subtitle: null };
}
