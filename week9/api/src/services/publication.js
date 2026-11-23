import { validatePhotoMetadata, validatePublication } from './contracts.js';

// Lifecycle owns manifest -> all PUTs -> atomic DB commit. Caller owns temp files.
export function createPublicationService({ lifecycle }) {
  return async function publishPhoto(photo, variants) {
    const metadata = validatePhotoMetadata(photo);
    validatePublication(photo, variants);
    if (variants.some(v => typeof v.path !== 'string' || !v.path)) throw new TypeError('Server-produced variant path required');
    return lifecycle.publish({ ...metadata, width: photo.width, height: photo.height }, variants);
  };
}
