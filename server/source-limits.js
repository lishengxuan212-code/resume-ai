export const MAX_SOURCE_BLOCKS = 30;
export const MAX_SOURCE_BLOCK_TEXT_LENGTH = 12000;
export const MAX_DIAGNOSIS_QUESTIONS = 12;
export const MAX_CONFIRMED_SOURCE_BLOCKS = MAX_SOURCE_BLOCKS + MAX_DIAGNOSIS_QUESTIONS;

// These are transport safety bounds, not editorial targets. Resume content is
// allowed to remain long and will paginate naturally in the renderer.
export const MAX_RESUME_SECTIONS = 20;
export const MAX_RESUME_ENTRIES = 100;
export const MAX_RESUME_BULLETS = 100;
export const MAX_RESUME_SUMMARY_LENGTH = 4000;
export const MAX_RESUME_BULLET_TEXT_LENGTH = 12000;
