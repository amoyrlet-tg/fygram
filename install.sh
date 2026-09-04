#!/usr/bin/env sh
set -e

REPO="amoyrlet-tg/fygram"
PREFIX="${PREFIX:-$HOME/.local}"
LIBDIR="$PREFIX/share/fygram"
BINDIR="$PREFIX/bin"
APPS="$PREFIX/share/applications"
ICONS="$PREFIX/share/icons/hicolor/128x128/apps"

die() { echo "error: $*" >&2; exit 1; }

fetch() {
  if command -v curl >/dev/null 2>&1; then curl -fsSL "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then wget -qO "$2" "$1"
  else die "need curl or wget"; fi
}
fetch_stdout() {
  if command -v curl >/dev/null 2>&1; then curl -fsSL "$1"
  elif command -v wget >/dev/null 2>&1; then wget -qO- "$1"
  else die "need curl or wget"; fi
}

[ "$(uname -s)" = "Linux" ] || die "this installer is for Linux; grab the .exe or .dmg from the releases page"
[ "$(uname -m)" = "x86_64" ] || die "only x86_64 builds are published right now (yours: $(uname -m))"

mkdir -p "$LIBDIR" "$BINDIR" "$APPS" "$ICONS"

here="$(cd "$(dirname "$0")" 2>/dev/null && pwd || echo .)"
local_bin=""
for candidate in fygram-arch-x86_64 fygram; do
  [ -f "$here/$candidate" ] && { local_bin="$here/$candidate"; break; }
done

if [ -n "$local_bin" ]; then
  install -m 755 "$local_bin" "$BINDIR/fygram"
  [ -f "$here/fygram.png" ] && cp "$here/fygram.png" "$ICONS/fygram.png"
else
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT

  echo "looking up the latest release…"
  url="$(fetch_stdout "https://api.github.com/repos/$REPO/releases/latest" \
    | grep -o 'https://[^"]*\.AppImage' | head -n 1)"
  [ -n "$url" ] || die "no AppImage in the latest release of $REPO"

  echo "downloading $(basename "$url")…"
  fetch "$url" "$tmp/fygram.AppImage"
  chmod +x "$tmp/fygram.AppImage"

  # unpack rather than run the AppImage in place: extraction is handled by the
  # bundled runtime itself, so the installed app never needs libfuse present
  echo "unpacking…"
  ( cd "$tmp" && ./fygram.AppImage --appimage-extract >/dev/null 2>&1 ) \
    || die "could not unpack the AppImage"
  [ -x "$tmp/squashfs-root/AppRun" ] || die "unpacked AppImage has no AppRun"

  rm -rf "$LIBDIR/app"
  mv "$tmp/squashfs-root" "$LIBDIR/app"

  # the bundle already ships a hicolor tree; copy it across size-for-size
  # rather than dropping one arbitrary png into a directory it doesn't match
  if [ -d "$LIBDIR/app/usr/share/icons/hicolor" ]; then
    ( cd "$LIBDIR/app/usr/share/icons/hicolor" && find . -name 'fygram.png' ) \
    | while read -r rel; do
        mkdir -p "$PREFIX/share/icons/hicolor/$(dirname "$rel")"
        cp "$LIBDIR/app/usr/share/icons/hicolor/$rel" \
           "$PREFIX/share/icons/hicolor/$rel"
      done
  fi

  cat > "$BINDIR/fygram" <<EOF
#!/usr/bin/env sh
exec "$LIBDIR/app/AppRun" "\$@"
EOF
  chmod 755 "$BINDIR/fygram"
fi

cat > "$APPS/fygram.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=fygram
Comment=Music player for your Telegram channels
Exec=$BINDIR/fygram
Icon=fygram
Terminal=false
Categories=AudioVideo;Audio;Player;
StartupWMClass=fygram
EOF

update-desktop-database "$APPS" 2>/dev/null || true
gtk-update-icon-cache -f "$PREFIX/share/icons/hicolor" 2>/dev/null || true

echo
echo "fygram is installed — look for it in your app menu."
case ":$PATH:" in
  *":$BINDIR:"*) echo "or run: fygram" ;;
  *) echo "to run it from a terminal, add $BINDIR to your PATH" ;;
esac
echo "to remove it: rm -rf $LIBDIR $BINDIR/fygram $APPS/fygram.desktop \\"
echo "                     $PREFIX/share/icons/hicolor/*/apps/fygram.png"
echo "              gtk-update-icon-cache -f $PREFIX/share/icons/hicolor"
