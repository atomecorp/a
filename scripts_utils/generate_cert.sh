#!/bin/bash
set -e

CERT_DIR="certs"
KEY_FILE="$CERT_DIR/key.pem"
CERT_FILE="$CERT_DIR/cert.pem"

mkdir -p "$CERT_DIR"

if [[ -f "$KEY_FILE" && -f "$CERT_FILE" ]]; then
  echo "✅ Certificates already exist in $CERT_DIR"
else
  echo "🔐 Generating self-signed certificates..."
  openssl req -x509 -newkey rsa:2048 -nodes -sha256 \
    -keyout "$KEY_FILE" \
    -out "$CERT_FILE" \
    -days 365 \
    -subj "/C=FR/ST=France/L=Paris/O=Atome/OU=Dev/CN=localhost"
  echo "✅ Certificates generated in $CERT_DIR"
fi
