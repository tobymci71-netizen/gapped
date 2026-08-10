/**
 * uuid-shaped local ids, no external dep.
 *
 * These are the ids rows carry all the way to Postgres, so they must be
 * uuid-parseable — the drive and vehicle primary keys are `uuid`. Math.random
 * is fine here: these identify rows the client already owns, and nothing about
 * them is a security boundary.
 */
export function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
