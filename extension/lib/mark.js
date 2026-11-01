// What starts a line in a list: a bullet or a checkbox. `done` is null for a
// bullet, and true or false for a checkbox, same as itemDone() in notes.js.
import Clutter from 'gi://Clutter';
import St from 'gi://St';

const centred = {x_align: Clutter.ActorAlign.CENTER, y_align: Clutter.ActorAlign.CENTER};

const bullet = () => new St.Label({text: '•', style_class: 'grid-notes-bullet', ...centred});

function box(done) {
    const check = new St.Bin({style_class: 'grid-notes-check', ...centred});
    if (done) {
        check.add_style_class_name('grid-notes-check-done');
        check.child = new St.Icon({icon_name: 'object-select-symbolic', style_class: 'grid-notes-check-icon'});
    }
    return check;
}

// With the first line of the text, however many lines it wraps to.
const slot = {style_class: 'grid-notes-mark', y_align: Clutter.ActorAlign.START};

// A bullet nobody can click, which holds the same room as a button.
export const staticBullet = () => new St.Bin({...slot, child: bullet()});

export function setMark(button, done) {
    button.child = done === null ? bullet() : box(done);
}

export function buildMark(done) {
    const button = new St.Button(slot);
    button.set_cursor_type(Clutter.CursorType.POINTER);
    setMark(button, done);
    return button;
}

// Struck through once it's done. On the label or entry holding the text.
export function setDoneStyle(actor, done) {
    if (done)
        actor.add_style_class_name('grid-notes-item-done');
    else
        actor.remove_style_class_name('grid-notes-item-done');
}
