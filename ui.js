import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Slider from 'resource:///org/gnome/shell/ui/slider.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';

import {
    normalVolume,
    setStreamLevel,
    setStreamMuted,
    streamMuted,
    streamVolume,
    toggleStreamMute,
} from './audio.js';

const MASTER_SCROLL_STEP = 0.05;

function clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, value));
}

const VolumeRow = GObject.registerClass(
class VolumeRow extends PopupMenu.PopupBaseMenuItem {
    _init(params) {
        super._init({reactive: false, can_focus: false});

        this._streams = params.streams;
        this._control = params.control;
        this._maximum = params.maximum;
        this._key = params.key ?? null;
        this._name = params.name;
        this._onVolumeChanged = params.onVolumeChanged ?? null;
        this.add_style_class_name('app-volume-row');

        const iconParams = {style_class: 'popup-menu-icon app-volume-icon'};
        if (params.gicon)
            iconParams.gicon = params.gicon;
        else
            iconParams.icon_name = params.iconName ?? 'audio-x-generic-symbolic';

        this._iconButton = new St.Button({
            can_focus: true,
            reactive: true,
            track_hover: true,
            button_mask: St.ButtonMask.ONE | St.ButtonMask.TWO,
            accessible_name: `Mute ${params.name}`,
            style_class: 'app-volume-icon-button',
            child: new St.Icon(iconParams),
        });
        this._iconButton.connect('clicked', () => this._toggleMute());
        this.add_child(this._iconButton);

        const label = new St.Label({
            text: params.name,
            style_class: 'app-volume-label',
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.START,
        });
        label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        label.clutter_text.single_line_mode = true;
        this.add_child(label);

        this._slider = new Slider.Slider(0);
        this._slider.x_expand = true;
        this._slider.y_align = Clutter.ActorAlign.CENTER;
        this._slider.maximum_value = this._maximum;
        this._slider.accessible_name = `${params.name} volume`;
        this._sliderChangedId = this._slider.connect(
            'notify::value', () => this._sliderChanged());
        this.add_child(this._slider);

        for (const stream of this._streams) {
            stream.connectObject(
                'notify::volume', () => this._sync(),
                'notify::is-muted', () => this._sync(),
                this
            );
        }
        this._sync();
    }

    _allMuted() {
        return this._streams.length > 0 &&
            this._streams.every(stream => streamMuted(stream));
    }

    _toggleMute() {
        const mute = !this._allMuted();
        for (const stream of this._streams)
            setStreamMuted(stream, mute, this._control);
    }

    _sliderChanged() {
        const level = clamp(this._slider.value, 0, this._maximum);
        for (const stream of this._streams)
            setStreamLevel(stream, level, this._control);
        if (this._key && this._onVolumeChanged)
            this._onVolumeChanged(this._key, level);
    }

    _sync() {
        if (!this._streams.length)
            return;

        let audibleTotal = 0;
        let audibleCount = 0;
        for (const stream of this._streams) {
            const current = streamVolume(stream);
            if (!streamMuted(stream)) {
                audibleTotal += current;
                audibleCount++;
            }
        }

        const normal = normalVolume(this._control);
        const shownLevel = audibleCount ? audibleTotal / audibleCount / normal : 0;

        this._slider.block_signal_handler(this._sliderChangedId);
        this._slider.value = clamp(shownLevel, 0, this._maximum);
        this._slider.unblock_signal_handler(this._sliderChangedId);
        const allMuted = this._allMuted();
        this._iconButton.opacity = allMuted ? 160 : 255;
        this._iconButton.accessible_name = `${allMuted ? 'Unmute' : 'Mute'} ${this._name}`;
    }

    destroy() {
        // connectObject() tracks this row as the signal owner, so destroying
        // the row disconnects the stream handlers automatically. Avoid
        // touching a stream that may already have been removed/disposed.
        this._streams = [];
        this._onVolumeChanged = null;
        super.destroy();
    }
});

export const MixerButton = GObject.registerClass(
class MixerButton extends PanelMenu.Button {
    _init(control, onAppVolumeChanged) {
        super._init(0.0, 'App Volume Mixer', false);

        this._control = control;
        this._onAppVolumeChanged = onAppVolumeChanged;
        this._master = null;
        this._maximum = 1;

        // GNOME 50 moved panel clicks to ClickGesture; GNOME 49 has no member.
        if (this._clickGesture?.set_required_button)
            this._clickGesture.set_required_button(1);

        this._panelIcon = new St.Icon({
            icon_name: 'audio-volume-high-symbolic',
            style_class: 'system-status-icon',
        });
        this.add_child(this._panelIcon);
        this.connect('scroll-event', (_actor, event) => this._scroll(event));
    }

    vfunc_event(event) {
        if (event.type() === Clutter.EventType.BUTTON_PRESS) {
            const button = event.get_button();
            if (button === 2) {
                toggleStreamMute(this._master, this._control);
                return Clutter.EVENT_STOP;
            }
            if (!this._clickGesture && button === 1) {
                this.menu.toggle();
                return Clutter.EVENT_STOP;
            }
        } else if (event.type() === Clutter.EventType.TOUCH_BEGIN && !this._clickGesture) {
            this.menu.toggle();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    }

    _scroll(event) {
        if (event.get_flags() & Clutter.EventFlags.FLAG_POINTER_EMULATED)
            return Clutter.EVENT_PROPAGATE;

        let steps = 0;
        const direction = event.get_scroll_direction();
        if (direction === Clutter.ScrollDirection.UP)
            steps = 1;
        else if (direction === Clutter.ScrollDirection.DOWN)
            steps = -1;
        else if (direction === Clutter.ScrollDirection.SMOOTH) {
            const [, dy] = event.get_scroll_delta();
            steps = -dy;
            if (event.get_scroll_flags() & Clutter.ScrollFlags.INVERTED)
                steps *= -1;
        }

        if (Math.abs(steps) <= 0.01 || !this._master)
            return Clutter.EVENT_PROPAGATE;

        const current = streamVolume(this._master) / normalVolume(this._control);
        setStreamLevel(this._master,
            clamp(current + steps * MASTER_SCROLL_STEP, 0, this._maximum),
            this._control);
        return Clutter.EVENT_STOP;
    }

    _setMaster(stream) {
        if (stream === this._master)
            return;

        this._master?.disconnectObject(this);
        this._master = stream;
        this._master?.connectObject(
            'notify::volume', () => this._syncPanelIcon(),
            'notify::is-muted', () => this._syncPanelIcon(),
            this
        );
        this._syncPanelIcon();
    }

    _syncPanelIcon() {
        if (!this._master) {
            this._panelIcon.icon_name = 'audio-volume-high-symbolic';
            return;
        }
        if (streamMuted(this._master) || streamVolume(this._master) < 1) {
            this._panelIcon.icon_name = 'audio-volume-muted-symbolic';
            return;
        }

        const level = streamVolume(this._master) / normalVolume(this._control);
        if (level > 1)
            this._panelIcon.icon_name = 'audio-volume-overamplified-symbolic';
        else if (level < 0.34)
            this._panelIcon.icon_name = 'audio-volume-low-symbolic';
        else if (level < 0.67)
            this._panelIcon.icon_name = 'audio-volume-medium-symbolic';
        else
            this._panelIcon.icon_name = 'audio-volume-high-symbolic';
    }

    rebuild({sink, source, groups, maximum}) {
        this._maximum = maximum;
        this._setMaster(sink);
        this.menu.removeAll();

        const addRow = params => this.menu.addMenuItem(new VolumeRow({
            control: this._control,
            maximum,
            onVolumeChanged: this._onAppVolumeChanged,
            ...params,
        }));

        if (sink)
            addRow({streams: [sink], name: 'Output', iconName: 'audio-volume-high-symbolic'});
        if (source)
            addRow({streams: [source], name: 'Input', iconName: 'audio-input-microphone-symbolic'});
        if ((sink || source) && groups.length)
            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        for (const group of groups)
            addRow(group);

        if (!sink && !source && !groups.length) {
            this.menu.addMenuItem(new PopupMenu.PopupMenuItem('No active audio streams', {
                reactive: false,
                can_focus: false,
            }));
        }
    }

    destroy() {
        this._master?.disconnectObject(this);
        this._master = null;
        this._onAppVolumeChanged = null;
        super.destroy();
    }
});
