/**
 * The pre-first-drive SAMPLE board: the rows the Board tab shows before there
 * is anything real to show, and the three the welcome carousel's board card
 * borrows (src/onboarding/intro/introBoard.ts).
 *
 * One list, so the sample someone meets on the carousel is the one they meet
 * again on the Board tab. It lives on its own, with no imports, because the
 * carousel's rules are tested without a backend and boards.ts brings one in.
 *
 * Road-legal speeds, `sample_driver_N` names that say what they are, and every
 * row labelled SAMPLE wherever it is drawn: never presented as people (spec
 * Part C, "no fabricated users"). `km` is the same driver's distance, for the
 * Distance board, which is the one the Ranks tab opens on: a sample week of
 * ordinary driving, not a record.
 *
 * Every `mph` is under 70, the UK's motorway limit, and so under the 130 km/h
 * ceiling verify-drive ranks to where a country has no limit of its own
 * (supabase/functions/_shared/speedLimits.ts). The Top speed board says that
 * nothing over the national limit is ranked; a sample board above that line
 * ranking 82 mph would have shown exactly what it says never happens.
 */
export const SAMPLE_BOARD_ROWS: readonly {
  username: string;
  vehicle: string;
  mph: number;
  km: number;
}[] = [
  { username: 'sample_driver_1', vehicle: 'BMW M240i', mph: 69, km: 412 },
  { username: 'sample_driver_2', vehicle: 'Golf GTI', mph: 67, km: 356 },
  { username: 'sample_driver_3', vehicle: 'MX-5 ND', mph: 65, km: 298 },
  { username: 'sample_driver_4', vehicle: 'Civic Type R', mph: 62, km: 241 },
  { username: 'sample_driver_5', vehicle: 'GR Yaris', mph: 58, km: 187 },
];
