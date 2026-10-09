import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {MixerModel} from './audio.js';
import {MixerButton} from './ui.js';

export default class AppVolumePanelExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._model = new MixerModel(this._settings);
        this._button = new MixerButton(
            this._model.control,
            (key, value) => this._model.rememberVolume(key, value),
            () => {
                try {
                    if (!this._model.switchOutput())
                        Main.notify('App Volume Mixer',
                            'Choose two connected outputs under Quick-switch presets.');
                } catch (error) {
                    console.warn(`App Volume Panel Mixer: output switch failed: ${error}`);
                    Main.notify('App Volume Mixer', 'Could not switch audio output.');
                }
            },
            (slot, name) => this._model.selectOutputPreset(slot, name)
        );
        Main.panel.addToStatusArea(this.uuid, this._button, 0, 'right');
        this._model.start(state => this._button.rebuild(state));
    }

    disable() {
        this._button?.destroy();
        this._button = null;
        this._model?.destroy();
        this._model = null;
        this._settings = null;
    }
}
