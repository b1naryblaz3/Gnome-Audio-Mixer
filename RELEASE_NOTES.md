# App Volume Panel Mixer 1.0.0

First stable public release, based on the development build tested by the maintainer on GNOME / CachyOS Wayland.

## One-click output switcher

Save two preferred outputs, such as your USB headset and speakers. One right-click on the panel icon flips between them. You can also click **Switch output** at the top of the mixer. The **1 / 2** indicator beside the panel icon shows the active preset.

![Mixer with output switcher and two device presets](https://raw.githubusercontent.com/b1naryblaz3/Gnome-Audio-Mixer/main/docs/screenshot.png)

## Features

- Master output and microphone volume sliders.
- Grouped per-application volume and mute controls, with remembered levels.
- Two saved audio output presets: choose them under Preset 1 and Preset 2, then right-click the panel icon to switch.
- A small 1 / 2 panel indicator shows the active preset.
- Scroll the panel icon to adjust master volume; middle-click to mute.
- Supports GNOME Shell 49, 50 and 51, using GNOME's GVC mixer and PipeWire/PulseAudio-compatible metadata.

## Installation

Download **app-volume-panel-v4@appvol.local.zip** below, then run:

```bash
gnome-extensions install --force ./app-volume-panel-v4@appvol.local.zip
```

Log out and back in. Enable the extension if needed:

```bash
gnome-extensions enable app-volume-panel-v4@appvol.local
```

The package includes the compiled settings schema. Existing remembered volumes and output presets are preserved. Choose the attached extension ZIP for installation; GitHub's automatic source archives are source code.

## Versioning and validation

This is public version **1.0.0**. Earlier 4.x/5.x labels were development iterations. The internal GNOME version counter is **512**, so this release remains an update to those builds.

JavaScript syntax, preset/model checks, submenu selection checks, strict schema compilation and ZIP integrity checks passed. The maintainer confirmed that the preceding build's preset selection and right-click output switching work on his GNOME system. No audio-control behavior changed for the stable release.

## Known limitations

- Presets choose output sinks, not microphone inputs or separate ports on one sound card.
- A disconnected target cannot be selected until it reconnects.
- Applications with explicitly pinned audio routing may retain their own routing.
- Application naming can depend on metadata exposed through `pactl`; the mixer falls back to GNOME-provided identity information when it is unavailable.
