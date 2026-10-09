import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const strip = code => code.replace(/^import[\s\S]*?;\n/gm, '').replace(/^export /gm, '');
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const quickOutputState = new Function(strip(read('../outputs.js')) + '\nreturn quickOutputState;')();
const MixerModel = new Function('quickOutputState', strip(read('../audio.js')) + '\nreturn MixerModel;')(quickOutputState);
const outputs = [{name: 'speakers', label: 'Speakers'}, {name: 'usb', label: 'Headset'}];
const names = ['speakers', 'usb'];
for (const [current, target] of [['speakers', 1], ['usb', 0], ['hdmi', 0]]) {
    const state = quickOutputState(outputs, names, [], current);
    assert.equal(state.targetSlot, target);
    assert.equal(state.canSwitch, true);
}
for (const saved of [[], ['speakers'], ['', 'usb'], ['usb', 'usb']])
    assert.equal(quickOutputState(outputs, saved, [], 'speakers').canSwitch, false);
const disconnected = quickOutputState(outputs.slice(0, 1), names, ['Speakers', 'Headset'], 'speakers');
assert.equal(disconnected.canSwitch, false);
assert.equal(disconnected.presets[1].label, 'Headset');
assert.equal(quickOutputState(outputs, names, [], 'speakers').canSwitch, true);
assert.equal(quickOutputState(outputs.slice(0, 1), names, [], 'usb').canSwitch, true);

const saved = new Map([['quick-output-names', [...names]], ['quick-output-labels', ['Speakers', 'Headset']]]);
let activeName = 'speakers';
let liveNames = [...names];
let activated = null;
const model = Object.create(MixerModel.prototype);
model._settings = {
    get_strv: key => [...saved.get(key)],
    set_strv: (key, value) => saved.set(key, [...value]),
};
const sinks = () => liveNames.map(name => ({
    get_name: () => name,
    get_description: () => name === 'usb' ? 'Headset' : 'Speakers',
}));
model.control = {
    get_sinks: sinks,
    get_default_sink: () => sinks().find(stream => stream.get_name() === activeName),
    lookup_device_from_stream: stream => ({name: stream.get_name(), id: 999}),
    change_output: device => {activated = device; activeName = device.name;},
};
assert.equal(model.switchOutput(), true);
assert.equal(activated.name, 'usb');
assert.equal(model.switchOutput(), true);
assert.equal(activated.name, 'speakers');
liveNames = ['speakers'];
activated = null;
assert.equal(model.switchOutput(), false);
assert.equal(activated, null);
liveNames = [...names];
assert.equal(model.switchOutput(), true);
assert.equal(activated.name, 'usb');
model.selectOutputPreset(1, 'speakers');
assert.deepEqual(saved.get('quick-output-names'), ['', 'speakers']);
model.selectOutputPreset(0, 'usb');
assert.equal(saved.get('quick-output-labels')[0], 'Headset');
model.selectOutputPreset(0, '');
assert.equal(saved.get('quick-output-names')[0], '');
assert.equal(saved.get('quick-output-labels')[0], '');
model.selectOutputPreset(0, 'missing');
assert.equal(saved.get('quick-output-names')[0], '');
console.log('Output preset and mocked GVC switching checks passed.');
