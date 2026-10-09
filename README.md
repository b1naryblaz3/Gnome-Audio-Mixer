# GNOME App Volume Panel Mixer

A compact GNOME Shell top-panel mixer for per-application audio control.

Stable release: **v1.1.0**, with GNOME Shell 49–51 support and output quick switching.

[Download the latest release](https://github.com/b1naryblaz3/Gnome-Audio-Mixer/releases/latest)

![GNOME App Volume Panel Mixer screenshot](https://raw.githubusercontent.com/b1naryblaz3/Gnome-Audio-Mixer/main/docs/screenshot.png)

## Development credits

This project was **vibe-coded collaboratively by [b1naryblaz3](https://github.com/b1naryblaz3) and ChatGPT (OpenAI)**.

ChatGPT assisted with architecture, implementation, debugging, API review, and code review. b1naryblaz3 directed the project, chose the product behaviour, and tested it on a real GNOME Shell / CachyOS Wayland system.

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
- One-click output switcher: right-click the panel icon to flip between two remembered audio outputs
- Small **1 / 2** indicator beside the panel icon shows the active preset
- Collapsible **Output switcher settings** at the bottom; expands automatically until both presets are configured
- No continuous polling or live VU meters

## Supported GNOME versions

- GNOME Shell 49
- GNOME Shell 50
- GNOME Shell 51

The baseline was runtime-tested on GNOME Shell 50.4. The output-switching release candidate was also confirmed working on the maintainer's GNOME / CachyOS Wayland system. Compatibility code supports GNOME 49–51; this is not a claim that every combination of Shell version and audio hardware has been tested.

## GNOME 51 port

The GNOME 51 compatibility update:

- accepts the new `St.ButtonMask.PRIMARY` and `St.ButtonMask.MIDDLE` names, with fallbacks for older Shell releases;
- uses `Clutter.ScrollController` for panel-icon volume scrolling on GNOME 51;
- retains the legacy scroll-event path on GNOME 49/50;
- handles middle-click mute through a dedicated `Clutter.ClickGesture` on GNOME 50/51;
- keeps the same UUID and GSettings schema, so remembered application volumes continue to work.

## Quick output switch

1. Left-click the panel icon and expand **Output switcher settings** at the bottom. It opens automatically until both presets are configured.
2. Choose an output under **Preset 1** and a different output under **Preset 2** (for example, speakers and a USB headset).
3. **Right-click the panel icon** to flip between them.

The small number beside the icon shows the active preset. A dash means neither selected preset is active, or presets have not been configured. If another output is active, switching selects preset 1 first.

Selections survive logout and reboot. A disconnected device keeps its preset and becomes usable again when it reconnects with the same sink name. Right-click shows a notification when its target is unavailable. Selecting the same device in the other slot clears its previous slot.

Switching uses GNOME's normal output-device action. Applications with explicitly pinned audio routing may retain their own routing. Presets select outputs (sinks), not microphone inputs or separate ports on the same sound card.

## Audio stack

The extension uses GNOME Shell's existing GVC mixer control for volume operations.

For improved application identification it also runs:

```bash
pactl -f json list sink-inputs
```

asynchronously when audio stream topology changes. If `pactl` is unavailable or times out, the mixer falls back to GVC-provided identity information.

On Arch/CachyOS, `pactl` is provided by the `libpulse` package and works with `pipewire-pulse`.

## Install from a release ZIP

Download **gnome-audio-mixer-v1.1.0.zip** from the [latest release](https://github.com/b1naryblaz3/Gnome-Audio-Mixer/releases/latest), then run:

```bash
gnome-extensions install --force ./gnome-audio-mixer-v1.1.0.zip
```

Log out and back in to reload the extension, then enable it if needed:

```bash
gnome-extensions enable app-volume-panel-v4@appvol.local
```

Existing remembered volumes and output presets are preserved. The release ZIP includes the compiled settings schema; no extraction or install script is needed.

## Install or update from source

Download a fresh source checkout and run the installer:

```bash
git clone --depth 1 https://github.com/b1naryblaz3/Gnome-Audio-Mixer.git Gnome-Audio-Mixer-update
cd Gnome-Audio-Mixer-update
bash tools/install.sh
```

The installer compiles the settings schema before copying the extension into your user extension directory. Existing remembered volumes and output presets are kept. Log out and back in, then select outputs 1 and 2 under **Preset 1** and **Preset 2**.

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
outputs.js       Quick-switch preset resolution
ui.js            Panel indicator, popup rows and interaction
stylesheet.css   Popup styling
metadata.json    GNOME extension metadata
schemas/         GSettings schema for remembered app volumes
```

## Development notes

Public releases now use semantic versions starting at **1.0.0**. The earlier 4.x/5.x names were development iterations. GNOME's separate integer `version` continues increasing (512 for 1.0.0) so existing installations recognise this as an update.

To build an installable ZIP:

```bash
bash tools/package.sh
```

This requires `glib-compile-schemas` and Python 3. The package is written to `dist/` and contains only extension files and the compiled settings schema.

The current UUID remains:

```text
app-volume-panel-v4@appvol.local
```

The UUID is intentionally unchanged for this port so an existing installation keeps its extension identity and remembered GSettings values. Before an extensions.gnome.org release, the project should decide whether to keep this UUID permanently or migrate once to a release UUID.

## Known limitations

- Application identity sometimes depends on PulseAudio-compatible metadata exposed by PipeWire through `pactl`.
- The popup is rebuilt when stream topology changes rather than updating every row in place.
- GNOME 50/51 `PanelMenu.Button` currently exposes its built-in click gesture as an internal field. The compatibility shim only uses it to restrict menu opening to primary click, and this should be rechecked for each future Shell release.

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
