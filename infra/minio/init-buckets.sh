#!/bin/sh
# Creates the buckets MedTravel needs. Idempotent: re-running changes nothing.
set -eu

mc alias set local http://minio:9000 "$S3_ACCESS_KEY" "$S3_SECRET_KEY"

# Medical files. Never public: they are only reachable through signed links.
mc mb --ignore-existing "local/$S3_PRIVATE_BUCKET"
mc anonymous set none "local/$S3_PRIVATE_BUCKET"

# Stamped copies made for a download are only needed for the five minutes the link lives.
mc ilm rule add --prefix "watermarked/" --expire-days 1 "local/$S3_PRIVATE_BUCKET" >/dev/null 2>&1 || true

# Website images served through the CDN in production.
mc mb --ignore-existing "local/$S3_PUBLIC_BUCKET"
mc anonymous set download "local/$S3_PUBLIC_BUCKET"

echo "Buckets ready: $S3_PRIVATE_BUCKET (private), $S3_PUBLIC_BUCKET (public read)"
