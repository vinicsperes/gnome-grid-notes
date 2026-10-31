// The board: keeps the cards in step with the note files, lays them out on the
// grid, and sits at the right height in the stack of windows.
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Card} from './card.js';
import {compact, metrics, place} from './grid.js';

const SIZES = {cell: 141, row: 18, gap: 18, margin: 40};
const DEFAULT_WIDTH = 2;
// How many columns notes without a saved position spread across.
const INITIAL_COLUMNS = 8;
const REFRESH_SECONDS = 30 * 60;

// The desktop icons extensions only label their window a moment after it maps,
// so the application id is what identifies it from the first frame.
const DESKTOP_APPS = ['com.rastersoft.ding', 'com.desktop.ding'];

function isDesktop(window) {
    return window.get_window_type() === Meta.WindowType.DESKTOP ||
        DESKTOP_APPS.includes(window.get_gtk_application_id());
}

export const MOTION = {
    move: {duration: 240, mode: Clutter.AnimationMode.EASE_OUT_QUINT},
};

export class Board {
    constructor(store) {
        this._store = store;
        this._cards = new Map();
        this._layout = [];

        this.layer = new Clutter.Actor({name: 'mural'});
        global.window_group.add_child(this.layer);

        this._restackedId = global.display.connect('restacked', () => this._syncStack());
        this._mapId = global.window_manager.connect_after('map', () => this._syncStack());
        this._monitorsId = Main.layoutManager.connect('monitors-changed', () => this._relayout());
        this._store.onChanged(() => this._queueReload());
        this._clockId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, REFRESH_SECONDS, () => {
            for (const card of this._cards.values())
                card.render();
            return GLib.SOURCE_CONTINUE;
        });

        this._syncStack();
        this._reload();
    }

    // Directly above whatever acts as the desktop, and below every real window.
    // The desktop icons extension is a transparent window covering the screen:
    // placed under it the cards would be visible but never get a click. It also
    // hides itself from get_window_actors(), hence walking the group directly.
    //
    // Mutter puts unknown actors on top whenever it reorders windows, so this
    // runs again after each restack.
    _syncStack() {
        const group = global.window_group;
        const desktop = group.get_children().filter(actor =>
            actor instanceof Meta.WindowActor && isDesktop(actor.meta_window));
        const below = desktop.at(-1) ?? Main.layoutManager._backgroundGroup;
        group.set_child_above_sibling(this.layer, below);
    }

    _metrics() {
        const {layoutManager} = Main;
        return metrics(layoutManager.getWorkAreaForMonitor(layoutManager.primaryIndex), SIZES);
    }

    // Cards never get shorter than their contents, so text is never cut off.
    _rowsFor(card, w, grid = this._metrics()) {
        const content = grid.rowsFor(card.naturalHeight(grid.widthOf(w)));
        return Math.max(content, card.userRows);
    }

    _queueReload() {
        if (this._reloadId)
            return;
        this._reloadId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 150, () => {
            this._reloadId = 0;
            this._reload();
            return GLib.SOURCE_REMOVE;
        });
    }

    _reload() {
        const entries = this._store.list();
        const seen = new Set(entries.map(e => e.file));

        for (const [file, card] of this._cards) {
            if (!seen.has(file)) {
                card.destroy();
                this._cards.delete(file);
            }
        }
        const fresh = [];
        for (const {file, note, error} of entries) {
            const card = this._cards.get(file);
            if (!card) {
                const created = new Card(file, note, error);
                this.layer.add_child(created.actor);
                this._cards.set(file, created);
                fresh.push(created);
            } else {
                card.note = note;
                card.error = error;
                card.userRows = note.grid?.h ?? 0;
                card.render();
            }
        }
        this._relayout(fresh);
    }

    // Saved positions first, then anything new takes the next free slot.
    _relayout(fresh = []) {
        const grid = this._metrics();
        const cards = [...this._cards.values()];
        const known = cards.filter(card => card.note.grid);
        const unplaced = cards.filter(card => !card.note.grid);

        let items = compact(known.map(card => {
            const {x, y, w} = card.note.grid;
            return {id: card.file, x, y, w, h: this._rowsFor(card, Math.min(w, grid.cols), grid)};
        }), grid.cols);
        for (const card of unplaced) {
            const w = Math.min(DEFAULT_WIDTH, grid.cols);
            items = [...items, place({id: card.file, w, h: this._rowsFor(card, w, grid)},
                items, grid.cols, INITIAL_COLUMNS)];
        }
        this._layout = items;
        this._applyLayout(grid, new Set(fresh));
    }

    _applyLayout(grid, instant = new Set()) {
        for (const item of this._layout) {
            const card = this._cards.get(item.id);
            const {px, py} = grid.toPixels(item);
            const target = {x: px, y: py, width: grid.widthOf(item.w), height: grid.heightOf(item.h)};
            if (instant.has(card)) {
                card.actor.set_position(target.x, target.y);
                card.actor.set_size(target.width, target.height);
            } else {
                card.actor.ease({...target, ...MOTION.move});
            }
        }
    }

    destroy() {
        if (this._reloadId)
            GLib.source_remove(this._reloadId);
        GLib.source_remove(this._clockId);
        global.display.disconnect(this._restackedId);
        global.window_manager.disconnect(this._mapId);
        Main.layoutManager.disconnect(this._monitorsId);
        this.layer.destroy();
        this._cards.clear();
        this.layer = this._store = null;
    }
}
