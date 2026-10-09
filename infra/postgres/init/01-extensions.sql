-- Runs once, the first time the database volume is created.
-- pg_trgm powers fuzzy search (patient and hospital lookup, duplicate detection);
-- unaccent makes search ignore diacritics. Both ship with the official image.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
