/**
 * NHTSA vPIC client (free, no key) — auto-populates make/model catalogue and,
 * where available, the spec fields that feed bracketing. Results are advisory;
 * curb weight / power are frequently absent from vPIC, in which case the
 * vehicle stays in the open bracket until enriched from another source.
 *
 * https://vpic.nhtsa.dot.gov/api/
 */

const BASE = 'https://vpic.nhtsa.dot.gov/api/vehicles';

type VpicResponse<T> = { Count: number; Results: T[] };

export async function fetchMakes(): Promise<string[]> {
  const res = await fetch(`${BASE}/GetAllMakes?format=json`);
  if (!res.ok) throw new Error(`vPIC ${res.status}`);
  const json = (await res.json()) as VpicResponse<{ Make_Name: string }>;
  return json.Results.map((r) => r.Make_Name);
}

export async function fetchModelsForMake(make: string): Promise<string[]> {
  const res = await fetch(
    `${BASE}/GetModelsForMake/${encodeURIComponent(make)}?format=json`,
  );
  if (!res.ok) throw new Error(`vPIC ${res.status}`);
  const json = (await res.json()) as VpicResponse<{ Model_Name: string }>;
  return [...new Set(json.Results.map((r) => r.Model_Name))].sort();
}
