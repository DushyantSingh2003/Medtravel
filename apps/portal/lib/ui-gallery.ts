/**
 * The component gallery and its mock S3 endpoint exist for development, staging demos and the
 * end-to-end tests. They are off in production unless explicitly enabled, so the mock storage
 * endpoint can never be reached on a live deployment.
 */
export const isUiGalleryEnabled = (): boolean =>
  process.env.ENABLE_UI_GALLERY === 'true' || process.env.NODE_ENV !== 'production';
