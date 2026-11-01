// Talks to the headless shell from tools/headless.sh over D-Bus.
import {execFileSync, spawn} from 'node:child_process';
import {readdirSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';

const BOARD = "Main.extensionManager.lookup('grid-notes@desktop').stateObj._board";

function gdbus(path, method, ...args) {
    return execFileSync('gdbus', ['call', '--session', '-d', 'org.gnome.Shell',
        '-o', path, '-m', method, ...args], {encoding: 'utf8'}).trim();
}

export function evaluate(code) {
    const output = gdbus('/org/gnome/Shell', 'org.gnome.Shell.Eval', code);
    const match = /^\((true|false), (['"])([\s\S]*)\2\)$/.exec(output);
    if (!match)
        throw new Error(`unexpected reply: ${output}`);
    const text = match[3].replace(/\\(['"\\])/g, '$1');
    if (match[1] === 'false')
        throw new Error(`in the shell: ${text}`);
    return text ? JSON.parse(text) : undefined;
}

export const board = expression => evaluate(`(b => ${expression})(${BOARD})`);

export function screenshot(file) {
    gdbus('/org/gnome/Shell/Screenshot', 'org.gnome.Shell.Screenshot.Screenshot',
        'false', 'false', file);
}

// Runs an async driver call and waits for it to finish.
export async function drive(code) {
    evaluate(`globalThis.__busy = true; (async () => { ${code} })()` +
        '.catch(e => { globalThis.__error = String(e); })' +
        '.finally(() => { globalThis.__busy = false; }); 0');
    for (let i = 0; i < 300; i++) {
        await sleep(50);
        if (!evaluate('globalThis.__busy'))
            break;
    }
    const error = evaluate('globalThis.__error ?? null');
    if (error) {
        evaluate('delete globalThis.__error; 0');
        throw new Error(error);
    }
}

// Opens a real application window and waits until it has a place on screen,
// which can come well after the window first exists.
export async function openWindow(size = '1800x900') {
    spawn('gjs', ['-m', fileURLToPath(new URL('window.js', import.meta.url))], {
        env: {...process.env, WAYLAND_DISPLAY: 'grid-notes-0', GDK_BACKEND: 'wayland', GRID_NOTES_WINDOW: size},
        stdio: 'ignore',
        detached: true,
    }).unref();
    const width = () => board('global.get_window_actors()[0]?.meta_window.get_frame_rect().width ?? 0');
    for (let i = 0; i < 80 && !width(); i++)
        await sleep(250);
    if (!width())
        throw new Error('the window never opened');
    await sleep(300);
}

export const layout = () => Object.fromEntries(
    board("b._layout.map(i => [i.id, {x: i.x, y: i.y, w: i.w, h: i.h}])"));

export function rect(id) {
    return board(`(a => ({x: a.x, y: a.y, width: a.width, height: a.height}))` +
        `(b._cards.get(${JSON.stringify(id)}).actor)`);
}

const dataDir = () => join(process.env.GRID_NOTES_RUN, 'data', 'grid-notes');

// `lenient` leaves out what isn't valid, for tests that wrote broken files on purpose.
export function notes({lenient = false} = {}) {
    const read = name => {
        try {
            return [name, JSON.parse(readFileSync(join(dataDir(), name), 'utf8'))];
        } catch (e) {
            if (lenient)
                return null;
            throw e;
        }
    };
    return Object.fromEntries(readdirSync(dataDir())
        .filter(name => name.endsWith('.json'))
        .map(read)
        .filter(Boolean));
}

export const writeNote = (name, value) =>
    writeFileSync(join(dataDir(), name), typeof value === 'string' ? value : JSON.stringify(value));

export const removeNote = name => rmSync(join(dataDir(), name), {force: true});

export function errors() {
    const log = readFileSync(join(process.env.GRID_NOTES_RUN, 'shell.log'), 'utf8');
    return log.split('\n').filter(line => /JS ERROR|grid-notes.*(Error|error)|Gjs-CRITICAL|Clutter-CRITICAL|St-CRITICAL/.test(line));
}

export {sleep};
