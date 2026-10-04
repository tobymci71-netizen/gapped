import { requireOptionalNativeModule } from 'expo';
import { isPermissionError } from './photoPaths';
import { keepVehiclePhoto } from './vehiclePhoto';

export type PickOutcome =
  /** A photo was chosen and kept; `uri` is what to store. */
  | { kind: 'picked'; uri: string }
  /** The person closed the picker. Not an error, and nothing to say. */
  | { kind: 'canceled' }
  /** Access was refused; only Settings can change that. */
  | { kind: 'denied' }
  /** This build has no image-picker native module (a dev client older than the dependency). */
  | { kind: 'unavailable' }
  /** Anything else. Worth one more try. */
  | { kind: 'failed' };

/**
 * Opens the photo library for one picture of the vehicle and keeps it.
 *
 * - Library only. There is no camera: the reference never offers one, and
 *   the app declares no camera permission (app.json).
 * - No permission prompt first. The system pickers on current iOS (PHPicker,
 *   or the out-of-process crop picker) and Android (the Photo Picker) hand
 *   the app only the photo chosen, so asking for the whole library would be
 *   asking for more than this needs. Refusal is still handled, for the
 *   platforms and policies that do route through a permission.
 * - Square crop. iOS's crop is always square, so Android is asked for the
 *   same, and every screen that shows the photo can rely on its shape.
 *
 * The module is loaded on demand, and only once its native half is known to
 * be there. A development build made before it was installed does not contain
 * it: a static import would take the whole step down with it, and even a
 * guarded import let its init error through to the dev error overlay and
 * resolved to a module with nothing in it.
 */
export async function pickVehiclePhoto(): Promise<PickOutcome> {
  if (requireOptionalNativeModule('ExponentImagePicker') == null) return { kind: 'unavailable' };
  let picker: typeof import('expo-image-picker');
  try {
    picker = await import('expo-image-picker');
  } catch {
    return { kind: 'unavailable' };
  }
  if (typeof picker.launchImageLibraryAsync !== 'function') return { kind: 'unavailable' };
  try {
    const result = await picker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      // Plenty for a card on a phone screen, and a fraction of the size.
      quality: 0.85,
      exif: false,
      base64: false,
    });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return { kind: 'canceled' };
    return { kind: 'picked', uri: await keepVehiclePhoto(asset.uri) };
  } catch (error) {
    return isPermissionError(error) ? { kind: 'denied' } : { kind: 'failed' };
  }
}
