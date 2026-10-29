# ADR 007 — Browser uploads through signed requests, downloads only through the API

Status: accepted (F-06)

## Decision

- Files live only in the private bucket. The browser uploads straight to it in parts, but only through requests the API signs
  (`POST /documents/uploads/sign`): the API chooses the object key (`files/<uuid>`), records an upload intent, checks the type,
  size and where the file belongs, and signs later requests only for that key, for the same user, while it is open. Completion is
  confirmed by the API with a HEAD against the bucket (size must match) before a `Document` exists.
- A document is `pending` until the worker has scanned it (ClamAV over `INSTREAM`, streamed), checked that its first bytes match
  its declared type, and read its page count or made a thumbnail. Infected, mismatched or unreadable files are moved to
  `quarantine/`. Nothing that is not `clean` can be downloaded.
- The only way out is `POST /documents/:id/download|preview`: the document must be visible to the caller through
  `ScopeService.documentWhere`, the access is audited (`recordAccess`, which also feeds the download alert) before a link
  exists, PDFs and JPEG/PNG are stamped for the viewer, and the link lasts five minutes.
- Sharing is the patient's consent made concrete: turning a hospital on creates the consent and the `DocumentShare` in one
  transaction; withdrawing either closes the door (`documentWhere` checks both).
- `@medtravel/storage` holds the bucket client, file helpers and the test doubles (`FakeS3Server`, `FakeClamd`) so the API, the
  worker and CI use one implementation and run without MinIO or ClamAV.

## Why not

Proxying uploads through the API would hold 500 MB requests on it; presigned single URLs cannot enforce the key and size rules;
letting the browser choose the key would let one user write into another's object.

## Consequences

The bucket needs CORS and lifecycle rules (see docs/progress.md); the real MinIO and ClamAV paths are verified only in
development and staging.

## Added after review

Patients, attendants and hospital desks may change or delete only documents they uploaded themselves; hospitals and attendants
are not told which other hospitals a case is consulting. The scanner (`infra/clamav/clamd.conf`) is set to read 500 MB and to
report files it cannot fully read; a file it still refuses is quarantined as `scan_limit` rather than retried. The `watermarked/`
prefix expires after a day through a MinIO rule in `infra/minio/init-buckets.sh` (real S3 needs the same rule).
