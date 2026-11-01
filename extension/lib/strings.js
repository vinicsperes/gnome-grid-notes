// The few words the cards show, in the language of the session.
import GLib from 'gi://GLib';

const STRINGS = {
    en: {
        next: 'NEXT',
        today: 'today',
        yesterday: 'yesterday',
        daysAgo: n => `${n} days ago`,
        unreadable: why => `could not read this file: ${why}`,
        titleHint: 'Title',
        itemHint: 'New line (Ctrl+T for a checkbox)',
        nextHint: 'What comes next',
        confirmDelete: 'delete?',
        deleted: 'Note deleted',
        undo: 'Undo',
        prefs: {
            shortcuts: 'Shortcuts',
            shortcutsHint: 'Press a new combination with Ctrl, Alt or Super. Esc cancels, Backspace turns the shortcut off.',
            newNote: 'New note',
            toggleFocus: 'Bring notes in front of windows',
            toggleHidden: 'Hide or show notes',
            change: 'Change',
            waiting: 'Press the keys…',
            off: 'Off',
            notes: 'Notes',
            show: 'Show notes on the desktop',
            showHint: 'Turn off before sharing your screen',
            folder: 'Notes folder',
            open: 'Open',
        },
        saveFailed: 'Grid Notes could not save a note',
        saveFailedKeep: 'Your text is still there. Finish again to discard it.',
    },
    pt: {
        next: 'PRÓXIMO',
        today: 'hoje',
        yesterday: 'ontem',
        daysAgo: n => `há ${n} dias`,
        unreadable: why => `não deu pra ler este arquivo: ${why}`,
        titleHint: 'Título',
        itemHint: 'Nova linha (Ctrl+T para caixinha)',
        nextHint: 'O que vem depois',
        confirmDelete: 'apagar?',
        deleted: 'Nota apagada',
        undo: 'Desfazer',
        prefs: {
            shortcuts: 'Atalhos',
            shortcutsHint: 'Pressione uma combinação nova com Ctrl, Alt ou Super. Esc cancela, Backspace desliga o atalho.',
            newNote: 'Nota nova',
            toggleFocus: 'Trazer as notas para a frente das janelas',
            toggleHidden: 'Esconder ou mostrar as notas',
            change: 'Trocar',
            waiting: 'Pressione as teclas…',
            off: 'Desligado',
            notes: 'Notas',
            show: 'Mostrar as notas na área de trabalho',
            showHint: 'Desligue antes de compartilhar a tela',
            folder: 'Pasta das notas',
            open: 'Abrir',
        },
        saveFailed: 'O Grid Notes não conseguiu salvar uma nota',
        saveFailedKeep: 'Seu texto continua aí. Finalize de novo para descartar.',
    },
};

function detect() {
    for (const name of GLib.get_language_names()) {
        const language = name.split(/[_.@]/)[0];
        if (STRINGS[language])
            return STRINGS[language];
    }
    return STRINGS.en;
}

export const strings = detect();
