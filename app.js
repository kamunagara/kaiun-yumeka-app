
// グリッド配列（NW,N,NE,W,C,E,SW,S,SE）のindex→宮
const IDX_TO_PALACE = ["乾","坎","艮","兌","中","震","坤","離","巽"];
// このアプリの盤表示は「南が上（離が上）」で描画しているため、月盤の宮⇔配列index対応は下記。
// （配列順は [左上,上,右上,左,中,右,左下,下,右下]）
const IDX_TO_PALACE_SOUTH_TOP = ["巽","離","坤","震","中","兌","艮","坎","乾"];

// 宮の向かい側（反対方位）
const OPPOSITE_PALACE = { "乾":"坤","坤":"乾","坎":"離","離":"坎","震":"兌","兌":"震","艮":"巽","巽":"艮","中":"中" };

// 月盤用：指定した星が入っている「宮」を返す（南が上）
function palaceOfStarMonth(grid, star){
  if (!Array.isArray(grid)) return null;
  const s = Number(star);
  const idx = grid.map(Number).indexOf(s);
  return (idx>=0) ? IDX_TO_PALACE_SOUTH_TOP[idx] : null;
}


// 正規化：宮名の表記ゆれ（例： "坎宮", "坎 ", "中宮"）を吸収
function normPalace(p){
  if(p==null) return null;
  let s = String(p).trim();
  if(s==="") return null;
  if(s==="中宮") return "中";
  // 末尾の「宮」を落とす（坎宮→坎）
  s = s.replace(/宮$/,"");
  return s;
}

function palaceOfStar(grid, star){
  if (!Array.isArray(grid)) return null;

  // star が "1" みたいな文字列で来てもOKにする
  const s = Number(star);

  // grid 側も数値として比較できるように（念のため）
  const idx = grid.map(Number).indexOf(s);

  return (idx >= 0) ? normPalace(IDX_TO_PALACE[idx]) : null;
}


// 指定した宮（例："兌"）に回座している星を返す（gridは [乾,坎,艮,兌,中,震,坤,離,巽] の並び）
function starInPalace(grid, palaceName){
  const idxMap = {"乾":0,"坎":1,"艮":2,"兌":3,"中":4,"震":5,"坤":6,"離":7,"巽":8};
  const p = normPalace(palaceName);
  const idx = idxMap[p];
  if(idx==null) return null;
  const g = Array.isArray(grid) ? grid : [];
  const v = g[idx];
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}


/* ===============================
   開運夢叶カレンダー app.js（安定版）
   - 月切替で止まらない
   - 2月以降も月盤を自動生成して表示
   - 日盤（2026）から日マス点数を自動計算（未入力日も50固定にならない）
   - 月盤の五黄殺/暗剣殺（薄緑）表示：方位キーで正しく塗る
   - 年盤：yearBlocks に grid が無くても自動生成して表示
================================ */

const $ = (id) => document.getElementById(id);

// ---- DOM ----
const titleEl = $("title");
const subtitleEl = $("subtitle");
const calendarEl = $("calendar");
const detailEl = $("detail");
const topBoardsEl = $("topBoards");

const honmeiSelect = $("honmeiSelect");
const monthInput = $("monthInput");

const backBtn = $("backBtn");
const helpBtn = $("helpBtn");


const STAR_NAME_MAP = {1:"一白水星",2:"二黒土星",3:"三碧木星",4:"四緑木星",5:"五黄土星",6:"六白金星",7:"七赤金星",8:"八白土星",9:"九紫火星"};
// ---- URLパラメータで本命星を固定（販売用）----
// 例: ?star=2 なら二黒土星で固定。
const FIXED_HONMEI = (() => {
  try {
    const v = new URLSearchParams(location.search).get("star");
    const n = Number(v);
    return Number.isFinite(n) && n >= 1 && n <= 9 ? n : null;
  } catch(e) {
    return null;
  }
})();

// 固定されている場合は本命星を固定表示（販売用）
// - セレクトは非表示＆変更不可
// - 「本命星」ラベルに星名を表示（例：本命星：二黒土星）
if (FIXED_HONMEI && honmeiSelect) {
  honmeiSelect.value = String(FIXED_HONMEI);
  honmeiSelect.disabled = true;
  honmeiSelect.style.display = "none";

  // index.html の label に for 属性が無い場合があるので、セレクトと同じ行の label を拾う
  const row = honmeiSelect.closest(".row");
  const label = (row && row.querySelector("label")) || document.querySelector("label[for='honmeiSelect']");
  if (label) {
    const name = STAR_NAME_MAP[FIXED_HONMEI] || `星${FIXED_HONMEI}`;
    label.style.display = "";
    label.textContent = `本命星：${name}`;
    label.classList.add("honmei-fixedlabel");
  }
}


const detailDateEl = $("detailDate");
const refYearEl = $("refYear");
const refMonthEl = $("refMonth");
const dayPalaceEl = $("dayPalace");
const dayScoreEl = $("dayScore");
const dayBadEl = $("dayBad");
const monthBadEl = $("monthBad");
const oneLineEl = $("oneLine");
// 日詳細の「吉方位（日）」表示
const dayGoodDirEl = $("dayGoodDir");
const memoEl = $("memo");

const dialog = $("dialog");
const dialogTitle = $("dialogTitle");
const dialogText = $("dialogText");
const closeDialog = $("closeDialog");

let data = null;
let dataLoadError = "";
let currentMonth = "2026-01";

// 年運点数（year_scores_2026.json から読み込む）
let YEAR_SCORES = null;
let YEAR_SCORES_PROMISE = null;
let currentHonmei = 1;
// ===============================
// 祐気どり（honmei_1〜9.json からロードしてキャッシュ）
// ===============================
let YUKI_CACHE_BY_HONMEI = {}; // { "1": [ {date,times,dirs}, ... ], ... }
let YUKI_READY = false;

function loadAllYuki(){
  const tasks = [];
  for(let h=1; h<=9; h++){
    const url = `./data/honmei_${h}.json`;
    tasks.push(
      fetch(url, { cache: "no-store" })
        .then(r => r.ok ? r.json() : null)
        .then(j => {
          const list = Array.isArray(j?.yuki) ? j.yuki : [];
          YUKI_CACHE_BY_HONMEI[String(h)] = list;
        })
        .catch(() => {
          YUKI_CACHE_BY_HONMEI[String(h)] = [];
        })
    );
  }
  return Promise.all(tasks).then(() => { YUKI_READY = true; });
}

function getYukidoriForDate(dateStr, honmeiNum){
  const list = YUKI_CACHE_BY_HONMEI?.[String(honmeiNum)] || [];
  return list.filter(e => e?.date === dateStr);
}

function formatYukiText(events){
  if(!events || events.length === 0) return "";
  return events.map(e => {
    const t = Array.isArray(e.times) ? e.times.join(" / ") : "";
    const d = Array.isArray(e.dirs) ? e.dirs.join("・") : "";
    if(t && d) return `${t}（${d}）`;
    if(t) return t;
    if(d) return d;
    return "";
  }).filter(Boolean).join(" / ");
}


// 年運「続きを読む」開閉状態（yearBlocksのidごとに保持）
const YEAR_MORE_OPEN = Object.create(null);

// 年運「続きを読む」：イベント委譲（描画し直しても必ず効く）
if (topBoardsEl) {
  topBoardsEl.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button.readMoreBtn");
    if (!btn) return;
    const yid = btn.getAttribute("data-year-id") || "";
    if (!yid) return;
    YEAR_MORE_OPEN[yid] = !YEAR_MORE_OPEN[yid];
    const [yy, mm] = String(currentMonth||"").split("-");
    const yNum = Number(yy);
    const mNum = Number(mm);
    if (Number.isFinite(yNum) && Number.isFinite(mNum)) {
      renderTopBoards(yNum, mNum);
    } else {
      // fallback: try read from monthSelect
      const ms = document.getElementById("monthSelect");
      const v = ms?.value || "";
      const [y2, m2] = v.split("-");
      const yN2 = Number(y2);
      const mN2 = Number(m2);
      if (Number.isFinite(yN2) && Number.isFinite(mN2)) renderTopBoards(yN2, mN2);
    }
  });
}

// ===== 日ごとの点数ルール（由依さん定義） =====
const PALACE_BASE_SCORE = {
  "坎": 30,
  "坤": 55,
  "震": 90,
  "巽": 95,
  "中": 50,
  "乾": 85,
  "兌": 80,
  "艮": 45,
  "離": 75,
};

// ===== 方位 ⇄ 宮 変換（九星気学の標準方位）=====
const DIR_TO_PALACE = { N:"坎", NE:"艮", E:"震", SE:"巽", S:"離", SW:"坤", W:"兌", NW:"乾", C:"中" };
// ハイライト色
const DAY_BAD_BLUE    = "rgba(135, 206, 250, 0.35)";
const MONTH_BAD_GREEN = "rgba(180, 235, 180, 0.35)";
const YEAR_BAD_PURPLE = "rgba(170, 120, 255, 0.35)";

const PALACE_TO_DIR = { "坎":"N","艮":"NE","震":"E","巽":"SE","離":"S","坤":"SW","兌":"W","乾":"NW","中":"C" };

// 節入り日（毎月の節代わり日）
const SETSUIRI_DAY_BY_MONTH = {1:5,2:4,3:5,4:5,5:5,6:6,7:7,8:7,9:7,10:8,11:7,12:7};

function pad2(n){ return String(n).padStart(2,"0"); }
function parseISO(iso){
  const [y,m,d] = iso.split("-").map(Number);
  return new Date(y, m-1, d);
}
function formatISO(dateObj){
  return `${dateObj.getFullYear()}-${pad2(dateObj.getMonth()+1)}-${pad2(dateObj.getDate())}`;
}

function isTodayISO(iso){
  // iso: "YYYY-MM-DD"
  const now = new Date();
  const y = now.getFullYear();
  const m = pad2(now.getMonth() + 1);
  const d = pad2(now.getDate());
  return String(iso) === `${y}-${m}-${d}`;
}



function normalizeMonthId(v){
  // Accept "2026-2" / "2026-02" / with spaces
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{4})-(\d{1,2})$/);
  if (m) {
    const y = m[1];
    const mm = String(Number(m[2])).padStart(2,"0");
    return `${y}-${mm}`;
  }
  return s;
}


function formatRangeFromBlock(block, fallbackMonthId){
  const s = block?.range?.start || block?.start || block?.startDate || block?.start_day || block?.startDay;
  const e = block?.range?.end   || block?.end   || block?.endDate   || block?.end_day   || block?.endDay;
  if (s && e) {
    const [sy,sm,sd] = String(s).split("-");
    const [ey,em,ed] = String(e).split("-");
    if (sy === ey) return `${Number(sy)}年${Number(sm)}月${Number(sd)}日～${Number(em)}月${Number(ed)}日`;
    return `${Number(sy)}年${Number(sm)}月${Number(sd)}日～${Number(ey)}年${Number(em)}月${Number(ed)}日`;
  }
  return formatMonthRange(fallbackMonthId || currentMonth);
}

function formatMonthRange(monthId){
  // monthId: "2026-01" など
  const id = normalizeMonthId(monthId);
// 共通JSON（埋め込み）を最優先で参照
  const fromCommon = (Array.isArray(COMMON_MONTH_BLOCKS) ? COMMON_MONTH_BLOCKS : [])
    .find(b => String(b.id) === id);

  // 念のため：直近に読み込んだデータ側にも monthBlocks があれば参照（互換）
  const fromRuntime = (Array.isArray(window.__APP_DATA__?.monthBlocks) ? window.__APP_DATA__.monthBlocks : [])
    .find(b => String(b.id) === id);

  const mObj = fromCommon || fromRuntime || null;

  // range: {start:"YYYY-MM-DD", end:"YYYY-MM-DD"} を使う
  const s = mObj?.range?.start || mObj?.start || mObj?.startDate || mObj?.start_day || mObj?.startDay;
  const e = mObj?.range?.end   || mObj?.end   || mObj?.endDate   || mObj?.end_day   || mObj?.endDay;

  if (s && e) {
    const [sy,sm,sd] = String(s).split("-");
    const [ey,em,ed] = String(e).split("-");
    // 同年なら年は開始側のみ
    if (sy === ey) {
      return `${Number(sy)}年${Number(sm)}月${Number(sd)}日～${Number(em)}月${Number(ed)}日`;
    }
    return `${Number(sy)}年${Number(sm)}月${Number(sd)}日～${Number(ey)}年${Number(em)}月${Number(ed)}日`;
  }

  // フォールバック：月だけ
  const [y,m] = id.split("-");
  return `${Number(y)}年${Number(m)}月`;
}


function jpDate(iso){
  const [y,m,d] = iso.split("-");
  return `${Number(y)}年${Number(m)}月${Number(d)}日`;
}
function shortText(s, max=70){
  if(!s) return "";
  const one = String(s).replace(/\s+/g," ").trim();
  return one.length > max ? one.slice(0,max) + "…" : one;
}

// ===== 反対方位 =====
function oppositeDir(dir){
  const opp = { N:"S", NE:"SW", E:"W", SE:"NW", S:"N", SW:"NE", W:"E", NW:"SE", C:"C" };
  return opp[dir] ?? null;
}

// ===== board(方位→星) から、指定の星がいる方位キーを返す =====
function findDirOfStar(board, star){
  if(!board) return null;
  for(const dir of Object.keys(board)){
    if(board[dir] === star) return dir;
  }
  return null;
}

// ===== 盤(board: 方位→星) から、凶方位（五黄がいる方位/向かい＋本命星がいる方位/向かい）を返す =====
function getBadDirsFromBoard(board, honmei){
  if(!board) return [];
  const gohDir = findDirOfStar(board, 5);
  const honDir = findDirOfStar(board, Number(honmei));
  const dirs = [gohDir, oppositeDir(gohDir), honDir, oppositeDir(honDir)]
    .filter(Boolean)
    .filter(d => d !== "C");
  // 重複除去（順序は保持）
  return Array.from(new Set(dirs));
}

function formatDirsJP(dirKeys){
  if(!dirKeys || !dirKeys.length) return "—";
  return dirKeys.map(d => DIR_LABEL_JP[d] || d).join("・");
}


// 日盤(board: 方位→星) から、その日の「宮」を推定（本命星がいる宮）
function inferPalaceFromNichiban(board, honmei){
  const dir = findDirOfStar(board, honmei);
  return dir ? (DIR_TO_PALACE[dir] || null) : null;
}

// 日盤から「暗剣殺」を自動算出（本命星が5の反対にいる＝暗剣殺）
function inferDayWarningsFromNichiban(board, honmei){
  const warnings = [];
  const dir5 = findDirOfStar(board, 5);
  if(!dir5) return warnings;
  const ankenDir = oppositeDir(dir5);
  const honmeiDir = findDirOfStar(board, honmei);
  if(honmeiDir && honmeiDir === ankenDir) warnings.push("暗剣殺");
  return warnings;
}

/* ===== 日破（十二支ベース・節入り無関係）===== */
const BRANCHES = ["子","丑","寅","卯","辰","巳","午","未","申","酉","戌","亥"];
const BRANCH_TO_DIR = {
  "子":"N",
  "丑":"NE","寅":"NE",
  "卯":"E",
  "辰":"SE","巳":"SE",
  "午":"S",
  "未":"SW","申":"SW",
  "酉":"W",
  "戌":"NW","亥":"NW"
};
const PALACE_LUCK_LABEL = {
  "坎宮": "創始運",
  "坤宮": "準備運",
  "震宮": "開運",
  "巽宮": "福運",
  "乾宮": "強運",
  "兌宮": "喜楽運",
  "艮宮": "継承運",
  "離宮": "頂上運",
  "中宮": "中宮運",
};

// ===============================
// 年盤メッセージ：1文目を太字＋2〜3行＋続きを読む
// ===============================
function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}

function splitSentencesJa(msg){
  return String(msg || "")
    .replace(/\r?\n/g, " ")
    .split("。")
    .map(s => s.trim())
    .filter(Boolean);
}

// 1文目をテーマとして太字、残りは短く、全文はdetailsで表示
function formatYearMessageSimple(message, isExpanded, yearId = "") {
  // ① キーワードを抽出して本文から除去（重複表示防止）
  let keyword = "";
  let body = (message || "").toString();

  // （キーワード：〇〇）形式の場合は抽出して保持
  const kmParen = (message || "").toString().match(/（\s*キーワード[:：]\s*([^）]+)）/);
  if (kmParen) {
    keyword = (kmParen[1] || "").trim();
  }

  // （キーワード：〇〇）形式も除去
  body = body.replace(/（\s*キーワード[:：]\s*[^）]+）/g, "").trim();

  // キーワード「〇〇」 / キーワード"〇〇" / キーワード『〇〇』
  const km = body.match(/キーワード[「『"]([^」』"]+)[」』"]/);
  if (km) {
    keyword = (km[1] || "").trim();
    body = body.replace(km[0], "").trim();
  }

  // 末尾の余計な句点・空白を整える
  body = body.replace(/[\s　]+/g, " ").replace(/[。．\s　]*$/, "");

  // ② 文章を「。」単位で分割（句点は後で戻す）
  const sentences = body
    .split("。")
    .map(s => s.trim())
    .filter(Boolean);

  const theme = sentences[0] || "";
  const previewLines = sentences.slice(1, 3); // 2文ぶん（必要なら調整）
  const remainingLines = sentences.slice(3);

  const previewText = previewLines.length ? (previewLines.join("。") + "。") : "";
  const remainingText = remainingLines.length ? (remainingLines.join("。") + "。") : "";

  const hasMore = !!remainingText;

  const themeHtml = theme
    ? `<div class="yearTheme"><b>${escapeHtml(theme)}。</b></div>`
    : "";

  const previewHtml = previewText
    ? `<div class="yearPreview">${escapeHtml(previewText)}</div>`
    : "";

  const moreBtnHtml = hasMore
    ? `<button class="readMoreBtn" data-year-more="1" data-year-id="${escapeHtml(yearId)}" aria-expanded="${isExpanded ? "true" : "false"}">
         ${isExpanded ? "▼ 続きを閉じる" : "▶ 続きを読む"}
       </button>`
    : "";

  const moreHtml = (hasMore && isExpanded)
    ? `<div class="yearMore">${escapeHtml(remainingText)}</div>`
    : "";

  const keywordHtml = keyword
    ? `<div class="yearKeyword">（キーワード：${escapeHtml(keyword)}）</div>`
    : "";

  // ③ 表示：テーマ（太字）＋プレビュー（2〜3行想定）＋続きを読むで残りを展開
  return `
    ${themeHtml}
    ${previewHtml}
    ${moreBtnHtml}
    ${moreHtml}
    ${keywordHtml}
  `;
}


// ===== 月運メッセージ（宮ごと共通）=====
const MONTH_PALACE_MESSAGES = {
  "乾": { theme:"視野を広げ、格を上げる", good:["学び・発信・相談の質を上げる","尊敬できる人の型を真似る"], caution:"プライドで孤立しない", action:"背筋を伸ばす習慣を1つ（姿勢・言葉・服）" },
  "兌": { theme:"よろこびとご縁を育てる", good:["楽しい予定を先に入れる","話す・笑う・小さく喜ぶ"], caution:"軽口で信用を落とさない", action:"連絡を1本（感謝・お礼・近況）" },
  "艮": { theme:"土台固め、積み上げ", good:["仕組み化・貯める・整える","『続ける』に勝ちがある"], caution:"頑固・停滞に注意（変える所は変える）", action:"家の“溜まり場”を1か所リセット" },
  "離": { theme:"魅せる、照らす", good:["見える化（資料・SNS・実績）","自分の強みを言語化"], caution:"感情で燃え尽き・対立しない", action:"発信を1つ（写真＋一言でもOK）" },
  "坎": { theme:"静かに整え、深める", good:["体調・睡眠・内面ケア","急がず『準備の質』を上げる"], caution:"不安で止まらない（小さく前進）", action:"水回りを磨く／早寝を1日" },
  "坤": { theme:"受け取り、支える", good:["周りのために動く","育成・家庭・チームが伸びる"], caution:"抱え込み・我慢しすぎ注意", action:"『頼る』を1回（お願い・相談）" },
  "震": { theme:"スタート、動く", good:["即行動・即返信","始めたことが勢いになる"], caution:"焦り・勢い任せで衝突しない", action:"朝の5分ルーティンを作る" },
  "巽": { theme:"風に乗る、広げる", good:["紹介・ご縁・営業","人を介して流れが来る"], caution:"優柔不断・情報過多に注意", action:"名刺／プロフィール／導線を整える" },
  "中": { theme:"軸を整え、決める", good:["優先順位を決める","中心から整えると全体が回る"], caution:"決めないことで疲れない", action:"今月やらないことを3つ決める" }
};

function getMonthPalaceMessage(palace){
  const p = normPalace(palace);
  if(!p) return null;
  const fromData = data?.monthPalaceMessage?.[p];
  return fromData || (MONTH_PALACE_MESSAGES[p] || null);
}

const DIR_LABEL_JP = {N:"北",NE:"北東",E:"東",SE:"東南",S:"南",SW:"南西",W:"西",NW:"北西",C:"中央"};


// ===== 祐気どり：方位（宮）の運＋回座星の運（要点）=====
// ※「祐気どり」の方位チップをタップしたときだけ表示します。
const PALACE_FORTUNE_ONE = {
  "坎": "人脈・恋愛運が育つ",
  "坤": "仕事・家庭の土台が整う",
  "震": "発展・スタートの勢いが出る",
  "巽": "良縁・結婚運が動く",
  "乾": "財運・試験運が伸びる",
  "兌": "金運・恋愛運が育つ",
  "艮": "変化・相続運が動く",
  "離": "名誉・評価が高まる",
  "中": "中心が整い安定する"
};

const STAR_FORTUNE_ONE = {
  1: "人脈運が上がる",
  2: "仕事運が上がる",
  3: "発展運が上がる",
  4: "良縁運が上がる",
  5: "五黄は凶。祐気どり不可",
  6: "有益な人とのご縁が増える",
  7: "金運が上がる",
  8: "相続・変化運が動く",
  9: "名誉・評価が高まる"
};
// 祐気どり：運の箇条書き（ユーザー向けに「宮/回座」などの言葉は出さず、内容だけ表示）
const PALACE_FORTUNE_LIST = {
  "坎": ["人脈が広がる", "恋愛運が育つ", "心の疲れが癒える"],
  "坤": ["仕事運が安定する", "家庭運が整う", "コツコツ力がつく"],
  "震": ["発展の勢いが出る", "モヤモヤが晴れる", "積極的になれる"],
  "巽": ["良縁がつながる", "交渉が進みやすい", "風通しが良くなる"],
  "乾": ["財運が伸びる", "試験・勝負運が上がる", "責任感が整う"],
  "兌": ["金運が育つ", "商売運が上がる", "楽しみが増える"],
  "艮": ["変化の流れに乗れる", "区切りがつく", "学び・相続運が動く"],
  "離": ["評価が高まる", "直感が冴える", "魅力が輝く"],
  "中": ["中心が整い安定する", "気持ちが落ち着く", "流れが整う"]
};

const STAR_FORTUNE_LIST = {
  1: ["人脈運アップ", "恋愛運アップ", "心の回復"],
  2: ["仕事運アップ", "家庭運アップ", "土台が強くなる"],
  3: ["発展運アップ", "行動力アップ", "停滞が動く"],
  4: ["良縁運アップ", "交渉運アップ", "信用が育つ"],
  5: ["（五黄は祐気どり対象外）"],
  6: ["有益な人とのご縁", "財運アップ", "試験・勝負運アップ"],
  7: ["金運アップ", "恋愛運アップ", "楽しみが増える"],
  8: ["相続・変化運が動く", "積み上げが形になる", "貯蓄運アップ"],
  9: ["名誉・評価運アップ", "人気運アップ", "直感が冴える"]
};

// 定位盤（宮）に元々いる星：同じ星が回座している場合は運がダブるので回座側を出さない
const NATAL_STAR_BY_PALACE = { "坎":1, "坤":2, "震":3, "巽":4, "中":5, "乾":6, "兌":7, "艮":8, "離":9 };


// 方位ラベル（日本語）→方位キー（N/NE/...）
const JP_TO_DIR = Object.fromEntries(Object.entries(DIR_LABEL_JP).map(([k,v]) => [v,k]));
// 別表記ゆれ対応
JP_TO_DIR["東北"] = "NE";
JP_TO_DIR["東南"] = "SE";
JP_TO_DIR["西北"] = "NW";
JP_TO_DIR["西南"] = "SW";

// 16方位（表記ゆれ/細分方位）→8方位へ丸め
JP_TO_DIR["東北東"] = "NE";
JP_TO_DIR["西北西"] = "NW";
JP_TO_DIR["南南東"] = "SE";
JP_TO_DIR["東南東"] = "SE";
JP_TO_DIR["西南西"] = "SW";

// 方位タップ時に参照する「その日の日盤board（方位→星）」を保持
let CURRENT_DIR_CONTEXT = { board:null, dateStr:null, honmei:null };

// ===== 方位タップ：ワンポイント（吉/凶） =====
const DIR_TIPS = {
  N:  { good: "休息と内省に向く。無理をしない。", bad: "不安を広げない。考えすぎ注意。" },
  NE: { good: "準備・整理・区切りに最適。", bad: "曖昧なまま進めない。" },
  E:  { good: "スタート・発信が吉。朝の行動◎", bad: "勢い任せで決めない。" },
  SE: { good: "ご縁・交渉が進みやすい。", bad: "言質を取られやすい。慎重に。" },
  S:  { good: "表現・注目を活かす。", bad: "感情的にならない。" },
  SW: { good: "人間関係・支え合い◎", bad: "抱え込みすぎない。" },
  W:  { good: "楽しみ・収穫を味わう。", bad: "衝動買い・軽口注意。" },
  NW: { good: "決断・責任を果たす。", bad: "独断にならない。" }
};


// ===== 凶方位（ルール別）注意ポイント =====
// ※方位ごとの注意ではなく「五黄殺/暗剣殺/本命殺/本命的殺/破」それぞれの“気を付けるポイント”
const BAD_RULE_POINTS = {
  "五黄殺": [
    "大きな決断・契約・勝負事は控えめに",
    "家や身の回りを整える（掃除・換気・整頓）",
    "焦らず、いつもより慎重に進める"
  ],
  "暗剣殺": [
    "突発対応に備えて時間と心の余裕を確保",
    "飛び込み行動・強行突破は避ける",
    "安全確認と段取り（連絡・保険）を丁寧に"
  ],
  "本命殺": [
    "自分のやり方に固執せず、計画を見直す",
    "確認回数を増やす（ミス・勘違い予防）",
    "背伸びせず、等身大で進める"
  ],
  "本命的殺": [
    "体調・メンタル最優先（睡眠・休息）",
    "無理な予定を詰め込まず、余白をつくる",
    "方向転換や手放しも“整える行動”としてOK"
  ],
  "歳破": [
    "対人・仕事のすれ違いが起きやすいので報連相を丁寧に",
    "約束・期日・金額など“確認”を徹底",
    "言葉を柔らかく、感情的な判断は避ける"
  ],
  "月破": [
    "対人・仕事のすれ違いが起きやすいので報連相を丁寧に",
    "約束・期日・金額など“確認”を徹底",
    "言葉を柔らかく、感情的な判断は避ける"
  ],
  "日破": [
    "対人・仕事のすれ違いが起きやすいので報連相を丁寧に",
    "約束・期日・金額など“確認”を徹底",
    "言葉を柔らかく、感情的な判断は避ける"
  ],
};

function buildBadTypeMap(board, honmei, haDir, haLabel){
  const map = Object.create(null);

  const add = (dir, type) => {
    if(!dir || dir==="C") return;
    if(!map[dir]) map[dir] = [];
    if(!map[dir].includes(type)) map[dir].push(type);
  };

  const gohDir = findDirOfStar(board, 5);
  add(gohDir, "五黄殺");
  add(oppositeDir(gohDir), "暗剣殺");

  const honDir = findDirOfStar(board, Number(honmei));
  add(honDir, "本命殺");
  add(oppositeDir(honDir), "本命的殺");

  if(haDir && haLabel){
    add(haDir, haLabel); // 歳破 / 月破 / 日破
  }
  return map; // { dirKey: ["五黄殺","歳破"] ... }
}

function orderedBadDirsFromTypeMap(typeMap){
  const baseOrder = ["N","NE","E","SE","S","SW","W","NW"];
  return baseOrder.filter(d => typeMap && typeMap[d] && typeMap[d].length);
}

function renderBadDirChips(typeMap, scope){
  const dirs = orderedBadDirsFromTypeMap(typeMap);
  if(!dirs.length) return "—";
  const sc = scope || "general";
  return dirs.map(d => {
    const typeArr = (typeMap[d] || []).filter(Boolean);
    const typesCsv = typeArr.join(",");
    const base = DIR_LABEL_JP[d] || d; // 画面表示は方位名のみ（カード上の表記は従来通り）
    return `<span class="dirChip bad" data-dir="${escapeHtml(d)}" data-kind="bad" data-scope="${escapeHtml(sc)}" data-badtypes="${escapeHtml(typesCsv)}">${escapeHtml(base)}</span>`;
  }).join("・");
}

function badDialogHtmlFromTypes(typeList){
  const types = (typeList || []).filter(Boolean);
  if(!types.length) return "—";
  const lines = [];
  for(const t of types){
    const pts = BAD_RULE_POINTS[t] || [];
    if(!pts.length) continue;
    // 見出しは出さず、ポイントだけ（2〜3個）
    for(const p of pts.slice(0,3)){
      lines.push(`・${escapeHtml(p)}`);
    }
  }
  // 重複排除
  const seen = new Set();
  const dedup = [];
  for(const l of lines){
    if(seen.has(l)) continue;
    seen.add(l);
    dedup.push(l);
  }
  return dedup.length ? `<div class="bulletList">${dedup.join("<br>")}</div>` : "—";
}

function renderDirChips(dirKeys, kind){
  if(!Array.isArray(dirKeys) || dirKeys.length===0) return "—";
  return dirKeys
    .filter(Boolean)
    .map(d => `<span class="dirChip ${kind}" data-dir="${d}" data-kind="${kind}">${DIR_LABEL_JP[d] ?? d}</span>`)
    .join("・");
}

function openDirTip(dirKey, kind, scope="general", badtypes=""){
  const jp = DIR_LABEL_JP[dirKey] ?? dirKey;
  const isGood = kind === "good";

  // 祐気どりの日だけ：運の内容だけ（見出しなし・①②なし）
  if(scope === "yuki" && isGood){
    const palace = DIR_TO_PALACE?.[dirKey] || null; // "兌" など
    const seatedStar = CURRENT_DIR_CONTEXT?.board ? Number(CURRENT_DIR_CONTEXT.board[dirKey]) : null; // 1-9

    // 宮の運（2〜3個）
    const pList = (palace && PALACE_FORTUNE_LIST?.[palace]) ? PALACE_FORTUNE_LIST[palace].slice(0,3) : [];

    // 回座星の運（2〜3個）※定位盤と同じ星ならダブるので出さない
    const natal = palace ? (NATAL_STAR_BY_PALACE?.[palace] ?? null) : null;
    const showStar = seatedStar && seatedStar !== 5 && seatedStar !== natal;
    const sList = (showStar && STAR_FORTUNE_LIST?.[seatedStar]) ? STAR_FORTUNE_LIST[seatedStar].slice(0,3) : [];

    // 重複排除（同じ文言があれば1回だけ）
    const seen = new Set();
    const merged = [];
    for(const x of [...pList, ...sList]){
      const t = String(x||"").trim();
      if(!t) continue;
      if(seen.has(t)) continue;
      seen.add(t);
      merged.push(t);
    }

    const body = merged.length
      ? `<div class="bulletList">` + merged.map(t => `・${escapeHtml(t)}`).join("<br>") + `</div>`
      : "—";

    openDialog(`祐気どり：${jp}`, body);
    return;
  }

  // 通常（年運・月運・日詳細）
  // 吉方位：活かし方（方位ワンポイント）
  if(isGood){
    const title = `${jp}（吉方位）ワンポイント`;
    const tip = (DIR_TIPS?.[dirKey]?.good) || "—";
    openDialog(title, tip);
    return;
  }

  // 凶方位：ルール別の注意ポイント（五黄殺/暗剣殺/本命殺/本命的殺/破）
  const types = String(badtypes||"").split(",").map(s => s.trim()).filter(Boolean);
  const body = badDialogHtmlFromTypes(types);
  const tLabel = types.length ? types.join("・") : "凶方位";
  openDialog(`${jp}（${tLabel}）注意ポイント`, body);
}


// イベント委任：方位チップをタップしたらワンポイント表示
document.addEventListener("click", (ev) => {
  const chip = ev.target?.closest?.(".dirChip");
  if(!chip) return;
  const dirKey = chip.getAttribute("data-dir");
  const kind = chip.getAttribute("data-kind") || "good";
  if(!dirKey) return;
  const scope = chip.getAttribute("data-scope") || "general";
  const badtypes = chip.getAttribute("data-badtypes") || "";
  openDirTip(dirKey, kind, scope, badtypes);
});


const HONMEI_JP = {1:"一白水星",2:"二黒土星",3:"三碧木星",4:"四緑木星",5:"五黄土星",6:"六白金星",7:"七赤金星",8:"八白土星",9:"九紫火星"};
const STAR_NAME_JP = {1:'一白水星',2:'二黒土星',3:'三碧木星',4:'四緑木星',5:'五黄土星',6:'六白金星',7:'七赤金星',8:'八白土星',9:'九紫火星'};
function starNameJP(n){ return STAR_NAME_JP[Number(n)] || String(n); }
// ===== 本命星ごとの吉数字（日盤：夢叶手帳ルール）=====
// ※「中宮(中央)に入った数字は除外」→ 吉方位の抽出では C をそもそも見ない
const GOOD_NUMS_BY_HONMEI = {
  1: [3,4,6,7],
  2: [6,7,8,9],
  3: [1,4,9],
  4: [1,3,9],
  5: [2,6,7,8,9],
  6: [1,2,7,8],
  7: [1,2,6,8],
  8: [2,6,7,9],
  9: [2,3,4,8],
};

// ===== 年盤 吉方位（固定データ表示）=====
// 2026年：一白水星のみ（立春前／立春後）
// ※年盤は「計算」ではなく、確定データをそのまま表示（立春で切り替え）
const YEAR_LUCKY_DIRECTIONS = {
  "2026": {
    1: { // 一白水星
      preRisshun: ["西","北","南"],            // ～2026-02-03
      postRisshun: ["南西","西","北東"]        // 2026-02-04～
    },
    2: { // 二黒土星
      preRisshun: ["南","北","東"],            // ～2026-02-03
      postRisshun: ["南西","東"]               // 2026-02-04～
    }
  }
};


// ===============================
// 年運（文章・運勢名・点数）上書き（2026年立春前/後）
//  - データ(honmei_*.json)の年運を優先するが、ここに定義があれば上書きする
// ===============================
const YEAR_FORTUNE_OVERRIDES_2026 = {
  2: { // 二黒土星
    preRisshun: {
      fortuneName: "静観運",
      score: 50,
      message: `中心的な存在になる時です。
実行に移さず静観し、次の年の準備期間です。善事善行を行ってきた人には吉事が、誤った方針を続けてきた人には凶事が極端に現れます。「大変化の年」とも言われ、結婚、転業、独立、移転、増改築、新築などの問題も出てきます。自分の力に応じた行動は、良い結果を招きます。しかし、あちらこちらに手を出すと、八方ふさがりになります。
（キーワード：内面・内部充実）`
    },
    postRisshun: {
      fortuneName: "強運",
      score: 85,
      message: `2026年の運勢は、人々の労をねぎらい施す時で、自分の力が増大し、利益も増大する傾向のある年です。
目標を再検討し、大きな目標を掲げ、目標に向かって努力すれば、より一層の恵みを得ることができます。
何事にも行動に移せる年となりますが、柔軟性を忘れずに。何かとチャンスの多い年です。
忙しい年になりやすいので、体調管理に心がけることが大切です。
（キーワード：与える心）`
    }
  }
};

// ===============================
// 祐気どり（外部JSONからロード）

function getYearLuckyDirs(yearBoardObj, honmeiNum, yearMarks){
  // 年盤の吉方位は、月盤・日盤と同様に「盤上の数（本命星別の吉数）」から選び、
  // 除外：本命星の反対方位／暗剣殺／五黄殺／歳破
  return getGoodDirsFromNenban(yearBoardObj, Number(honmeiNum), yearMarks || {});
}


// 日破の「方位キー(N/NE/...)」を返す（※吉方位除外用：本命星に関係なく常に除外）
function getNichihaDirByDate(dateObj){
  const br = getBranchByDate(dateObj);
  const brDir = BRANCH_TO_DIR[br];
  return brDir ? oppositeDir(brDir) : null;
}

// 日盤(board: {N,NE,E,SE,S,SW,W,NW,C}) から吉方位を抽出
// 除外：①中宮はそもそも対象外 ②本命星の向かい側 ③暗剣殺(=5の向かい) ④日破
function getGoodDirsFromNichiban(board, honmei, haDir){
  if(!board) return [];
  const goodNums = new Set(GOOD_NUMS_BY_HONMEI[honmei] || []);
  const DIRS_8 = ["N","NE","E","SE","S","SW","W","NW"]; // 中央は除外

  const honmeiDir = findDirOfStar(board, honmei);
  const excludeOpp = (honmeiDir && honmeiDir !== "C") ? oppositeDir(honmeiDir) : null;

  const dir5 = findDirOfStar(board, 5);
  const ankenDir = (dir5 && dir5 !== "C") ? oppositeDir(dir5) : null;

  const out = [];
  for(const dir of DIRS_8){
    const num = board[dir];
    if(!goodNums.has(num)) continue;
    if(excludeOpp && dir === excludeOpp) continue;
    if(ankenDir && dir === ankenDir) continue;
    if(haDir && dir === haDir) continue;
    out.push(dir);
  }
  return out;
}

// 月盤(board: {N,NE,E,SE,S,SW,W,NW,C}) から吉方位を抽出（ルールは日盤と同じ）
// 除外：①中宮は対象外 ②本命星の向かい側 ③暗剣殺 ④五黄殺 ⑤月破
function getGoodDirsFromGetsuban(board, honmei, monthMarks){
  if(!board) return [];
  const goodNums = new Set(GOOD_NUMS_BY_HONMEI[honmei] || []);
  const DIRS_8 = ["N","NE","E","SE","S","SW","W","NW"]; // 中央は除外

  const honmeiDir = findDirOfStar(board, honmei);
  const excludeOpp = (honmeiDir && honmeiDir !== "C") ? oppositeDir(honmeiDir) : null;

  const gohPal = monthMarks?.gohPalace || monthMarks?.gohosatsuPalace || null;
  const ankenPal = monthMarks?.ankensatsuPalace || null;
  const haPal = monthMarks?.haPalace || null;

  const gohDir = gohPal ? (PALACE_TO_DIR[gohPal] || null) : null;
  const haDir  = haPal  ? (PALACE_TO_DIR[haPal]  || null) : null;

  // 五黄が中宮の月は暗剣殺なし
  const ankenDir = (gohDir === "C") ? null : (ankenPal ? (PALACE_TO_DIR[ankenPal] || null) : null);

  const out = [];
  for (const dir of DIRS_8){
    const n = Number(board[dir]);
    if (!goodNums.has(n)) continue;
    if (excludeOpp && dir === excludeOpp) continue;
    if (ankenDir && dir === ankenDir) continue;
    if (gohDir && dir === gohDir) continue;
    if (haDir  && dir === haDir) continue;
    out.push(dir);
  }
  return out;
}

function getGoodDirsFromNenban(board, honmei, yearMarks){
  if(!board) return [];
  const goodNums = new Set(GOOD_NUMS_BY_HONMEI[honmei] || []);
  const DIRS_8 = ["N","NE","E","SE","S","SW","W","NW"]; // 中央は除外

  const honmeiDir = findDirOfStar(board, honmei);
  const excludeOpp = (honmeiDir && honmeiDir !== "C") ? oppositeDir(honmeiDir) : null;

  // 五黄殺・暗剣殺（年盤）は 5 の位置とその反対で決める
  const gohDir = findDirOfStar(board, 5);
  const ankenDir = (gohDir && gohDir !== "C") ? oppositeDir(gohDir) : null;

  // 歳破（または破の宮）を除外
  const saihaPal = yearMarks?.saihaPalace || yearMarks?.haPalace || yearMarks?.saiha || null;
  const saihaDir = saihaPal ? (PALACE_TO_DIR[saihaPal] || null) : null;

  const out = [];
  for(const dir of DIRS_8){
    const num = Number(board[dir]);
    if(!goodNums.has(num)) continue;
    if(excludeOpp && dir === excludeOpp) continue;
    if(ankenDir && dir === ankenDir) continue;
    if(gohDir && dir === gohDir) continue;
    if(saihaDir && dir === saihaDir) continue;
    out.push(dir);
  }
  return out;
}




// 夢叶手帳：月運点数（本命星ごとに 1〜12月）

// ===== 埋め込みデータ（index.html 内の <script id="honmeiData" type="application/json"> を共通データとして利用） =====
const EMBEDDED_DATA = (() => {
  try{
    const el = document.getElementById("honmeiData");
    if(!el) return null;
    const txt = (el.textContent || "").trim();
    if(!txt) return null;
    return JSON.parse(txt);
  }catch(e){
    console.warn("EMBEDDED_DATA parse failed:", e);
    return null;
  }
})();
const COMMON_MONTH_BLOCKS = Array.isArray(EMBEDDED_DATA?.monthBlocks) ? EMBEDDED_DATA.monthBlocks : [];
const COMMON_YEAR_BLOCKS  = Array.isArray(EMBEDDED_DATA?.yearBlocks)  ? EMBEDDED_DATA.yearBlocks  : [];

const MONTH_UNEI_SCORES = {
  1: [55,70,45,45,5,55,70,85,45,70,70,40], // 一白水星
  2: [80,20,45,5,40,65,85,45,70,70,20,35], // 二黒土星
  3: [15,60,5,55,95,75,30,70,75,45,50,5], // 三碧木星
  4: [55,5,70,75,85,45,55,30,50,35,5,55], // 四緑木星
  5: [25,55,85,90,50,85,75,30,20,5,60,65], // 五黄土星
  6: [5,80,85,60,55,60,25,55,3,40,85,100], // 六白金星
  7: [60,50,55,35,80,40,45,5,60,75,50,45], // 七赤金星
  8: [70,45,55,65,45,45,5,35,55,70,55,55], // 八白土星
  9: [50,70,35,20,45,5,55,75,85,30,55,55], // 九紫火星
};

// 月盤バッジ用データ（年-月キー）
// ここに「暗剣殺・五黄殺・月破（haType）・天道・吉神」の“有無”を月ごとに登録します。
// 例）"2026-02": { ankensatsu: true, gohosatsu: false, haType: "月破", tendo: ["兌"], goodGods: ["坎","乾"] }
const MONTH_BADGE_DATA_2026 = {
  // "2026-01": { ankensatsu: false, gohosatsu: false, haType: "", tendo: [], goodGods: [] },
};


// ===== 月盤：天道・吉神・暗剣殺・五黄殺・破などの表示用 =====
// 以前表示できていた情報を「月盤カード内」に復活させるためのHTMLブロック。
// ===== 月盤：天道・吉神・暗剣殺・五黄殺・月破など（※宮名は出さない）=====
// 仕様：
// - 天道/吉神は「どの宮か」ではなく「その宮に入っている星」と「方位（西など）」を表示
// - 天道と吉神は同じ横列、改行して暗剣殺/五黄殺/月破
// - 五黄が中宮の月（五黄殺が中）では暗剣殺は表示しない
function monthBadgeBlockHtml(mBlock, mGrid){
  const marks = mBlock?.board?.marks ?? {};

  // 配列/文字列どちらでも受け取れるように正規化
  const toArr = (v) => {
    if (Array.isArray(v)) return v;
    if (v == null) return [];
    const s = String(v).trim();
    if (!s) return [];
    // 「兌」「坎,乾」「坎・乾」「坎 乾」などを吸収
    return s.split(/[\s,、・/]+/).filter(Boolean);
  };

  // 月データの持ち方が月ごとに揺れても拾えるように、参照先を複数用意（安全版）
  const getByPath = (obj, path) => {
    try{
      return path.split(".").reduce((o,k)=> (o==null? undefined : o[k]), obj);
    }catch(_){ return undefined; }
  };
  const firstDefined = (...vals) => {
    for(const v of vals){
      if(v!==undefined && v!==null) return v;
    }
    return undefined;
  };

  const tendoSrcRaw = firstDefined(
    mBlock?.tendo,
    mBlock?.tendou,
    mBlock?.tenDou,
    getByPath(mBlock,"board.tendo"),
    getByPath(mBlock,"board.tendou"),
    getByPath(mBlock,"board.marks.tendo"),
    getByPath(mBlock,"board.marks.tendou"),
    getByPath(mBlock,"marks.tendo"),
    getByPath(mBlock,"marks.tendou"),
    mBlock?.["天道"],
    getByPath(mBlock,"board.天道"),
    getByPath(mBlock,"board.marks.天道")
  );

  const goodSrcRaw = firstDefined(
    mBlock?.goodGods,
    mBlock?.goodGod,
    mBlock?.kichi,
    mBlock?.kichijin,
    mBlock?.kishin,
    getByPath(mBlock,"board.goodGods"),
    getByPath(mBlock,"board.goodGod"),
    getByPath(mBlock,"board.marks.goodGods"),
    getByPath(mBlock,"board.marks.goodGod"),
    getByPath(mBlock,"marks.goodGods"),
    getByPath(mBlock,"marks.goodGod"),
    mBlock?.["吉神"],
    getByPath(mBlock,"board.吉神"),
    getByPath(mBlock,"board.marks.吉神")
  );


// ---- 共通データ（不足時のフォールバック） ----
const common = (mBlock && mBlock.id && MONTH_BADGE_DATA_2026[mBlock.id]) ? MONTH_BADGE_DATA_2026[mBlock.id] : null;

function renderExplicitLine(label, star, dir){
  if(!star || !dir) return "";
  const starName = STAR_NAMES?.[String(star)] || String(star);
  const dirJp = DIR_LABEL_JP?.[dir] || dir;
  return `${label}-${starName}（${dirJp}）`;
}

// tendo/goodGods は「宮→星」ではなく「星＋方位」が指定されるケースがあるため、
// 共通データがあればそちらを優先して表示する
const explicitTendoLine = common?.tendo ? renderExplicitLine("天道", common.tendo.star, common.tendo.dir) : "";
const explicitGoodLines = Array.isArray(common?.goodGods) ? common.goodGods.map(g => renderExplicitLine("吉神", g.star, g.dir)).filter(Boolean) : [];
const explicitMonthHaLine = common?.monthHa ? renderExplicitLine("月破", common.monthHa.star, common.monthHa.dir) : "";


  // 入力が「兌」「坎宮」などの“宮名”の場合もあれば、「西」「北東」など“方位”で来る場合もある。
  // どちらでも「宮（兌など）」に正規化して扱う。
  const DIR_JP_TO_DIRKEY = {
    "北":"N","南":"S","東":"E","西":"W",
    "北東":"NE","北西":"NW","南東":"SE","南西":"SW",
    "中央":"C","中":"C"
  };
  const dirKeyToPalace = (dirKey) => {
    // DIR_TO_PALACE がある環境ならそれを優先
    if (typeof DIR_TO_PALACE === "object" && DIR_TO_PALACE && DIR_TO_PALACE[dirKey]) return DIR_TO_PALACE[dirKey];
    // フォールバック（万一のため）
    const fallback = { N:"坎", S:"離", E:"震", W:"兌", NE:"艮", NW:"乾", SE:"巽", SW:"坤", C:"中" };
    return fallback[dirKey] || null;
  };
  const tokenToPalace = (t) => {
    if (t == null) return null;
    const s = String(t).trim();
    if (!s) return null;
    // 方位表記 → 宮へ
    if (DIR_JP_TO_DIRKEY[s]) return normPalace(dirKeyToPalace(DIR_JP_TO_DIRKEY[s]));
    // 宮表記 → 宮へ
    return normPalace(s);
  };

  const tendoPalaces = toArr(tendoSrcRaw).map(tokenToPalace).filter(Boolean);
  const goodPalaces  = toArr(goodSrcRaw).map(tokenToPalace).filter(Boolean);

  const PALACE_TO_IDX_MONTH = Object.fromEntries(IDX_TO_PALACE_SOUTH_TOP.map((p,i)=>[p,i]));
  const PALACE_TO_DIR_MONTH = { "離":"S","坎":"N","震":"E","兌":"W","巽":"SE","坤":"SW","艮":"NE","乾":"NW","中":"C" };

  const starAtPalace = (pal) => {
    const idx = PALACE_TO_IDX_MONTH[pal];
    return (idx != null && Array.isArray(mGrid)) ? Number(mGrid[idx]) : null;
  };
  const dirLabelOfPalace = (pal) => {
    const d = PALACE_TO_DIR_MONTH[pal] || "";
    return DIR_LABEL_JP?.[d] || "";
  };
  const starDirText = (pal) => {
    const s = starAtPalace(pal);
    const dir = dirLabelOfPalace(pal);
    if (!s) return "";
    return `${starNameJP(s)}（${dir || "—"}）`;
  };

  // 1行目：天道＋吉神（同じ列）
  let tendoTxt = tendoPalaces.length
    ? `天道-${tendoPalaces.map(starDirText).filter(Boolean).join("・")}`
    : "";
  let goodTxt = goodPalaces.length
    ? `吉神-${goodPalaces.map(starDirText).filter(Boolean).join("・")}`
    : "";

  // 共通データがある場合はそれを優先（星＋方位）
  if (explicitTendoLine) tendoTxt = explicitTendoLine;
  if (explicitGoodLines.length) goodTxt = `吉神-${explicitGoodLines.map(s=>s.replace(/^吉神-/, "")).join("・")}`;

  // 2行目：暗剣殺・五黄殺・月破（同じ列）
  const gohPal   = normPalace(marks.gohPalace);
  const ankenPal = normPalace(marks.ankensatsuPalace);
  const haPal    = normPalace(marks.haPalace);
  const haTypeRaw = String(marks.haType || "");
  // 月盤では「歳破」と入っていてもユーザー表示は「月破」に統一（"破"なら月破として表示）
  const haType = haTypeRaw.includes("破") ? "月破" : "";

  // 五黄殺：星名は出さず方位だけ（必ず五黄になるため）
  const gohLine = gohPal ? `五黄殺（${dirLabelOfPalace(gohPal) || "—"}）` : "";

  // 五黄が中宮の月は暗剣殺なし
  const ankenLine = (gohPal === "中") ? "" : (ankenPal ? `暗剣殺-${starDirText(ankenPal)}` : "");

  // 月破はデータの方位をそのまま採用（反対補正しない）
  let haLine = (haType && haPal) ? `${haType}-${starDirText(haPal)}` : "";

  // 共通データ（月破）がある場合は優先
  const explicitMonthHaTxt = "";
  if (explicitMonthHaTxt) haLine = explicitMonthHaTxt;

  const hasTop = (tendoTxt || goodTxt);
  const hasBottom = (ankenLine || gohLine || haLine);
  if (!hasTop && !hasBottom) return "";

  return `
    <div class="badge-block">
      ${hasTop ? `<div class="badge-row badge-row-top">
        ${tendoTxt ? `<span class="badge-item">${tendoTxt}</span>` : ``}
        ${goodTxt ? `<span class="badge-item">${goodTxt}</span>` : ``}
      </div>` : ``}

      ${hasBottom ? `<div class="badge-row badge-row-bottom">
        ${ankenLine ? `<span class="badge-item">${ankenLine}</span>` : ``}
        ${gohLine ? `<span class="badge-item">${gohLine}</span>` : ``}
        ${haLine ? `<span class="badge-item">${haLine}</span>` : ``}
      </div>` : ``}
    </div>
  `;
}


function getMonthUneiScore(honmei, month1to12){
  const arr = MONTH_UNEI_SCORES[Number(honmei)];
  if (!arr) return null;
  const m = Number(month1to12);
  if (!m || m<1 || m>12) return null;
  return arr[m-1] ?? null;
}

function getLuckLabelFromGrid(grid, honmei){
  if (!grid) return "";
  const b = gridToBoardObj(grid);
  const dir = findDirOfStar(b, Number(honmei));
  if (!dir) return "";
  const palace = DIR_TO_PALACE[dir] || "";
  return PALACE_LUCK_LABEL[palace] || PALACE_LUCK_LABEL[`${palace}宮`] || "";
}

// 基準：2026-01-01 は「亥」
const BASE_BRANCH_DATE = new Date(2026,0,1);
const BASE_BRANCH = "亥";

function daysBetweenUTC(a,b){
  const au = Date.UTC(a.getFullYear(),a.getMonth(),a.getDate());
  const bu = Date.UTC(b.getFullYear(),b.getMonth(),b.getDate());
  return Math.floor((bu-au)/(24*60*60*1000));
}
function getBranchByDate(dateObj){
  const baseIndex = BRANCHES.indexOf(BASE_BRANCH);
  const diff = daysBetweenUTC(BASE_BRANCH_DATE, dateObj);
  const idx = (baseIndex + diff) % 12;
  return BRANCHES[(idx+12)%12];
}
function getNichihaPalaceByDate(dateObj){
  const br = getBranchByDate(dateObj);
  const brDir = BRANCH_TO_DIR[br];
  const haDir = brDir ? oppositeDir(brDir) : null;
  return haDir ? (DIR_TO_PALACE[haDir] || null) : null;
}

/* ===== 盤の自動生成（中心星→grid）===== */
// grid 配列の並び：[NW, N, NE, W, C, E, SW, S, SE]
function createGridByCenter(center){
  // 飛泊：中→NW→W→NE→S→N→SW→E→SE に 1ずつ進めて配置
  // 返却順は [NW,N,NE,W,C,E,SW,S,SE]
  const ORDER_LOCAL = ["C","NW","W","NE","S","N","SW","E","SE"];
  const mod9local = (n)=>(((n - 1) % 9 + 9) % 9 + 1);

  const b = { C: center };
  for (let i=1; i<ORDER_LOCAL.length; i++){
    b[ORDER_LOCAL[i]] = mod9local(b[ORDER_LOCAL[i-1]] + 1);
  }
  return [b.SE, b.S, b.SW, b.E, b.C, b.W, b.NE, b.N, b.NW];
}


// grid がデータ由来で -1 巡り等になっていても、表示・判定を「+1 巡り」に統一する
function normalizePlusOneGrid(grid){
  if (!Array.isArray(grid) || grid.length !== 9) return grid;
  const center = grid[4];
  const nw = grid[0];
  const mod9 = (n)=>(((n - 1) % 9 + 9) % 9 + 1);
  // createGridByCenter は「中宮→NW が +1」になるように作っている
  const expectNW = mod9(center + 1);
  if (nw === expectNW) return grid;
  return createGridByCenter(center);
}
// grid は「表示順」：左上→上→右上→左→中→右→左下→下→右下
// = SE, S, SW, E, C, W, NE, N, NW
function gridToBoardObj(grid){
  return {
    SE: grid[0], S:  grid[1], SW: grid[2],
    E:  grid[3], C:  grid[4], W:  grid[5],
    NE: grid[6], N:  grid[7], NW: grid[8],
  };
}


// grid が無い（null/undefined）場合でも落ちないためのラッパー
function safeGridToBoardObj(grid){
  return Array.isArray(grid) ? gridToBoardObj(grid) : null;
}

/**
 * boardSvg（=日盤と同じ見た目配置）に合わせて、
 * “通常の方位盤(NW,N,NE,W,C,E,SW,S,SE)” を
 * boardSvg が期待するキー配置へ変換する。
 * ※日盤は既に boardSvg 期待の形で来るので、年盤/月盤だけに適用する。
 */
function toLegacyBoard(b){
  if(!b) return b;
  return {
    C:  b.C,
    // boardSvg の表示は「NW位置に b.SE を置く」等の独自配置になっているため、逆変換する
    SE: b.NW,  // 表示NW
    S:  b.N,   // 表示N
    SW: b.NE,  // 表示NE
    E:  b.W,   // 表示W
    W:  b.E,   // 表示E
    NE: b.SW,  // 表示SW
    N:  b.S,   // 表示S
    NW: b.SE   // 表示SE
  };
}


function calcGohAnkenFromGrid(grid){
  const board = gridToBoardObj(grid);
  const dir5 = findDirOfStar(board, 5);
  return {
    gohosatsuPalace: dir5 ? (DIR_TO_PALACE[dir5] || null) : null,
    ankensatsuPalace: dir5 ? (DIR_TO_PALACE[oppositeDir(dir5)] || null) : null
  };
}

// 2026年：節入り月の中宮（あなたの 1月=9 に合わせる）
const MONTH_CENTER_STAR_2026 = {1:9,2:8,3:7,4:6,5:5,6:4,7:3,8:2,9:1,10:9,11:8,12:7};

// ===== 節入り日（2026年用）=====
const SETSUIRI_DAY = {
  1: 5, 2: 4, 3: 5, 4: 5, 5: 5, 6: 6,
  7: 7, 8: 7, 9: 7, 10: 8, 11: 7, 12: 7
};
function getAfterSetsuiriDate(yyyy, mm){
  const d = SETSUIRI_DAY[mm] ?? 5;
  return `${yyyy}-${pad2(mm)}-${pad2(d)}`;
}
function addDaysISO(iso, add){
  const d = parseISO(iso);
  d.setDate(d.getDate()+add);
  return formatISO(d);
}
function monthStartAfterSetsuiriISO(year, month){
  const d = SETSUIRI_DAY[month] ?? 5;
  return `${year}-${pad2(month)}-${pad2(d)}`;
}
function buildAutoMonthBlock(dateStr){
  const d = parseISO(dateStr);
  const y = d.getFullYear();
  const m = d.getMonth()+1;
  let center = null;
  if(y===2026) center = MONTH_CENTER_STAR_2026[m] ?? null;
  if(!center) return null;

  const start = monthStartAfterSetsuiriISO(y,m);
  let ny=y, nm=m+1;
  if(nm===13){ nm=1; ny=y+1; }
  const nextStart = monthStartAfterSetsuiriISO(ny,nm);
  const end = addDaysISO(nextStart,-1);

  const grid = createGridByCenter(center);
  const marks = calcGohAnkenFromGrid(grid);

  return {
    label: `${y}年${m}月（節入り）`,
    range: {start, end},
    board: { grid, marks },
    fortuneName: "",
    score: "",
    message: {good:[], caution:[]}
  };
}

// 年盤：中心星（例：2026→1, 2025→2）
function yearCenterStar(year){
  const r = year % 9;
  const v = (11 - r) % 9;
  return v===0 ? 9 : v;
}
function ensureYearGrid(yBlock){
  if(!yBlock) return yBlock;
  if(yBlock.board && Array.isArray(yBlock.board.grid)) return yBlock;
  const year = Number(yBlock.id);
  if(!Number.isFinite(year)) return yBlock;
  const center = yearCenterStar(year);
  const grid = createGridByCenter(center);
  const marks = calcGohAnkenFromGrid(grid);
  yBlock.board = yBlock.board || {};
  yBlock.board.grid = grid;
  yBlock.board.marks = yBlock.board.marks || marks;
  return yBlock;
}

// ===== 範囲検索 =====
function parseDate(s){ return new Date(s + "T00:00:00"); }
function inRange(dateStr, range){
  const d = parseDate(dateStr);
  const s = parseDate(range.start);
  const e = parseDate(range.end);
  return d >= s && d <= e;
}
function findYearBlock(dateStr){
  const hit = (data.yearBlocks || []).find(y => inRange(dateStr, y.range));
  const base = ensureYearGrid(hit);
  if(!base) return base;

  // 2026年立春前/後の年運文言・点数を上書き（必要な星だけ）
  const honmeiNum = Number(honmeiSelect?.value || currentHonmei || 1);
  const before = (String(dateStr) <= "2026-02-03");
  const ov = YEAR_FORTUNE_OVERRIDES_2026?.[honmeiNum];
  if(ov){
    const pack = before ? ov.preRisshun : ov.postRisshun;
    if(pack && ((before && String(base.id) === "2025") || (!before && String(base.id) === "2026"))){
      // 参照を壊さないよう浅いコピーで返す
      return {
        ...base,
        fortuneName: pack.fortuneName ?? base.fortuneName,
        score: (pack.score ?? base.score),
        message: pack.message ?? base.message
      };
    }
  }
  return base;
}
function findMonthBlock(dateStr, monthKey){
  // ① idで直指定（range未入力でも拾える）
  if(monthKey){
    const mk = String(monthKey);
    const mkNorm = mk.replace(/-(0+)(\d)$/, "-$2"); // 2026-02 -> 2026-2
    const direct = (data.monthBlocks || []).find(m => {
      const id = String(m.id ?? "");
      const idNorm = id.replace(/-(0+)(\d)$/, "-$2");
      return (id === mk) || (idNorm === mkNorm);
    });
    if(direct) return direct;
  }
  // ② rangeがあるものだけ日付で拾う
  const hit = (data.monthBlocks || []).find(m => m.range && inRange(dateStr, m.range));
  if(hit) return hit;
  // ③ なければ自動生成
  return buildAutoMonthBlock(dateStr);
}

// ===== カレンダー補助 =====
function daysInMonth(yyyy, mm){
  return new Date(yyyy, mm, 0).getDate(); // mm: 1-12
}
function memoKey(dateStr){
  return `memo:${currentHonmei}:${dateStr}`;
}

// ===== UI =====
function openDialog(title, html){
  dialogTitle.textContent = title;
  // HTMLを表示できるように（祐気どりの箇条書きなど）
  dialogText.innerHTML = html;
  dialog.showModal();
}
closeDialog?.addEventListener("click", () => dialog.close());
helpBtn?.addEventListener("click", () => openDialog("ヘルプ", "準備中"));
backBtn?.addEventListener("click", () => {
  detailEl.classList.add("hidden");
  calendarEl.classList.remove("hidden");
});
memoEl?.addEventListener("input", () => {
  const dateStr = memoEl.dataset.date;
  if(!dateStr) return;
  localStorage.setItem(memoKey(dateStr), memoEl.value);
});


// ===== ラッキーカラー・ラッキーナンバー（宮ごと） =====
const PALACE_LUCKY = {
  "巽": { numbers:[3,8], colors:["緑"] },
  "離": { numbers:[2,7], colors:["赤","紫"] },
  "坤": { numbers:[5,10], colors:["こげ茶","茶色"] },
  "震": { numbers:[3,8], colors:["青"] },
  "中": { numbers:[5,10], colors:["黄色","茶色"] },
  "兌": { numbers:[4,9], colors:["ピンク","オレンジ"] },
  "艮": { numbers:[5,10], colors:["アイボリー","茶色"] },
  "坎": { numbers:[1,6], colors:["白","黒","グレー"] },
  "乾": { numbers:[4,9], colors:["金","銀","パール"] },

};
// ===============================
// 日詳細：吉数・吉色・吉香（宮→表示）
// ※宮名自体は表示しない
// ===============================

function stablePick(list, seedStr){
  if(!Array.isArray(list) || list.length === 0) return "";
  // 文字列ハッシュ（簡易・安定）
  let h = 2166136261;
  for (let i=0; i<seedStr.length; i++){
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const idx = Math.abs(h) % list.length;
  return list[idx];
}

// 宮→吉香（各3。表示はランダム1つ）
// 宮→吉香（各3。表示はランダム1つ）
const PALACE_KIKOU = {
  "巽": ["ベルガモット", "ライム", "バジル"],
  "離": ["イランイラン", "オレンジ", "シナモン"],
  "坤": ["ラベンダー", "ローマンカモミール", "ベチバー"],
  "震": ["ペパーミント", "レモン", "ローズマリー"],
  "中": ["レモングラス", "ティーツリー", "ベチバー"],
  "兌": ["ゼラニウム", "オレンジ", "パチョリ"],
  "艮": ["サンダルウッド", "ヒノキ", "ベチバー"],
  "坎": ["サイプレス", "ユーカリ", "ジュニパーベリー"],
  "乾": ["フランキンセンス", "サンダルウッド", "グレープフルーツ"],
};

// 宮→ひとこと（各3。表示はランダム1つ）
const PALACE_ONE_LINE = {
  "巽": ["風に乗る。広げるより“整える”が先。", "紹介・ご縁・循環が動く月。丁寧に返す。", "足りないものが補われ、交際や取引が整う日。"],
  "離": ["魅せ方を磨く。主役は“あなたの一言”。", "情熱は武器。熱くなりすぎず芯を保つ。", "決断は早めに。迷うなら一度寝かせる。"],
  "坤": ["土台づくりの日。コツコツが一番強い。", "受け取る器を整える。感謝が運を呼ぶ。", "地道な積み重ねが、あとで大きな力になります。"],
  "震": ["スタートの合図。まず一歩、動く。", "勢いは吉。やりながら整える。", "思い立ったら即連絡。流れが開く。"],
  "中": ["中心に戻る日。優先順位を1つに。", "リセットすると運が回る。整理が吉。", "背筋を伸ばすと判断が冴える。"],
  "兌": ["楽しさが鍵。笑顔がご縁を連れてくる。", "言葉を明るく。軽さが流れを作る。", "楽しみの中に、成果や収穫がある一日。"],
  "艮": ["切り替えの時。終わらせて次へ。", "小さな習慣が未来を変える。", "古い形を整え直すことで、次の変化につながる日。"],
  "坎": ["深呼吸。焦らず足元から。", "感情の波は整えられる。静けさを選ぶ。", "守りの強さが勝ち。無理に攻めない。"],
  "乾": ["格が上がる日。言葉と所作を整える。", "自分の看板を磨く。プロフィール更新が吉。", "プライドは味方にも敵にも。柔らかく。"],
};

// 宮→開運アクション（各3。表示はランダム1つ）
const PALACE_ACTION = {
  "巽": ["連絡を1本（感謝・お礼・近況）", "名刺・プロフィールを整える", "紹介したい人を1人思い浮かべる"],
  "離": ["見せ方を1つ改善（写真・文章・肩書き）", "気になる発信を1つ保存して研究", "鏡を見て笑顔の練習30秒"],
  "坤": ["机の上を10分だけ片付ける", "目の前の作業を一つ、丁寧に仕上げる", "家計・予定を1つ見直す"],
  "震": ["やることを3分で着手する", "気になる所へ即返信する", "短い散歩で気を切り替える"],
  "中": ["優先順位を1つに絞る", "背筋を伸ばす習慣を1つ作る", "不要なタブ/アプリを閉じる"],
  "兌": ["“会う/話す”を1件入れる", "楽しい予定を先にカレンダーへ", "笑える動画/音楽で気分を上げる"],
  "艮": ["継続したい習慣を1つ決める", "学びの型を真似る（講座/本/人）", "やめたいことを1つ手放す"],
  "坎": ["湯船・足湯で整える", "情報を遮断する時間を作る", "静かな場所で深呼吸3回"],
  "乾": ["服・姿勢・言葉を1つ整える", "尊敬できる人の型を真似る", "名刺/肩書き/導線を更新する"],
};

// 凶作用（暗剣殺・日破）がある時だけ表示する追加メッセージ
function cautionMessage(palace, dayWarnings, seedStr){
  const w = new Set(dayWarnings || []);
  const hasHa = w.has("日破");
  const hasAn = w.has("暗剣殺");
  // ※暗剣殺 or 日破 が“ついた日だけ”表示
  if(!hasHa && !hasAn) return "";

  const key = (palace === "中宮") ? "中" : palace;
  const strongKeys = ["巽","乾","兌","震","離"]; // 運勢が強い宮
  const isStrong = strongKeys.includes(key);

  const msgs = [];

  // 日破
  if(hasHa){
    const strongHa = [
      "卒業と更新の合図。手放すほど運が進む日。",
      "区切りの日。終わらせることで次が開く。",
      "更新のチャンス。古い約束を見直して。",
    ];
    const weakHa   = [
      "調整と守りが吉。予定変更は流れに任せて。",
      "無理は禁物。確認・修正・やり直しが吉。",
      "急がず整える日。キャンセルも悪ではありません。",
    ];
    const msg = stablePick(isStrong ? strongHa : weakHa, `${seedStr}|${key}|ha`) || "";
    if(msg) msgs.push(`日破：${msg}`);
  }

  // 暗剣殺
  if(hasAn){
    const strongAn = [
      "卒業と手放しに追い風。切るほど軽くなる。",
      "方向転換が吉。思い切った更新を。",
      "流れが変わる日。執着を外すと道が開く。",
    ];
    const weakAn   = [
      "慎重に。急なトラブルや延期に備えて。",
      "今日は守り。決断は先送りが吉。",
      "焦りは禁物。余白と確認が身を守ります。",
    ];
    const msg = stablePick(isStrong ? strongAn : weakAn, `${seedStr}|${key}|an`) || "";
    if(msg) msgs.push(`暗剣殺：${msg}`);
  }

  return msgs.join(" / ");
}

// ===== 日詳細モーダル & メモ（カレンダー下固定） =====
let dayModalEl = null;

function ensureDayModal(){
  if(dayModalEl) return dayModalEl;

  // CSS（薄く・アプリの世界観を崩さない）
  const style = document.createElement("style");
  style.textContent = `
  .day-modal-overlay{position:fixed; inset:0; background:rgba(0,0,0,.55); display:none; align-items:center; justify-content:center; z-index:9999;}
  .day-modal{width:min(820px, calc(100vw - 24px)); max-height:calc(100vh - 24px); overflow:auto; background:rgba(8,16,30,.98); border:1px solid rgba(255,255,255,.12); border-radius:18px; box-shadow:0 16px 40px rgba(0,0,0,.5); padding:18px 18px 16px;}
  .day-modal header{display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px;}
  .day-modal-title{font-size:20px; font-weight:700; letter-spacing:.5px;}
  .day-modal-close{border:1px solid rgba(255,255,255,.18); background:rgba(255,255,255,.06); color:inherit; border-radius:12px; padding:8px 12px; cursor:pointer;}
  .day-modal-grid{display:grid; grid-template-columns:1fr; gap:10px;}
  .day-modal-row{border:1px solid rgba(255,255,255,.10); border-radius:14px; padding:12px 12px 10px; background:rgba(255,255,255,.03);}
  .day-modal-row .label{opacity:.85; font-size:13px; margin-bottom:6px;}
  .day-modal-row .value{font-size:16px; line-height:1.5; font-weight:600;}
  .day-modal-sub{margin-top:8px; font-size:14px; line-height:1.55; opacity:.92; font-weight:500;}
  @media (min-width:720px){ .day-modal-grid{grid-template-columns:1fr 1fr;} .span2{grid-column:1 / -1;} }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement("div");
  overlay.className = "day-modal-overlay";
  overlay.innerHTML = `
    <div class="day-modal" role="dialog" aria-modal="true">
      <header>
        <div class="day-modal-title" id="dayModalTitle">日詳細</div>
        <button class="day-modal-close" id="dayModalClose">閉じる</button>
      </header>
      <div class="day-modal-grid" id="dayModalBody"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  const closeBtn = overlay.querySelector("#dayModalClose");
  closeBtn.addEventListener("click", () => overlay.style.display="none");
  overlay.addEventListener("click", (e) => { if(e.target === overlay) overlay.style.display="none"; });
  window.addEventListener("keydown", (e) => { if(e.key === "Escape") overlay.style.display="none"; });

  dayModalEl = overlay;
  return dayModalEl;
}

function setupMemoBelowCalendar(){
  if(!memoEl || !calendarEl) return;
  if(memoEl.dataset.moved === "1") return;

  // 既存のtextareaを、カレンダー下に「メモ枠」を作って移動
  const wrap = document.createElement("div");
  wrap.className = "card";
  wrap.style.marginTop = "14px";
  wrap.innerHTML = `
    <div style="font-size:22px; font-weight:800; margin-bottom:10px;">メモ（自動保存）</div>
  `;
  // memoEl を移動
  memoEl.style.width = "100%";
  memoEl.style.minHeight = "180px";
  memoEl.style.borderRadius = "14px";
  memoEl.style.border = "1px solid rgba(255,255,255,.12)";
  memoEl.style.background = "rgba(255,255,255,.03)";
  memoEl.style.padding = "12px 14px";
  wrap.appendChild(memoEl);

  // カレンダーの直下（calendarEl の末尾）に追加
  calendarEl.appendChild(wrap);
  memoEl.dataset.moved = "1";
}

// 宮からラッキー情報を作る（宮名は表示しない）
function luckyInfoByPalace(palace){
  const key = (palace === "中宮") ? "中" : palace;
  const info = PALACE_LUCKY[key];
  if(!info) return { numbersText:"", colorsText:"" };
  return {
    numbersText: info.numbers.join("・"),
    colorsText: info.colors.join("・"),
  };
}
// ===== データ読み込み =====
// 共通データ（年盤/月盤/年運メッセージ/宮ごとの月運メッセージ）を先に読み込んで、星別JSONに不足があれば補完する
let COMMON_DATA = null;
let COMMON_DATA_PROMISE = null;

function loadCommonData(){
  if(COMMON_DATA) return Promise.resolve(COMMON_DATA);
  if(COMMON_DATA_PROMISE) return COMMON_DATA_PROMISE;

  const url = "./data/honmei_common_2026.json";
  COMMON_DATA_PROMISE = fetch(url, { cache: "no-store" })
    .then(r => {
      if(!r.ok) throw new Error(`共通データが見つかりません: ${url}（HTTP ${r.status}）`);
      return r.json();
    })
    .then(j => {
      COMMON_DATA = j || null;
      return COMMON_DATA;
    })
    .catch(e => {
      console.warn("COMMON_DATA load failed:", e);
      COMMON_DATA = null;
      return null;
    });

  return COMMON_DATA_PROMISE;
}

function mergeCommonIntoData(starData, common){
  const d = starData || {};
  if(common){
    if((!Array.isArray(d.monthBlocks) || d.monthBlocks.length===0) && Array.isArray(common.monthBlocks)) d.monthBlocks = common.monthBlocks;
    if((!Array.isArray(d.yearBlocks)  || d.yearBlocks.length===0)  && Array.isArray(common.yearBlocks))  d.yearBlocks  = common.yearBlocks;
    if(!d.yearFortuneByPalace && common.yearFortuneByPalace) d.yearFortuneByPalace = common.yearFortuneByPalace;
    if(!d.monthPalaceMessage  && common.monthPalaceMessage)  d.monthPalaceMessage  = common.monthPalaceMessage;
  }
  return d;
}



// 年運点数データを読み込む（存在しない場合でも落とさない）
function loadYearScoresData(){
  if(YEAR_SCORES) return Promise.resolve(YEAR_SCORES);
  if(YEAR_SCORES_PROMISE) return YEAR_SCORES_PROMISE;

  const url = "./data/year_scores_2026.json";
  YEAR_SCORES_PROMISE = fetch(url, { cache: "no-store" })
    .then(r => (r.ok ? r.json() : {}))
    .then(j => {
      YEAR_SCORES = j || {};
      return YEAR_SCORES;
    })
    .catch(() => {
      YEAR_SCORES = {};
      return YEAR_SCORES;
    });

  return YEAR_SCORES_PROMISE;
}

// 年運点数を取得（yearId は "2025" など / honmei は 1〜9）
function getYearUneiScore(yearId, honmei){
  const y = String(yearId || "");
  const h = String(honmei || "");
  return YEAR_SCORES?.[y]?.[h] ?? "";
}

async function loadHonmei(honmei){
  const h = Number(honmei);
  const url = `./data/honmei_${h}.json`;

  // 共通JSONを先読み（失敗しても続行）
  const common = await loadCommonData();

  // 既定の空データ（読み込み失敗でも画面が崩れないように）
  const EMPTY = { yearBlocks: [], monthBlocks: [], yuki: [] };

  let res = null;
  try{
    res = await fetch(url, { cache: "no-store" });
  }catch(e){
    data = EMPTY;
    dataLoadError = `データ取得に失敗しました: ${url}`;
    console.warn(dataLoadError, e);
    return;
  }

  if(!res.ok){
    data = EMPTY;
    dataLoadError = `データが見つかりません: ${url}（HTTP ${res.status}）`;
    console.warn(dataLoadError);
    return;
  }

  try{
    const json = await res.json();
    data = json || EMPTY;
    data = mergeCommonIntoData(data, common);
    // 共通データ（monthBlocks / yearBlocks）が入っていない星データは、index.html 埋め込みから補完
    if(!Array.isArray(data.monthBlocks) || data.monthBlocks.length===0){
      if(COMMON_MONTH_BLOCKS.length) data.monthBlocks = COMMON_MONTH_BLOCKS;
    }
    if(!Array.isArray(data.yearBlocks) || data.yearBlocks.length===0){
      if(COMMON_YEAR_BLOCKS.length) data.yearBlocks = COMMON_YEAR_BLOCKS;
    }
    dataLoadError = "";
  }catch(e){
    data = EMPTY;
    dataLoadError = `データの解析に失敗しました: ${url}`;
    console.warn(dataLoadError, e);
  }
}


// ===== 点数・状態 =====
function calcDayScore(palace, dayWarnings = []) {
  let score = PALACE_BASE_SCORE[palace] ?? 50;
  const hasAn = dayWarnings.includes("暗剣殺");
  const hasHa = dayWarnings.includes("日破");
  if (hasAn) score -= 30;
  if (hasHa) score -= 15;
  if (score < 5) score = 5;
  return score;
}
function dayState(dayScore, dayWarnings){
  const hasAttention = (dayWarnings || []).some(w => w === "暗剣殺" || w === "日破");
  if(hasAttention) return "注意";
  return (typeof dayScore === "number" && dayScore >= 60) ? "行動" : "整え";
}

// ===== トップ盤表示 =====
function renderTopBoards(yyyy, mm){
  const monthKey = `${yyyy}-${String(mm).padStart(2,"0")}`;
  const monthAfterDate  = getAfterSetsuiriDate(yyyy, mm);

  // まず monthBlocks の id で拾う（range未入力でも表示できる）
  // honmeiデータは「運勢名/点数/文章」中心なので、共通メタ（天道/吉神/月破など）は共通MONTH_BLOCKSから補完する
  const mBlockUser = (Array.isArray(data?.monthBlocks)
      ? data.monthBlocks.find(b => String(b.id) === String(monthKey))
      : null);
  const mBlockBase = findMonthBlock(monthAfterDate, monthKey) || null;

  const mBlock = (() => {
    if(!mBlockUser) return mBlockBase;
    if(!mBlockBase) return mBlockUser;

    const merged = { ...mBlockBase, ...mBlockUser };

    // board を深めにマージ（gridはユーザー優先、marksは両方合成）
    const bBase = mBlockBase.board || {};
    const bUser = mBlockUser.board || {};
    merged.board = { ...bBase, ...bUser };
    merged.board.marks = { ...(bBase.marks||{}), ...(bUser.marks||{}) };

    // 共通項目の補完（ユーザーに無ければ共通を採用）
    if(merged.tendo == null && mBlockBase.tendo != null) merged.tendo = mBlockBase.tendo;
    if(merged.goodGods == null && mBlockBase.goodGods != null) merged.goodGods = mBlockBase.goodGods;

    return merged;
  })();

  // 月盤マーク（暗剣殺/五黄殺/月破など）。データに無い場合でも落ちないように空オブジェクト。
  const monthMarks = (mBlock && mBlock.board && mBlock.board.marks) ? mBlock.board.marks : {};
  const yBlock = findYearBlock(monthAfterDate);


  const yGridRaw = yBlock?.board?.grid || null;
  const mGridRaw = mBlock?.board?.grid || null;
  // 盤の巡りはデータファイルの grid をそのまま使う（表示順：左上SE→上S→右上SW→左E→中C→右W→左下NE→下N→右下NW）
  const yGrid = yGridRaw;
  const mGrid = mGridRaw;


// 年運（宮ごと共通）：年盤で本命星が入る宮をキーに yearFortuneByPalace から取得
const honmei = Number(honmeiSelect?.value || 1);
const honmeiPalY = yGrid ? palaceOfStarMonth(yGrid, honmei) : null;
const yFortSrc = data?.yearFortuneByPalace;
let yPack = null;
if(yFortSrc && honmeiPalY){
  // 形式A: { "坎": {...}, ... } / 形式B: { "2025": { "坎": {...}}, ... }
  yPack = (yFortSrc?.[String(yBlock?.id ?? "")]?.[honmeiPalY]) ?? (yFortSrc?.[honmeiPalY]) ?? null;
}
const yearFortuneName = (yPack?.fortuneName ?? "");
  const yearBodyText = (yPack?.text ?? yPack?.message ?? "");
  const yearMessageText = (yearBodyText ? yearBodyText : "") + (yPack?.keyword ? `（キーワード：${yPack.keyword}）` : "");


  const yearTitle = `年運（${jpDate(yBlock?.range?.start ?? "2025-02-03")}～${jpDate(yBlock?.range?.end ?? "2026-02-03")}）`;
  const monthTitle = `月運（${formatRangeFromBlock(mBlock, currentMonth)}）`;
// 年盤の紫（五黄殺・暗剣殺）は「方位キー」にして boardSvg へ渡す
// 五黄殺/暗剣殺（年盤・月盤）は grid の中の「5」とその向かいで決める（marks は使わない）
const yBoardObj = safeGridToBoardObj(yGrid);
const yearGohDir = yBoardObj ? findDirOfStar(yBoardObj, 5) : null;
const yearAnkenDir = yearGohDir ? oppositeDir(yearGohDir) : null;

const mBoardObjForBad = safeGridToBoardObj(mGrid);
const monthGohDir = mBoardObjForBad ? findDirOfStar(mBoardObjForBad, 5) : null;
const monthAnkenDir = monthGohDir ? oppositeDir(monthGohDir) : null;


  // 表示用（本命星×月）点数＆運名：データが無い月はここで自動補完
  const yearBoardObjForKichi = yGrid ? gridToBoardObj(yGrid) : null;
  const yearMarks = yBlock?.board?.marks || {};
  const yearGoodDirs = getGoodDirsFromNenban(yearBoardObjForKichi, honmei, yearMarks);
  const yearLuckyText = yearGoodDirs.length ? yearGoodDirs.map(d => DIR_LABEL_JP[d]).join("・") : "—";
  const yearLuckyHtml = renderDirChips(yearGoodDirs, "good");
  // 凶方位（年）：五黄殺・暗剣殺・本命殺・本命的殺・歳破
  const saihaPal = yearMarks?.saihaPalace || yearMarks?.haPalace || yearMarks?.saiha || null;
  const saihaDir = saihaPal ? (PALACE_TO_DIR[saihaPal] || null) : null;
  const yearBadTypeMap = buildBadTypeMap(yearBoardObjForKichi, honmei, saihaDir, "歳破");
  const yearBadDirs = orderedBadDirsFromTypeMap(yearBadTypeMap);
  const yearBadText = formatDirsJP(yearBadDirs);
  const yearBadHtml = renderBadDirChips(yearBadTypeMap, "year");
  const yearLuckLabel  = (yearFortuneName || (yBlock?.fortuneName ?? "")) || getLuckLabelFromGrid(yGrid, honmei);
  const yearScoreVal   = (getYearUneiScore(yBlock?.id ?? "", honmei) || (yBlock?.score ?? ""));
  const monthLuckLabel = (mBlock?.fortuneName ?? "") || (mGrid ? getLuckLabelFromGrid(mGrid, honmei) : "") || "";
  const monthScoreVal  = (mBlock?.score ?? "") || (getMonthUneiScore(honmei, mm) ?? "");

  // 月メッセージ（本命星が入る宮の文章を使う）
  const honmeiPalM = palaceOfStarMonth(mGrid, honmei);
  const mMsg = getMonthPalaceMessage(honmeiPalM) || {};

  // 月の吉方位表示（日盤と同ルール）
  let kichiText = "—";
  let kyoText = "—";

  // 月盤ヘッダ用バッジ（ア=暗剣殺 / 破=月破 / 天=天道 / 吉=吉神）
  // 暗剣殺は月盤の marks から（無ければ表示用 mGrid から自動算出）
  const monthMarksCalc = (mGrid && (!monthMarks || Object.keys(monthMarks).length === 0))
    ? calcGohAnkenFromGrid(mGrid)
    : (monthMarks || {});
  
  
  // 月の吉方位を計算（除外：本命星の向かい／暗剣殺／五黄殺／月破／中宮）
  const monthBoardObj = mGrid ? gridToBoardObj(mGrid) : null;
  const monthGoodDirs = getGoodDirsFromGetsuban(monthBoardObj, honmei, monthMarksCalc || {});
  kichiText = monthGoodDirs.length ? monthGoodDirs.map(d => DIR_LABEL_JP[d]).join("・") : "—";
  const kichiHtml = renderDirChips(monthGoodDirs, "good");
  // 凶方位（月）：五黄殺・暗剣殺・本命殺・本命的殺・月破
  const geppaPal = monthMarks?.haPalace || null;
  const geppaDir = geppaPal ? (PALACE_TO_DIR[geppaPal] || null) : null;
  const monthBadTypeMap = buildBadTypeMap(monthBoardObj, honmei, geppaDir, "月破");
  const monthBadDirs = orderedBadDirsFromTypeMap(monthBadTypeMap);
  kyoText = formatDirsJP(monthBadDirs);
  const kyoHtml = renderBadDirChips(monthBadTypeMap, "month");

// ■ 月盤カード右上：バッジ（暗剣殺／五黄殺／月破(haType)／天道／吉神）
  // ※ まずは MONTH_BADGE_DATA_2026 に入力したものだけを表示（未入力月は何も表示しない）


// 月盤：天道・吉神・暗剣殺・五黄殺・月破などの表示ブロック
const monthBadgeBlock = monthBadgeBlockHtml(mBlock, mGrid);

const yExpanded = !!YEAR_MORE_OPEN[String(yBlock?.id ?? "")];


const yearHtml = `
    <div class="boardCard">
      <div class="boardCardHead">
        <div class="boardTitle">${yearTitle}</div>
        <div class="boardMeta"><span class="fortuneName" style="font-weight:700; font-size:1.1em;">${yearLuckLabel}</span> <span class="fortuneScore" style="font-weight:700; font-size:1.1em;">${yearScoreVal}点</span></div>
      </div>
      <div class="boardBody">
        ${yGrid ? boardSvg(gridToBoardObj(yGrid), yearGohDir, yearAnkenDir, false, YEAR_BAD_PURPLE) : `<div class="boardText">※年盤データがありません</div>`}
        <div class="boardText">${formatYearMessageSimple(yearMessageText || (yBlock?.message ?? ""), yExpanded, yBlock?.id ?? "")}
          <div class="yearKeyword">（吉方位：${yearLuckyHtml}／凶方位：${yearBadHtml}）</div>
        </div>
      </div>
    </div>
  `;

  const monthHtml = `
    <div class="boardCard">
      <div class="boardCardHead">
        <div class="boardTitle">${monthTitle}</div>
        <div class="boardMeta"><span class="fortuneName" style="font-weight:700; font-size:1.1em;">${monthLuckLabel}</span> <span class="fortuneScore" style="font-weight:700; font-size:1.1em;">${monthScoreVal}点</span></div>
      </div>
      <div class="boardBody">
        ${mGrid ? boardSvg(gridToBoardObj(mGrid), monthGohDir, monthAnkenDir, false, MONTH_BAD_GREEN) : `<div class="boardText">
  ${monthBadgeBlock}
※月盤データが見つかりません</div>`}
<div class="boardText">
    ${monthBadgeBlock}
  <div><b>テーマ：</b>${mMsg?.theme ?? (mBlock?.message?.theme ?? "")}</div>
  <div><b>今月の伸ばし方：</b>${(Array.isArray(mMsg?.good) ? mMsg.good.join("／") : (mBlock?.message?.good?.[0] ?? ""))}</div>
  <div><b>注意：</b>${mMsg?.caution ?? (mBlock?.message?.caution?.[0] ?? "")}</div>
  <div><b>開運アクション：</b>${mMsg?.action ?? (mBlock?.message?.action?.[0] ?? "")}</div>
  <div><b>吉方位：</b>${kichiHtml}　<b>凶方位：</b>${kyoHtml}</div>
</div>
      </div>
    </div>
  `;

  topBoardsEl.innerHTML = yearHtml + monthHtml;
}




// ===== 月描画 =====
function renderMonth(){
  const [yyyyStr, mmStr] = currentMonth.split("-");
  const yyyy = Number(yyyyStr);
  const mm   = Number(mmStr);
  const setsuDay = SETSUIRI_DAY_BY_MONTH[mm] || null;

  titleEl.textContent = `${yyyy}年${mm}月`;
  if(subtitleEl) subtitleEl.textContent = FIXED_HONMEI ? starNameJP(FIXED_HONMEI) : "";

  // トップ盤
  renderTopBoards(yyyy, mm);

  // カレンダー
  calendarEl.innerHTML = "";

  // 曜日ヘッダー（月曜始まり）
  const dow = ["月","火","水","木","金","土","日"];
  dow.forEach(t => {
    const h = document.createElement("div");
    h.className = "dowCell";
    h.textContent = t;
    calendarEl.appendChild(h);
  });

  const maxDay = daysInMonth(yyyy, mm);

  // 月曜始まり：月初の空白
  const firstDate = new Date(yyyy, mm - 1, 1);
  const lead = (firstDate.getDay() + 6) % 7;
  for(let i=0;i<lead;i++){
    const empty = document.createElement("div");
    empty.className = "dayCell empty";
    calendarEl.appendChild(empty);
  }

  for(let d=1; d<=maxDay; d++){
    const dateStr = `${yyyyStr}-${mmStr}-${pad2(d)}`;
    const dateObj = new Date(yyyy, mm-1, d);


    // 干支（十二支）
    const eto = getBranchByDate(dateObj);
    // 日盤（2026専用）
    const board = makeNichiban2026(dateObj);

    // JSONの手入力データ（あれば優先）
    const dayObj = (data?.days && data.days[dateStr]) ? data.days[dateStr] : {};

    // palace：JSON優先、無ければ日盤から推定
    const palace = dayObj.palace ?? inferPalaceFromNichiban(board, Number(currentHonmei)) ?? "中";

    // 日破：干支で自動（palace と一致したら日破）
    const nichihaPalace = getNichihaPalaceByDate(dateObj);
    const hasNichiha = (palace && nichihaPalace && palace === nichihaPalace);

    // 暗剣殺：日盤から自動
    const inferred = inferDayWarningsFromNichiban(board, Number(currentHonmei));

    // warnings：JSON + 自動 + 日破
    const dayWarnings = Array.from(new Set([...(dayObj.dayWarnings ?? []), ...inferred, ...(hasNichiha ? ["日破"] : [])]));

    // 点数・状態
    const dayScore = calcDayScore(palace, dayWarnings);
    const state = dayState(dayScore, dayWarnings);

    // 月盤の薄緑（その日が属する月盤）
    // 重要：marks の片方だけが欠けている月があるため、基本は「月盤gridの5→五黄殺／その反対→暗剣殺」で算出する。
    const monthBlock = findMonthBlock(dateStr);
    const monthMarks = monthBlock?.board?.marks || {};

    let monthGohDir = null;
    let monthAnkenDir = null;

    const mGrid = monthBlock?.board?.grid;
    if (Array.isArray(mGrid) && mGrid.length === 9) {
      const mBoardObj = gridToBoardObj(mGrid);
      monthGohDir = findDirOfStar(mBoardObj, 5);
      monthAnkenDir = oppositeDir(monthGohDir);
    } else {
      // fallback: marks から（表記ゆれを吸収）
      const gohPal = normPalace(monthMarks.gohosatsuPalace);
      const ankenPal = normPalace(monthMarks.ankensatsuPalace);
      monthGohDir = gohPal ? (PALACE_TO_DIR[gohPal] || null) : null;
      monthAnkenDir = ankenPal ? (PALACE_TO_DIR[ankenPal] || null) : null;
    }

    const hasAn = dayWarnings.includes("暗剣殺");
    const hasHa = dayWarnings.includes("日破");
    const mark = hasAn ? "ア" : (hasHa ? "破" : "");
    const yukiEvents = getYukidoriForDate(dateStr, Number(currentHonmei));
    const hasYuki = yukiEvents.length > 0;
    const isSetsuiri = (setsuDay != null && d === setsuDay);

    const cell = document.createElement("div");
    cell.className = `dayCell state-${state}${isSetsuiri ? " setsuiri" : ""}${hasYuki ? " yuki" : ""}${isTodayISO(dateStr) ? " today" : ""}`;
    cell.innerHTML = `
      <div class="topRow">
        <div class="topLeft">
          <div class="dayNum">${d}</div>
                    <div class="etoMini">${eto}</div>
${isSetsuiri ? `` : ``}
          ${mark ? `<span class="kyoMini">${mark}</span>` : ``}
          ${hasYuki ? `<span class="yukiMini" style="display:inline-block;font-size:11px;line-height:1;padding:2px 5px;border-radius:6px;border:1px solid rgba(255,192,203,0.9);color:#b85c7a;background:rgba(255,240,245,0.9);margin-left:4px;">祐</span>` : ``}
          <div class="stateBadge">${state}</div>
        </div>
        <div class="scoreNum">${(dayScore!=="" && dayScore!=null) ? (dayScore + "点") : ""}</div>
      </div>
      <div class="oct-board">${boardSvg(board, monthGohDir, monthAnkenDir, true, MONTH_BAD_GREEN)}</div>
    `;
    cell.addEventListener("click", () => openDetail(dateStr));
    calendarEl.appendChild(cell);
  }
}

// ===== 詳細 =====
function pickOneLine(dateStr){
  const dayObj = (data?.days && data.days[dateStr]) ? data.days[dateStr] : {};
  const monthBlock = findMonthBlock(dateStr);
  if(!monthBlock) return "";
  const hasBad = (dayObj.dayWarnings?.length || 0) > 0;
  const src = hasBad ? monthBlock.message?.caution : monthBlock.message?.good;
  return src?.[0] ?? "";
}

function openDetail(dateStr){
  // カレンダーはそのまま。情報だけモーダルで表示し、メモは下固定。
  setupMemoBelowCalendar();

  const dayObj = (data?.days && data.days[dateStr]) ? data.days[dateStr] : {};
  const dObj = parseISO(dateStr);
  const board = makeNichiban2026(dObj);

  // 方位タップで参照する「その日の日盤」を保持
  CURRENT_DIR_CONTEXT = { board, dateStr, honmei: Number(currentHonmei) };

  // 今日が入る宮（内部で使う。宮名は表示しない）
  const palace = dayObj.palace ?? inferPalaceFromNichiban(board, Number(currentHonmei)) ?? "中";

  // 日の凶作用（暗剣殺・五黄殺など）＋日破
  const inferred = inferDayWarningsFromNichiban(board, Number(currentHonmei));
  const nichihaPalace = getNichihaPalaceByDate(dObj);
  const hasNichiha = (palace && nichihaPalace && palace === nichihaPalace);
  const dayWarnings = Array.from(new Set([...(dayObj.dayWarnings ?? []), ...inferred, ...(hasNichiha ? ["日破"] : [])]));

  // 点数（既存ロジック）
  const dayScore = calcDayScore(palace, dayWarnings);

  // 吉方位（日）＝既存ロジック
  const haDir = getNichihaDirByDate(dObj);
  const goodDirs = getGoodDirsFromNichiban(board, Number(currentHonmei), haDir);
  const goodDirText = goodDirs.length ? goodDirs.map(d => DIR_LABEL_JP[d] || d).join("・") : "なし";
  const goodDirHtml = renderDirChips(goodDirs, "good");
  // 凶方位（日）：五黄殺・暗剣殺・本命殺・本命的殺・日破
  const dayBadTypeMap = buildBadTypeMap(board, Number(currentHonmei), haDir, "日破");
  const badDirs = orderedBadDirsFromTypeMap(dayBadTypeMap);
  const badDirText = formatDirsJP(badDirs);
  const badDirHtml = renderBadDirChips(dayBadTypeMap, "day");
const yukiList = getYukidoriForDate(dateStr, Number(currentHonmei));
// 祐気どり（タップ可能：この時だけ「宮の運＋回座星の運」を表示）
const yukiText = (() => {
  if(!yukiList.length) return "";
  const lines = yukiList.map(e => {
    const t = (e.times && e.times.length) ? e.times.join(" / ") : "";
    const dirs = Array.isArray(e.dirs) ? e.dirs : [];
    const chips = dirs.map(jp => {
      const k = JP_TO_DIR[jp];
      if(!k) return `<span class="yukiDirText">${escapeHtml(jp)}</span>`;
      return `<span class="dirChip" data-dir="${k}" data-kind="good" data-scope="yuki">${escapeHtml(jp)}</span>`;
    }).join(" ");
    const left = t ? `<span class="yukiTime">${escapeHtml(t)}</span>` : "";
    return [left, chips].filter(Boolean).join("　");
  });
  return lines.join("<br>");
})();


  // ラッキー（宮→色/数：宮名は表示しない）
  const lucky = luckyInfoByPalace(palace);
  const luckyNumText = lucky.numbersText || "—";
  const luckyColorText = lucky.colorsText || "—";

  // 吉香（宮→アロマを1つランダム表示：日付で固定）
  const pKey2 = (palace === "中宮") ? "中" : palace;
  const kikkouOil = stablePick(PALACE_KIKOU[pKey2] || [], `${dateStr}|${pKey2}|oil`) || "—";

  // ひとこと・開運アクション（宮ごとの候補からランダム表示：日付で固定）
  const pKey = (palace === "中宮") ? "中" : palace;
  const oneLine = stablePick(PALACE_ONE_LINE[pKey] || [], `${dateStr}|${pKey}|one`) || "—";
  const act = stablePick(PALACE_ACTION[pKey] || [], `${dateStr}|${pKey}|act`) || "—";

  // メモ（下固定）
  if (memoEl){
    memoEl.dataset.date = dateStr;
    memoEl.value = localStorage.getItem(memoKey(dateStr)) ?? "";
  }

  // モーダル表示
  const modal = ensureDayModal();
  const titleEl = modal.querySelector("#dayModalTitle");
  const bodyEl  = modal.querySelector("#dayModalBody");
  if (titleEl) titleEl.textContent = dateStr;

  const warnText = dayWarnings.length ? dayWarnings.join("・") : "なし";
  const caution = cautionMessage(palace, dayWarnings, dateStr);

  bodyEl.innerHTML = `
    <div class="day-modal-row">
      <div class="label">今日の運勢</div>
      <div class="value">${dayScore}点</div>
    </div>
    <div class="day-modal-row span2">
      <div class="label">吉方位/凶方位（タップでワンポイント）</div>
      <div class="value">
        <div><span class="dirMiniLabel">吉：</span>${goodDirHtml}</div>
        <div style="margin-top:6px;"><span class="dirMiniLabel">凶：</span>${badDirHtml}</div>
      </div>
    </div>
    ${yukiText ? `
    <div class="day-modal-row">
      <div class="label">祐気どり</div>
      <div class="value">${yukiText}</div>
    </div>` : ``}


    <div class="day-modal-row">
      <div class="label">注意（凶作用）</div>
      <div class="value">${warnText}</div>
      ${caution ? `<div class="day-modal-sub">${escapeHtml(caution)}</div>` : ""}
    </div>
    <div class="day-modal-row">
      <div class="label">吉数 / 吉色 / 吉香</div>
      <div class="value">${luckyNumText} ／ ${luckyColorText} ／ ${escapeHtml(kikkouOil)}</div>
    </div>

    <div class="day-modal-row span2">
      <div class="label">ひとことメッセージ</div>
      <div class="value">${escapeHtml(oneLine)}</div>
    </div>
    <div class="day-modal-row span2">
      <div class="label">開運アクション</div>
      <div class="value">${escapeHtml(act)}</div>
    </div>
  `;

  modal.style.display = "flex";
}


function getTodayMonthId(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  return `${y}-${m}`;
}

// ===== 起動 =====
async function boot(){
  currentHonmei = (FIXED_HONMEI ?? Number(honmeiSelect.value));
  // 初期表示の月：URL指定があれば優先、なければ「今日の月」
  const qs = new URLSearchParams(location.search);
  const qMonth = qs.get("month") || qs.get("m");
  const todayMonth = getTodayMonthId();
  const initMonth = (qMonth && /^\d{4}-\d{2}$/.test(qMonth)) ? qMonth : todayMonth;

  if (monthInput) monthInput.value = initMonth;
  currentMonth = normalizeMonthId(initMonth);

  await loadYearScoresData();
  await loadAllYuki();
  await loadHonmei(currentHonmei);
  renderMonth();
  setupMemoBelowCalendar();
}
if(!FIXED_HONMEI){ honmeiSelect?.addEventListener("change", () => boot().catch(showBootError)); }
monthInput?.addEventListener("change", () => {
  // ★2026年版固定：他の年が選ばれても2026年に戻す
  if (monthInput && monthInput.value) {
    const v = monthInput.value;
    if (/^\d{4}-\d{2}$/.test(v) && !v.startsWith("2026-")) {
      const mm = v.slice(5,7);
      monthInput.value = `2026-${mm}`;
    }
  }

  currentMonth = normalizeMonthId(monthInput.value);
  try { renderMonth(); } catch(e){ showBootError(e); }
});

function showBootError(err){
  console.error(err);
  alert(err?.message ?? String(err));
}
boot().catch(showBootError);

/* ===============================
   八角形盤（SVG）
   - 日盤の五黄殺/暗剣殺：水色（数字5の位置とその反対）
   - 月盤の五黄殺/暗剣殺：薄緑（monthGohDir/monthAnkenDir を方位キーで受け取る）
================================ */

function findDirOfNumber(board, num){
  const entries = Object.entries(board).filter(([k]) => k !== "C");
  const hit = entries.find(([,v]) => v === num);
  return hit ? hit[0] : null;
}
function svgCell(x,y,val,isCenter=false){
  const textFill = isCenter ? "#b8860b" : "#111827";
  const fontSize = isCenter ? 15 : 13;
  return `
    <text x="${x}" y="${y + 5}" text-anchor="middle"
      font-size="${fontSize}" font-weight="${isCenter ? 800 : 700}"
      fill="${textFill}"
      font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial"
    >${val}</text>`;
}

function boardSvg(b, badDir1, badDir2, showDayBad = true, badFill = "rgba(180, 235, 180, 0.35)"){
  // 外側八角形（頂点）
  const O = [
    [30, 6],[70, 6],[94, 30],[94, 70],[70, 94],[30, 94],[6, 70],[6, 30],
  ];
  // 内側八角形（頂点）
  const I = [
    [44, 32],[56, 32],[68, 44],[68, 56],[56, 68],[44, 68],[32, 56],[32, 44],
  ];

  // 日盤（水色）
  const gohDir   = findDirOfNumber(b, 5);
  const ankenDir = oppositeDir(gohDir);
  const dirByIdx = ["S","SW","W","NW","N","NE","E","SE"];

  function trapezoid(i){
    const i2 = (i + 1) % 8;
    const dir = dirByIdx[i];

    const isMonthBad = (dir && (dir === badDir1 || dir === badDir2));
    const isDayBad = showDayBad && (dir && (dir === gohDir || dir === ankenDir));

    // 優先：日盤（水色） > 月運（薄緑）
    let fill = "transparent";
    if(isDayBad) fill = DAY_BAD_BLUE;
    else if(isMonthBad) fill = badFill;

    return `<polygon class="trap" style="fill:${fill}"
      points="${I[i][0]},${I[i][1]} ${I[i2][0]},${I[i2][1]} ${O[i2][0]},${O[i2][1]} ${O[i][0]},${O[i][1]}" />`;
  }

  function seg(a, c){
    return `<line x1="${a[0]}" y1="${a[1]}" x2="${c[0]}" y2="${c[1]}"
      stroke="#111111" stroke-width="2" />`;
  }

  return `
  <svg class="oct-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <path d="M${O[0][0]} ${O[0][1]} L${O[1][0]} ${O[1][1]} L${O[2][0]} ${O[2][1]} L${O[3][0]} ${O[3][1]}
             L${O[4][0]} ${O[4][1]} L${O[5][0]} ${O[5][1]} L${O[6][0]} ${O[6][1]} L${O[7][0]} ${O[7][1]} Z"
          fill="#ffffff" stroke="#111111" stroke-width="2.2" />

    ${trapezoid(0)}${trapezoid(1)}${trapezoid(2)}${trapezoid(3)}
    ${trapezoid(4)}${trapezoid(5)}${trapezoid(6)}${trapezoid(7)}

    <path d="M${I[0][0]} ${I[0][1]} L${I[1][0]} ${I[1][1]} L${I[2][0]} ${I[2][1]} L${I[3][0]} ${I[3][1]}
             L${I[4][0]} ${I[4][1]} L${I[5][0]} ${I[5][1]} L${I[6][0]} ${I[6][1]} L${I[7][0]} ${I[7][1]} Z"
          fill="none" stroke="#111111" stroke-width="2" />

    ${seg(I[0], O[0])}${seg(I[1], O[1])}${seg(I[2], O[2])}${seg(I[3], O[3])}
    ${seg(I[4], O[4])}${seg(I[5], O[5])}${seg(I[6], O[6])}${seg(I[7], O[7])}

    <!-- 数字（既存UIに合わせた配置） -->
    ${svgCell(25,25,b.SE)}
    ${svgCell(50,18,b.S)}
    ${svgCell(75,25,b.SW)}
    ${svgCell(18,50,b.E)}
    ${svgCell(50,50,b.C,true)}
    ${svgCell(82,50,b.W)}
    ${svgCell(25,75,b.NE)}
    ${svgCell(50,82,b.N)}
    ${svgCell(75,75,b.NW)}
  </svg>`;
}


function boardSvgTop(b, badDir1, badDir2, showDayBad = true, badFill = "rgba(180, 235, 180, 0.35)"){
  // UIの盤配置（既存）を保ちつつ、表示だけ「方位どおり」に見えるように並べ替える
  // 既存配置: TL=SE, T=S, TR=SW, ML=E, MR=W, BL=NE, B=N, BR=NW
  // 見せたい配置: TL=NW, T=N, TR=NE, ML=W, MR=E, BL=SW, B=S, BR=SE
  const r = {
    C:  b.C,
    SE: b.NW,
    S:  b.N,
    SW: b.NE,
    E:  b.W,
    W:  b.E,
    NE: b.SW,
    N:  b.S,
    NW: b.SE
  };
  return boardSvg(r, badDir1, badDir2, showDayBad, badFill);
}
/* ========= 日盤計算（2026年専用） ========= */

function diffDays(a, b) {
  const ms = 24 * 60 * 60 * 1000;
  const aa = new Date(a); aa.setHours(0,0,0,0);
  const bb = new Date(b); bb.setHours(0,0,0,0);
  return Math.round((bb - aa) / ms);
}
function mod9(n){
  return ((n - 1) % 9 + 9) % 9 + 1;
}

// 中宮（切替2日同値対応）
function centerStar2026(date){
  const d = new Date(date); d.setHours(0,0,0,0);

  const yinStart   = new Date(2026, 5, 19); // 6/19
  const yangStart  = new Date(2026,11,16); // 12/16
  const yangAnchor = new Date(2026, 5, 18); // 6/18
  const yinLast    = new Date(2026,11,15); // 12/15

  if (d >= yangStart) {
    return mod9(1 + diffDays(yangStart, d));
  }
  if (d >= yinStart) {
    if (+d === +yinLast) return 1;
    return mod9(9 - diffDays(yinStart, d));
  }
  return mod9(9 - diffDays(d, yangAnchor));
}

// 飛泊順（固定）：中→NW→W→NE→S→N→SW→E→SE
const ORDER = ["C","NW","W","NE","S","N","SW","E","SE"];

function makeNichiban2026(date){
  const d = new Date(date); d.setHours(0,0,0,0);
  const center = centerStar2026(d);

  const step = +1;
  const b = { C: center };
  for (let i=1; i<ORDER.length; i++){
    b[ORDER[i]] = mod9(b[ORDER[i-1]] + step);
  }
  return {
    NW:b.NW, N:b.N, NE:b.NE,
    W:b.W,  C:b.C, E:b.E,
    SW:b.SW, S:b.S, SE:b.SE
  };
}

/* ===== Badge block layout tweaks ===== */
// NOTE: CSS をJS内に直接書くと構文エラーで全体が止まるため、styleタグとして注入する
(function injectBadgeCss(){
  try{
    const css = `
      .badge-row-top{display:flex; gap:14px; flex-wrap:wrap; align-items:center;}
      .badge-item{white-space:nowrap;}
      .badge-row-bottom{margin-top:6px;}
      .dayCell.setsuiri{outline:2px solid rgba(255,182,193,0.8); border-radius:6px;}
            .etoMini{font-size:11px; line-height:1; opacity:.85; margin-top:2px;}
      `;
    const st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
  } catch(e){
    // ignore
  }
})();

// 初期起動
window.addEventListener('DOMContentLoaded', () => {
  try{ boot().catch(showBootError); }catch(e){ showBootError(e); }
});