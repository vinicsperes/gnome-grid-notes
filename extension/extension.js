import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Board} from './lib/board.js';
import {NoteStore} from './lib/store.js';

const SHORTCUT_MODES = Shell.ActionMode.NORMAL | Shell.ActionMode.POPUP;

export default class MuralExtension extends Extension {
    enable() {
        // First, since it's the one step that can fail on a broken install.
        const settings = this.getSettings();
        this._store = new NoteStore();
        this._board = new Board(this._store);

        const bind = (name, handler) => Main.wm.addKeybinding(name, settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT, SHORTCUT_MODES, handler);
        bind('new-note', () => this._board.newNote());
        bind('toggle-focus', () => this._board.toggleFocus());
    }

    disable() {
        Main.wm.removeKeybinding('new-note');
        Main.wm.removeKeybinding('toggle-focus');
        this._board.destroy();
        this._store.destroy();
        this._board = this._store = null;
    }
}
