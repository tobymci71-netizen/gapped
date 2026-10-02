/**
 * The modified flag as the server holds it, read off a bracket key
 * ('{drivetrain}|{mod}|{tier}', built by vehicles/brackets.ts bracketKey and
 * mirrored server-side). Null when the key is not in that shape. Pure — tested.
 *
 * decode-vin never writes is_modified and does not return it, while decodeVin
 * hands back specs with it hard-coded false — so applying a decode as-is
 * flipped a modified car's switch to off and its class to Stock, while the
 * server went on ranking it as modified. The bracket key in the same response
 * is computed from the stored flag, so it is the one value that knows.
 */
export function modifiedFromBracketKey(key: unknown): boolean | null {
  if (typeof key !== 'string') return null;
  const parts = key.split('|');
  if (parts.length !== 3) return null;
  return parts[1] === 'modified' ? true : parts[1] === 'stock' ? false : null;
}
