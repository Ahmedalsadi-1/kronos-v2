# KronOS macOS installer artwork

The disk image and installed app use `build/kronos.icns`, the KronOS cube icon.
The installer opens at 400 x 490 points. Its app and Applications icons are native
Finder items centered at (200, 134) and (200, 347), with 96-point icons.

`background.png` and `background@2x.png` contain the silver chrome glow, drag cursor trail, and
instructions only. Electron-builder combines both resolutions for Retina displays.
Finder supplies the draggable icons and their labels; they are not baked into the
background.

## Preview and regenerate

From the repository root, run `python3 -m http.server 4178 --bind 127.0.0.1`, then
open <http://127.0.0.1:4178/build/dmg/artwork.html>. This is a visual preview, not an
installer. It renders a fixed frame of the exact shader from
`website/src/os-liquid-chrome.tsx`, the website logo, the packaged app icon, and
the macOS Applications folder icon.

Use **Save Retina artwork** to replace `background@2x.png`, then create the 1x file:

```sh
node -e "require('sharp')('build/dmg/background@2x.png').resize(400, 490).png().toFile('build/dmg/background.png')"
```

The preview includes a simulated title bar. macOS controls the actual Finder
window chrome. No DMG build or release is needed to update these assets.
