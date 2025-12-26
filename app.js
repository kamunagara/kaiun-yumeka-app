
// グリッド配列（NW,N,NE,W,C,E,SW,S,SE）のindex→宮
const IDX_TO_PALACE = ["乾","坎","艮","兌","中","震","坤","離","巽"];

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

const detailDateEl = $("detailDate");
const refYearEl = $("refYear");
const refMonthEl = $("refMonth");
const dayPalaceEl = $("dayPalace");
const dayScoreEl = $("dayScore");
const dayBadEl = $("dayBad");
const monthBadEl = $("monthBad");
const oneLineEl = $("oneLine");
const memoEl = $("memo");

const dialog = $("dialog");
const dialogTitle = $("dialogTitle");
const dialogText = $("dialogText");
const closeDialog = $("closeDialog");

let data = null;
let currentMonth = "2026-01";
let currentHonmei = 1;

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
const DAY_BAD_BLUE    = "rgba(120, 200, 255, 0.28)";
const MONTH_BAD_GREEN = "rgba(170, 255, 170, 0.28)";
const YEAR_BAD_PURPLE = "rgba(170, 120, 255, 0.35)";

const PALACE_TO_DIR = { "坎":"N","艮":"NE","震":"E","巽":"SE","離":"S","坤":"SW","兌":"W","乾":"NW","中":"C" };

function pad2(n){ return String(n).padStart(2,"0"); }
function parseISO(iso){
  const [y,m,d] = iso.split("-").map(Number);
  return new Date(y, m-1, d);
}
function formatISO(dateObj){
  return `${dateObj.getFullYear()}-${pad2(dateObj.getMonth()+1)}-${pad2(dateObj.getDate())}`;
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
function formatYearMessageSimple(msg){
  const raw = String(msg || "");
  const keyword = (raw.match(/キーワード[「『"]([^」』"]+)[」』"]/) || [])[1] || "";

  const sentences = splitSentencesJa(raw).filter(s => !s.includes("キーワード"));
  const theme = sentences[0] || "";
  const rest = sentences.slice(1);

  // 2〜3行ぶん＝だいたい 2〜3文だけ表示（CSSで行数制限もかける）
  const preview = rest.slice(0, 3).join("。");

  return `
    <div class="yearMsg">
      ${theme ? `<div class="yearTheme"><strong>${escapeHtml(theme)}。</strong></div>` : ""}
      ${preview ? `<div class="yearPreview">${escapeHtml(preview)}${preview.endsWith("。") ? "" : "。"}${keyword ? `（キーワード：${escapeHtml(keyword)}）` : ""}</div>` : ""}
      <details class="yearMore">
        <summary>続きを読む</summary>
        <div class="yearFull">${escapeHtml(raw)}</div>
      </details>
    </div>
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
  return p ? (MONTH_PALACE_MESSAGES[p] || null) : null;
}

const DIR_LABEL_JP = {N:"北",NE:"北東",E:"東",SE:"東南",S:"南",SW:"南西",W:"西",NW:"北西",C:"中央"};

// 夢叶手帳：月運点数（本命星ごとに 1〜12月）
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
  return ensureYearGrid(hit);
}
function findMonthBlock(dateStr, monthKey){
  // ① idで直指定（range未入力でも拾える）
  if(monthKey){
    const direct = (data.monthBlocks || []).find(m => String(m.id) === String(monthKey));
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
function openDialog(title, text){
  dialogTitle.textContent = title;
  dialogText.textContent = text;
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

// ===== データ読み込み =====
async function loadHonmei(honmei){
  const embedded = document.getElementById("honmeiData");
  if (embedded && embedded.textContent.trim().startsWith("{")) {
    data = JSON.parse(embedded.textContent);
    return;
  }
  const url = `data/2026/honmei-${honmei}.json`;
  const res = await fetch(url);
  if(!res.ok) throw new Error(`データが読めません: ${url}`);
  data = await res.json();
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
  const mBlock = (Array.isArray(data?.monthBlocks)
      ? data.monthBlocks.find(b => String(b.id) === String(monthKey))
      : null)
    || findMonthBlock(monthAfterDate, monthKey);
  // 月盤マーク（暗剣殺/五黄殺/月破など）。データに無い場合でも落ちないように空オブジェクト。
  const monthMarks = (mBlock && mBlock.board && mBlock.board.marks) ? mBlock.board.marks : {};
  const yBlock = findYearBlock(monthAfterDate);


  const yGridRaw = yBlock?.board?.grid || null;
  const mGridRaw = mBlock?.board?.grid || null;
  // 盤の巡りはデータファイルの grid をそのまま使う（表示順：左上SE→上S→右上SW→左E→中C→右W→左下NE→下N→右下NW）
  const yGrid = yGridRaw;
  const mGrid = mGridRaw;

  const yearTitle = `年盤（${yBlock?.id ?? "—"}年）（${jpDate(yBlock?.range?.end ?? "2026-02-03")}まで）`;
  const monthLabelRaw = (mBlock?.label ?? "—");
  const monthLabel = monthLabelRaw.replace(/（節入り）/g, "");
  const monthTitle = `月盤（${monthLabel}）`;
// 年盤の紫（五黄殺・暗剣殺）は「方位キー」にして boardSvg へ渡す
    // 五黄殺/暗剣殺（年盤・月盤）は grid の中の「5」とその向かいで決める（marks は使わない）
  const yBoardObj = gridToBoardObj(yGrid);
  const yearGohDir = findDirOfStar(yBoardObj, 5);
  const yearAnkenDir = oppositeDir(yearGohDir);

  const mBoardObjForBad = gridToBoardObj(mGrid);
  const monthGohDir = findDirOfStar(mBoardObjForBad, 5);
  const monthAnkenDir = oppositeDir(monthGohDir);


  // 表示用（本命星×月）点数＆運名：データが無い月はここで自動補完
  const honmei = Number(honmeiSelect?.value || 1);
  const yearLuckLabel  = (yBlock?.fortuneName ?? "") || getLuckLabelFromGrid(yGrid, honmei);
  const yearScoreVal   = (yBlock?.score ?? "");
  const monthLuckLabel = (mBlock?.fortuneName ?? "") || (mGrid ? getLuckLabelFromGrid(mGrid, honmei) : "") || "";
  const monthScoreVal  = (mBlock?.score ?? "") || (getMonthUneiScore(honmei, mm) ?? "");

  // 月盤ヘッダ用バッジ（ア=暗剣殺 / 破=月破 / 天=天道 / 吉=吉神）
  // 暗剣殺は月盤の marks から（無ければ表示用 mGrid から自動算出）
  const monthMarksCalc = (mGrid && (!monthMarks || Object.keys(monthMarks).length === 0))
    ? calcGohAnkenFromGrid(mGrid)
    : (monthMarks || {});
  
  // ■ 月盤カード右上：バッジ（暗剣殺／五黄殺／月破(haType)／天道／吉神）
  // ※ まずは MONTH_BADGE_DATA_2026 に入力したものだけを表示（未入力月は何も表示しない）

// 月盤カード右上：暗剣殺/五黄殺/月破/天道/吉神（本命星の宮にかかるものだけ表示）
const badges = [];
// 本命星が今月どの宮にいるか
  const mBoardObjMsg = gridToBoardObj(mGrid);
  const honmeiDir = findDirOfStar(mBoardObjMsg, currentHonmei);
  const honmeiPal = honmeiDir ? DIR_TO_PALACE[honmeiDir] : null;

// ===== 宮メッセージ & 吉方位（表示）=====
const mMsg = getMonthPalaceMessage(honmeiPal);

// データ側（honmei-*.json）の kichiDirs を表示（未入力なら "—"）
const kichiDirs = Array.isArray(mBlock?.kichiDirs) ? mBlock.kichiDirs : [];
const kichiText = kichiDirs.map(d => DIR_LABEL_JP[d] || d).join("・");



// データ：monthBlocks優先。無ければ MONTH_BADGE_DATA_2026 を参照（入力していれば使える）
const meta2 = (MONTH_BADGE_DATA_2026 && MONTH_BADGE_DATA_2026[monthKey]) ? MONTH_BADGE_DATA_2026[monthKey] : {};

// データ側の表記ゆれ対策（全角/半角スペース・「○○宮」表記）
// marks が無い月でも、grid から五黄殺/暗剣殺を自動算出してバッジ判定に使う
const mMarksRaw = (mBlock?.board?.marks ?? meta2?.marks ?? {});
const mMarksAuto = (mGrid ? calcGohAnkenFromGrid(mGrid) : {});
const mMarks = {
  ankensatsuPalace: normPalace(mMarksRaw.ankensatsuPalace || mMarksAuto.ankensatsuPalace),
  gohosatsuPalace:  normPalace(mMarksRaw.gohosatsuPalace  || mMarksAuto.gohosatsuPalace),
  haType: (mMarksRaw.haType==null? null : String(mMarksRaw.haType).trim()),
  haPalace: normPalace(mMarksRaw.haPalace),
};

const tendoArr = Array.isArray(mBlock?.tendo) ? mBlock.tendo
               : (Array.isArray(meta2?.tendo) ? meta2.tendo : []);
const goodArr  = Array.isArray(mBlock?.goodGods) ? mBlock.goodGods
               : (Array.isArray(meta2?.goodGods) ? meta2.goodGods : []);

const tendoP = tendoArr.map(normPalace).filter(Boolean);
const goodP  = goodArr.map(normPalace).filter(Boolean);

  // 五黄殺＝盤の中の「5」が入る宮、暗剣殺＝その向かいの宮（marks の値は使わない）
  const mBoardObj = gridToBoardObj(mGrid);
  const gohoDir = findDirOfStar(mBoardObj, 5);
  const ankenDir = oppositeDir(gohoDir);
  const gohoPal  = gohoDir  ? DIR_TO_PALACE[gohoDir]  : null;
  const ankenPal = ankenDir ? DIR_TO_PALACE[ankenDir] : null;
const haPal    = normPalace(mMarks?.haPalace);

if (honmeiPal && mMarks.ankensatsuPalace && mMarks.ankensatsuPalace === honmeiPal) badges.push("暗剣殺");
if (honmeiPal && mMarks.gohosatsuPalace && mMarks.gohosatsuPalace === honmeiPal)  badges.push("五黄殺");
if (honmeiPal && mMarks.haType === "月破" && mMarks.haPalace && mMarks.haPalace === honmeiPal) badges.push("月破");

if (honmeiPal && tendoP.includes(honmeiPal)) badges.push("天道");
if (honmeiPal && goodP.includes(honmeiPal))  badges.push("吉神");

const badgeText = badges.join("・");
const monthBadgesHtml = badgeText ? `${badgeText} ` : "";

console.log("[MONTH_BADGE]", currentMonth, { honmeiPal, tendoP, goodP, marks: mMarks });


  const yearHtml = `
    <div class="boardCard">
      <div class="boardCardHead">
        <div class="boardTitle">${yearTitle}</div>
        <div class="boardMeta">${yearLuckLabel} / ${yearScoreVal}</div>
      </div>
      <div class="boardBody">
        ${yGrid ? boardSvg(gridToBoardObj(yGrid), yearGohDir, yearAnkenDir, false, YEAR_BAD_PURPLE) : `<div class="boardText">※年盤データがありません</div>`}
        <div class="boardText">${formatYearMessageSimple(yBlock?.message ?? "")}</div>
      </div>
    </div>
  `;

  const monthHtml = `
    <div class="boardCard">
      <div class="boardCardHead">
        <div class="boardTitle">${monthTitle}</div>
        <div class="boardMeta">${monthBadgesHtml}${monthLuckLabel} / ${monthScoreVal}</div>
      </div>
      <div class="boardBody">
        ${mGrid ? boardSvg(gridToBoardObj(mGrid), monthGohDir, monthAnkenDir, false, MONTH_BAD_GREEN) : `<div class="boardText">※月盤データが見つかりません</div>`}
<div class="boardText">
  <div><b>テーマ：</b>${mMsg?.theme ?? (mBlock?.message?.theme ?? "")}</div>
  <div><b>今月の伸ばし方：</b>${(Array.isArray(mMsg?.good) ? mMsg.good.join("／") : (mBlock?.message?.good?.[0] ?? ""))}</div>
  <div><b>注意：</b>${mMsg?.caution ?? (mBlock?.message?.caution?.[0] ?? "")}</div>
  <div><b>開運アクション：</b>${mMsg?.action ?? (mBlock?.message?.action?.[0] ?? "")}</div>
  <div><b>吉方位：</b>${kichiText || "—"}</div>
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

  titleEl.textContent = `${yyyy}年${mm}月`;
  if(subtitleEl) subtitleEl.textContent = "";

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
    const monthBlock = findMonthBlock(dateStr);
    const monthMarks = monthBlock?.board?.marks || {};
    const monthGohDir   = monthMarks.gohosatsuPalace ? (PALACE_TO_DIR[monthMarks.gohosatsuPalace] || null) : null;
    const monthAnkenDir = monthMarks.ankensatsuPalace ? (PALACE_TO_DIR[monthMarks.ankensatsuPalace] || null) : null;

    const hasAn = dayWarnings.includes("暗剣殺");
    const hasHa = dayWarnings.includes("日破");
    const mark = hasAn ? "ア" : (hasHa ? "破" : "");

    const cell = document.createElement("div");
    cell.className = `dayCell state-${state}`;
    cell.innerHTML = `
      <div class="topRow">
        <div class="topLeft">
          <div class="dayNum">${d}</div>
          ${mark ? `<span class="kyoMini">${mark}</span>` : ``}
          <div class="stateBadge">${state}</div>
        </div>
        <div class="scoreNum">${dayScore}</div>
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
  calendarEl.classList.add("hidden");
  detailEl.classList.remove("hidden");

  const dayObj = (data?.days && data.days[dateStr]) ? data.days[dateStr] : {};
  const dObj = parseISO(dateStr);
  const board = makeNichiban2026(dObj);
  const palace = dayObj.palace ?? inferPalaceFromNichiban(board, Number(currentHonmei)) ?? "中";
  const inferred = inferDayWarningsFromNichiban(board, Number(currentHonmei));
  const nichihaPalace = getNichihaPalaceByDate(dObj);
  const hasNichiha = (palace && nichihaPalace && palace === nichihaPalace);
  const dayWarnings = Array.from(new Set([...(dayObj.dayWarnings ?? []), ...inferred, ...(hasNichiha ? ["日破"] : [])]));

  const dayScore = calcDayScore(palace, dayWarnings);
  const yb = findYearBlock(dateStr);
  const mb = findMonthBlock(dateStr);

  detailDateEl.textContent = dateStr;
  refYearEl.textContent = yb ? `${yb.fortuneName ?? ""}（${yb.score ?? ""}点）` : "—";
  refMonthEl.textContent = mb ? `${mb.fortuneName ?? ""}（${mb.score ?? ""}点）` : "—";

  dayPalaceEl.textContent = palace;
  dayScoreEl.textContent = String(dayScore);

  dayBadEl.textContent = (dayWarnings.length ? dayWarnings.join("・") : "なし");
  monthBadEl.textContent = "—";
  oneLineEl.textContent = pickOneLine(dateStr);

  memoEl.dataset.date = dateStr;
  memoEl.value = localStorage.getItem(memoKey(dateStr)) ?? "";
}

// ===== 起動 =====
async function boot(){
  currentHonmei = Number(honmeiSelect.value);
  currentMonth = monthInput.value;
  await loadHonmei(currentHonmei);
  renderMonth();
}
honmeiSelect?.addEventListener("change", () => boot().catch(showBootError));
monthInput?.addEventListener("change", () => {
  currentMonth = monthInput.value;
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

    // 優先：日盤（水色） > 月盤（薄緑）
    let fill = "transparent";
    if(isDayBad) fill = "rgba(135, 206, 250, 0.35)";
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