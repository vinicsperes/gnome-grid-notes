// Test helper only, loaded by tools/headless.sh and never packed. Turns on the
// shell's Eval and Screenshot D-Bus calls and exposes a virtual pointer and
// keyboard, so end-to-end tests can drive the extension like a person would.
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const wait = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    resolve();
    return GLib.SOURCE_REMOVE;
}));

export default class Driver extends Extension {
    enable() {
        // Unsafe mode lets any program on the session bus run code in the
        // compositor. Fine in a throwaway shell, dangerous in a real session,
        // so this does nothing unless tools/headless.sh started it.
        if (!GLib.getenv('GRID_NOTES_RUN'))
            return;
        global.context.unsafe_mode = true;
        globalThis.Clutter = Clutter;
        globalThis.Main = Main;
        // Turning on unsafe mode raises a banner right over the top of the board.
        Main.messageTray.bannerBlocked = true;
        const seat = Clutter.get_default_backend().get_default_seat();
        const pointer = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        const keyboard = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        const t = () => GLib.get_monotonic_time();
        const button = (b, state) => pointer.notify_button(t(), b, state);

        globalThis.driver = {
            wait,
            move: (x, y) => pointer.notify_absolute_motion(t(), x, y),
            scroll: direction => pointer.notify_discrete_scroll(t(), direction, Clutter.ScrollSource.WHEEL),
            press: (b = 1) => button(b, Clutter.ButtonState.PRESSED),
            release: (b = 1) => button(b, Clutter.ButtonState.RELEASED),
            async click(x, y, count = 1) {
                this.move(x, y);
                await wait(60);
                for (let i = 0; i < count; i++) {
                    this.press();
                    await wait(30);
                    this.release();
                    await wait(60);
                }
            },
            async drag(x0, y0, x1, y1, steps = 24, stepMs = 16) {
                this.move(x0, y0);
                await wait(80);
                this.press();
                await wait(40);
                for (let i = 1; i <= steps; i++) {
                    this.move(x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps);
                    await wait(stepMs);
                }
                await wait(80);
                this.release();
            },
            key(keyval, pressed = true) {
                keyboard.notify_keyval(t(), keyval,
                    pressed ? Clutter.KeyState.PRESSED : Clutter.KeyState.RELEASED);
            },
            async tap(keyval, ...mods) {
                for (const m of mods)
                    this.key(m);
                this.key(keyval);
                await wait(25);
                this.key(keyval, false);
                for (const m of mods)
                    this.key(m, false);
                await wait(25);
            },
            async type(text) {
                for (const ch of text)
                    await this.tap(Clutter.unicode_to_keysym(ch.codePointAt(0)));
            },
        };
    }

    disable() {
        if (!globalThis.driver)
            return;
        global.context.unsafe_mode = false;
        delete globalThis.driver;
        delete globalThis.Clutter;
        delete globalThis.Main;
    }
}
