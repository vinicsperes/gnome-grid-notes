// Note files on disk. Each .json file in the folder is one note, and the folder
// is the single source of truth: whatever changes it, the board follows.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {fileNameFor, parseNote, serializeNote} from './notes.js';

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export class NoteStore {
    constructor(path = GLib.build_filenamev([GLib.get_user_data_dir(), 'mural'])) {
        this._dir = Gio.File.new_for_path(path);
        try {
            this._dir.make_directory_with_parents(null);
        } catch (e) {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
                throw e;
        }
        this._monitor = this._dir.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null);
        this._text = new Map();
        this._changedId = 0;
    }

    // A file that doesn't parse (say, half written by another program) still
    // gets a card saying so, and is never overwritten. Each entry also says
    // whether it differs from what was last read or written here, which is how
    // the board tells its own saves from someone else's edits.
    list() {
        const entries = [];
        const en = this._dir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        for (let info; (info = en.next_file(null));) {
            const file = info.get_name();
            if (file.endsWith('.json') && !file.startsWith('.'))
                entries.push(this._read(file));
        }
        en.close(null);
        entries.sort((a, b) => a.file.localeCompare(b.file));
        for (const entry of entries)
            entry.changed = this._text.get(entry.file) !== entry.text;
        this._text = new Map(entries.map(e => [e.file, e.text]));
        return entries;
    }

    _read(file) {
        let text = null;
        try {
            const [, bytes] = this._dir.get_child(file).load_contents(null);
            text = decoder.decode(bytes);
            return {file, text, note: parseNote(text), error: null};
        } catch (e) {
            return {file, text, note: parseNote('{}'), error: e.message};
        }
    }

    onChanged(callback) {
        this._changedId = this._monitor.connect('changed', callback);
    }

    save(file, note) {
        const text = serializeNote(note);
        if (this._text.get(file) === text)
            return;
        this._text.set(file, text);
        this._dir.get_child(file).replace_contents(encoder.encode(text), null, false,
            Gio.FileCreateFlags.NONE, null);
    }

    newFileName(title) {
        return fileNameFor(title, [...this._text.keys()]);
    }

    // To the system trash rather than gone, since a click can be a mistake.
    trash(file) {
        this._text.delete(file);
        const target = this._dir.get_child(file);
        try {
            target.trash(null);
        } catch (e) {
            if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                return;
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_SUPPORTED))
                throw e;
            target.delete(null);
        }
    }

    destroy() {
        if (this._changedId)
            this._monitor.disconnect(this._changedId);
        this._monitor.cancel();
        this._monitor = this._dir = this._text = null;
    }
}
