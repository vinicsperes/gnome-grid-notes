import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {Board} from './lib/board.js';
import {NoteStore} from './lib/store.js';

export default class MuralExtension extends Extension {
    enable() {
        this._store = new NoteStore();
        this._board = new Board(this._store);
    }

    disable() {
        this._board.destroy();
        this._store.destroy();
        this._board = this._store = null;
    }
}
