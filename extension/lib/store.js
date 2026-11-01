// Note files on disk. Each .json file in the folder is one note, and the folder
// is the single source of truth: whatever changes it, the board follows.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {emptyNote, fileNameFor, parseNote, withContent, withDone, withGrid} from './notes.js';

// Notes are read on the shell's main thread, so a file has to be small enough
// to do no harm there. Far more text than any card could show.
const MAX_BYTES = 256 * 1024;

// Fatal, because decoding bad bytes leniently and saving would corrupt the file.
const decoder = new TextDecoder('utf-8', {fatal: true});
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

    _names() {
        const found = [];
        let en;
        try {
            en = this._dir.enumerate_children('standard::name,standard::type,standard::size',
                Gio.FileQueryInfoFlags.NONE, null);
        } catch {
            return found;
        }
        for (let info; (info = en.next_file(null));) {
            const file = info.get_name();
            if (file.endsWith('.json') && !file.startsWith('.'))
                found.push({file, info});
        }
        en.close(null);
        return found;
    }

    // A file that can't be used (half written by another program, say) still
    // gets a card saying so, and is never overwritten. Each entry also says
    // whether it differs from what was last read or written here, which is how
    // the board tells its own saves from someone else's edits.
    list() {
        const entries = this._names().map(({file, info}) => this._read(file, info));
        entries.sort((a, b) => a.file.localeCompare(b.file));
        for (const entry of entries)
            entry.changed = this._text.get(entry.file) !== entry.text;
        this._text = new Map(entries.map(e => [e.file, e.text]));
        return entries;
    }

    _read(file, info) {
        let text = null;
        try {
            // Reading a pipe would hang the whole desktop.
            if (info.get_file_type() !== Gio.FileType.REGULAR)
                throw new Error('not a regular file');
            if (info.get_size() > MAX_BYTES)
                throw new Error('too big for a note');
            text = this._load(file);
            return {file, text, note: parseNote(text), error: null};
        } catch (e) {
            return {file, text, note: emptyNote(), error: e.message};
        }
    }

    _load(file) {
        const [, bytes] = this._dir.get_child(file).load_contents(null);
        return decoder.decode(bytes);
    }

    _write(file, text) {
        this._dir.get_child(file).replace_contents(encoder.encode(text), null, false,
            Gio.FileCreateFlags.NONE, null);
        this._text.set(file, text);
    }

    onChanged(callback) {
        this._changedId = this._monitor.connect('changed', callback);
    }

    // Reads the file again first: it may have changed since the board last
    // looked, and a position is no reason to bring back old contents or a file
    // that was deleted. If it can't be read, the position just isn't saved.
    saveGrid(file, grid) {
        return this._patch(file, text => withGrid(text, grid));
    }

    // Says whether anything was written. Not writing means the line changed on
    // disk, and the reload on its way will show what's there now.
    saveDone(file, index, label, done) {
        return this._patch(file, text => withDone(text, index, label, done));
    }

    _patch(file, change) {
        let text, updated;
        try {
            text = this._load(file);
            updated = change(text);
        } catch (e) {
            if (e instanceof GLib.Error && !e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                throw e;
            return false;
        }
        if (updated === text)
            return false;
        this._writeOver(file, text, updated);
        return true;
    }

    // Same idea for an edit: only the fields that were changed get replaced.
    saveContent(file, changes, grid) {
        let text = null;
        try {
            text = this._load(file);
        } catch (e) {
            if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND))
                throw e;
        }
        this._writeOver(file, text, withContent(text, changes, grid));
    }

    // Content the board hasn't seen yet has to still look new to the next
    // reload, or the card would keep showing the old text.
    _writeOver(file, previous, text) {
        const seen = this._text.get(file) === previous;
        this._write(file, text);
        if (!seen)
            this._text.delete(file);
    }

    // Writes a note under a new name made from its title. Creating the file
    // fails if the name is taken, so this can't land on top of another note,
    // even one written a moment ago by something else.
    create(content, grid) {
        const text = withContent(null, content, grid);
        const claim = name => this._dir.get_child(name).create(Gio.FileCreateFlags.NONE, null)
            .close(null);
        const taken = this._names().map(({file}) => file);
        for (;;) {
            const file = fileNameFor(content.title, taken);
            try {
                claim(file);
            } catch (e) {
                if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS))
                    throw e;
                taken.push(file);
                continue;
            }
            // The contents arrive in one atomic step. If they can't, nothing
            // is left behind pretending to be a note.
            try {
                this._write(file, text);
            } catch (e) {
                this._dir.get_child(file).delete(null);
                throw e;
            }
            return file;
        }
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
