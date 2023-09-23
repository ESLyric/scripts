import { parse } from 'himalaya/src/index.js';

const lyricContainerElements = [];

export function getConfig(cfg) {
	cfg.name = 'AZLyrics (Unsynced)';
	cfg.version = '0.2';
	cfg.author = 'ohyeah & TT';
	cfg.useRawMeta = false;
}

export function getLyrics(meta, man) {
	const Clean = (text) => text
		.replace(/\(.*\)|{.*}|\[.*\]|【.*】/g, '').normalize().trim().toLowerCase()
		.replace(/[^a-z0-9\- ]/g, '')
		.replace(/@/g, 'at')
		.replace(/&/g, 'and')
		.replace(/ /g, '_') // AZLyrics formatting - identify
		.replace(/a_/g, '') // AZLyrics formatting - capture
		.replace(/the_/g, '') // AZLyrics formatting - capture
		.replace(/_/g, ''); // AZLyrics formatting - clean up

	const artist = Clean(meta.artist);
	const title = Clean(meta.title);
	const url = `https://azlyrics.com/lyrics/${artist}/${title}.html`;

	if (artist === '' || title === '') return;

	request(url, (err, res, body) => {
		if (err || res.statusCode !== 200) return;

		const jsonElement = parse(body);
		const htmlElement = jsonElement.find(element => element.type === 'element' && element.tagName === 'html');
		if (!htmlElement) return;

		const bodyElement = htmlElement.children.find(element => element.type === 'element' && element.tagName === 'body');
		if (!bodyElement) return;

		let lyricText = '';

		if (findLyrics(htmlElement, bodyElement)) {
			let findTarget = false;
			const children = lyricContainerElements[0].children || [];

			for (const child of children) {
				const tag = child.tagName || '';
				if (!findTarget) {
					if (tag === '__AZL_TARGET_TAG__') findTarget = true;
					continue;
				}

				const type = child.type || '';
				if (type !== 'element' && tag !== 'div') {
					continue;
				}

				let hasClass = false;
				const attributes = child.attributes || [];
				for (const attri of attributes) {
					const key = attri.key || '';
					if (key === 'class') {
						hasClass = true;
						break;
					}
				}

				if (hasClass) continue;
				if (lyricText.length > 0) break;
				lyricText = parseLyrics(child, lyricText);
			}
		}

		if (lyricText.length <= 0) return;

		const lyricMeta = man.createLyric();
		lyricMeta.title = meta.title;
		lyricMeta.artist = meta.artist;
		lyricMeta.lyricText = lyricText;
		lyricMeta.location = url;
		man.addLyric(lyricMeta);
	});
}

function findLyrics(parentElement, element) {
	const type = element.type || '';
	const children = element.children || [];
	const attributes = element.attributes || [];

	if (type !== 'element' || !children || children.length === 0) {
		return false;
	}

	for (const attribute of attributes) {
		const key = attribute.key || '';
		const value = attribute.value || '';

		if (key === 'class' && value.startsWith('lyricsh')) {
			element.tagName = '__AZL_TARGET_TAG__';
			lyricContainerElements.push(parentElement);
			return true;
		}
	}

	for (const child of children) {
		if (findLyrics(element, child)) {
			return true;
		}
	}

	return false;
}

function parseLyrics(element, lyricText) {
	const Clean = (rawString) => rawString.trim()
		.replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16))) // HTML characters decode
		.replace(/&amp(;|)/gi, '&')
		.replace(/&gt(;|)/gi, '>')
		.replace(/&lt(;|)/gi, '<')
		.replace(/&nbsp(;|)/gi, '')
		.replace(/&quot(;|)/gi, '"')
		.replace(/<br>/gi, '')
		.replace(/\uFF1A/gi, ':')
		.replace(/\uFF08/gi, '(')
		.replace(/\uFF09/gi, ')')
		.replace(/\u00E2\u20AC\u2122|\u2019|\uFF07|[\u0060\u00B4]|â€™(;|)|â€˜(;|)|&apos(;|)|&#39(;|)|(&#(?:039|8216|8217|8220|8221|8222|8223|x27);)/gi, "'") // Apostrophe variants
		.replace(/[\u2000-\u200F\u2028-\u202F\u205F-\u206F\u3000\uFEFF]/gi, ' '); // Whitespace variants

	const tag = element.tagName || '';
	const type = element.type || '';
	const children = element.children || [];
	const content = element.content || '';

	if (tag === 'script' || tag === 'b') {
		return lyricText;
	}

	if (tag === 'br') { // AZLyrics formatting
		return lyricText.replace(/<br>/gi, '');
	}

	if (type === 'text') {
		return lyricText + content;
	}

	for (const child of children) {
		lyricText = parseLyrics(child, lyricText);
	}

	return Clean(lyricText);
}
