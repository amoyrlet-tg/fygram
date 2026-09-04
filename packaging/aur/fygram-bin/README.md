# Publishing fygram-bin to the AUR

This PKGBUILD downloads the prebuilt Arch x86_64 binary + icon that the
`arch` job in `.github/workflows/release.yml` already attaches to every
GitHub release (`fygram-arch-installer.tar.gz`), and packages it the
proper Arch way (binary in `/usr/bin`, icon in the hicolor theme, a real
`.desktop` entry) — so `yay -S fygram-bin` / `paru -S fygram-bin`
just works, no compiling required.

The package is live: `yay -S fygram-bin` / `paru -S fygram-bin` works.

This copy is the source of truth. The AUR repo
(`ssh://aur@aur.archlinux.org/fygram-bin.git`) holds only `PKGBUILD` and
`.SRCINFO`, and both are kept identical to the ones here — check with a
plain `diff` before pushing anything.

Pushing needs an SSH key registered under
https://aur.archlinux.org/account/*/edit. One is registered on this
machine already; `ssh aur@aur.archlinux.org` printing a welcome banner
rather than "Permission denied" is how you confirm that.

## Updating on a new release

The checksum has to come from the asset GitHub actually published, so
this only works _after_ the release is out of draft.

1. Bump `pkgver` and reset `pkgrel=1` in `PKGBUILD` here.
2. `updpkgsums && makepkg --printsrcinfo > .SRCINFO`
   (`updpkgsums` downloads the new tarball and rewrites `sha256sums`; with
   no `makepkg` at hand, `sha256sum` the asset and edit both files by hand.)
3. Copy `PKGBUILD` and `.SRCINFO` into a checkout of the AUR repo and
   `git commit -am "upgpkg: fygram-bin X.Y.Z-1" && git push`.

If you only need to fix packaging and not bump the app version, bump
`pkgrel` instead (e.g. `1` → `2`) and skip `updpkgsums`.
