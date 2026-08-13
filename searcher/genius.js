import { parse } from 'himalaya/src/index.js';

export function getConfig(cfg) {
    cfg.name = 'Genius (Unsynced)';
    cfg.version = '0.4';
    cfg.author = 'ohyeah & TT & zeremy';
    cfg.useRawMeta = false;
}

export function getLyrics(meta, man) {
    const Clean = (text) => text
    .replace(/\(.*\)|{.*}|\[.*\]|【.*】/g, '')
    .normalize()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\- ]/g, '')
    .replace(/@/g, 'at')
    .replace(/&/g, 'and')
    .replace(/ /g, '-'); // Genius formatting

    const artist = Clean(meta.artist);
    const title = Clean(meta.title);
    const url = `https://genius.com/${artist}-${title}-lyrics`;
    const settings = {
        url,
        timeout: 5000
    };

    if (artist === '' || title === '')
        return;

    request(settings, (err, res, body) => {
        if (err || res.statusCode !== 200)
            return;

        const jsonElement = parse(body);

        const htmlElement = jsonElement.find(
                element =>
                element.type === 'element' &&
                element.tagName === 'html');

        if (!htmlElement)
            return;

        const bodyElement = htmlElement.children.find(
                element =>
                element.type === 'element' &&
                element.tagName === 'body');

        if (!bodyElement)
            return;

        // Keep this local so containers from previous songs
        // aren't retained.
        const lyricContainerElements = [];

        // Find ALL lyric containers.
        findLyrics(bodyElement, lyricContainerElements);

        if (lyricContainerElements.length === 0)
            return;

        let lyricText = '';

        // Parse every lyric container found.
        for (const element of lyricContainerElements) {
            lyricText = parseLyrics(element, lyricText);
        }

        if (lyricText === '')
            return;

        const lyricMeta = man.createLyric();
        lyricMeta.title = meta.title;
        lyricMeta.artist = meta.artist;
        lyricMeta.lyricText = lyricText;
        lyricMeta.location = url;

        man.addLyric(lyricMeta);
    });
}

function findLyrics(rootElement, lyricContainerElements) {
    const type = rootElement.type || '';
    const children = rootElement.children || [];
    const attributes = rootElement.attributes || [];

    if (type !== 'element') {
        return;
    }

    // Skip elements with data-exclude-from-selection="true"
    // for unwanted content.
    if (attributes.some(
            attr =>
            attr.key === 'data-exclude-from-selection' &&
            attr.value === 'true')) {
        return;
    }

    const hasLyricsContainer = attributes.some(
            attr =>
            attr.key === 'data-lyrics-container' &&
            attr.value === 'true');

    const hasLyricsClass = attributes.some(
            attr =>
            attr.key === 'class' &&
            attr.value.startsWith('Lyrics_Container'));

    // Add the matching element, but DON'T return.
    // This allows us to continue searching for other containers.
    if (hasLyricsContainer || hasLyricsClass) {
        lyricContainerElements.push(rootElement);
    }

    // Continue searching through ALL children.
    for (const child of children) {
        findLyrics(child, lyricContainerElements);
    }
}

function parseLyrics(element, lyricText) {
    const Clean = (rawString) => rawString.trim()
    .replace(
        /&#x([0-9a-f]+);/gi,
        (_, code) => String.fromCharCode(parseInt(code, 16))) // HTML characters decode
    .replace(/&amp(;|)/gi, '&')
    .replace(/&gt(;|)/gi, '>')
    .replace(/&lt(;|)/gi, '<')
    .replace(/&nbsp(;|)/gi, '')
    .replace(/&quot(;|)/gi, '"')
    .replace(/<br>/gi, '')
    .replace(/\uFF1A/gi, ':')
    .replace(/\uFF08/gi, '(')
    .replace(/\uFF09/gi, ')')
    .replace(
        /\u00E2\u20AC\u2122|\u2019|\uFF07|[\u0060\u00B4]|â€™(;|)|â€˜(;|)|&apos(;|)|&#39(;|)|(&#(?:039|8216|8217|8220|8221|8222|8223|x27);)/gi,
        "'") // Apostrophe variants
    .replace(
        /[\u2000-\u200F\u2028-\u202F\u205F-\u206F\u3000\uFEFF]/gi,
        ' '); // Whitespace variants

    const tag = element.tagName || '';
    const type = element.type || '';
    const children = element.children || [];
    const content = element.content || '';
    const attributes = element.attributes || [];

    // Skip elements with data-exclude-from-selection="true"
    // for unwanted stuff.
    if (attributes.some(
            attr =>
            attr.key === 'data-exclude-from-selection' &&
            attr.value === 'true')) {
        return lyricText;
    }

    if (type === 'text') {
        return lyricText + content;
    }

    if (tag === 'br') {
        return `${lyricText}\r\n`;
    }
    
    // Add a newline between div elements
    if (tag === 'div' && lyricText !== '') {
        lyricText += '\n';
    }
    
    for (const child of children) {
        lyricText = parseLyrics(child, lyricText);
    }

    return Clean(lyricText);
}
