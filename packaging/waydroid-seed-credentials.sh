#!/usr/bin/env bash
#
# Copies the Telegram api credentials from the desktop install into the Waydroid
# one, so they do not have to be typed on an on-screen keyboard.
#
# The app writes api_credentials.json next to its database and reads it back on
# start when the settings table has no keys - the same path that survives a
# reinstall on the desktop. Dropping the file in is all it takes.
#
# Needs root: the app's data directory is mode 700 and owned by the app's own
# uid, which is how Android keeps applications out of each other's files.
#
#   sudo packaging/waydroid-seed-credentials.sh
#
set -euo pipefail

PKG="com.amoyrlet.fygram"
USER_HOME=$(getent passwd "${SUDO_USER:-$USER}" | cut -d: -f6)
SRC="$USER_HOME/.local/share/$PKG/api_credentials.json"
APP_DATA="$USER_HOME/.local/share/waydroid/data/data/$PKG"

[ "$(id -u)" = 0 ] || {
  echo "run this with sudo - the app's data directory is not readable otherwise" >&2
  exit 1
}
[ -r "$SRC" ] || {
  echo "no credentials at $SRC - sign in on the desktop first" >&2
  exit 1
}
[ -d "$APP_DATA" ] || {
  echo "$PKG has no data directory yet - install and start it once" >&2
  exit 1
}

# Wherever the app actually put its database is where it looks for the file.
DEST_DIR=$(dirname "$(find "$APP_DATA" -name library.db -print -quit)" 2>/dev/null || true)
if [ -z "$DEST_DIR" ] || [ ! -d "$DEST_DIR" ]; then
  DEST_DIR="$APP_DATA/files"
  echo "no database yet, falling back to $DEST_DIR"
fi

UID_OF_APP=$(stat -c %u "$APP_DATA")
install -o "$UID_OF_APP" -g "$UID_OF_APP" -m 600 "$SRC" "$DEST_DIR/api_credentials.json"

echo "credentials placed in $DEST_DIR - restart the app and it will pick them up"
