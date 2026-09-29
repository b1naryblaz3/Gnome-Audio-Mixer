# GNOME App Volume Panel Mixer

A compact GNOME Shell top-panel mixer for per-application audio control.

Current stable development baseline: **v4.2.2**.

## Features

- Native GNOME top-panel indicator and popup
- Master output and microphone input sliders
- Per-application output volume sliders
- Groups multiple audio streams from the same application into one row
- Better Electron/browser identification using PipeWire/Pulse metadata
- Discord streams such as `Playback` and `playStream` are grouped under Discord when `application.process.binary` identifies Discord
- Remembers per-application volume using GSettings
- New streams inherit the application's current volume
- Click an application icon to mute/unmute it
- Scroll over the panel icon to adjust master output volume
- Middle-click the panel icon to mute/unmute master output
- No continuous polling or live VU meters

## Supported GNOME versions

- GNOME Shell 49
- GNOME Shell 50

The current development system is GNOME Shell 50.4 on Wayland.

## Audio stack

The extension uses GNOME Shell's existing GVC mixer control for volume operations.

For improved application identification it also runs:

```bash
pactl -f json list sink-inputs
```

asynchronously when audio stream topology changes. If `pactl` is unavailable or times out, the mixer falls back to GVC-provided identity information.

On Arch/CachyOS, `pactl` is provided by the `libpulse` package and works with `pipewire-pulse`.

## Install from a packaged ZIP

```bash
gnome-extensions disable app-volume-panel-v4@appvol.local 2>/dev/null || true
gnome-extensions install ./app-volume-panel-v4@appvol.local.zip --force
gnome-extensions enable app-volume-panel-v4@appvol.local
```

On Wayland, changed JavaScript under an already-loaded UUID may require logging out and back in for a guaranteed clean reload.

## Install from source for development

Clone the repository, then copy or symlink it into your user extension directory:

```bash
mkdir -p ~/.local/share/gnome-shell/extensions
ln -s "$(pwd)" ~/.local/share/gnome-shell/extensions/app-volume-panel-v4@appvol.local
```

Compile the settings schema:

```bash
glib-compile-schemas schemas/
```

Then log out/in and enable the extension:

```bash
gnome-extensions enable app-volume-panel-v4@appvol.local
```

## Project structure

```text
extension.js     Extension lifecycle and panel registration
audio.js         GVC/PipeWire stream model, grouping, metadata and persistence
ui.js            Panel indicator, popup rows and interaction
stylesheet.css   Popup styling
metadata.json    GNOME extension metadata
schemas/         GSettings schema for remembered app volumes
```

## Development notes

The current UUID is still the development UUID:

```text
app-volume-panel-v4@appvol.local
```

Before a public extensions.gnome.org release, the project should move to a permanent release UUID and review GNOME 51 compatibility, particularly the panel middle-click implementation.

## Known limitations

- Application identity sometimes depends on PulseAudio-compatible metadata exposed by PipeWire through `pactl`.
- The popup is rebuilt when stream topology changes rather than updating every row in place.
- The GNOME 50 middle-click implementation touches an internal panel click gesture, so that area should be revalidated for future Shell releases.

## Diagnostics

Show extension-related GNOME Shell errors from the last 15 minutes:

```bash
journalctl --user --since "15 minutes ago" _COMM=gnome-shell -o cat | \
  grep -Ei 'app-volume-panel|JS ERROR|TypeError|ReferenceError|CRITICAL'
```

Verify no `pactl` helper is left running while idle:

```bash
pgrep -af pactl
```
