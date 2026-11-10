// The differences between the shell versions this runs on, 46 to 50, so the
// rest of the code can be written once.
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import St from 'gi://St';

// From 48 each actor has its own cursor. Before that there is one cursor for
// the whole display, which has to follow the pointer by hand.
const perActor = Clutter.CursorType !== undefined;

// The nearest older cursor for each one used here: there was no open or closed hand.
const OLDER = {
    DEFAULT: 'DEFAULT',
    POINTER: 'POINTING_HAND',
    POINTING_HAND: 'POINTING_HAND',
    GRAB: 'MOVE_OR_RESIZE_WINDOW',
    GRABBING: 'DND_IN_DRAG',
    SE_RESIZE: 'SE_RESIZE',
    SW_RESIZE: 'SW_RESIZE',
};

export const Cursor = Object.freeze(Object.fromEntries(Object.keys(OLDER).map(name => [name, name])));

// The cursor of the innermost actor under the pointer that asked for one.
function followPointer() {
    const [x, y] = global.get_pointer();
    let actor = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
    while (actor && actor._gridNotesCursor === undefined)
        actor = actor.get_parent();
    global.display.set_cursor(actor?._gridNotesCursor ?? Meta.Cursor.DEFAULT);
}

export function setCursor(actor, name) {
    if (perActor) {
        actor.set_cursor_type(Clutter.CursorType[name]);
        return;
    }
    if (actor._gridNotesCursor === undefined) {
        for (const signal of ['enter-event', 'leave-event']) {
            actor.connect(signal, () => {
                followPointer();
                return Clutter.EVENT_PROPAGATE;
            });
        }
    }
    actor._gridNotesCursor = Meta.Cursor[OLDER[name]] ?? Meta.Cursor.DEFAULT;
    followPointer();
}

// St.BoxLayout took `orientation` in 48, in place of `vertical`.
export function verticalBox(props) {
    const box = new St.BoxLayout(props);
    if ('orientation' in box)
        box.orientation = Clutter.Orientation.VERTICAL;
    else
        box.vertical = true;
    return box;
}
