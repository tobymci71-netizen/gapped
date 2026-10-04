/**
 * The pre-first-drive SAMPLE board: the rows the Board tab shows before there
 * is anything real to show, and the three the welcome carousel's "Top speed"
 * card borrows (src/onboarding/intro/introBoard.ts).
 *
 * One list, so the sample someone meets on the carousel is the one they meet
 * again on the Board tab. It lives on its own, with no imports, because the
 * carousel's rules are tested without a backend and boards.ts brings one in.
 *
 * Road-legal speeds, `sample_driver_N` names that say what they are, and every
 * row labelled SAMPLE wherever it is drawn: never presented as people (spec
 * Part C, "no fabricated users").
 */
export const SAMPLE_BOARD_ROWS: readonly { username: string; vehicle: string; mph: number }[] = [
  { username: 'sample_driver_1', vehicle: 'BMW M240i', mph: 82 },
  { username: 'sample_driver_2', vehicle: 'Golf GTI', mph: 76 },
  { username: 'sample_driver_3', vehicle: 'MX-5 ND', mph: 71 },
  { username: 'sample_driver_4', vehicle: 'Civic Type R', mph: 69 },
  { username: 'sample_driver_5', vehicle: 'GR Yaris', mph: 64 },
];
