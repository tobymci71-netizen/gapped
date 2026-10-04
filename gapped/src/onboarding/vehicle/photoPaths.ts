/**
 * Where a vehicle photo lives, and how to tell why a pick failed. Pure; the
 * file operations that use these are in ./vehiclePhoto.
 */

/** Folder under the app's Documents directory that holds vehicle photos. */
export const PHOTO_DIR = 'vehicle-photos';

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp']);

/**
 * The name a kept photo is saved under: a fresh id plus the source's own
 * extension, when it is an image extension; jpg otherwise, which is what the
 * picker produces after a crop.
 */
export function photoFileName(id: string, sourceUri: string): string {
  const ext = /\.([A-Za-z0-9]+)(?:[?#].*)?$/.exec(sourceUri)?.[1]?.toLowerCase();
  return `${id}.${ext && IMAGE_EXTENSIONS.has(ext) ? ext : 'jpg'}`;
}

/** The file name of a photo Gapped keeps, or null for any other URI. */
export function keptPhotoName(uri: string | null | undefined): string | null {
  if (typeof uri !== 'string') return null;
  const m = new RegExp(`/${PHOTO_DIR}/([^/?#]+)$`).exec(uri);
  return m ? m[1] : null;
}

/**
 * A stored photo URI, re-pointed at the current Documents directory.
 *
 * The profile stores an absolute `file://` URI, and on iOS the absolute path
 * of the app's container is not stable: it changes when the app is updated or
 * restored, while the files inside move across untouched. A URI saved by last
 * month's build can therefore name a folder that no longer exists, for a
 * photo that still does. Rebuilding it from the file name and today's
 * Documents path finds it again. URIs Gapped did not write — a picker's cache
 * file on a first run, say — come back as they were.
 */
export function reanchorPhotoUri(stored: string, documentUri: string): string {
  const name = keptPhotoName(stored);
  if (!name) return stored;
  const base = documentUri.endsWith('/') ? documentUri : `${documentUri}/`;
  return `${base}${PHOTO_DIR}/${name}`;
}

/**
 * Whether an error from the photo picker means access was refused, as opposed
 * to anything else going wrong.
 *
 * The system pickers on current iOS and Android need no permission at all —
 * they hand the app only the photo chosen — so this is the uncommon path: an
 * older Android build or a device policy that routes through storage
 * permissions. When it does happen the only fix is in Settings, and saying
 * "try again" would send the person round in a circle.
 */
export function isPermissionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  const text = `${typeof code === 'string' ? code : ''} ${typeof message === 'string' ? message : ''}`;
  return /permission|not authori[sz]ed|denied/i.test(text);
}
