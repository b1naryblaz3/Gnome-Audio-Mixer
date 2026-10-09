// Sink names survive reconnects and reboots; numeric GVC IDs do not.
export function quickOutputState(outputs, names, labels, currentName) {
    const presets = [0, 1].map(slot => {
        const name = names[slot] ?? '';
        const output = outputs.find(candidate => candidate.name === name);
        return {
            name,
            label: output?.label || labels[slot] || name || 'Not selected',
            available: Boolean(output),
            active: Boolean(name) && name === currentName,
        };
    });
    const configured = presets.every(preset => preset.name) &&
        presets[0].name !== presets[1].name;
    // When a third output is active, the quick switch goes to preset 1.
    const targetSlot = presets[0].active ? 1 : 0;
    return {presets, targetSlot, canSwitch: configured && presets[targetSlot].available};
}
