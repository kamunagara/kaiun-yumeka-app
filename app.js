const $ = (id) => document.getElementById(id);

const titleEl = $("title");
const subtitleEl = $("subtitle");
const calendarEl = $("calendar");
const detailEl = $("detail");
const topBoardsEl = $("topBoards");

const honmeiSelect = $("honmeiSelect");
const monthInput = $("monthInput");

const backBtn = $("backBtn");
const helpBtn = $("helpBtn"); // 画面上のボタンは残すが、説明は今は使わない

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

// 宮（八卦）→ 方位キー（SVG用）
const PALACE_TO_DIR = {
  "坎": "N",
  "艮": "NE",
  "震": "E",
  "巽": "SE",
  "離": "S",
  "坤": "SW",
  "兌": "W",
  "乾": "NW",
};

// 方位キー → 宮（八卦）
const DIR_TO_PALACE = {
  N: "坎",
  NE: "艮",
  E: "震",
  SE: "巽",
  S: "離",
  SW: "坤",
  W: "兌",
  NW: "乾",
  C: "中",
};

// ===== 年盤中宮星（立春基準・暫定）=====
const yearCenterStar = {
  2024: 3,
  2025: 2,
  2026: 1,
  2027: 9,
  2028: 8,
  2029: 7,
  2030: 6,
  2031: 5,
  2032: 4
};

// ===== 年盤生成（洛書ベースで回転）=====
function createYearBoard(year) {
  const center = yearCenterStar[year];
  if (!center) return null;

  // 洛書（5が中宮の基準配列）
  // grid の並び：左上→右下（上段=南側）を想定
  // [SE,S,SW, E,C,W, NE,N,NW]
  const loshu = [4,9,2,3,5,7,8,1,6];
  const diff = center - 5;

  const grid = loshu.map(n => {
    let v = n + diff;
    if (v > 9) v -= 9;
    if (v < 1) v += 9;
    return v;
  });

  return { center, grid, goh: "NE", anken: "SW" };
}

// 盤（N/NE/…/C）から指定の星がいる方位を返す
function findDirOfStar(board, star){
  const hit = Object.entries(board).find(([k,v]) => v === star);
  return hit ? hit[0] : null;
}

// 日盤から「その日の宮」を自動算出（本命星の位置）
function inferPalaceFromNichiban(board, honmei){
  const dir = findDirOfStar(board, honmei) || "C";
  return DIR_TO_PALACE[dir] || "中";
}

// 日盤から「注意日（暗剣殺）」を自動算出
function inferDayWarningsFromNichiban(board, honmei){
  const warnings = [];

  const honmeiDir = findDirOfStar(board, honmei);
  const gohDir    = findDirOfStar(board, 5);
  const ankenDir  = oppositeDir(gohDir);

  if (honmeiDir && ankenDir && honmeiDir === ankenDir) {
    warnings.push("暗剣殺");
  }
  return warnings;
}


// ===== 節入り日（2026年用）=====
const SETSUIRI_DAY = {
  1: 5,
  2: 4,
  3: 5,
  4: 5,
  5: 5,
  6: 6,
  7: 7,
  8: 7,
  9: 7,
  10: 8,
  11: 7,
  12: 7
};

// 指定年月の「節入り後の日付文字列」を返す
function getAfterSetsuiriDate(yyyy, mm){
  const d = SETSUIRI_DAY[mm] ?? 5;
  const mmStr = String(mm).padStart(2,"0");
  const ddStr = String(d).padStart(2,"0");
  return `${yyyy}-${mmStr}-${ddStr}`;
}


function calcDayScore(palace, dayWarnings = []) {
  let score = PALACE_BASE_SCORE[palace] ?? 50;

  const hasAn = dayWarnings.includes("暗剣殺");
  const hasHa = dayWarnings.includes("日破");

  if (hasAn) score -= 30;
  if (hasHa) score -= 15;

  // 最低点は 5点（5点未満にしない）
  if (score < 5) score = 5;

  return score;
}


function parseDate(s){ return new Date(s + "T00:00:00"); }
function inRange(dateStr, range){
  const d = parseDate(dateStr);
  const s = parseDate(range.start);
  const e = parseDate(range.end);
  return d >= s && d <= e;
}

function findYearBlock(dateStr){
  return data.yearBlocks.find(y => inRange(dateStr, y.range));
}
function findMonthBlock(dateStr){
  return data.monthBlocks.find(m => inRange(dateStr, m.range));
}

function daysInMonth(yyyy, mm){
  return new Date(yyyy, mm, 0).getDate(); // mm: 1-12
}

function memoKey(dateStr){
  return `memo:${currentHonmei}:${dateStr}`;
}

function openDialog(title, text){
  dialogTitle.textContent = title;
  dialogText.textContent = text;
  dialog.showModal();
}
closeDialog.addEventListener("click", () => dialog.close());

// 今は説明を出さない（ボタンは残しておく）
helpBtn?.addEventListener("click", () => {
  openDialog("ヘルプ", "準備中");
});

backBtn.addEventListener("click", () => {
  detailEl.classList.add("hidden");
  calendarEl.classList.remove("hidden");
});

memoEl.addEventListener("input", () => {
  const dateStr = memoEl.dataset.date;
  if(!dateStr) return;
  localStorage.setItem(memoKey(dateStr), memoEl.value);
});

async function loadHonmei(honmei){
  // file://でも動く（index.html 埋め込みがあれば優先）
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

function scoreSymbol(score){
  // ホーム画面：点数は「◎(60以上) / △(60未満)」の2段階
  if(typeof score !== "number") return "—";
  return score >= 60 ? "◎" : "△";
}

function dayState(dayScore, dayWarnings){
  // ルール
  // - 60点以上：行動日
  // - それ以外：整え日
  // - 暗剣殺（日盤） or 日破：注意日（優先）
  const hasAttention = (dayWarnings || []).some(w => w === "暗剣殺" || w === "日破");
  if(hasAttention) return "注意";
  return (typeof dayScore === "number" && dayScore >= 60) ? "行動" : "整え";
}

function renderMonth(){
  const [yyyyStr, mmStr] = currentMonth.split("-");
  const yyyy = Number(yyyyStr);
  const mm   = Number(mmStr);

  // ★ 月盤カードは「節入り後」を固定参照（例：2026-01 → 2026-01-05）
  const monthAfterDate  = getAfterSetsuiriDate(yyyy, mm);
  const monthBlockAfter = findMonthBlock(monthAfterDate);

  titleEl.textContent = `${yyyy}年${mm}月`;
  if(subtitleEl) subtitleEl.textContent = "";

  renderTopBoards();

  function renderTopBoards(){
    // 月盤（節入り後）
    const mBlock = monthBlockAfter;

    // 年盤：その「節入り後の日付」が属する年ブロック（=2025年でOK）
    const yBlock = findYearBlock(monthAfterDate);

    function jpDate(iso){
      const [y,m,d] = iso.split("-");
      return `${Number(y)}年${Number(m)}月${Number(d)}日`;
    }
    // ★ 年盤タイトルに「〜まで」を付ける
    const yearTitle = `年盤（${yBlock?.id ?? "—"}年）（${jpDate(yBlock?.range?.end ?? "2026-02-03")}まで）`;
    const monthTitle = `月盤（${mBlock?.label ?? "—"}）`;

    // 年運メッセージは短めに
    const shortText = (s, max=70) => {
      if(!s) return "";
      const one = String(s).replace(/\s+/g," ").trim();
      return one.length > max ? one.slice(0, max) + "…" : one;
    };

    // JSON の grid 配列を、SVG が期待する方位キーに変換（上=南の九星盤表示に合わせる）
    // grid の並び：左上→右下（上段=南側）を想定
    // [SE,S,SW, E,C,W, NE,N,NW]
    const toBoardObj = (grid) => ({
      SE: grid[0], S: grid[1], SW: grid[2],
      E:  grid[3], C: grid[4], W:  grid[5],
      NE: grid[6], N: grid[7], NW: grid[8],
    });

    // 宮 → 方位(dir) 変換（SVG用）
    const palaceToDir = {
      "坎": "N",
      "艮": "NE",
      "震": "E",
      "巽": "SE",
      "離": "S",
      "坤": "SW",
      "兌": "W",
      "乾": "NW",
    };

    const yGrid = yBlock?.board?.grid || null;

const yearBoard = createYearBoard(yBlock?.id);

const yearBoardSvg =
  yearBoard?.grid
    ? toBoardObj(yearBoard.grid)
    : null;

    const mGrid = mBlock?.board?.grid || null;

    const yearHtml = `
      <div class="boardCard">
        <div class="boardCardHead">
          <div class="boardTitle">${yearTitle}</div>
          <div class="boardMeta">${yBlock?.fortuneName ?? ""} / ${yBlock?.score ?? ""}</div>
        </div>
        <div class="boardBody">

       ${
  yearBoardSvg
    ? `
      <div class="yearBoard" style="--bad-fill: rgba(170, 130, 165, 0.75);">
        ${boardSvg(yearBoardSvg, "NE", "SW", false)}
      </div>
    `
    : `<div class="boardText">年盤データが生成できません</div>`
}


          <div class="boardText">${shortText(yBlock?.message ?? "", 70)}</div>
        </div>
      </div>
    `;

    // 月盤の凶方位（五黄殺・暗剣殺）を「方位キー」に変換（薄緑表示用）
    const monthMarks = mBlock?.board?.marks || {};
    const monthGohDir   = palaceToDir[monthMarks.gohosatsuPalace]   || null;
    const monthAnkenDir = palaceToDir[monthMarks.ankensatsuPalace] || null;

    const monthHtml = `
      <div class="boardCard">
        <div class="boardCardHead">
          <div class="boardTitle">${monthTitle}</div>
          <div class="boardMeta">${mBlock?.fortuneName ?? ""} / ${mBlock?.score ?? ""}</div>
        </div>
        <div class="boardBody">
          ${
            mGrid
              ? boardSvg(toBoardObj(mGrid), monthGohDir, monthAnkenDir, false)
              : `<div class="boardText">※月盤データが見つかりません</div>`
          }
          <div class="boardText">
            ${mBlock?.message?.good?.[0] ?? ""}<br>
            ${mBlock?.message?.caution?.[0] ?? ""}
          </div>
        </div>
      </div>
    `;

    topBoardsEl.innerHTML = yearHtml + monthHtml;
  }

  // ここから下は「日マス描画」なのでそのまま
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

// ===== 月曜始まり：月初の空白マスを入れる =====
const firstDate = new Date(yyyy, mm - 1, 1);
// getDay(): 日0 月1 火2 水3 木4 金5 土6
// 月曜始まりに変換（月=0, 火=1 ... 日=6）
const lead = (firstDate.getDay() + 6) % 7;

for(let i = 0; i < lead; i++){
  const empty = document.createElement("div");
  empty.className = "dayCell empty";
  calendarEl.appendChild(empty);
}


for (let d = 1; d <= maxDay; d++) {

  // ① 日付文字列
  const dateStr = `${yyyyStr}-${mmStr}-${String(d).padStart(2,"0")}`;

  // ② 日盤
  const dateObj = new Date(yyyy, mm - 1, d);
  const board = makeNichiban2026(dateObj);
  // ③ JSON（日データ）
  const dayObj = data.days[dateStr] ?? {};

  // ④ 自動判定
  const autoPalace   = inferPalaceFromNichiban(board, currentHonmei);
  const autoWarnings = inferDayWarningsFromNichiban(board, currentHonmei);

  // ⑤ JSON優先
  const palace      = dayObj.palace ?? autoPalace;
  const dayWarnings = dayObj.dayWarnings ?? autoWarnings;

  // ⑥ 点数・状態
  const dayScore = calcDayScore(palace, dayWarnings);
  const state    = dayState(dayScore, dayWarnings);

  const hasAn = dayWarnings.includes("暗剣殺");
  const hasHa = dayWarnings.includes("日破");

  // ★ 月盤の五黄殺・暗剣殺（薄緑表示用：その日の月盤から取得）
  const mBlock2 = findMonthBlock(dateStr);
  const mMarks2 = mBlock2?.board?.marks || {};
  const monthGohDir   = PALACE_TO_DIR[mMarks2.gohosatsuPalace] || null;
  const monthAnkenDir = PALACE_TO_DIR[mMarks2.ankensatsuPalace] || null;

  // ★★★★★ ⑦ ここで cell を作る（これが無いとエラー）
  const cell = document.createElement("div");
  cell.className = `dayCell state-${state}`;

  // ⑧ HTML を入れる
  cell.innerHTML = `
    <div class="topRow">
      <div class="topLeft">
        <div class="dayNum">${d}</div>
        ${hasAn ? `<span class="kyoMini">ア</span>` : ``}
        ${hasHa ? `<span class="kyoMini">破</span>` : ``}
        <div class="stateBadge">${state}</div>
      </div>
      <div class="scoreNum">${dayScore}</div>
    </div>

    <div class="oct-board">
      ${boardSvg(board, monthGohDir, monthAnkenDir)}
    </div>

    <div class="badRow">
      ${hasAn ? `<span class="badge blue">ア</span>` : ``}
      ${hasHa ? `<span class="badge blue">破</span>` : ``}
    </div>
  `;

  // ⑨ クリックイベント
  cell.addEventListener("click", () => openDetail(dateStr));

  // ⑩ カレンダーに追加
  calendarEl.appendChild(cell);
}

}

function pickOneLine(dateStr){
  // ひとこと：その日の月運ブロックの message を使う（詳細画面用）
  const dayObj = data.days[dateStr] ?? {};
  const monthBlock = findMonthBlock(dateStr);
// ★ 月盤の五黄殺・暗剣殺（盤表示専用）
const monthMarks = monthBlock?.board?.marks || {};
const monthGohDir   = PALACE_TO_DIR[monthMarks.gohosatsuPalace] || null;
const monthAnkenDir = PALACE_TO_DIR[monthMarks.ankensatsuPalace] || null;

  if(!monthBlock) return "";

  const hasBad = (dayObj.dayWarnings?.length || 0) > 0;
  const src = hasBad ? monthBlock.message?.caution : monthBlock.message?.good;
  return src?.[0] ?? "";
}

function openDetail(dateStr){
  calendarEl.classList.add("hidden");
  detailEl.classList.remove("hidden");

  const dayObj = data.days[dateStr] ?? { palace:"—", dayWarnings:[] };
  const yb = findYearBlock(dateStr);
  const mb = findMonthBlock(dateStr);

  // ★ 日点数を計算（由依ルール）
  const dayScore = calcDayScore(
    dayObj.palace ?? "中",
    dayObj.dayWarnings ?? []
  );


  detailDateEl.textContent = dateStr;
  refYearEl.textContent = yb ? `${yb.fortuneName}（${yb.score}点）` : "—";
  refMonthEl.textContent = mb ? `${mb.fortuneName}（${mb.score}点）` : "—";

  dayPalaceEl.textContent = dayObj.palace ?? "—";
dayScoreEl.textContent = String(dayScore);

  // 凶：日盤（暗剣殺・日破）のみ
  dayBadEl.textContent = (dayObj.dayWarnings?.length ? dayObj.dayWarnings.join("・") : "なし");

  // 月盤の五黄殺・暗剣殺・月破は非表示
  monthBadEl.textContent = "—";

  oneLineEl.textContent = pickOneLine(dateStr);

  memoEl.dataset.date = dateStr;
  memoEl.value = localStorage.getItem(memoKey(dateStr)) ?? "";
}

async function boot(){
  currentHonmei = Number(honmeiSelect.value);
  currentMonth = monthInput.value;

  await loadHonmei(currentHonmei);
  renderMonth();
}

honmeiSelect.addEventListener("change", boot);
monthInput.addEventListener("change", () => {
  currentMonth = monthInput.value;
  renderMonth();
});

boot().catch(err => {
  console.error(err);
  alert(err.message);
});

/* ===== 八角形ミニ日盤（SVG） ===== */

function boardSvg(b, monthGohPalace, monthAnkenPalace, showDayBad = true){
  // 外側八角形（頂点）
  const O = [
    [30, 6],[70, 6],[94, 30],[94, 70],[70, 94],[30, 94],[6, 70],[6, 30],
  ];

  // 内側八角形（頂点）※中心の小八角形
  const I = [
    [44, 32],[56, 32],[68, 44],[68, 56],[56, 68],[44, 68],[32, 56],[32, 44],
  ];

  // ===== 日盤（水色）：五黄殺=「数字5がいる方位」 / 暗剣殺=反対 =====
  const gohDir   = findDirOfNumber(b, 5);
  const ankenDir = oppositeDir(gohDir);

  // 台形のインデックス → 方位（上から時計回り）
  const dirByIdx = ["N","NE","E","SE","S","SW","W","NW"];

  // ===== 月盤（薄緑）：宮 → 台形インデックス（同じ並び） =====
  // ※ここは「盤の向き（上=南）」に合わせた対応
  const palaceToSeg = {
    "離": 0, // 南（上）
    "坤": 1,
    "兌": 2,
    "乾": 3,
    "坎": 4,
    "艮": 5,
    "震": 6,
    "巽": 7
  };

  const monthGohSeg   = monthGohPalace   ? palaceToSeg[monthGohPalace]   : null;
  const monthAnkenSeg = monthAnkenPalace ? palaceToSeg[monthAnkenPalace] : null;

function trapezoid(i, extraClass){
  const i2 = (i + 1) % 8;

  const dirByIdx = ["N","NE","E","SE","S","SW","W","NW"];
  const dir = dirByIdx[i];

  const isMonthBad = (dir === monthGohPalace) || (dir === monthAnkenPalace);
  const isDayBad   = showDayBad && ((dir === gohDir) || (dir === ankenDir));

  // 優先：日盤（水色） > 月盤（薄緑） > なし
  let fill = "transparent";
  if (isDayBad) {
    fill = "rgba(135, 206, 250, 0.35)";      // 水色
  } else if (isMonthBad) {
   fill = "var(--bad-fill, rgba(180, 235, 180, 0.35))";
   // 薄緑
  }

  const cls = `trap${extraClass ? " " + extraClass : ""}`;
  return `<polygon class="${cls}"
    style="fill:${fill}"
    points="${I[i][0]},${I[i][1]} ${I[i2][0]},${I[i2][1]} ${O[i2][0]},${O[i2][1]} ${O[i][0]},${O[i][1]}" />`;
}


  function seg(a, c){
    return `<line x1="${a[0]}" y1="${a[1]}" x2="${c[0]}" y2="${c[1]}"
      stroke="#111111" stroke-width="2" />`;
  }

  return `
  <svg class="oct-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">

    <!-- 外枠 -->
    <path d="M${O[0][0]} ${O[0][1]} L${O[1][0]} ${O[1][1]} L${O[2][0]} ${O[2][1]} L${O[3][0]} ${O[3][1]}
             L${O[4][0]} ${O[4][1]} L${O[5][0]} ${O[5][1]} L${O[6][0]} ${O[6][1]} L${O[7][0]} ${O[7][1]} Z"
          fill="#ffffff" stroke="#111111" stroke-width="2.2" />

    <!-- 8つの台形（塗り：日盤水色 / 月盤薄緑） -->
    ${trapezoid(0)}${trapezoid(1)}${trapezoid(2)}${trapezoid(3)}
    ${trapezoid(4)}${trapezoid(5)}${trapezoid(6)}${trapezoid(7)}

    <!-- 内側八角形（線） -->
    <path d="M${I[0][0]} ${I[0][1]} L${I[1][0]} ${I[1][1]} L${I[2][0]} ${I[2][1]} L${I[3][0]} ${I[3][1]}
             L${I[4][0]} ${I[4][1]} L${I[5][0]} ${I[5][1]} L${I[6][0]} ${I[6][1]} L${I[7][0]} ${I[7][1]} Z"
          fill="none" stroke="#111111" stroke-width="2" />

    <!-- 分割線（内側→外側） -->
    ${seg(I[0], O[0])}${seg(I[1], O[1])}${seg(I[2], O[2])}${seg(I[3], O[3])}
    ${seg(I[4], O[4])}${seg(I[5], O[5])}${seg(I[6], O[6])}${seg(I[7], O[7])}

    <!-- 数字（九星気学の向き：上=南、下=北、左=東、右=西） -->
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

// ===== boardSvg 用のヘルパー（もし既にあるなら二重定義しないでOK） =====
function findDirOfNumber(board, num){
  const entries = Object.entries(board).filter(([k]) => k !== "C");
  const hit = entries.find(([,v]) => v === num);
  return hit ? hit[0] : null;
}
function oppositeDir(dir){
  const opp = { N:"S", NE:"SW", E:"W", SE:"NW", S:"N", SW:"NE", W:"E", NW:"SE" };
  return opp[dir] ?? null;
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
