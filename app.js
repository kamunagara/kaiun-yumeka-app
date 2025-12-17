const $ = (id) => document.getElementById(id);

const titleEl = $("title");
const subtitleEl = $("subtitle");
const calendarEl = $("calendar");
const detailEl = $("detail");

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

helpBtn.addEventListener("click", () => {
  openDialog(
    "節入りについて",
    "表示の月（1月1日〜31日）は通常のカレンダーです。運勢は節入りで切り替わります。例：1/1〜1/4は前月運、1/5から当月運です。年運も同様に2/3まで前年運、2/4から当年運になります。"
  );
});

document.querySelectorAll(".pill").forEach(btn => {
  btn.addEventListener("click", () => {
    const kind = btn.dataset.pop;
    if(kind === "ha"){
      openDialog("破（守破離の破）", "「破」は壊れるではなく、型を卒業して更新する合図です。運勢が良い時は更新のチャンス、低い時は調整と守りが吉。");
    }
    if(kind === "an"){
      openDialog("暗剣殺（ア）", "予想外の流れが出やすい配置。運勢が良い時は卒業・手放し、低い時は慎重に。");
    }
    if(kind === "go"){
      openDialog("五黄殺（5）", "中心の気が乱れやすい配置。立て直し・再スタートの合図。原点回帰が吉。");
    }
  });
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
 // まず index.html に埋め込んだJSONがあればそれを使う（file://でも動く）
  const embedded = document.getElementById("honmeiData");
  if (embedded && embedded.textContent.trim().startsWith("{")) {
    data = JSON.parse(embedded.textContent);
    return;
  }

  // 埋め込みが無い場合だけ、従来どおり fetch
  const url = `data/2026/honmei-${honmei}.json`;
  const res = await fetch(url);
  if(!res.ok) throw new Error(`データが読めません: ${url}`);
  data = await res.json();  
}

function renderMonth(){
  const [yyyyStr, mmStr] = currentMonth.split("-");
  const yyyy = Number(yyyyStr);
  const mm = Number(mmStr);

  titleEl.textContent = `${yyyy}年${mm}月`;
  calendarEl.innerHTML = "";

  // 1日〜末日
  const maxDay = daysInMonth(yyyy, mm);

  for(let d=1; d<=maxDay; d++){
    const dateStr = `${yyyyStr}-${mmStr}-${String(d).padStart(2,"0")}`;
    const dayObj = data.days[dateStr];

    // データが無い日は「日情報なし」でも表示はする（あとで埋められる）
    const palace = dayObj?.palace ?? "—";
    const monthBlock = findMonthBlock(dateStr);
    const score = monthBlock?.score ?? "—";

    // サブタイトル：月運の切替案内（1回だけ表示）
    if(d === 1){
      const m1 = findMonthBlock(`${yyyyStr}-${mmStr}-01`);
      const m5 = findMonthBlock(`${yyyyStr}-${mmStr}-05`);
      subtitleEl.textContent =
        `運勢は節入りで切替：1/1〜は「${m1?.label ?? "—"}」、1/5〜は「${m5?.label ?? "—"}」`;
    }

    // ★ 2026年：日盤（八角形）表示
    const dateObj = new Date(yyyy, mm - 1, d);
    const board = makeNichiban2026(dateObj);

    const cell = document.createElement("div");
    cell.className = "dayCell";
    cell.innerHTML = `
      <div class="dayNum">${d}</div>
      <div class="oct-board">${boardSvg(board)}</div>
      <div class="meta">日盤宮：${palace}　月運：${score}</div>
      <div class="marks"></div>
    `;

    // マーク
    const marksEl = cell.querySelector(".marks");
    const dayWarnings = dayObj?.dayWarnings ?? [];
    const monthWarnings = dayObj?.monthWarnings ?? [];

    // 青（日）
    dayWarnings.forEach(w => {
      const badge = document.createElement("span");
      badge.className = "badge blue";
      badge.textContent = w === "暗剣殺" ? "ア" : "破";
      marksEl.appendChild(badge);
    });

    // 緑（月）
    monthWarnings.forEach(w => {
      const badge = document.createElement("span");
      badge.className = "badge green";
      badge.textContent = w === "暗剣殺" ? "ア" : "5";
      marksEl.appendChild(badge);
    });

    cell.addEventListener("click", () => openDetail(dateStr));
    calendarEl.appendChild(cell);
  }
}


function pickOneLine(dateStr){
  const dayObj = data.days[dateStr];
  const monthBlock = findMonthBlock(dateStr);
  if(!monthBlock) return "";

  const hasBad = (dayObj?.dayWarnings?.length || 0) + (dayObj?.monthWarnings?.length || 0) > 0;

  const src = hasBad ? monthBlock.message.caution : monthBlock.message.good;
  // 先頭を1つ返す（後でランダムにもできる）
  return src?.[0] ?? "";
}

function openDetail(dateStr){
  calendarEl.classList.add("hidden");
  detailEl.classList.remove("hidden");

  const dayObj = data.days[dateStr] ?? { palace:"—", dayWarnings:[], monthWarnings:[] };
  const yb = findYearBlock(dateStr);
  const mb = findMonthBlock(dateStr);

  detailDateEl.textContent = dateStr;
  refYearEl.textContent = yb ? `${yb.fortuneName}（${yb.score}点）` : "—";
  refMonthEl.textContent = mb ? `${mb.fortuneName}（${mb.score}点）` : "—";

  dayPalaceEl.textContent = dayObj.palace ?? "—";
  dayScoreEl.textContent = mb?.score ?? "—";

  dayBadEl.textContent = (dayObj.dayWarnings?.length ? dayObj.dayWarnings.join("・") : "なし");
  monthBadEl.textContent = (dayObj.monthWarnings?.length ? dayObj.monthWarnings.join("・") : "なし");

  oneLineEl.textContent = pickOneLine(dateStr);

  // メモ
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

// 初期起動
boot().catch(err => {
  console.error(err);
  alert(err.message);
});


function boardSvg(b){
  // b: {NW,N,NE,W,C,E,SW,S,SE} numbers
  // 八角形のミニ盤をSVGで返す（文字が薄くならないように明示色）
  return `
  <svg class="oct-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
    <!-- octagon background -->
    <path d="M30 6 L70 6 L94 30 L94 70 L70 94 L30 94 L6 70 L6 30 Z"
          fill="#ffffff" opacity="0.96" stroke="#cfd8e3" stroke-width="2"/>
    <!-- subtle inner -->
    <path d="M30 10 L70 10 L90 30 L90 70 L70 90 L30 90 L10 70 L10 30 Z"
          fill="none" stroke="#e5e7eb" stroke-width="1"/>

    ${svgCell(25,25,b.NW)}
    ${svgCell(50,18,b.N)}
    ${svgCell(75,25,b.NE)}
    ${svgCell(18,50,b.W)}
    ${svgCell(50,50,b.C,true)}
    ${svgCell(82,50,b.E)}
    ${svgCell(25,75,b.SW)}
    ${svgCell(50,82,b.S)}
    ${svgCell(75,75,b.SE)}
  </svg>`;
}

function svgCell(x,y,val,isCenter=false){
  const size = 18;
  const rx = 4;
  const stroke = isCenter ? "#b8860b" : "#cfd8e3";
  const sw = isCenter ? 2 : 1.2;
  const fill = isCenter ? "#fff7e0" : "#ffffff";
  const textFill = "#111827";
  return `
    <g>
      <rect x="${x - size/2}" y="${y - size/2}" width="${size}" height="${size}" rx="${rx}"
            fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>
      <text x="${x}" y="${y+4}" text-anchor="middle" font-size="11" font-weight="${isCenter?800:700}"
            fill="${textFill}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">${val}</text>
    </g>`;
}


/* ========= 日盤計算（2026年専用）ここから ========= */

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

// 飛泊順
const ORDER = ["C","NW","W","NE","S","N","SW","E","SE"];

// ミニ日盤（3×3）
function makeNichiban2026(date){
  const d = new Date(date); d.setHours(0,0,0,0);
  const center = centerStar2026(d);

  const isYin =
    d >= new Date(2026,5,19) && d <= new Date(2026,11,15);

  const step = isYin ? -1 : +1;

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

/* ========= 日盤計算 ここまで ========= */

