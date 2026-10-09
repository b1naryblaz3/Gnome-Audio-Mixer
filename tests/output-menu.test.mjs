import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

class Menu {
    constructor(top = null) {
        this.items = [];
        this.top = top ?? this;
        this.opened = null;
        this.isOpen = false;
    }
    addMenuItem(item) {
        this.items.push(item);
        item.parent = this;
        if (item.menu)
            item.menu.top = this.top;
    }
    open() {
        // Mirrors GNOME's one-open-submenu tracking on the top menu.
        if (this.top.opened)
            this.top.opened.isOpen = false;
        this.top.opened = this;
        this.isOpen = true;
    }
}
class Item {
    constructor(text) {
        this.label = {text, clutter_text: {}, add_style_class_name() {}};
        this.handlers = new Map();
        this.sensitive = true;
    }
    connect(name, handler) { this.handlers.set(name, handler); }
    setSensitive(value) { this.sensitive = value; }
    setOrnament() {}
    activate() { this.handlers.get('activate')?.(); }
}
class SubmenuItem extends Item {
    constructor(text) { super(text); this.menu = new Menu(); }
    activate() { this.menu.open(); }
}
const code = readFileSync(new URL('../ui.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\n/gm, '').replace(/^export /gm, '');
const MixerButton = new Function('GObject', 'St', 'Clutter', 'Pango', 'PopupMenu', 'Slider', 'PanelMenu',
    code + '\nreturn MixerButton;')(
    {registerClass: value => value}, {ButtonMask: {PRIMARY: 1, MIDDLE: 2}}, {},
    {EllipsizeMode: {END: 1}},
    {PopupBaseMenuItem: Item, PopupMenuItem: Item, PopupSubMenuMenuItem: SubmenuItem,
        PopupSeparatorMenuItem: Item, Ornament: {CHECK: 1, NONE: 0}}, {}, {Button: class {}});
const button = Object.create(MixerButton.prototype);
button.menu = new Menu();
const selected = [];
button._onSelectOutputPreset = (slot, name) => selected.push([slot, name]);
let switches = 0;
button._onSwitchOutput = () => switches++;
button._addQuickOutputs([{name: 'speakers', label: 'Speakers'}, {name: 'usb', label: 'Headset'}], {
    presets: [{name: 'speakers', label: 'Speakers', available: true, active: true},
        {name: 'usb', label: 'Headset', available: true, active: false}],
    targetSlot: 1, canSwitch: true,
});
const selectors = button.menu.items.filter(item => item instanceof SubmenuItem);
assert.equal(selectors.length, 2, 'Both preset selectors must be direct children of the main menu');
for (const [slot, selector] of selectors.entries()) {
    assert.equal(selector.parent, button.menu);
    assert.equal(selector.menu.items.some(item => item instanceof SubmenuItem), false,
        'Selectors must contain device choices, not nested selectors');
    selector.activate();
    assert.equal(selector.menu.isOpen, true);
    if (slot === 1)
        assert.equal(selectors[0].menu.isOpen, false);
    selector.menu.items[1].activate();
    selector.menu.items.at(-1).activate();
}
assert.deepEqual(selected, [[0, 'usb'], [0, ''], [1, 'usb'], [1, '']]);
button.menu.items[0].activate();
assert.equal(switches, 1);
console.log('Preset submenu layout and selection callback checks passed.');
