/**
 * NetEase Cloud Music Lyrics Searcher Ex
 * Original Author: ohyeah
 * Modified by: Robotxm
 * Fixed by: A-pigeon
 * Version: 0.3
 * License: GPL 3.0
 * Description: Make foobar2000 with ESLyric able to parse lyrics provided by NetEase Cloud Music.
 * Github: https://github.com/Robotxm/ESLyric-LyricsSource
 *
 * All credits to:
 * https://github.com/Binaryify/NeteaseCloudMusicApi
 * https://github.com/entronad/crypto-es
 * https://note.ldper.com/netease-music-api-interface.html
**/

evalLib('querystring/querystring.min.js')

const doRequest = (method, url, params) => {
    return new Promise((resolve, reject) => {
        const headers = {
            'Referer': 'https://music.163.com',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        let body = null
        if (method.toUpperCase() === 'GET') {
            const query = querystring.stringify(params || {})
            if (query)
                url += (url.includes('?') ? '&' : '?') + query
        } else {
            headers['Content-Type'] = 'application/x-www-form-urlencoded'
            body = querystring.stringify(params || {})
        }
        const settings = {
            method: method,
            url: url,
            headers: headers
        }
        if (body !== null)
            settings.body = body
        request(settings, (err, res, body) => {
            if (!err && res.statusCode === 200)
                resolve(body)
            else
                reject(new Error(err ? err : 'HTTP ' + (res ? res.statusCode : 'no response')))
        })
    }).catch(error => {
        console.log('[netease_ex] request failed: ' + (error && error.message ? error.message : error))
    })
}

const procKeywords = (str) => {
    let s = str
    s = s.toLowerCase()
    s = s.replace(/\'|·|\$|\&|–/g, "")
    //truncate all symbols
    s = s.replace(/\(.*?\)|\[.*?]|{.*?}|（.*?/g, "")
    s = s.replace(/[-/:-@[-`{-~]+/g, "")
    s = s.replace(/[\u2014\u2018\u201c\u2026\u3001\u3002\u300a\u300b\u300e\u300f\u3010\u3011\u30fb\uff01\uff08\uff09\uff0c\uff1a\uff1b\uff1f\uff5e\uffe5]+/g, "")
    return s.trim()
}

const metaText = (raw, cooked) => {
    if (typeof raw === 'string' && raw.trim() !== '')
        return raw
    if (typeof cooked === 'string' && cooked.trim() !== '')
        return cooked
    return ''
}

const cleanLrc = (text) => text.replace(/^\{(.*)\}\s*/mg, "").trim()

export function getConfig(config) {
    config.name = "网易云音乐 Ex"
    config.version = "0.3"
    config.author = "A-pigeon"
}

export function getLyrics(meta, man) {
    const title = procKeywords(metaText(meta.rawTitle, meta.title))
    const artist = procKeywords(metaText(meta.rawArtist, meta.artist))
    const keyword = (title + " " + artist).trim()

    if (keyword === '') {
        console.log('[netease_ex] empty search keyword, skipped')
        return
    }

    doRequest('GET', 'https://music.163.com/api/search/get', {
        s: keyword,
        type: 1,
        limit: 10,
        offset: 0
    }).then((body) => {
        const candicates = parseSearchResults(body)
        console.log('[netease_ex] search "' + keyword + '" -> ' + candicates.length + ' candidates')
        for (const item of candicates) {
            if (man.checkAbort())
                return
            doRequest('GET', 'https://music.163.com/api/song/lyric', {
                os: 'pc',
                id: item.id,
                lv: -1,
                tv: -1
            }).then((body) => {
                parseLyricResponse(item, man, body)
            })
        }
    })
    // loop to 'wait' callback(promise)
    messageLoop(0)
}

function parseSearchResults(body) {
    let candicates = []
    if (!body)
        return candicates
    try {
        let obj = JSON.parse(body)
        let results = obj['result'] || {}
        let songs = results['songs'] || []
        for (const song of songs) {
            if (typeof (song['id']) === 'undefined' || typeof (song['name']) === 'undefined')
                continue
            let id = song['id']
            let title = song['name']
            let artist = ''
            let artists = song['artists'] || []
            for (const item of artists) {
                if ('name' in item) {
                    artist = item['name']
                    break
                }
            }
            let album = song['album'] || {}
            album = album['name'] || ''
            candicates.push({ id: id, title: title, artist: artist, album: album })
        }
    } catch (e) {
        console.log(e)
    }

    return candicates
}

function parseLyricResponse(item, man, body) {
    if (!body)
        return
    try {
        let lyricObj = JSON.parse(body)

        if (lyricObj['uncollected'] || lyricObj['nolyric']) {
            console.log('[netease_ex] ' + item.id + ' "' + item.title + '": no lyric available')
            return
        }

        const lrc = lyricObj['lrc']
        if (!lrc || typeof (lrc['lyric']) !== 'string')
            return

        // version 1 is a placeholder such as "[00:00.00]暂无歌词"
        if ((lrc['version'] || 0) == 1) {
            console.log('[netease_ex] ' + item.id + ' "' + item.title + '": placeholder lyric, skipped')
            return
        }

        let lyricText = cleanLrc(lrc['lyric'])
        if (lyricText === '')
            return

        // Append translation if exists
        const tlyric = lyricObj['tlyric']
        if (tlyric && typeof (tlyric['lyric']) === 'string') {
            const translation = cleanLrc(tlyric['lyric'])
            if (translation !== '')
                lyricText += "\n" + translation
        }

        const lyricsMetadata = man.createLyric()
        lyricsMetadata.title = item.title
        lyricsMetadata.artist = item.artist
        lyricsMetadata.album = item.album
        lyricsMetadata.lyricText = lyricText
        man.addLyric(lyricsMetadata)
    } catch (e) {
        console.log(e)
    }
}
