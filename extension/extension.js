import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Board} from './lib/board.js';
import {isoDay} from './lib/notes.js';
import {NoteStore} from './lib/store.js';
import {strings} from './lib/strings.js';

const SHORTCUT_MODES = Shell.ActionMode.NORMAL | Shell.ActionMode.POPUP;

export default class GridNotesExtension extends Extension {
    enable() {
        // First, since it's the one step that can fail on a broken install.
        const settings = this.getSettings();
        this._store = new NoteStore();
        this._welcome(settings);
        this._board = new Board(this._store, settings);

        const bind = (name, handler) => Main.wm.addKeybinding(name, settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT, SHORTCUT_MODES, handler);
        bind('new-note', () => this._board.newNote());
        bind('toggle-focus', () => this._board.toggleFocus());
        bind('toggle-hidden', () => this._board.toggleHidden());
    }

    // A first note showing how things work, for someone with none yet. Whoever
    // already has notes knows, and whoever deletes this one doesn't get it again.
    _welcome(settings) {
        if (settings.get_boolean('welcomed'))
            return;
        settings.set_boolean('welcomed', true);
        if (!this._store.list().length)
            this._store.create({...strings.welcome, date: isoDay(new Date())}, null);
    }

    disable() {
        Main.wm.removeKeybinding('new-note');
        Main.wm.removeKeybinding('toggle-focus');
        Main.wm.removeKeybinding('toggle-hidden');
        this._board.destroy();
        this._store.destroy();
        this._board = this._store = null;
    }
}
