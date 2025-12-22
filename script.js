// 初期化
const dateInput = document.getElementById('date-input');
dateInput.valueAsDate = new Date();

// イベントリスト（流星群など）
const ASTRO_EVENTS = [
    { name: "しぶんぎ座流星群", startMonth: 1, startDay: 1, endMonth: 1, endDay: 7, peak: "21:00〜明け方" },
    { name: "こと座流星群", startMonth: 4, startDay: 16, endMonth: 4, endDay: 25, peak: "23:00〜明け方" },
    { name: "ペルセウス座流星群", startMonth: 7, startDay: 17, endMonth: 8, endDay: 24, peak: "22:00〜明け方" },
    { name: "ふたご座流星群", startMonth: 12, startDay: 4, endMonth: 12, endDay: 17, peak: "20:00〜明け方" },
    { name: "こぐま座流星群", startMonth: 12, startDay: 17, endMonth: 12, endDay: 26, peak: "21:00〜24:00" }
];

function checkAstroEvents(dateStr) {
    const d = new Date(dateStr);
    const m = d.getMonth() + 1;
    const day = d.getDate();
    
    const event = ASTRO_EVENTS.find(e => 
        (m === e.startMonth && day >= e.startDay) && (m === e.endMonth && day <= e.endDay)
    );

    const banner = document.getElementById('event-text');
    if (event) {
        banner.innerText = `【注目】今日は${event.name}が${event.peak}ごろから流れやすくなります！`;
    } else {
        banner.innerText = "特筆すべき流星群等のイベントはありません。深宇宙撮影に集中しましょう。";
    }
}

function toggleMode() {
    const isNormal = document.body.classList.toggle('normal-mode');
    const btn = document.querySelector('.mode-toggle-btn');
    btn.innerText = isNormal ? "SWITCH TO RED MODE" : "SWITCH TO NORMAL MODE";
}

async function startAnalysis() {
    const sel = document.getElementById('location-select');
    if (!sel.value) return alert("場所を選択してください");
    
    const [lat, lon] = sel.value.split(',').map(Number);
    const elev = Number(sel.options[sel.selectedIndex].dataset.elevation);
    const bortle = Number(sel.options[sel.selectedIndex].dataset.bortle);
    const date = dateInput.value;

    checkAstroEvents(date);
    await executeEngine(lat, lon, elev, bortle, date);
}

async function executeEngine(lat, lon, elev, bortle, date) {
    document.getElementById('slm-output').innerText = "衛星データをシミュレート中...";
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&elevation=${elev}&hourly=cloud_cover,relative_humidity_2m,temperature_2m,dewpoint_2m,windspeed_250hPa&start_date=${date}&end_date=${date}&timezone=auto`;

    try {
        const res = await fetch(url);
        const data = await res.json();
        const best = findBestNight(data, lat, lon, bortle);
        render(best);
    } catch (e) {
        document.getElementById('slm-output').innerText = "API Error: " + e.message;
    }
}

function findBestNight(data, lat, lon, bortle) {
    let best = { score: -1 };
    data.hourly.time.forEach((t, i) => {
        const d = new Date(t);
        const sun = SunCalc.getPosition(d, lat, lon);
        if (sun.altitude > -0.314) return; // 天文薄明外のみ

        const p = {
            cloud: data.hourly.cloud_cover[i],
            dewGap: data.hourly.temperature_2m[i] - data.hourly.dewpoint_2m[i],
            wind: data.hourly.windspeed_250hPa[i],
            moon: SunCalc.getMoonPosition(d, lat, lon),
            moonIllum: SunCalc.getMoonIllumination(d)
        };

        // スコア計算ロジック
        let s = 100;
        s -= Math.pow(p.cloud / 4.2, 2.5);
        if (p.moon.altitude > 0) s -= Math.pow(p.moonIllum.fraction, 3) * 85;
        if (p.wind > 22) s -= (p.wind - 22) * 1.4;
        if (p.dewGap < 2.5) s -= 35;
        s -= Math.pow(bortle, 1.6);

        const finalScore = Math.max(0, Math.round(s));
        if (finalScore > best.score) best = { score: finalScore, p, t };
    });
    return best;
}

function render(res) {
    if (res.score === -1) {
        document.getElementById('slm-output').innerText = "指定日は天文薄明が発生しません。";
        return;
    }
    document.getElementById('score-value').innerText = res.score;
    document.getElementById('gauge').style.background = `conic-gradient(var(--accent) ${res.score * 3.6}deg, #111 0deg)`;
    document.getElementById('val-cloud').innerText = res.p.cloud;
    document.getElementById('val-wind').innerText = Math.round(res.p.wind);
    document.getElementById('val-dew').innerText = res.p.dewGap.toFixed(1);
    document.getElementById('val-moon').innerText = res.p.moon.altitude > 0 ? (res.p.moonIllum.fraction * 100).toFixed(0) + "%" : "沈";
    
    document.getElementById('slm-output').innerText = res.score > 75 ? "【神】最高のコンディションです。" : "【厳】条件はシビアです。";
}

// 初回チェック
checkAstroEvents(dateInput.value);
