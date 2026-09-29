import Shell from 'gi://Shell';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Volume from 'resource:///org/gnome/shell/ui/status/volume.js';

const METADATA_DELAY_MS = 150;
const METADATA_TIMEOUT_MS = 1500;
const STORE_SAVE_DELAY_MS = 300;
const UNMUTE_DEFAULT_VOLUME = 0.25;
const ALLOW_AMPLIFIED_KEY = 'allow-volume-above-100-percent';
const MAX_STORED_LEVEL = 4;
const STORE_KEY = 'app-volumes';
const GENERIC_APP_NAMES = new Set([
    'chromium',
    'electron',
    'google chrome',
    'webrtc voiceengine',
]);
const GENERIC_BINARIES = new Set([
    'chrome',
    'chromium',
    'electron',
    'google-chrome',
    'chromium-browser',
    'java',
    'node',
    'python',
    'python3',
    'qtwebengineprocess',
    'webkitwebprocess',
    'wine',
    'wine64',
    'wine-preloader',
    'wine64-preloader',
]);

function text(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, value));
}

function identityKey(value) {
    return text(value).toLowerCase().replace(/\.desktop$/i, '');
}

function binaryName(value) {
    const valueText = text(value);
    return valueText ? GLib.path_get_basename(valueText) : '';
}

function prettyBinary(value) {
    return binaryName(value)
        .replace(/\.(?:bin|exe)$/i, '')
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

export function normalVolume(control) {
    return control.get_vol_max_norm();
}

export function streamMuted(stream) {
    return stream.get_is_muted();
}

export function streamVolume(stream) {
    return stream.get_volume();
}

export function setStreamLevel(stream, level, control) {
    const raw = Math.round(Math.max(0, level) * normalVolume(control));
    const wasMuted = streamMuted(stream);

    if (stream.set_volume(raw))
        stream.push_volume();

    if (raw < 1 && !wasMuted)
        stream.change_is_muted(true);
    else if (raw >= 1 && wasMuted)
        stream.change_is_muted(false);
}

export function setStreamMuted(stream, muted, control) {
    if (!stream)
        return;

    if (!muted && streamVolume(stream) < 1) {
        const raw = Math.round(UNMUTE_DEFAULT_VOLUME * normalVolume(control));
        if (stream.set_volume(raw))
            stream.push_volume();
    }
    stream.change_is_muted(muted);
}

export function toggleStreamMute(stream, control) {
    if (stream)
        setStreamMuted(stream, !streamMuted(stream), control);
}

function desktopApp(identity) {
    const raw = text(identity).replace(/\.desktop$/i, '');
    if (!raw)
        return null;

    const apps = Shell.AppSystem.get_default();
    const lower = raw.toLowerCase();
    const tail = raw.split('.').filter(Boolean).pop() ?? raw;
    const candidates = [...new Set([raw, lower, tail, tail.toLowerCase()])];

    for (const candidate of candidates) {
        const app = apps.lookup_app(`${candidate}.desktop`);
        if (app)
            return app;

        const wmClassApp = apps.lookup_desktop_wmclass(candidate);
        if (wmClassApp)
            return wmClassApp;

        const startupApp = apps.lookup_startup_wmclass(candidate);
        if (startupApp)
            return startupApp;

        const heuristicApp = apps.lookup_heuristic_basename(candidate);
        if (heuristicApp)
            return heuristicApp;
    }

    return null;
}

function desktopAppFromPid(pid) {
    const value = Number.parseInt(pid, 10);
    if (!Number.isFinite(value) || value <= 0)
        return null;

    const app = Shell.WindowTracker.get_default().get_app_from_pid(value);
    return app?.is_window_backed() ? null : app;
}

function appIcon(app) {
    return app ? app.get_icon() : null;
}

class VolumeStore {
    constructor(settings) {
        this._settings = settings;
        this._values = new Map();
        this._saveTimer = 0;
        this._dirty = false;

        const saved = this._settings.get_value(STORE_KEY).deepUnpack();
        for (const [key, value] of Object.entries(saved)) {
            if (Number.isFinite(value) && value >= 0 && value <= MAX_STORED_LEVEL)
                this._values.set(key, value);
        }
    }

    get(key) {
        return this._values.get(key);
    }

    set(key, value) {
        if (!key || !Number.isFinite(value))
            return;

        value = clamp(value, 0, MAX_STORED_LEVEL);
        if (Math.abs((this._values.get(key) ?? -1) - value) < 0.002)
            return;

        this._values.set(key, value);
        this._dirty = true;

        if (this._saveTimer)
            GLib.Source.remove(this._saveTimer);
        this._saveTimer = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            STORE_SAVE_DELAY_MS,
            () => {
                this._saveTimer = 0;
                this._flush();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _flush() {
        if (!this._dirty)
            return;

        this._settings.set_value(
            STORE_KEY,
            new GLib.Variant('a{sd}', Object.fromEntries(this._values))
        );
        this._dirty = false;
    }

    destroy() {
        if (this._saveTimer) {
            GLib.Source.remove(this._saveTimer);
            this._saveTimer = 0;
        }
        this._flush();
        this._settings = null;
    }
}

export class MixerModel {
    constructor(settings) {
        this.control = Volume.getMixerControl();
        this._soundSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.sound'});
        this._store = new VolumeStore(settings);
        this._metadata = new Map();
        this._knownStreamIds = new Set();
        this._metadataTimer = 0;
        this._metadataTimeout = 0;
        this._metadataBusy = false;
        this._metadataPending = false;
        this._metadataProcess = null;
        this._metadataCancellable = null;
        this._pactl = GLib.find_program_in_path('pactl');
        this._pactlWarningShown = false;
        this._onChanged = null;
    }

    start(onChanged) {
        this._onChanged = onChanged;
        this.control.connectObject(
            'state-changed', () => this._queueMetadata(),
            'stream-added', () => this._queueMetadata(),
            'stream-removed', () => this._queueMetadata(),
            'default-sink-changed', () => this._render(),
            'default-source-changed', () => this._render(),
            this
        );
        this._soundSettings.connectObject(
            `changed::${ALLOW_AMPLIFIED_KEY}`, () => this._render(), this);
        this._queueMetadata(true);
    }

    rememberVolume(key, value) {
        this._store.set(key, value);
    }

    _maximum() {
        if (!this._soundSettings.get_boolean(ALLOW_AMPLIFIED_KEY))
            return 1;

        const normal = normalVolume(this.control);
        return clamp(
            this.control.get_vol_max_amplified() / normal,
            1,
            MAX_STORED_LEVEL
        );
    }

    _queueMetadata(immediate = false) {
        if (!this._onChanged)
            return;

        if (this._metadataTimer) {
            GLib.Source.remove(this._metadataTimer);
            this._metadataTimer = 0;
        }
        this._metadataTimer = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            immediate ? 0 : METADATA_DELAY_MS,
            () => {
                this._metadataTimer = 0;
                this._refreshMetadata();
                return GLib.SOURCE_REMOVE;
            }
        );
    }

    _refreshMetadata() {
        if (this._metadataBusy) {
            this._metadataPending = true;
            return;
        }

        if (!this._appStreams().length) {
            this._metadata.clear();
            this._render();
            return;
        }

        if (!this._pactl) {
            if (!this._pactlWarningShown) {
                console.warn(
                    'App Volume Panel Mixer: pactl not found; Electron/browser app names may be less accurate.');
                this._pactlWarningShown = true;
            }
            this._metadata.clear();
            this._render();
            return;
        }

        this._metadataBusy = true;
        this._metadataPending = false;
        const cancellable = new Gio.Cancellable();
        this._metadataCancellable = cancellable;

        try {
            this._metadataProcess = Gio.Subprocess.new(
                [this._pactl, '-f', 'json', 'list', 'sink-inputs'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
            );
        } catch (e) {
            this._metadataBusy = false;
            this._metadataCancellable = null;
            this._metadata.clear();
            console.warn(`App Volume Panel Mixer: could not start pactl: ${e}`);
            this._render();
            return;
        }

        const proc = this._metadataProcess;
        this._metadataTimeout = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            METADATA_TIMEOUT_MS,
            () => {
                this._metadataTimeout = 0;
                if (this._metadataCancellable === cancellable) {
                    cancellable.cancel();
                    try {
                        proc.force_exit();
                    } catch (_) {
                    }
                }
                return GLib.SOURCE_REMOVE;
            }
        );

        proc.communicate_utf8_async(null, cancellable, (_proc, result) => {
            let next = new Map();
            try {
                const [ok, stdout] = proc.communicate_utf8_finish(result);
                if (ok && proc.get_successful())
                    next = this._parseMetadata(stdout);
            } catch (e) {
                if (this._metadataCancellable === cancellable && !cancellable.is_cancelled())
                    console.warn(`App Volume Panel Mixer: failed to read pactl metadata: ${e}`);
            }

            if (this._metadataCancellable !== cancellable)
                return;

            if (this._metadataTimeout) {
                GLib.Source.remove(this._metadataTimeout);
                this._metadataTimeout = 0;
            }

            this._metadata = next;
            this._metadataBusy = false;
            this._metadataProcess = null;
            this._metadataCancellable = null;
            this._render();

            if (this._metadataPending) {
                this._metadataPending = false;
                this._queueMetadata();
            }
        });
    }

    _parseMetadata(stdout) {
        const result = new Map();
        const data = JSON.parse(stdout || '[]');
        if (!Array.isArray(data))
            return result;

        for (const item of data) {
            const index = Number(item?.index);
            if (!Number.isFinite(index))
                continue;
            const props = item?.properties ?? {};
            result.set(index, {
                appName: text(props['application.name']),
                appId: text(props['application.id']),
                binary: text(props['application.process.binary']),
                pid: text(props['application.process.id']),
            });
        }
        return result;
    }

    _appStreams() {
        // These are GObject properties in GJS. Their JS property names shadow
        // the C methods with the same names, so calling them as functions throws.
        return this.control.get_sink_inputs().filter(stream =>
            !stream.is_event_stream && !stream.is_virtual);
    }

    _streamId(stream) {
        return stream.get_id();
    }

    _pulseIndex(stream) {
        // pactl sink-input index == GVC stream index; get_id() is different.
        return stream.get_index();
    }

    _identity(stream) {
        const meta = this._metadata.get(this._pulseIndex(stream)) ?? {};
        const metadataAppId = text(meta.appId);
        const fallbackAppId = text(stream.get_application_id());
        const appId = metadataAppId || fallbackAppId;
        const binary = binaryName(meta.binary);
        const appName = text(meta.appName);

        let app = appId ? desktopApp(appId) : null;
        app ??= meta.pid ? desktopAppFromPid(meta.pid) : null;
        app ??= binary ? desktopApp(binary) : null;
        app ??= appName ? desktopApp(appName) : null;

        // Group identity is deliberately independent from PID/window lookup.
        // That prevents Discord helper processes from splitting into two rows.
        const genericBinary = GENERIC_BINARIES.has(identityKey(binary));
        const genericAppName = GENERIC_APP_NAMES.has(identityKey(appName));

        // Prefer stable application IDs when available. Discord and similar
        // Electron apps often have no app ID, so their non-generic process
        // binary remains the next strongest grouping key.
        if (metadataAppId)
            return {key: `appid:${identityKey(metadataAppId)}`, app, appId, binary, appName, fallback: metadataAppId};
        if (binary && !genericBinary)
            return {key: `binary:${identityKey(binary)}`, app, appId, binary, appName, fallback: binary};
        if (fallbackAppId)
            return {key: `appid:${identityKey(fallbackAppId)}`, app, appId, binary, appName, fallback: fallbackAppId};
        if (app) {
            const id = text(app.get_id()) || binary || appName;
            return {key: `app:${identityKey(id)}`, app, appId, binary, appName, fallback: id};
        }
        if (appName && !genericAppName)
            return {key: `appname:${identityKey(appName)}`, app, appId, binary, appName, fallback: appName};
        if (binary)
            return {key: `binary:${identityKey(binary)}`, app, appId, binary, appName, fallback: binary};
        if (appName)
            return {key: `appname:${identityKey(appName)}`, app, appId, binary, appName, fallback: appName};

        // GVC name is normally the client/app; description is often a media title.
        const name = text(stream.get_name());
        if (name)
            return {key: `name:${identityKey(name)}`, app: desktopApp(name), appId, binary, appName, fallback: name};

        const description = text(stream.get_description()) || 'Application';
        return {key: `stream:${this._streamId(stream)}`, app: null, appId, binary, appName, fallback: description};
    }

    _groups(streams) {
        const map = new Map();
        for (const stream of streams) {
            const info = this._identity(stream);
            const group = map.get(info.key) ?? {info, streams: []};
            if (!group.info.app && info.app)
                group.info.app = info.app;
            group.streams.push(stream);
            map.set(info.key, group);
        }

        const groups = [];
        for (const {info, streams: members} of map.values()) {
            let name = text(info.app?.get_name());
            const genericBinary = GENERIC_BINARIES.has(identityKey(info.binary));
            const genericAppName = GENERIC_APP_NAMES.has(identityKey(info.appName));
            if (!name && info.appName && !genericAppName)
                name = info.appName;
            if (!name && info.binary && !genericBinary)
                name = prettyBinary(info.binary);
            if (!name && info.appId)
                name = prettyBinary(info.appId.split('.').filter(Boolean).pop() || info.appId);
            if (!name && info.binary)
                name = prettyBinary(info.binary);
            if (!name && info.appName)
                name = info.appName;
            name ||= info.fallback || 'Application';

            let fallbackGIcon = null;
            for (const stream of members) {
                fallbackGIcon = stream.get_gicon();
                if (fallbackGIcon)
                    break;
            }
            groups.push({
                key: info.key,
                name,
                gicon: appIcon(info.app) ?? fallbackGIcon,
                iconName: 'audio-x-generic-symbolic',
                streams: members,
            });
        }

        return groups.sort((a, b) =>
            a.name.localeCompare(b.name, undefined, {sensitivity: 'base'}));
    }

    _meanLevel(streams) {
        const audible = streams.filter(stream => !streamMuted(stream));
        const relevant = audible.length ? audible : streams;
        return relevant.reduce((sum, stream) => sum + streamVolume(stream), 0) /
            relevant.length / normalVolume(this.control);
    }

    _restoreNewStreams(groups, maximum) {
        const currentIds = new Set();
        for (const group of groups) {
            const existing = [];
            const fresh = [];

            for (const stream of group.streams) {
                const id = this._streamId(stream);
                currentIds.add(id);
                (this._knownStreamIds.has(id) ? existing : fresh).push(stream);
            }

            // If the app is already active, a new sibling stream should
            // inherit the group's current live level rather than a stale value
            // from a previous session. Persisted volume is only used when the
            // whole application is appearing for the first time.
            const desired = existing.length
                ? this._meanLevel(existing)
                : this._store.get(group.key);
            if (!Number.isFinite(desired))
                continue; // First sight with no saved value: preserve app volume.

            const level = clamp(desired, 0, maximum);
            const inheritMuted = existing.length > 0
                ? existing.every(stream => streamMuted(stream))
                : null;
            for (const stream of fresh) {
                if (stream.set_volume(Math.round(level * normalVolume(this.control))))
                    stream.push_volume();

                if (inheritMuted !== null) {
                    const muted = level <= 0 || inheritMuted;
                    if (streamMuted(stream) !== muted)
                        stream.change_is_muted(muted);
                } else if (level <= 0 && !streamMuted(stream)) {
                    stream.change_is_muted(true);
                }
            }
        }
        this._knownStreamIds = currentIds;
    }

    _render() {
        if (!this._onChanged)
            return;

        const groups = this._groups(this._appStreams());
        const maximum = this._maximum();
        this._restoreNewStreams(groups, maximum);
        this._onChanged({
            sink: this.control.get_default_sink(),
            source: this.control.get_default_source(),
            groups,
            maximum,
        });
    }

    destroy() {
        this._onChanged = null;

        if (this._metadataTimer) {
            GLib.Source.remove(this._metadataTimer);
            this._metadataTimer = 0;
        }
        if (this._metadataTimeout) {
            GLib.Source.remove(this._metadataTimeout);
            this._metadataTimeout = 0;
        }

        const cancellable = this._metadataCancellable;
        this._metadataCancellable = null;
        cancellable?.cancel();
        try {
            this._metadataProcess?.force_exit();
        } catch (_) {
        }
        this._metadataProcess = null;
        this._metadataBusy = false;
        this._metadataPending = false;

        this.control.disconnectObject(this);
        this._soundSettings.disconnectObject(this);
        this._store.destroy();

        this._metadata.clear();
        this._knownStreamIds.clear();
        this._store = null;
        this._soundSettings = null;
        this.control = null;
    }
}
