/*
 All credit goes to the original author
                https://github.com/cimoc/NeteaseCloudMusicScript
                https://sokka.cn/107/

All credit goes to the translator
                https://github.com/wxruints/NeteaseCloudMusicScript-trs
                https://wxruints.github.io
                https://deepseek.com
        转译者：
                原先我在更新ESLyric时丢失了一个非常好用的脚本
                根据我的判断，这是由于旧脚本格式无法匹配新版本ESLyric所导致的
                于是我根据旧脚本备注时留存的项目地址与联系方式尝试联系作者，但并未联系上,且项目仓库也已删除
                在此时我有了转译脚本的打算
                感谢如今A.I.工具的发展，这使得我很快便完成了转译工作
                现在该脚本由deepseek编写主要框架，本人进行框架内的纠错、API更新和其他方面的进一步完善
                同时希望原作者能看到的话务必联系我！
                基本保留原作者注释
                Translated by wxruints&Kiana Kaslana&DeepSeek
*/

export function getConfig(cfg) {
    cfg.name = "NeteaseCloudMusicScript-trs";
    cfg.version = "1.2.0.7,Trs-from old ver0.1.2 b6"; // 版本号更新，兼容歌手分隔符
    cfg.author = "Auth.cimoc，Trans.wxruints";
}

export function getLyrics(meta, man) {
    
    // 更改lrc_order内标识顺序,设置歌词输出顺序,删除即不获取
    // double_row:双语并排、old_merge:并排合并、newtype:并列合并、origin:原版、tran:翻译
    var lrc_order = [
        "old_merge", // （置顶优先级最高）
        "double_row",//双语并排
        "newtype", 
        "origin",
        "tran",
    ];
    
    // 搜索歌词数,如果经常搜不到试着改小或改大
    var limit = 4;
    
    // 更改或删除翻译外括号
    // 提供一些括号〔 〕〈 〉《 》「 」『 』〖 〗【 】( ) [ ] { }
    var bracket = [
        "「", // 左括号
        "」"  // 右括号
    ];
    
    // 修复newtype歌词保存 翻译提前秒数 设为0则取消 如果翻译歌词跳的快看的难过,蕴情设为0.4-1.0
    var savefix = 0.01;
    // new_merge歌词翻译时间轴滞后秒数，防闪
    var timefix = 0.01;
    // 当timefix有效时设置offset(毫秒),防闪
    var offset = -20;
    
    var debug = false;
    
    // —————— 核心修改：兼容任意歌手分隔符 ——————
    // 处理标题：删除feat.及之后内容
    var titleResult = del(meta.title, "feat.");
    var title = titleResult[0];
    var outstr1 = titleResult[1];
    
    // 处理艺术家：将任意分隔符（空格/&/和/|/;等）转为网易云兼容的逗号，去重、过滤空值
    var artistRaw = meta.artist || "";
    var artistFormatted = artistRaw
        .replace(/\s+| & | 和 |\||;|\/|·/g, ",") // 匹配空格/&/和/|/;/·等分隔符，转为逗号
        .split(",")
        .map(artist => artist.trim()) // 去除每个歌手名的首尾空格
        .filter(artist => artist); // 过滤空值
    var artist = artistFormatted.join(","); // 转为网易云标准的逗号分隔格式
    var outstr2 = artistRaw.substr(artist.length) || "";
    // —————— 歌手分隔符处理结束 ——————
    
    // 搜索：兼容单歌手/多歌手，格式为 标题-歌手1,歌手2,歌手3
    var searchQuery = artist ? (title + "-" + artist) : title;
    var searchURL = "http://music.163.com/api/search/get/";
    
    var headers = {
        'Host': 'music.163.com',
        'Origin': 'http://music.163.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 6.3; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.90 Safari/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': 'http://music.163.com/search/',
        'Cookie': 'appver=1.5.0.75771'
    };
    
    var postData = 'hlpretag=<span class="s-fc7">&hlposttag=</span>&s=' + encodeURIComponent(searchQuery) + '&type=1&offset=0&total=true&limit=' + limit;
    
    var settings = {
        method: 'post',
        url: searchURL,
        headers: headers,
        body: postData
    };
    
    request(settings, (err, res, body) => {
        if (err || res.statusCode !== 200) {
            consoleLog(debug, 'Search failed: ' + res.statusCode);
            return;
        }
        
        try {
            var ncmBack = parseJson(body);
            if (!ncmBack || ncmBack.code !== 200) {
                consoleLog(debug, 'Get info failed');
                return;
            }
            
            var result = ncmBack.result || {};
            if (!result.songCount) {
                consoleLog(debug, 'No songs found');
                return;
            }
            
            var songs = result.songs || [];
            consoleLog(debug, 'Found ' + songs.length + ' songs');
            
            // 筛选曲名及艺术家（原有逻辑，无改动）
            var bestMatch = { index: 0, artistIndex: 0, score: [0, 0] };
            for (var k = 0; k < songs.length; k++) {
                var song = songs[k];
                var ncmName = song.name || '';
                
                for (var a_k = 0; a_k < (song.artists || []).length; a_k++) {
                    var ncmArtist = song.artists[a_k].name || '';
                    var p0 = compare(title, ncmName);
                    var p1 = compare(artist, ncmArtist);
                    
                    if (p0 === 100 && p1 === 100) {
                        bestMatch.index = k;
                        bestMatch.artistIndex = a_k;
                        bestMatch.score = [p0, p1];
                        break;
                    }
                    
                    if (p0 > bestMatch.score[0]) {
                        bestMatch.index = k;
                        bestMatch.artistIndex = a_k;
                        bestMatch.score = [p0, p1];
                    } else if (!artist && (p0 === bestMatch.score[0] && p1 > bestMatch.score[1])) {
                        bestMatch.index = k;
                        bestMatch.artistIndex = a_k;
                        bestMatch.score[1] = p1;
                    }
                }
            }
            
            var selectedSong = songs[bestMatch.index];
            var resId = selectedSong.id;
            var resName = selectedSong.name;
            var resArtist = selectedSong.artists[bestMatch.artistIndex].name;
            
            consoleLog(debug, resId + "-" + resName + "-" + resArtist);
            
            // 获取歌词（原有逻辑，无改动）
            var lyricURL = "http://music.163.com/api/song/lyric?os=pc&id=" + resId + "&lv=-1&kv=-1&tv=-1";
            var lyricSettings = {
                method: 'get',
                url: lyricURL,
                headers: headers
            };
            
            request(lyricSettings, (err, res, body) => {
                if (err || res.statusCode !== 200) {
                    consoleLog(debug, 'Get lyric failed: ' + res.statusCode);
                    return;
                }
                
                var ncmLrc = parseJson(body);
                if (!ncmLrc || !ncmLrc.lrc) {
                    consoleLog(debug, 'No lyric data');
                    return;
                }
                
                var hasTranslation = false;
                var hasOriginal = false;
                var translationLrc = '';
                var originalLrc = ncmLrc.lrc.lyric || '';
                
                if (originalLrc) {
                    hasOriginal = true;
                } else {
                    consoleLog(debug, 'No original lyric');
                }
                
                if (ncmLrc.tlyric && ncmLrc.tlyric.lyric) {
                    translationLrc = ncmLrc.tlyric.lyric.replace(/(〔|〕|〈|〉|《|》|「|」|『|』|〖|〗|【|】|{|}|\/)/g, "");
                    hasTranslation = true;
                } else {
                    consoleLog(debug, 'No translation');
                }
                
                if (!lrc_order.length) {
                    lrc_order = ["double_row", "old_merge", "newtype", "origin", "tran"];
                }
                
                var finalTitle = resName + outstr1;
                var finalArtist = resArtist + outstr2;
                
                // 歌词版本输出（原有逻辑，无改动）
                for (var key in lrc_order) {
                    switch (lrc_order[key]) {
                        case "double_row": // 双语并排
                            if (hasOriginal && hasTranslation) {
                                addLyric(man, lrcDoubleRow(originalLrc, translationLrc, bracket), finalTitle, finalArtist, "网易云双语并排");
                            }
                            break;
                        case "old_merge":
                            if (hasOriginal && hasTranslation) {
                                addLyric(man, lrcMerge(originalLrc, translationLrc, bracket), finalTitle, finalArtist, "网易云并排旧");
                            }
                            break;
                        case "newtype":
                            if (hasOriginal && hasTranslation) {
                                addLyric(man, lrcNewtype(originalLrc, translationLrc, true, bracket), finalTitle, finalArtist, "网易云并列");
                            }
                            break;
                        case "origin":
                            if (hasOriginal) {
                                addLyric(man, originalLrc, finalTitle, finalArtist, "网易云原词");
                            }
                            break;
                        case "tran":
                            if (hasTranslation) {
                                addLyric(man, translationLrc, finalTitle, finalArtist, "网易云翻译");
                            }
                            break;
                        case "new_merge":
                            if (hasOriginal && hasTranslation) {
                                addLyric(man, lrcNewtypeFixed(originalLrc, translationLrc, bracket), finalTitle, finalArtist, "网易云并排");
                            }
                            break;
                    }
                }
            });
            
        } catch (e) {
            consoleLog(debug, 'Exception: ' + e.message);
        }
    });
}

// 原有工具函数，无改动
function addLyric(man, lyricText, title, artist, source) {
    if (!lyricText) return;
    
    var lyricMeta = man.createLyric();
    lyricMeta.title = title;
    lyricMeta.artist = artist;
    lyricMeta.lyricText = lyricText;
    man.addLyric(lyricMeta);
}

// 原有工具函数，无改动
function del(str, delthis) {
    var s = [str, ""];
    if (!str) return s;
    
    var set = str.indexOf(delthis);
    if (set === -1) {
        return s;
    }
    
    s[1] = " " + str.substr(set);
    s[0] = str.substring(0, set);
    return s;
}

// 原有工具函数，无改动
function compare(x, y) {
    if (!x || !y) return 0;
    
    x = x.split("");
    y = y.split("");
    var z = 0;
    var s = x.length + y.length;
    
    x.sort();
    y.sort();
    var a = x.shift();
    var b = y.shift();
    
    while (a !== undefined && b !== undefined) {
        if (a === b) {
            z++;
            a = x.shift();
            b = y.shift();
        } else if (a < b) {
            a = x.shift();
        } else if (a > b) {
            b = y.shift();
        }
    }
    return z / s * 200;
}

// 双语并排核心函数，无改动
function lrcDoubleRow(olrc, tlrc, bracket) {
    olrc = olrc.split("\n");
    tlrc = tlrc.split("\n");
    
    var set = 0;
    for (var ii = 5; ii < 10; ii++) {
        var counter = olrc[ii]?.indexOf("]") ?? 9;
        counter = (counter === -1) ? 9 : counter;
        set += counter;
    }
    set = Math.round(set / 5);
    
    var i = 0;
    var l = tlrc.length;
    var lrc = [];
    
    for (var k in olrc) {
        var a = olrc[k].substring(1, set);
        var timeTag = "[" + a + "]";
        while (i < l) {
            var j = 0;
            var tf = 0;
            while (j < 5) {
                if (i + j >= l) break;
                var b = tlrc[i + j].substring(1, set);
                if (a === b) {
                    tf = 1;
                    i += j;
                    break;
                }
                j++;
            }
            if (tf === 0) {
                lrc.push(olrc[k]);
                break;
            }
            var originalContent = olrc[k].substr(set + 1).trim();
            var transContent = tlrc[i].substr(set + 1).trim();
            if (originalContent && transContent) {
                lrc.push(timeTag + " " + originalContent + bracket[0] + transContent + bracket[1]);
                i++;
                break;
            } else if (originalContent) {
                lrc.push(timeTag + " " + originalContent);
                i++;
                break;
            } else {
                lrc.push(olrc[k]);
                break;
            }
        }
    }
    return lrc.join("\n");
}

// 并排旧版函数，无改动
function lrcMerge(olrc, tlrc, bracket) {
    olrc = olrc.split("\n");
    tlrc = tlrc.split("\n");
    
    var set = 0;
    for (var ii = 5; ii < 10; ii++) {
        var counter = olrc[ii]?.indexOf("]") ?? 9;
        counter = (counter === -1) ? 9 : counter;
        set += counter;
    }
    set = Math.round(set / 5);
    
    var i = 0;
    var l = tlrc.length;
    var lrc = [];
    
    for (var k in olrc) {
        var a = olrc[k].substring(1, set);
        var timeTag = "[" + a + "]";
        while (i < l) {
            var j = 0;
            var tf = 0;
            while (j < 5) {
                if (i + j >= l) break;
                var b = tlrc[i + j].substring(1, set);
                if (a === b) {
                    tf = 1;
                    i += j;
                    break;
                }
                j++;
            }
            if (tf === 0) {
                lrc.push(olrc[k]);
                break;
            }
            var c = tlrc[i].substr(set + 1).trim();
            if (c) {
                lrc.push(timeTag + olrc[k].substr(set + 1).trim());
                lrc.push(timeTag + bracket[0] + c + bracket[1]);
                i++;
                break;
            } else {
                lrc.push(olrc[k]);
                break;
            }
        }
    }
    return lrc.join("\n");
}

// 并列版函数，无改动
function lrcNewtype(olrc, tlrc, mergeType, bracket) {
    olrc = olrc.split("\n");
    tlrc = tlrc.split("\n");
    
    var set = 0;
    for (var ii = 5; ii < 10; ii++) {
        var counter = olrc[ii]?.indexOf("]") ?? 9;
        counter = (counter === -1) ? 9 : counter;
        set += counter;
    }
    set = Math.round(set / 5);
    
    var i = 0;
    var l = tlrc.length;
    var r = [];
    
    for (var k in olrc) {
        var a = olrc[k].substring(1, set);
        if (i >= l) break;
        
        var j = 0;
        var tf = 0;
        while (j < 5) {
            if (i + j >= l) break;
            var b = tlrc[i + j].substring(1, set);
            if (a === b) {
                tf = 1;
                i += j;
                break;
            }
            j++;
        }
        
        if (tf === 0) {
            r.push([k, false, a]);
        } else {
            r.push([k, i, a]);
        }
    }
    
    var lrc = [];
    var l_r = r.length;
    
    if (mergeType) {
        for (var kk = 0; kk < l_r; kk++) {
            var o = r[kk][0];
            var t = r[kk][1];
            var timeTag = "[" + r[kk][2] + "]";
            var o_content = olrc[o].substr(set + 1).trim();
            var o_lrc = o_content ? timeTag + o_content : timeTag;
            if(o_lrc) lrc.push(o_lrc);
            
            var t_content = t !== false && tlrc[t].substr(set + 1).trim() ? tlrc[t].substr(set + 1).trim() : "";
            if (t_content) {
                lrc.push(timeTag + bracket[0] + t_content + bracket[1]);
            }
        }
    } else {
        for (var kk = 0; kk < l_r; kk++) {
            var o = r[kk][0];
            var t = r[kk][1];
            var timeTag = "[" + r[kk][2] + "]";
            var o_content = olrc[o].substr(set + 1).trim();
            var o_lrc = o_content ? timeTag + o_content : timeTag;
            
            var t_content = t !== false && tlrc[t].substr(set + 1).trim() ? tlrc[t].substr(set + 1).trim() : "";
            if(o_lrc) lrc.push(o_lrc);
            if (t_content) {
                lrc.push(timeTag + bracket[0] + t_content + bracket[1]);
            }
        }
    }
    
    return lrc.join("\n");
}

// 并排新版函数，无改动
function lrcNewtypeFixed(olrc, tlrc, bracket) {
    olrc = olrc.split("\n");
    tlrc = tlrc.split("\n");
    
    var set = 0;
    for (var ii = 5; ii < 10; ii++) {
        var counter = olrc[ii]?.indexOf("]") ?? 9;
        counter = (counter === -1) ? 9 : counter;
        set += counter;
    }
    set = Math.round(set / 5);
    
    var i = 0;
    var l = tlrc.length;
    var r = [];
    
    for (var k in olrc) {
        var a = olrc[k].substring(1, set);
        if (i >= l) break;
        
        var j = 0;
        var tf = 0;
        while (j < 5) {
            if (i + j >= l) break;
            var b = tlrc[i + j].substring(1, set);
            if (a === b) {
                tf = 1;
                i += j;
                break;
            }
            j++;
        }
        
        if (tf === 0) {
            r.push([k, false, a]);
        } else {
            r.push([k, i, a]);
        }
    }
    
    var lrc = [];
    var l_r = r.length;
    
    for (var kk = 0; kk < l_r; kk++) {
        var o = r[kk][0];
        var t = r[kk][1];
        var currentTime = r[kk][2];
        var timeTag = "[" + currentTime + "]";
        
        var originalLine = olrc[o];
        var originalContent = originalLine.substr(set + 1).trim();
        
        var translationContent = "";
        if (t !== false && tlrc[t]) {
            var transLine = tlrc[t];
            translationContent = transLine.substr(set + 1).trim();
        }
        
        if (originalContent) {
            lrc.push(timeTag + originalContent);
        }
        if (translationContent) {
            lrc.push(timeTag + bracket[0] + translationContent + bracket[1]);
        }
    }
    
    return lrc.join("\n");
}

// 原有工具函数，无改动
function parseJson(text) {
    try {
        return JSON.parse(text);
    } catch (e) {
        console.log('[NeteaseCloudMusic] Parse JSON exception: ' + e.message);
        return null;
    }
}

// 原有工具函数，无改动
function consoleLog(debug, msg) {
    if (debug) {
        console.log('[NeteaseCloudMusic] ' + msg);
    }
}
