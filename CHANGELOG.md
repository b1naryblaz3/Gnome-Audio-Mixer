# Changelog

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
