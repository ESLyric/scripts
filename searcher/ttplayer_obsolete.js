
var SERVER_1 = "http://ttlrcct.qianqian.com";
var SERVER_2 = "http://ttlrccnc.qianqian.com";

var SERVER = SERVER_1;

export function get_config(config) {
    config.name = "千千静听(已废弃)";
    config.version = "0.3";
    config.author = "ohyeah";
}

export function get_lyrics(meta, man) {
    var title = meta.title;
    var artist = meta.artist;
    var lyrics_arr = [];
    request(createReqUrl(meta.artist, meta.title),
        (err, res, body) => {
            if (!err & res.statusCode == 200) {
                var xml_doc = mxml.loadString(body);
                if (!xml_doc) return;
                var lyric_nodes = xml_doc.findElement("lrc");
                if (!lyric_nodes) return;
                for (const node of lyric_nodes) {
                    lyrics_arr.push({
                        id: node.getAttr("id"),
                        artist: node.getAttr("artist"),
                        title: node.getAttr("title")
                    });
                }
            }
        });
    var lyric_meta = man.createLyric();
    for (const node of lyrics_arr) {
        request(createReqUrl(node.artist, node.title, node.id),
            (err, res, body) => {
                if (!err & res.statusCode == 200) {
                    lyric_meta.title = node.title;
                    lyric_meta.artist = node.artist;
                    lyric_meta.lyricText = body;
                    man.addLyric(lyric_meta);
                }
            });
    }
}

function createReqUrl(artist, title, id) {
    var url;
    if (id) {
        var code = calcCode(artist, title, id);
        url = SERVER + "/dll/lyricsvr.dll?dl?Id=" + id + "&Code=" + code.toString(10);
    } else {
        title = procKeywords(title);
        artist = procKeywords(artist);
        url = SERVER + "/dll/lyricsvr.dll?sh?Artist=" + dumpHexUnicodeLE(artist) + "&Title=" + dumpHexUnicodeLE(title) + "&Flags=0";
    }
    return url;
}

function procKeywords(str) {
    var s = str;
    s = s.toLowerCase();
    s = s.replace(/\'|·|\$|\&|–/g, "");
    //trim all spaces
    s = s.replace(/(\s*)|(\s*$)/g, "");
    //truncate all symbols
    s = s.replace(/\(.*?\)|\[.*?]|{.*?}|（.*?/g, "");
    s = s.replace(/[-/:-@[-`{-~]+/g, "");
    s = s.replace(/[\u2014\u2018\u201c\u2026\u3001\u3002\u300a\u300b\u300e\u300f\u3010\u3011\u30fb\uff01\uff08\uff09\uff0c\uff1a\uff1b\uff1f\uff5e\uffe5]+/g, "");
    return s;
}

function mult32s(n, m) //signed version
{
    n |= 0; m |= 0;
    var nlo = n & 0xffff;
    var nhi = n - nlo;
    return ((nhi * m | 0) + (nlo * m)) | 0;
}

function calcCode(artist, title, id) {
    var info = artist + title;
    var utf8hex = dumpHexUTF8(info);
    var code = [];
    var len = utf8hex.length / 2;
    for (var i = 0; i < utf8hex.length; i += 2) {
        code[i / 2] = parseInt(utf8hex.substr(i, 2), 16);
    }
    var t1 = 0,
        t2 = 0,
        t3 = 0;
    t1 = (id & 0x0000FF00) >> 8;
    if ((id & 0x00FF0000) == 0) t3 = 0x000000FF & ~t1;
    else t3 = 0x000000FF & ((id & 0x00FF0000) >> 16);
    t3 = t3 | ((0x000000FF & id) << 8);
    t3 = t3 << 8;
    t3 = t3 | (0x000000FF & t1);
    t3 = t3 << 8;
    if ((id & 0xFF000000) == 0) t3 = t3 | (0x000000FF & (~id));
    else t3 = t3 | (0x000000FF & (id >> 24));

    var j = len - 1;
    while (j >= 0) {
        var c = code[j];
        if (c >= 0x80) c = c - 0x100;
        t1 = ((c + t2) & 0xFFFFFFFF);
        t2 = ((t2 << (j % 2 + 4)) & 0xFFFFFFFF);
        t2 = ((t1 + t2) & 0xFFFFFFFF);
        j--;
    }
    j = 0;
    t1 = 0;
    while (j < len) {
        var c = code[j];
        if (c >= 128) c = c - 256;
        var t4 = ((c + t1) & 0xFFFFFFFF);
        t1 = ((t1 << (j % 2 + 3)) & 0xFFFFFFFF);
        t1 = ((t1 + t4) & 0xFFFFFFFF);
        j++;
    }
    var t5 = conv(t2 ^ t3);
    t5 = conv(t5 + (t1 | id));
    t5 = conv(mult32s(t5, (t1 | t3)));
    t5 = conv(mult32s(t5, (t2 ^ id)));
    if (t5 > 0x80000000) t5 = (t5 - 0x100000000) & 0xFFFFFFFF;
    return t5;
}

//Unicode | UTF-8
//(HEX)   | (BIN)
//--------------------+---------------------------------------------
//0000 0000-0000 007F | 0xxxxxxx
//0000 0080-0000 07FF | 110xxxxx 10xxxxxx
//0000 0800-0000 FFFF | 1110xxxx 10xxxxxx 10xxxxxx
//0001 0000-0010 FFFF | 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx
function dumpHexUTF8(str) {
    var ret = "";

    for (var i = 0; i < str.length; i++) {
        var c = str.charCodeAt(i);
        var b = 0;
        if (c < 0x0080) { // 0000 - 007F
            b = c & 0x000000ff;
        } else if (c < 0x800) { // 0080 - 07FF
            b = (0xC0 | ((c & 0x7C0) >> 6)) << 8;
            b |= (0x80 | (c & 0x3F)) << 0;
        } else if (c < 0x010000) { // 0800 - FFFF
            b = (0xE0 | ((c & 0xF000) >> 12)) << 16;
            b |= (0x80 | ((c & 0xFC0) >> 6)) << 8;
            b |= (0x80 | (c & 0x3F)) << 0;
        } else { // 0x010000 - 
            b = (0xF0 | ((c & 0x1C0000) >> 18)) << 24;
            b |= (0x80 | ((c & 0x3F000) >> 12)) << 16;
            b |= (0x80 | ((c & 0xFC0) >> 6)) << 8;
            b |= (0x80 | (c & 0x3F)) << 0;
        }
        ret += b.toString(16).toUpperCase();
    }

    return ret;
}

function dumpHexUnicodeLE(str) {
    var ret = "";
    for (var i = 0; i < str.length; i++) {
        var b = str.charCodeAt(i);
        var bs = "";
        //convert UNICODE BE to LE
        var lb = (b & 0xff00) >> 8;
        var hb = (b & 0x00ff) >> 0;
        if (hb < 0x10) bs += "0";
        bs += hb.toString(16).toUpperCase();
        if (lb < 0x10) bs += "0";
        bs += lb.toString(16).toUpperCase();

        ret += bs;
    }
    return ret;
}

function conv(i) {
    i &= 0xFFFFFFFF;
    var r = i % 0x100000000;
    if (i >= 0 && r > 0x80000000) r = r - 0x100000000;
    if (i < 0 && r < 0x80000000) r = r + 0x100000000;
    return r & 0xFFFFFFFF;
}