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
        itemHint: 'What happened',
        nextHint: 'What comes next',
        confirmDelete: 'delete?',
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
        itemHint: 'O que rolou',
        nextHint: 'O que vem depois',
        confirmDelete: 'apagar?',
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
