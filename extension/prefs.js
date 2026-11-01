// The preferences window, opened from the Extensions app. Runs as an ordinary
// application rather than inside the shell, so it can't see the notes themselves.
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {strings} from './lib/strings.js';

const {prefs: words} = strings;

const SHORTCUTS = [
    ['new-note', words.newNote],
    ['toggle-focus', words.toggleFocus],
    ['toggle-hidden', words.toggleHidden],
];

// Whether a combination could stand as a global shortcut. A plain letter would
// take that key away from everything you type.
function usable(state) {
    const {CONTROL_MASK, ALT_MASK, SUPER_MASK} = Gdk.ModifierType;
    return (state & (CONTROL_MASK | ALT_MASK | SUPER_MASK)) !== 0;
}

function shortcutRow(settings, name, title) {
    const row = new Adw.ActionRow({title});
    const current = new Gtk.ShortcutLabel({
        disabled_text: words.off,
        valign: Gtk.Align.CENTER,
    });
    const button = new Gtk.Button({label: words.change, valign: Gtk.Align.CENTER});
    row.add_suffix(current);
    row.add_suffix(button);

    const show = () => {
        current.accelerator = settings.get_strv(name)[0] ?? '';
    };
    show();
    const changedId = settings.connect(`changed::${name}`, show);
    row.connect('destroy', () => settings.disconnect(changedId));

    const keys = new Gtk.EventControllerKey();
    let listening = false;
    const stop = () => {
        listening = false;
        button.label = words.change;
    };
    keys.connect('key-pressed', (_, keyval, keycode, state) => {
        if (!listening)
            return Gdk.EVENT_PROPAGATE;
        const mods = state & Gtk.accelerator_get_default_mod_mask();
        if (keyval === Gdk.KEY_Escape && !mods) {
            stop();
        } else if (keyval === Gdk.KEY_BackSpace && !mods) {
            settings.set_strv(name, []);
            stop();
        } else if (usable(mods) && Gtk.accelerator_valid(keyval, mods)) {
            settings.set_strv(name, [Gtk.accelerator_name_with_keycode(null, keyval, keycode, mods)]);
            stop();
        }
        // Holding Ctrl on its way to the rest of the combination keeps listening.
        return Gdk.EVENT_STOP;
    });
    button.add_controller(keys);
    button.connect('clicked', () => {
        listening = true;
        button.label = words.waiting;
    });
    return row;
}

export default class GridNotesPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();

        const shortcuts = new Adw.PreferencesGroup({
            title: words.shortcuts,
            description: words.shortcutsHint,
        });
        for (const [name, title] of SHORTCUTS)
            shortcuts.add(shortcutRow(settings, name, title));
        page.add(shortcuts);

        const notes = new Adw.PreferencesGroup({title: words.notes});
        const show = new Adw.SwitchRow({title: words.show, subtitle: words.showHint});
        settings.bind('hidden', show, 'active', Gio.SettingsBindFlags.INVERT_BOOLEAN);
        notes.add(show);

        const path = GLib.build_filenamev([GLib.get_user_data_dir(), 'grid-notes']);
        const folder = new Adw.ActionRow({title: words.folder, subtitle: path});
        const open = new Gtk.Button({label: words.open, valign: Gtk.Align.CENTER});
        open.connect('clicked', () => {
            Gio.AppInfo.launch_default_for_uri(Gio.File.new_for_path(path).get_uri(), null);
        });
        folder.add_suffix(open);
        notes.add(folder);
        page.add(notes);

        window.add(page);
        // Keeps the settings alive as long as the window using them.
        window._settings = settings;
    }
}
