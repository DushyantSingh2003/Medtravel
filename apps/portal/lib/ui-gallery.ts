/**
 * The component gallery and its mock S3 endpoint exist for development and the end-to-end tests.
 * They are opt-in everywhere: nothing is served unless ENABLE_UI_GALLERY is exactly "true", which
 * only `apps/portal/.env.example` (local development) and the CI browser-test job set.
 */
export const isUiGalleryEnabled = (): boolean => process.env.ENABLE_UI_GALLERY === 'true';
