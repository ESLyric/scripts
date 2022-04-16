
/*
 All credits to https://github.com/jsososo/QQMusicApi
                https://github.com/xmcp/QRCD
*/

export function getConfig(cfg) {
    cfg.name = "QQ音乐";
    cfg.version = "0.1";
    cfg.author = "ohyeah";
}

export function getLyrics(meta, man) {

    evalLib("querystring/querystring.min.js");

    // query QRC lyrics
    var url = 'https://c.y.qq.com/lyric/fcgi-bin/fcg_search_pc_lrc.fcg?';
    var data = {
        SONGNAME: meta.title,
        SINGERNAME: meta.artist,
        TYPE: 2,
        RANGE_MIN: 1,
        RANGE_MAX: 20
    };
    url += querystring.stringify(data);

    var headers = {};
    headers['Referer'] = 'https://y.qq.com';

    settings = {
        method: 'get',
        url: url,
        headers: headers
    };

    var stage_song_list = [];
    request(settings, (err, res, body) => {
        if (err || res.statusCode != 200) {
            return;
        }
        var xml_doc = mxml.loadString(body);
        var song_list = xml_doc.findElement('songinfo') || [];
        for (const song of song_list) {
            var id = song.getAttr('id');
            if (id == null) continue;
            var title = decodeURIComponent(getChildElementCDATA(song, 'name'));
            var artist = decodeURIComponent(getChildElementCDATA(song, 'singername'));
            var album = decodeURIComponent(getChildElementCDATA(song, 'albumname'));

            stage_song_list.push({ id: id, title: title, artist: artist, album: album });
        }

    });

    var qrcCount = 0;
    var lyricMeta = man.createLyric();
    for (const song of stage_song_list) {
        url = 'https://c.y.qq.com/qqmusic/fcgi-bin/lyric_download.fcg?';
        data = {
            version: '15',
            miniversion: '82',
            lrctype: '4',
            musicid: song.id,
        };
        url += querystring.stringify(data);

        settings = {
            method: 'get',
            url: url,
            headers: headers
        };

        request(settings, (err, res, body) => {
            if (err || res.statusCode != 200) {
                return;
            }

            body = body.replace('<!--', '').replace('-->', '').replace(/<miniversion.*\/>/, '').trim();
            var xml_root = mxml.loadString(body);
            if (xml_root != null) {
                var lyrics = xml_root.findElement('lyric') || [];
                for (const lyric_entry of lyrics) {
                    var content = getChildElementCDATA(lyric_entry, 'content');
                    if (content == null) continue;
                    var lyricData = restoreQrc(content);
                    if (lyricData == null) continue;
                    lyricMeta.title = song.title;
                    lyricMeta.artist = song.artist;
                    lyricMeta.album = song.album;
                    lyricMeta.lyricData = lyricData;
                    lyricMeta.fileType = 'qrc';
                    man.addLyric(lyricMeta);
                    ++qrcCount;
                }
            }
        });
    }

    // qury LRC lyrics
    var queryNum = qrcCount > 1 ? 5 : 10;
    url = 'http://c.y.qq.com/soso/fcgi-bin/client_search_cp?';
    var t = 0;
    data = {
        format: 'json',
        n: queryNum,
        p: 0,
        w: meta.title + '+' + meta.artist,
        cr: 1,
        g_tk: 5381
    };
    url += querystring.stringify(data);

    var settings = {
        method: 'get',
        url: url,
        headers: headers
    };

    stage_song_list = [];
    request(settings, (err, res, body) => {
        if (!err && res.statusCode === 200) {
            try {
                var obj = JSON.parse(body);
                var data = obj['data'] || {};
                var song = data['song'] || {};
                var song_list = song['list'] || {};
                for (const song_entry of song_list) {
                    var title = song_entry['songname'] || '';
                    var album = song_entry['albumname'] || '';
                    var artist = '';
                    var artist_list = song_entry['singer'] || [];
                    if (artist_list.length > 0) {
                        artist = artist_list[0]['name'] || '';
                    }
                    var songmid = song_entry['songmid'] || '';
                    if (songmid === '') {
                        continue;
                    }
                    stage_song_list.push({ title: title, album: album, artist: artist, songmid: songmid });
                }
            } catch (e) {
                console.log('qqmusic exception: ' + e.message);
            }
        }
    });

    var lyricMeta = man.createLyric();
    for (const result of stage_song_list) {
        url = 'http://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?';
        data = {
            songmid: result.songmid,
            pcachetime: new Date().getTime(),
            g_tk: 5381,
            loginUin: 0,
            hostUin: 0,
            inCharset: 'utf8',
            outCharset: 'utf-8',
            notice: 0,
            platform: 'yqq',
            needNewCode: 1,
            format: 'json'
        };
        url += querystring.stringify(data);
        settings = {
            method: 'get',
            url: url,
            headers: headers
        };

        request(settings, (err, res, body) => {
            if (!err && res.statusCode === 200) {
                lyricMeta.title = result.title;
                lyricMeta.artist = result.artist;
                lyricMeta.album = result.album;
                try {
                    var obj = JSON.parse(body);
                    var b64lyric = obj['lyric'] || '';
                    var b64tlyric = data['trans'] || '';
                    var lyric = atob(b64lyric);
                    var tlyric = atob(b64tlyric);
                    if (tlyric != '') lyric += tlyric;
                    lyricMeta.lyricText = lyric;
                    man.addLyric(lyricMeta);
                } catch (e) {
                    console.log('qqmusic parse lyric response exception: ' + e.message);
                }
            }
        });
    }
}

function getChildElementCDATA(node, name) {
    var child = node.findElement(name);
    if (child == null) {
        return '';
    }
    var schild = child.getFirstChild();
    if (schild == null) {
        return '';
    }
    return schild.getCDATA() || '';
}

function restoreQrc(hexText) {
    if (hexText.length % 2 != 0) return null;

    const sig = "[offset:0]\n";
    var arrBuf = new Uint8Array(hexText.length / 2 + sig.length);
    for (var i = 0; i < sig.length; ++i) {
        arrBuf[i] = sig.charCodeAt(i);
    }

    const offset = sig.length;
    for (var i = 0; i < hexText.length; i += 2) {
        arrBuf[offset + i / 2] = parseInt(hexText.slice(i, i + 2), 16);
    }

    return arrBuf.buffer;
}
