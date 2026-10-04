/**
 * Where a kept vehicle photo lives, and why a pick failed.
 */

import {
  isPermissionError,
  keptPhotoName,
  PHOTO_DIR,
  photoFileName,
  reanchorPhotoUri,
} from '../photoPaths';

const OLD_DOCS = 'file:///var/mobile/Containers/Data/Application/AAAA-1111/Documents/';
const NEW_DOCS = 'file:///var/mobile/Containers/Data/Application/BBBB-2222/Documents/';

describe('photoFileName', () => {
  it('keeps an image extension from the source', () => {
    expect(photoFileName('abc', 'file:///cache/ImagePicker/x.PNG')).toBe('abc.png');
    expect(photoFileName('abc', 'file:///cache/x.heic?v=2')).toBe('abc.heic');
  });

  it('falls back to jpg for anything else', () => {
    expect(photoFileName('abc', 'file:///cache/x')).toBe('abc.jpg');
    expect(photoFileName('abc', 'file:///cache/x.exe')).toBe('abc.jpg');
  });
});

describe('keptPhotoName', () => {
  it('recognises a photo Gapped kept', () => {
    expect(keptPhotoName(`${OLD_DOCS}${PHOTO_DIR}/abc.jpg`)).toBe('abc.jpg');
  });

  it('ignores every other URI', () => {
    expect(keptPhotoName('file:///cache/ImagePicker/abc.jpg')).toBeNull();
    expect(keptPhotoName(`${OLD_DOCS}${PHOTO_DIR}/`)).toBeNull();
    expect(keptPhotoName(null)).toBeNull();
    expect(keptPhotoName(undefined)).toBeNull();
  });
});

describe('reanchorPhotoUri', () => {
  it('moves a kept photo onto the current Documents directory', () => {
    expect(reanchorPhotoUri(`${OLD_DOCS}${PHOTO_DIR}/abc.jpg`, NEW_DOCS)).toBe(
      `${NEW_DOCS}${PHOTO_DIR}/abc.jpg`,
    );
  });

  it('accepts a Documents URI with or without the trailing slash', () => {
    expect(reanchorPhotoUri(`${OLD_DOCS}${PHOTO_DIR}/abc.jpg`, NEW_DOCS.slice(0, -1))).toBe(
      `${NEW_DOCS}${PHOTO_DIR}/abc.jpg`,
    );
  });

  it('is a no-op when nothing moved', () => {
    const uri = `${NEW_DOCS}${PHOTO_DIR}/abc.jpg`;
    expect(reanchorPhotoUri(uri, NEW_DOCS)).toBe(uri);
  });

  it('leaves URIs it did not write alone', () => {
    const cache = 'file:///var/mobile/Containers/Data/Application/AAAA/Library/Caches/x.jpg';
    expect(reanchorPhotoUri(cache, NEW_DOCS)).toBe(cache);
  });
});

describe('isPermissionError', () => {
  it('recognises the pickers’ refusals', () => {
    // expo-image-picker's Android CodedException, by message and by code.
    expect(isPermissionError({ message: 'User rejected permissions' })).toBe(true);
    expect(isPermissionError({ code: 'ERR_MISSING_PERMISSION' })).toBe(true);
    expect(isPermissionError(new Error('Access denied by policy'))).toBe(true);
    expect(isPermissionError({ message: 'App is not authorized to access photos' })).toBe(true);
  });

  it('does not mistake other failures for one', () => {
    expect(isPermissionError(new Error('Failed to read image data'))).toBe(false);
    expect(isPermissionError({ code: 'ERR_MISSING_CURRENT_VIEW_CONTROLLER' })).toBe(false);
    expect(isPermissionError(null)).toBe(false);
    expect(isPermissionError('permission')).toBe(false);
  });
});
