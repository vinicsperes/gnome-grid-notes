// The board: keeps the cards in step with the note files, lays them out on the
// grid, and sits at the right height in the stack of windows.
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Card} from './card.js';
import {compact, metrics, move, place, resize} from './grid.js';

const SIZES = {cell: 141, row: 18, gap: 18, margin: 40};
const DEFAULT_WIDTH = 2;
const MIN_WIDTH = 2;
// How many columns notes without a saved position spread across.
const INITIAL_COLUMNS = 8;
const REFRESH_SECONDS = 30 * 60;
const DRAG_THRESHOLD = 5;
const MAX_TILT = 3.5;
const ARRIVAL_STAGGER = 45;

const {EASE_OUT_QUINT, EASE_OUT_QUAD, EASE_OUT_BACK} = Clutter.AnimationMode;
const MOTION = {
    // Neighbours sliding out of the way, quick enough to keep up with the hand.
    reflow: {duration: 240, mode: EASE_OUT_QUINT},
    lift: {duration: 140, mode: EASE_OUT_QUAD},
    // The small overshoot makes a dropped card feel like it clicks into place.
    drop: {duration: 340, mode: EASE_OUT_BACK},
    fade: {duration: 160, mode: EASE_OUT_QUAD},
};

// The desktop icons extensions only label their window a moment after it maps,
// so the application id is what identifies it from the first frame.
const DESKTOP_APPS = ['com.rastersoft.ding', 'com.desktop.ding'];

function isDesktop(window) {
    return window.get_window_type() === Meta.WindowType.DESKTOP ||
        DESKTOP_APPS.includes(window.get_gtk_application_id());
}

export class Board {
    constructor(store) {
        this._store = store;
        this._cards = new Map();
        this._layout = [];
        this._gesture = null;

        this.layer = new Clutter.Actor({name: 'mural'});
        global.window_group.add_child(this.layer);
        this._buildGridHints();

        this._restackedId = global.display.connect('restacked', () => this._syncStack());
        this._mapId = global.window_manager.connect_after('map', () => this._syncStack());
        this._monitorsId = Main.layoutManager.connect('monitors-changed', () => {
            this._dots.queue_repaint();
            this._relayout();
        });
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

    // The grid only shows itself while something is being moved.
    _buildGridHints() {
        const {width, height} = global.stage;
        this._dots = new St.DrawingArea({width, height, opacity: 0, visible: false});
        this._dots.connect('repaint', area => this._paintDots(area));
        this.layer.add_child(this._dots);

        this._ghost = new St.Widget({style_class: 'mural-ghost', opacity: 0, visible: false});
        this.layer.add_child(this._ghost);
    }

    _paintDots(area) {
        const cr = area.get_context();
        const grid = this._metrics();
        const {y: top, height} = this._workArea();
        cr.setSourceRGBA(1, 1, 1, 0.28);
        for (let x = 0; x < grid.cols; x++) {
            for (let y = 0; ; y++) {
                const {px, py} = grid.toPixels({x, y, w: 1});
                if (py > top + height)
                    break;
                cr.arc(px, py, 1.4, 0, 2 * Math.PI);
                cr.fill();
            }
        }
        cr.$dispose();
    }

    _showHints(shown) {
        for (const hint of [this._dots, this._ghost]) {
            hint.remove_all_transitions();
            if (shown)
                hint.show();
            hint.ease({
                opacity: shown ? 255 : 0,
                ...MOTION.fade,
                onComplete: () => {
                    if (!shown)
                        hint.hide();
                },
            });
        }
    }

    _workArea() {
        const {layoutManager} = Main;
        return layoutManager.getWorkAreaForMonitor(layoutManager.primaryIndex);
    }

    _metrics() {
        return metrics(this._workArea(), SIZES);
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
        // Nothing moves under the pointer. The drop catches up afterwards.
        if (this._gesture) {
            this._reloadPending = true;
            return;
        }
        const entries = this._store.list();
        const seen = new Set(entries.map(e => e.file));
        let dirty = false;

        for (const [file, card] of this._cards) {
            if (!seen.has(file)) {
                card.vanish();
                this._cards.delete(file);
                dirty = true;
            }
        }
        const fresh = [];
        for (const {file, note, error, changed} of entries) {
            const card = this._cards.get(file);
            if (!card) {
                const created = new Card(file, note, error);
                this._wire(created);
                this.layer.add_child(created.actor);
                this._cards.set(file, created);
                fresh.push(created);
                dirty = true;
            } else if (changed) {
                card.note = note;
                card.error = error;
                card.userRows = note.grid?.h ?? 0;
                card.render();
                card.pulse();
                dirty = true;
            }
        }
        if (dirty)
            this._relayout(fresh);
        fresh.forEach((card, i) => card.appear(i * ARRIVAL_STAGGER));
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
        this._applyLayout(grid, {instant: new Set(fresh)});
    }

    _rectOf(item, grid) {
        const {px, py} = grid.toPixels(item);
        return {x: px, y: py, width: grid.widthOf(item.w), height: grid.heightOf(item.h)};
    }

    _applyLayout(grid, {instant = new Set(), skip = null} = {}) {
        for (const item of this._layout) {
            const card = this._cards.get(item.id);
            if (card === skip)
                continue;
            const rect = this._rectOf(item, grid);
            if (instant.has(card)) {
                card.actor.set_position(rect.x, rect.y);
                card.actor.set_size(rect.width, rect.height);
            } else {
                card.actor.ease({...rect, ...MOTION.reflow});
            }
        }
    }

    // Only cards that actually moved get written.
    _persist() {
        for (const item of this._layout) {
            const card = this._cards.get(item.id);
            if (card.error)
                continue;
            const {x, y, w} = item;
            card.note.grid = card.userRows ? {x, y, w, h: card.userRows} : {x, y, w};
            this._store.save(card.file, card.note);
        }
    }

    _wire(card) {
        const {actor} = card;
        actor.connect('button-press-event', (_, event) => this._onPress(card, event));
        actor.connect('motion-event', (_, event) => this._onMotion(event));
        actor.connect('button-release-event', (_, event) => this._onRelease(event));

        for (const grip of card.grips) {
            grip.connect('button-press-event', (_, event) => this._onGripPress(card, grip, event));
            grip.connect('motion-event', (_, event) => this._onGripMotion(event));
            grip.connect('button-release-event', (_, event) => this._onGripRelease(event));
        }
    }

    _onGripPress(card, grip, event) {
        if (this._gesture || event.get_button() !== Clutter.BUTTON_PRIMARY)
            return Clutter.EVENT_PROPAGATE;
        const [x, y] = event.get_coords();
        const {actor} = card;
        actor.remove_all_transitions();
        this._gesture = {
            card,
            resizing: true,
            side: grip.side,
            lifted: false,
            pressX: x,
            pressY: y,
            startWidth: actor.width,
            startHeight: actor.height,
            cell: null,
            base: this._layout,
            grab: global.stage.grab(grip),
        };
        this.layer.set_child_above_sibling(actor, null);
        this._dots.show();
        this._dots.remove_all_transitions();
        this._dots.ease({opacity: 255, ...MOTION.fade});
        return Clutter.EVENT_STOP;
    }

    _onGripMotion(event) {
        const gesture = this._gesture;
        if (!gesture?.resizing)
            return Clutter.EVENT_PROPAGATE;
        const [x, y] = event.get_coords();
        const {card} = gesture;
        const grid = this._metrics();
        const item = gesture.base.find(i => i.id === card.file);

        const pulled = x - gesture.pressX;
        const wide = gesture.startWidth + (gesture.side === 'right' ? pulled : -pulled);
        const w = Math.max(MIN_WIDTH, Math.min(grid.cols,
            Math.round((wide + SIZES.gap) / grid.stepX)));
        const tall = gesture.startHeight + y - gesture.pressY;
        const contentRows = grid.rowsFor(card.naturalHeight(grid.widthOf(w)));
        const h = Math.max(contentRows, Math.round((tall + SIZES.gap) / grid.stepY));

        if (gesture.cell?.w === w && gesture.cell?.h === h)
            return Clutter.EVENT_STOP;
        gesture.cell = {w, h};
        card.userRows = h > contentRows ? h : 0;
        // x counts from the right, so the left grip leaves it alone while the
        // right one has to move it to keep the left edge still.
        const x0 = gesture.side === 'left' ? item.x : Math.max(0, item.x + item.w - w);
        this._layout = resize(gesture.base, card.file, w, h, grid.cols, x0);
        this._applyLayout(grid);
        return Clutter.EVENT_STOP;
    }

    _onGripRelease(event) {
        const gesture = this._gesture;
        if (!gesture?.resizing || event.get_button() !== Clutter.BUTTON_PRIMARY)
            return Clutter.EVENT_PROPAGATE;
        gesture.grab.dismiss();
        this._gesture = null;
        this._dots.remove_all_transitions();
        this._dots.ease({
            opacity: 0,
            ...MOTION.fade,
            onComplete: () => this._dots.hide(),
        });
        this._persist();
        this._catchUp();
        return Clutter.EVENT_STOP;
    }

    _onPress(card, event) {
        if (this._gesture || event.get_button() !== Clutter.BUTTON_PRIMARY)
            return Clutter.EVENT_PROPAGATE;
        const [x, y] = event.get_coords();
        const {actor} = card;
        this._gesture = {
            card,
            pressX: x,
            pressY: y,
            lastX: x,
            startX: actor.x,
            startY: actor.y,
            lifted: false,
            cell: null,
            base: this._layout,
            grab: global.stage.grab(actor),
        };
        return Clutter.EVENT_STOP;
    }

    _onMotion(event) {
        const gesture = this._gesture;
        if (!gesture || gesture.resizing)
            return Clutter.EVENT_PROPAGATE;
        const [x, y] = event.get_coords();
        if (!gesture.lifted) {
            if (Math.hypot(x - gesture.pressX, y - gesture.pressY) < DRAG_THRESHOLD)
                return Clutter.EVENT_STOP;
            this._lift(gesture);
        }
        const {actor} = gesture.card;
        actor.set_position(gesture.startX + x - gesture.pressX, gesture.startY + y - gesture.pressY);
        this._tilt(gesture, x);
        this._previewDrop(gesture);
        return Clutter.EVENT_STOP;
    }

    _lift(gesture) {
        const {card} = gesture;
        const {actor} = card;
        const grid = this._metrics();
        actor.remove_all_transitions();
        actor.add_style_class_name('mural-card-lifted');
        actor.set_cursor_type(Clutter.CursorType.GRABBING);
        this.layer.set_child_above_sibling(actor, null);
        actor.ease({scale_x: 1.03, scale_y: 1.03, ...MOTION.lift});

        const item = this._layout.find(i => i.id === card.file);
        const rect = this._rectOf(item, grid);
        this._ghost.set_position(rect.x, rect.y);
        this._ghost.set_size(rect.width, rect.height);
        this._showHints(true);
        gesture.lifted = true;
    }

    // Leans a little into the movement, like something held by one corner.
    _tilt(gesture, x) {
        const {actor} = gesture.card;
        const lean = Math.max(-MAX_TILT, Math.min(MAX_TILT, (x - gesture.lastX) * 0.4));
        gesture.lastX = x;
        actor.ease({rotation_angle_z: lean, duration: 120, mode: EASE_OUT_QUAD});
        if (gesture.tiltId)
            GLib.source_remove(gesture.tiltId);
        gesture.tiltId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 90, () => {
            gesture.tiltId = 0;
            actor.ease({rotation_angle_z: 0, duration: 200, mode: EASE_OUT_QUAD});
            return GLib.SOURCE_REMOVE;
        });
    }

    // Always from the layout at the start of the drag, so neighbours that were
    // only pushed in passing go back when the card moves on.
    _previewDrop(gesture) {
        const {card} = gesture;
        const {actor} = card;
        const grid = this._metrics();
        const item = gesture.base.find(i => i.id === card.file);
        const cell = grid.toCell(actor.x, actor.y, item.w);
        if (gesture.cell?.x === cell.x && gesture.cell?.y === cell.y)
            return;
        gesture.cell = cell;
        this._layout = move(gesture.base, card.file, cell.x, cell.y, grid.cols);
        this._applyLayout(grid, {skip: card});
        const landing = this._rectOf(this._layout.find(i => i.id === card.file), grid);
        this._ghost.ease({x: landing.x, y: landing.y, width: landing.width, height: landing.height,
            ...MOTION.reflow});
    }

    _onRelease(event) {
        const gesture = this._gesture;
        if (!gesture || gesture.resizing || event.get_button() !== Clutter.BUTTON_PRIMARY)
            return Clutter.EVENT_PROPAGATE;
        this._endGesture(gesture);
        return Clutter.EVENT_STOP;
    }

    _endGesture(gesture) {
        const {card, grab} = gesture;
        const {actor} = card;
        grab.dismiss();
        this._gesture = null;
        if (gesture.tiltId)
            GLib.source_remove(gesture.tiltId);

        if (gesture.lifted) {
            const grid = this._metrics();
            const rect = this._rectOf(this._layout.find(i => i.id === card.file), grid);
            actor.remove_style_class_name('mural-card-lifted');
            actor.set_cursor_type(Clutter.CursorType.GRAB);
            actor.remove_all_transitions();
            actor.ease({...rect, scale_x: 1, scale_y: 1, rotation_angle_z: 0, ...MOTION.drop});
            this._showHints(false);
            this._persist();
        }
        this._catchUp();
    }

    _catchUp() {
        if (this._reloadPending) {
            this._reloadPending = false;
            this._queueReload();
        }
    }

    destroy() {
        if (this._gesture) {
            this._gesture.grab.dismiss();
            if (this._gesture.tiltId)
                GLib.source_remove(this._gesture.tiltId);
        }
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
