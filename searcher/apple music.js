// Apple Music TTML → LRC 搜索器 (ESLyric)
// 需要 AM_DEV_TOKEN 和 AM_USER_TOKEN 才能工作，即需要有效订阅
// 保存路径：foobar2000\profile\eslyric-data\scripts\searcher\apple_music.js
// 重启 foobar2000 后生效

// 打开浏览器访问 https://music.apple.com ，登录你的 Apple Music 账号。
// 打开开发者工具 → Network，播放一首任意歌曲，找到对 amp-api.music.apple.com 的请求：
// * 复制 Authorization 里的 Bearer … 作为 AM_DEV_TOKEN。
// * 复制 Media-User-Token 作为 AM_USER_TOKEN。

export function getConfig(cfg) {
  cfg.name = "Apple Music (TTML→LRC)";
  cfg.version = "1.0";
  cfg.author = "alwaysbeta";
}

// ======= 在这里填你自己的凭据 =======
const AM_DEV_TOKEN  = "PUT_YOUR_DEVELOPER_TOKEN_HERE，替换为自己的凭据";   // Apple Music Developer Token，形如 eyJhbGciOi...（authorization: Bearer ...）
const AM_USER_TOKEN = "PUT_YOUR_MEDIA_USER_TOKEN_HERE，替换为自己的凭据";   // 从浏览器 cookie 里复制 media-user-token
const AM_COOKIE     = "";   // 可选：整段 cookie，提升稳定性
const STOREFRONT    = "cn"; // 区域：us, jp, cn ...

function s(x){ return (x||"").trim(); }
function addLog(msg){ try{ console.log(String(msg)); }catch(e){} }

function buildTerm(meta){
  let t = s(meta.title)  || s(meta.rawTitle);
  let a = s(meta.artist) || s(meta.rawArtist);
  let term = (t + " " + a).trim();
  if (!term) term = s(meta.album) || s(meta.rawAlbum);
  return term;
}

// ========== TTML → LRC 转换 ==========
function parseTimeExpr(str) {
  if(!str) return 0;
  if(/^\d+:\d+(\.\d+)?$/.test(str)) {
    let [m, s] = str.split(":");
    return (+m)*60 + parseFloat(s);
  }
  if(/ms$/.test(str)) return parseFloat(str)/1000;
  if(/s$/.test(str)) return parseFloat(str);
  return parseFloat(str) || 0;
}
function toLrc(ttml){
  let lines = [];
  let regex = /<p [^>]*begin="([^"]+)"[^>]*>([\s\S]*?)<\/p>/g;
  let m;
  while((m = regex.exec(ttml))!==null){
    let t = parseTimeExpr(m[1]);
    let text = m[2].replace(/<[^>]+>/g,"").trim();
    let mm = String(Math.floor(t/60)).padStart(2,"0");
    let ss = String(Math.floor(t%60)).padStart(2,"0");
    let cs = String(Math.floor((t%1)*100)).padStart(2,"0");
    if(text) lines.push(`[${mm}:${ss}.${cs}]${text}`);
  }
  return lines.join("\n");
}

// ========== 主流程 ==========
export function getLyrics(meta, man) {
  const term = buildTerm(meta);
  addLog("[AM] 关键词: " + term);
  addLog("[AM] 元数据: title=" + meta.title + " | artist=" + meta.artist);

  if (!AM_DEV_TOKEN || !AM_USER_TOKEN) {
    addLog("[AM][错误] 未填写 AM_DEV_TOKEN / AM_USER_TOKEN。");
    return;
  }

  const searchUrl = "https://amp-api.music.apple.com/v1/catalog/" + STOREFRONT +
                    "/search?types=songs&limit=5&term=" + encodeURIComponent(term);
  const headers = {
    "Authorization": "Bearer " + AM_DEV_TOKEN,
    "Music-User-Token": AM_USER_TOKEN,
    "Media-User-Token": AM_USER_TOKEN,
    "Origin": "https://music.apple.com",
    "Referer": "https://music.apple.com/",
    "Accept": "application/json",
    "Cookie": AM_COOKIE
  };

  addLog("[AM] 搜索 URL: " + searchUrl);
  request({ url: searchUrl, method: "get", headers }, (err, res, body) => {
    if (err) { addLog("[AM][错误] 搜索请求失败: " + err); return; }
    addLog("[AM] 搜索状态: " + res.statusCode);
    if (res.statusCode !== 200) {
      addLog("[AM] 搜索响应片段: " + String(body).slice(0, 200));
      return;
    }

    let j;
    try { j = JSON.parse(body); }
    catch (e) { addLog("[AM][错误] 搜索 JSON 解析失败: " + e); return; }

    const songs = j && j.results && j.results.songs && j.results.songs.data ? j.results.songs.data : [];
    if (!songs.length) { addLog("[AM] 未找到匹配歌曲"); return; }

    let picked = songs[0];
    for (let i = 0; i < songs.length; i++) {
      try {
        if (songs[i].attributes && songs[i].attributes.hasTimeSyncedLyrics) { picked = songs[i]; break; }
      } catch (_) {}
    }

    const sid = picked.id;
    const title  = picked.attributes?.name || meta.title || "";
    const artist = picked.attributes?.artistName || meta.artist || "";
    const album  = picked.attributes?.albumName || meta.album || "";

    addLog("[AM] 命中: " + artist + " - " + title + " (id=" + sid + ")");

    const lyrUrl = "https://amp-api.music.apple.com/v1/catalog/" + STOREFRONT + "/songs/" + sid + "/lyrics";
    request({ url: lyrUrl, method: "get", headers }, (e2, r2, b2) => {
      if (e2) { addLog("[AM][错误] 拉取歌词失败: " + e2); return; }
      addLog("[AM] 歌词状态: " + r2.statusCode);
      if (r2.statusCode !== 200) { addLog("[AM] 歌词响应片段: " + String(b2).slice(0, 200)); return; }

      let o2;
      try { o2 = JSON.parse(b2); }
      catch (pe) { addLog("[AM][错误] 歌词 JSON 解析失败: " + pe); return; }

      const data0 = o2?.data?.[0];
      const ttml  = data0?.attributes?.ttml || "";

      if (!ttml) { addLog("[AM] 未返回 TTML。"); return; }

      const lrc = toLrc(ttml);
      const l = man.createLyric();
      l.title = title;
      l.artist = artist;
      l.album = album;
      l.source = "Apple Music";
      l.lyricText = lrc;
      l.confidence = 90;
      man.addLyric(l);
      addLog("[AM] 已转换 TTML → LRC 并提交，共 " + lrc.split("\n").length + " 行。");
    });
  });
}
