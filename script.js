const API_BASE = "https://api.open-meteo.com/v1/forecast";
const STORAGE_KEY = "asfProV3";
const WINDOW_THRESHOLD = 65;

const dateInput = document.getElementById("date-input");
const locationSelect = document.getElementById("location-select");
const bortleSelect = document.getElementById("bortle-select");
const targetSelect = document.getElementById("target-select");

const TARGETS = {
    m31: {
        name: "アンドロメダ銀河 M31",
        description: "広がった銀河。月離角と天体高度を重視。",
        type: "DSO",
        ra: 10.6847,
        dec: 41.2688,
        minAlt: 25
    },
    m42: {
        name: "オリオン大星雲 M42",
        description: "明るい散光星雲。高度が十分に上がる時間を優先。",
        type: "DSO",
        ra: 83.8221,
        dec: -5.3911,
        minAlt: 25
    },
    ngc7000: {
        name: "北アメリカ星雲 NGC 7000",
        description: "広角向きの散光星雲。高高度かつ月の影響が少ない時間を優先。",
        type: "DSO",
        ra: 314.7283,
        dec: 44.525,
        minAlt: 25
    },
    mw: {
        name: "天の川中心付近",
        description: "銀河中心方向。低高度になりやすいため、高度と月離角を強く評価。",
        type: "MILKY WAY",
        ra: 266.4167,
        dec: -29.0078,
        minAlt: 20
    },
    moon: {
        name: "月",
        description: "月面撮影。月高度と天候を中心に評価。月明かりは減点しません。",
        type: "LUNAR",
        ra: null,
        dec: null,
        minAlt: 15
    }
};

function isoDateLocal(date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function initDateLimits() {
    const now = new Date();
    dateInput.value = isoDateLocal(now);
    dateInput.min = isoDateLocal(now);
    const max = new Date(now);
    max.setDate(max.getDate() + 15);
    dateInput.max = isoDateLocal(max);
}

function restoreSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
        if (saved.bortle) bortleSelect.value = String(saved.bortle);
        if (saved.target && TARGETS[saved.target]) targetSelect.value = saved.target;
        if (Number.isFinite(saved.lat) && Number.isFinite(saved.lon)) {
            upsertCustomLocation(saved.lat, saved.lon, saved.bortle || bortleSelect.value);
        } else if (saved.location) {
            const opt = [...locationSelect.options].find(o => o.value === saved.location);
            if (opt) opt.selected = true;
        }
        updateTargetCard();
    } catch (_) {
        updateTargetCard();
    }
}

function saveSettings(lat, lon, bortle, target) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        lat, lon, bortle, target,
        updatedAt: new Date().toISOString()
    }));
}

function upsertCustomLocation(lat, lon, bortle) {
    const value = lat.toFixed(3) + "," + lon.toFixed(3);
    let opt = [...locationSelect.options].find(o => o.value === value);
    if (!opt) {
        opt = document.createElement("option");
        opt.value = value;
        opt.dataset.gps = "true";
        locationSelect.add(opt);
    }
    opt.textContent = "現在地 (" + lat.toFixed(3) + ", " + lon.toFixed(3) + ")";
    opt.setAttribute("data-bortle", String(bortle));
    opt.selected = true;
    return opt;
}

function parseForecastDate(timeString, utcOffsetSeconds) {
    const base = Date.parse(String(timeString) + "Z");
    if (Number.isNaN(base)) return new Date(timeString);
    return new Date(base - (safeNum(utcOffsetSeconds, 0) * 1000));
}

function localClock(timeString) {
    return timeString && timeString.includes("T") ? timeString.slice(11, 16) : "--:--";
}

function nextClock(timeString, hours) {
    const parts = localClock(timeString).split(":").map(Number);
    if (parts.length !== 2 || parts.some(Number.isNaN)) return "--:--";
    let mins = parts[0] * 60 + parts[1] + hours * 60;
    mins = ((mins % 1440) + 1440) % 1440;
    return String(Math.floor(mins / 60)).padStart(2, "0") + ":" + String(mins % 60).padStart(2, "0");
}

function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}

function safeNum(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : (fallback == null ? 0 : fallback);
}

function degToRad(v) { return v * Math.PI / 180; }
function radToDeg(v) { return v * 180 / Math.PI; }
function normalizeDeg(v) { return ((v % 360) + 360) % 360; }

function julianDay(date) {
    return date.getTime() / 86400000 + 2440587.5;
}

function localSiderealDeg(date, lonDeg) {
    const jd = julianDay(date);
    const t = (jd - 2451545.0) / 36525;
    const gmst = 280.46061837 +
        360.98564736629 * (jd - 2451545.0) +
        0.000387933 * t * t -
        (t * t * t) / 38710000;
    return normalizeDeg(gmst + lonDeg);
}

function equatorialToHorizontal(raDeg, decDeg, date, latDeg, lonDeg) {
    const lst = localSiderealDeg(date, lonDeg);
    const ha = normalizeDeg(lst - raDeg);
    const h = ha > 180 ? ha - 360 : ha;
    const lat = degToRad(latDeg);
    const dec = degToRad(decDeg);
    const hourAngle = degToRad(h);

    const sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle);
    const altitude = Math.asin(clamp(sinAlt, -1, 1));
    const azimuth = Math.atan2(
        -Math.sin(hourAngle),
        Math.tan(dec) * Math.cos(lat) - Math.sin(lat) * Math.cos(hourAngle)
    );

    return {
        altitude: radToDeg(altitude),
        azimuth: normalizeDeg(radToDeg(azimuth))
    };
}

function horizontalSeparation(a, b) {
    const a1 = degToRad(a.altitude);
    const b1 = degToRad(b.altitude);
    const deltaAz = degToRad(a.azimuth - b.azimuth);
    const cosSep = Math.sin(a1) * Math.sin(b1) +
        Math.cos(a1) * Math.cos(b1) * Math.cos(deltaAz);
    return radToDeg(Math.acos(clamp(cosSep, -1, 1)));
}

function targetPosition(target, date, lat, lon) {
    if (target.key === "moon") {
        const moon = SunCalc.getMoonPosition(date, lat, lon);
        return {
            altitude: radToDeg(moon.altitude),
            azimuth: normalizeDeg(radToDeg(moon.azimuth))
        };
    }
    return equatorialToHorizontal(target.ra, target.dec, date, lat, lon);
}

function altitudeScore(altitude, minAlt, type) {
    if (altitude < minAlt) return -clamp((minAlt - altitude) * 2.2, 0, 50);
    if (altitude >= 55 && altitude <= 78) return 8;
    if (altitude > 30) return 4;
    if (altitude >= 15) return -2;
    return -12;
}

function moonImpact(target, p) {
    if (target.type === "LUNAR") return 0;
    if (p.moon.altitude <= 0 || p.moonIllum < 0.03) return 0;
    const moonVisible = clamp(Math.sin(degToRad(p.moon.altitude)), 0, 1);
    const illum = p.moonIllum;
    const separation = p.separation;
    let sepFactor = 0;
    if (separation < 30) sepFactor = 1;
    else if (separation < 60) sepFactor = 0.65;
    else if (separation < 90) sepFactor = 0.3;
    else sepFactor = 0.08;
    return illum * moonVisible * sepFactor * 28;
}

function classifyReason(p, target) {
    if (target.type !== "LUNAR" && p.targetAltitude < target.minAlt) return "天体高度";
    if (p.cloud >= 55 || p.cloudLow >= 45) return "雲";
    if (p.rainProb >= 45 || p.precip >= 0.5) return "降水";
    if (p.separation < 35 && p.moon.altitude > 0 && p.moonIllum > 0.2) return "月明かり";
    if (p.windHigh > 45) return "上空風";
    if (p.dewGap < 2.5) return "結露";
    if (p.visibility < 10000) return "視程";
    return "条件";
}

function scoreHour(data, i, lat, lon, bortle, target, utcOffsetSeconds) {
    const timeString = data.time[i];
    const date = parseForecastDate(timeString, utcOffsetSeconds);
    const sun = SunCalc.getPosition(date, lat, lon);
    const solarAltitude = radToDeg(sun.altitude);

    if (solarAltitude > -18) return null;

    const moonRaw = SunCalc.getMoonPosition(date, lat, lon);
    const positionedTarget = Object.assign({ key: target.key }, targetPosition(target, date, lat, lon));
    const p = {
        cloud: safeNum(data.cloud_cover?.[i], 100),
        cloudLow: safeNum(data.cloud_cover_low?.[i], safeNum(data.cloud_cover?.[i], 100)),
        cloudMid: safeNum(data.cloud_cover_mid?.[i], safeNum(data.cloud_cover?.[i], 100)),
        cloudHigh: safeNum(data.cloud_cover_high?.[i], safeNum(data.cloud_cover?.[i], 100)),
        rainProb: safeNum(data.precipitation_probability?.[i], 0),
        precip: safeNum(data.precipitation?.[i], 0),
        humid: safeNum(data.relativehumidity_2m?.[i], 80),
        dewPoint: safeNum(data.dewpoint_2m?.[i], 0),
        temp: safeNum(data.temperature_2m?.[i], 0),
        windHigh: safeNum(data.windspeed_250hPa?.[i], 0),
        windLow: safeNum(data.windspeed_10m?.[i], 0),
        gust: safeNum(data.windgusts_10m?.[i], 0),
        visibility: safeNum(data.visibility?.[i], 20000),
        pressure: safeNum(data.surface_pressure?.[i], 0),
        moon: {
            altitude: radToDeg(moonRaw.altitude),
            azimuth: normalizeDeg(radToDeg(moonRaw.azimuth))
        },
        moonIllum: SunCalc.getMoonIllumination(date).fraction,
        targetAltitude: positionedTarget.altitude,
        targetAzimuth: positionedTarget.azimuth
    };
    p.separation = horizontalSeparation({ altitude: p.targetAltitude, azimuth: p.targetAzimuth }, p.moon);
    p.dewGap = p.temp - p.dewPoint;

    let score = 100;
    score -= (bortle - 1) * 3.5;

    score -= p.cloudLow * 0.22 + p.cloudMid * 0.11 + p.cloudHigh * 0.05;
    score -= p.rainProb * 0.18;
    score -= clamp(p.precip, 0, 3) * 5;
    if (p.visibility < 20000) score -= clamp((20000 - p.visibility) / 1000, 0, 15) * 0.7;

    if (p.windHigh > 20) score -= (p.windHigh - 20) * 0.75;
    if (p.windLow > 4) score -= (p.windLow - 4) * 4;
    if (p.gust > 9) score -= (p.gust - 9) * 1.1;

    if (p.dewGap < 4) score -= (4 - p.dewGap) * 7;
    if (p.humid > 90) score -= (p.humid - 90) * 1.15;

    score += altitudeScore(p.targetAltitude, target.minAlt, target.type);
    score -= moonImpact(target, p);

    if (target.type === "LUNAR") {
        if (p.targetAltitude < 15) score -= 35;
        else if (p.targetAltitude > 25) score += 6;
    }

    const hour = Number(timeString.slice(11, 13));
    if ((hour >= 22 || hour <= 3) && score > 55) score += 2;

    const finalScore = clamp(Math.round(score), 0, 100);

    let sqm = 21.7 - ((bortle - 1) * 0.45);
    if (target.type !== "LUNAR" && p.moon.altitude > 0) {
        sqm -= p.moonIllum * clamp(Math.sin(degToRad(p.moon.altitude)), 0, 1) * 1.8;
        sqm -= clamp(1 - p.separation / 180, 0, 1) * p.moonIllum * 0.9;
    }
    sqm -= clamp(p.cloud, 0, 100) / 100 * 0.8;
    sqm = clamp(sqm, 16, 22);

    return {
        time: timeString,
        date,
        score: finalScore,
        params: p,
        target,
        sqm: Number(sqm.toFixed(2)),
        reason: classifyReason(p, target)
    };
}

function findBest(data, lat, lon, bortle, target) {
    const hourly = data?.hourly;
    if (!hourly?.time?.length) return { score: -1, reason: "天候予報データがありません" };

    const evaluations = hourly.time
        .map((_, i) => scoreHour(hourly, i, lat, lon, bortle, target, data.utc_offset_seconds))
        .filter(Boolean);

    if (!evaluations.length) {
        return { score: -1, reason: "この日に天文暗夜として評価できる時間がありません" };
    }

    const best = evaluations.reduce((a, b) => {
        if (b.score !== a.score) return b.score > a.score ? b : a;
        if (b.params.targetAltitude !== a.params.targetAltitude) return b.params.targetAltitude > a.params.targetAltitude ? b : a;
        return b.params.cloud < a.params.cloud ? b : a;
    });

    const windows = [];
    let current = [];
    for (const item of evaluations) {
        const prev = current[current.length - 1];
        const contiguous = !prev || (item.date.getTime() - prev.date.getTime() <= 61 * 60 * 1000);
        if (item.score >= WINDOW_THRESHOLD && contiguous) current.push(item);
        else {
            if (current.length) windows.push(current);
            current = item.score >= WINDOW_THRESHOLD ? [item] : [];
        }
    }
    if (current.length) windows.push(current);

    const bestWindow = windows
        .map(w => ({ start: w[0], end: w[w.length - 1], hours: w.length }))
        .sort((a, b) => b.hours - a.hours || b.start.score - a.start.score)[0] || null;

    const top3 = [...evaluations].sort((a, b) => b.score - a.score || b.params.targetAltitude - a.params.targetAltitude).slice(0, 3);

    const required = [
        "temperature_2m", "relativehumidity_2m", "dewpoint_2m", "cloud_cover",
        "cloud_cover_low", "cloud_cover_mid", "cloud_cover_high",
        "precipitation_probability", "visibility", "windspeed_10m", "windgusts_10m",
        "windspeed_250hPa", "surface_pressure"
    ];
    const present = required.filter(key => Array.isArray(hourly[key])).length;
    const coverage = Math.round((present / required.length) * 100);

    return { best, bestWindow, evaluations, darkHours: evaluations.length, coverage, top3 };
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerText = value;
}

function setMetricClass(el, value, goodMax, warnMax) {
    if (!el) return;
    el.parentElement.classList.remove("metric-good", "metric-warn", "metric-bad");
    if (value <= goodMax) el.parentElement.classList.add("metric-good");
    else if (value <= warnMax) el.parentElement.classList.add("metric-warn");
    else el.parentElement.classList.add("metric-bad");
}

function updateTargetCard() {
    const item = TARGETS[targetSelect.value] || TARGETS.m31;
    setText("target-name", item.name);
    setText("target-description", item.description);
    setText("target-type", item.type);
}

function scoreComment(score, reason) {
    if (score >= 85) return "かなり狙いやすい時間帯。長時間露光向き。";
    if (score >= 75) return "良好。撮影計画を組みやすい時間帯。";
    if (score >= 65) return "条件は選択的。短めの撮影セッション向き。";
    return "厳しめ。主因: " + reason;
}

function renderHourlyRanking(result) {
    const ranking = document.getElementById("hour-ranking");
    ranking.innerHTML = "";
    result.top3.forEach((item, index) => {
        const row = document.createElement("div");
        row.className = "hour-row";
        row.innerHTML =
            '<div class="hour-time">#' + (index + 1) + ' ' + localClock(item.time) + '</div>' +
            '<div class="hour-bar"><div class="hour-fill" style="width:' + item.score + '%"></div></div>' +
            '<div class="hour-score">' + item.score + '</div>' +
            '<div class="hour-sub">高度 ' + item.params.targetAltitude.toFixed(1) + '° ・ 雲 ' + Math.round(item.params.cloud) + '% ・ 月離角 ' + Math.round(item.params.separation) + '°</div>';
        ranking.appendChild(row);
    });
}

function renderTimeline(evaluations) {
    const timeline = document.getElementById("hour-timeline");
    timeline.innerHTML = "";
    const slice = evaluations.filter((_, i) => i % 2 === 0);
    slice.forEach(item => {
        const cell = document.createElement("div");
        cell.className = "time-cell";
        const bar = document.createElement("div");
        bar.className = "time-cell-bar";
        bar.title = localClock(item.time) + " / " + item.score + "点";
        const fill = document.createElement("div");
        fill.className = "hour-fill";
        fill.style.height = Math.max(6, item.score) + "%";
        fill.style.width = "100%";
        fill.style.borderRadius = "0 0 5px 5px";
        fill.style.marginTop = (100 - Math.max(6, item.score)) + "%";
        bar.appendChild(fill);
        const label = document.createElement("div");
        label.className = "time-cell-label";
        label.innerText = localClock(item.time);
        cell.appendChild(bar);
        cell.appendChild(label);
        timeline.appendChild(cell);
    });
}

function updateUI(result, meta) {
    const gauge = document.getElementById("gauge");
    const scoreVal = document.getElementById("score-value");
    gauge.style.background = "conic-gradient(#27303a 0%, #27303a 100%)";

    if (result.score === -1) {
        scoreVal.innerText = "--";
        setText("time-display", "--:--");
        setText("slm-output", result.reason);
        setText("best-window", "--:-- → --:--");
        setText("window-duration", "--");
        setText("data-status", "NO DATA");
        document.getElementById("hour-ranking").innerHTML = '<div class="empty-state">表示できる時間帯がありません。</div>';
        document.getElementById("hour-timeline").innerHTML = "";
        return;
    }

    const best = result.best;
    scoreVal.innerText = best.score;
    setText("time-display", localClock(best.time));
    setText("slm-output", scoreComment(best.score, best.reason));
    setText("val-sqm", best.sqm.toFixed(2));
    setText("val-alt", best.params.targetAltitude.toFixed(1));
    setText("val-az", Math.round(best.params.targetAzimuth));
    setText("val-separation", Math.round(best.params.separation));
    setText("val-moon-alt", best.params.moon.altitude.toFixed(1));
    setText("val-moon-illum", Math.round(best.params.moonIllum * 100));
    setText("val-dark-hours", result.darkHours.toFixed(0));

    if (result.bestWindow) {
        const w = result.bestWindow;
        setText("best-window", localClock(w.start.time) + " → " + nextClock(w.end.time, 1));
        setText("window-duration", w.hours + "時間連続");
    } else {
        setText("best-window", "連続65点以上なし");
        setText("window-duration", "トップ時間を参照");
    }

    setText("val-cloud", Math.round(best.params.cloud));
    setText("val-rain", Math.round(best.params.rainProb));
    setText("val-wind", best.params.windHigh.toFixed(1));
    setText("val-dew", best.params.dewGap.toFixed(1));
    setText("val-visibility", (best.params.visibility / 1000).toFixed(1));
    setText("val-low-cloud", Math.round(best.params.cloudLow));
    setText("val-pressure", best.params.pressure ? Math.round(best.params.pressure) : "--");
    setText("val-ground-wind", best.params.windLow.toFixed(1));

    setMetricClass(document.getElementById("val-cloud"), best.params.cloud, 20, 50);
    setMetricClass(document.getElementById("val-rain"), best.params.rainProb, 15, 40);
    setMetricClass(document.getElementById("val-wind"), best.params.windHigh, 20, 40);
    const dewEl = document.getElementById("val-dew");
    dewEl.parentElement.classList.remove("metric-good", "metric-warn", "metric-bad");
    if (best.params.dewGap >= 4) dewEl.parentElement.classList.add("metric-good");
    else if (best.params.dewGap >= 2.5) dewEl.parentElement.classList.add("metric-warn");
    else dewEl.parentElement.classList.add("metric-bad");
    setMetricClass(document.getElementById("val-visibility"), 20 - best.params.visibility / 1000, 0, 10);
    setMetricClass(document.getElementById("val-low-cloud"), best.params.cloudLow, 20, 45);
    setMetricClass(document.getElementById("val-ground-wind"), best.params.windLow, 4, 8);

    const gaugeColor = best.score >= 80 ? "#00ffaa" : best.score >= 65 ? "#ffcc33" : "#ff5a5f";
    gauge.style.background = "conic-gradient(" + gaugeColor + " " + best.score + "%, #27303a " + best.score + "%)";
    setText("coverage-note", "予報コア " + result.coverage + "%");
    setText("data-status", "LOAD " + result.coverage + "%");
    setText("event-text", meta.locationLabel + " • B" + meta.bortle + " • " + meta.target.name);
    renderHourlyRanking(result);
    renderTimeline(result.evaluations);
}

async function startAnalysis() {
    const dateVal = dateInput.value;
    const selected = locationSelect.value;
    const target = TARGETS[targetSelect.value] || TARGETS.m31;
    if (!selected) {
        setText("event-text", "撮影地を選択するか、現在地を取得してください");
        setText("data-status", "入力待ち");
        return;
    }

    const coords = selected.split(",").map(Number);
    const lat = coords[0];
    const lon = coords[1];
    const bortle = Number(bortleSelect.value);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !dateVal) return;

    setLoading(true);
    saveSettings(lat, lon, bortle, targetSelect.value);

    const locationLabel = locationSelect.selectedOptions[0]?.textContent || "撮影地";
    setText("event-text", locationLabel + " / " + target.name + " を解析中");
    setText("target-date", dateVal);
    updateTargetCard();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
        const url = new URL(API_BASE);
        url.searchParams.set("latitude", lat);
        url.searchParams.set("longitude", lon);
        url.searchParams.set("hourly", [
            "temperature_2m",
            "relativehumidity_2m",
            "dewpoint_2m",
            "cloud_cover",
            "cloud_cover_low",
            "cloud_cover_mid",
            "cloud_cover_high",
            "precipitation_probability",
            "precipitation",
            "visibility",
            "surface_pressure",
            "windspeed_10m",
            "windgusts_10m",
            "windspeed_250hPa"
        ].join(","));
        url.searchParams.set("start_date", dateVal);
        url.searchParams.set("end_date", dateVal);
        url.searchParams.set("timezone", "auto");
        url.searchParams.set("wind_speed_unit", "ms");

        const response = await fetch(url.toString(), { signal: controller.signal });
        if (!response.ok) throw new Error("HTTP " + response.status);

        const weatherData = await response.json();
        const result = findBest(weatherData, lat, lon, bortle, target);
        updateUI(result, { locationLabel, bortle, target });
    } catch (e) {
        console.error(e);
        setText("data-status", "ERROR");
        setText("event-text", e.name === "AbortError" ? "予報取得がタイムアウトしました" : "予報データの取得に失敗しました");
        setText("slm-output", "ネットワークまたはAPIの状態を確認して、もう一度実行してください。");
    } finally {
        clearTimeout(timeout);
        setLoading(false);
    }
}

function useGPS() {
    if (!navigator.geolocation) {
        setText("event-text", "このブラウザは位置情報に対応していません");
        return;
    }
    setText("event-text", "高精度GPSを取得しています…");
    navigator.geolocation.getCurrentPosition(function(pos) {
        const lat = Number(pos.coords.latitude.toFixed(3));
        const lon = Number(pos.coords.longitude.toFixed(3));
        upsertCustomLocation(lat, lon, Number(bortleSelect.value));
        setText("event-text", "現在地を取得しました。解析を開始します。");
        startAnalysis();
    }, function(err) {
        console.warn(err);
        setText("event-text", "位置情報を取得できませんでした。ブラウザの権限を確認してください。");
        setText("data-status", "GPS ERROR");
    }, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000
    });
}

function setLoading(isLoading) {
    const btn = document.querySelector("button.primary");
    btn.innerText = isLoading ? "解析中…" : "この条件で予報する";
    btn.disabled = isLoading;
}

locationSelect.addEventListener("change", function() {
    const option = locationSelect.selectedOptions[0];
    const suggested = option?.dataset?.bortle;
    if (suggested) bortleSelect.value = suggested;
});

targetSelect.addEventListener("change", function() {
    updateTargetCard();
    startAnalysis();
});

initDateLimits();
restoreSettings();
