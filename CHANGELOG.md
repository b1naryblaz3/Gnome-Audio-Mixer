# Changelog

## 5.1.1 - Preset selector fix

- Moved preset selectors to the top-level mixer menu. GNOME tracks one open submenu per main menu, so nested selectors closed their parent and could not be used.
- Added menu layout and selection callback regression checks.


## 5.1.0 - Output quick switch

- Added two persistent output presets, configurable from the top of the mixer popup.
- Added a top-of-menu action to flip between the selected outputs.
- Added right-click output switching and a small 1 / 2 panel indicator.
- Kept left-click menu opening, middle-click mute and scroll volume controls.
- Remembered disconnected device labels and disabled unavailable switch targets.
- Used stable sink names instead of session-specific device IDs.

## 5.0.0 - GNOME Shell 51 compatibility

- Added GNOME Shell 51 to the supported shell versions.
- Updated button-mask handling for GNOME 51's `PRIMARY` and `MIDDLE` names while retaining fallbacks for GNOME 49/50.
- Added GNOME 51 `Clutter.ScrollController` handling for panel-icon volume scrolling.
- Kept the legacy scroll-event path for GNOME 49/50 compatibility.
- Moved middle-click master mute to a dedicated public `Clutter.ClickGesture` on GNOME 50/51.
- Replaced numeric mouse-button values with Clutter button constants and compatibility fallbacks.
- Retained the existing application grouping, volume persistence, GVC control and `pactl` metadata behaviour.

## 4.2.2 - Stable development baseline

- Fixed GVC `is_event_stream` / `is_virtual` property access on GNOME 50.
- Corrected GVC stream matching to use Pulse/PipeWire sink-input indexes.
- Grouped multiple streams by resolved application identity.
- Improved Discord/Electron/browser identity resolution using `application.process.binary` metadata.
- Added per-application volume persistence with GSettings.
- New streams inherit the current grouped application volume.
- Added timeout and cancellation handling around `pactl` metadata lookup.
- Reduced redundant stream signal/disposal handling.
- Reused GNOME Shell's existing GVC mixer control rather than opening another audio connection.
- Added panel scroll master-volume control and middle-click master mute.
- Removed earlier dead APIs and experimental Quick Settings implementations.
