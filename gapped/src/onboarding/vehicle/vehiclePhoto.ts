/**
 * Keeping, finding and deleting the vehicle photo from onboarding's photo
 * step. The rules are pure, in ./photoPaths; this file is the file system.
 *
 * Why the photo is copied at all: image-picker leaves its result in the cache
 * directory, which iOS purges under storage pressure. A photo kept there would
 * vanish some weeks later and leave every screen that shows the car pointing
 * at nothing. Documents is backed up and is not purged.
 */

import { Directory, File, Paths } from 'expo-file-system';
import { uuid } from '@/lib/ids';
import { keptPhotoName, PHOTO_DIR, photoFileName, reanchorPhotoUri } from './photoPaths';

function photoDirectory(): Directory {
  return new Directory(Paths.document, PHOTO_DIR);
}

/**
 * Copies a picked image into Documents and returns the URI to store.
 *
 * Falls back to the picked URI if the copy fails: the photo still shows for
 * this session, which is better than refusing a pick the person can see on
 * screen, and the cost is only that it may not survive a cache purge.
 */
export async function keepVehiclePhoto(pickedUri: string): Promise<string> {
  try {
    const dir = photoDirectory();
    dir.create({ intermediates: true, idempotent: true });
    const dest = new File(dir, photoFileName(uuid(), pickedUri));
    await new File(pickedUri).copy(dest);
    return dest.uri;
  } catch {
    return pickedUri;
  }
}

/**
 * Deletes a photo Gapped kept. Anything else — a cache URI, null, a file that
 * is already gone — is left alone, silently: deleting is cleanup, and cleanup
 * that throws would block whatever replaced the photo.
 */
export function discardVehiclePhoto(uri: string | null | undefined): void {
  if (!uri || !keptPhotoName(uri)) return;
  try {
    const file = new File(vehiclePhotoSource(uri));
    if (file.exists) file.delete();
  } catch {
    // Already gone, or unreadable: nothing left to clean up.
  }
}

/**
 * The URI to render for a stored photo URI — see reanchorPhotoUri for why a
 * stored absolute path cannot be used as is. Every screen that shows
 * `vehiclePhotoUri` should go through this.
 */
export function vehiclePhotoSource(stored: string): string {
  try {
    return reanchorPhotoUri(stored, Paths.document.uri);
  } catch {
    return stored;
  }
}
