const API_BASE = "https://api.open-meteo.com/v1/forecast";
const STORAGE_KEY = "astroForecastPro";

const dateInput = document.getElementById("date-input");
const locationSelect = document.getElementById("location-select");
const bortleSelect = document.getElementById("bortle-select");

function isoDateLocal(date) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0")
    ].join("-");
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
        if (saved.location) {
            const opt = [...locationSelect.options].find(o => o.value === saved.location);
            if (opt) opt.selected = true;
        }
    } catch (_) {}
}

function saveSettings(lat, lon, bortle) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        location: `${lat.toFixed(3)},${lon.toFixed(3)}`,
        bortle,
        updatedAt: new Date().toISOString()
    }));
}

function parseForecastDate(timeString, utcOffsetSeconds = 0) {
    // Open-Meteo may return local-clock ISO strings without a UTC suffix.
    // Convert that local clock into a real UTC instant for SunCalc.
    const base = Date.parse(`${timeString}Z`);
    return Number.isNaN(base)
        ? new Date(timeString)
        : new Date(base - (utcOffsetSeconds * 1000));
}

function localClock(timeString) {
    return timeString.includes("T") ? timeString.slice(11, 16) : "--:--";
}

function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}

function safeNum(value, fallback = 0) {
    return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function scoreHour(data, i, lat, lon, bortle, utcOffsetSeconds) {
    const timeString = data.time[i];
    const date = parseForecastDate(timeString, utcOffsetSeconds);
    const sun = SunCalc.getPosition(date, lat, lon);

    // Strict astronomy mode: only astronomical night (< -18° solar altitude).
    if (sun.altitude > -0.314159) return null;

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
        moon: SunCalc.getMoonPosition(date, lat, lon),
        moonIllum: SunCalc.getMoonIllumination(date)
    };

    let score = 100;
    const reasons = [];

    // Light pollution: significant, but intentionally not dominant over weather.
    score -= (bortle - 1) * 4;

    // Total + layered cloud cover. Low cloud matters most for practical imaging.
    const cloudPenalty = (p.cloudLow * 0.20) + (p.cloudMid * 0.11) + (p.cloudHigh * 0.05);
    score -= cloudPenalty;
    if (p.cloud >= 50) reasons.push("雲");
    else if (p.cloudLow >= 35) reasons.push("低層雲");

    // Precipitation probability and actual modeled precipitation.
    score -= p.rainProb * 0.18;
    score -= clamp(p.precip, 0, 3) * 5;
    if (p.rainProb >= 40 || p.precip >= 0.4) reasons.push("降水");

    // Transparency / haze proxy.
    if (p.visibility < 20000) {
        score -= clamp((20000 - p.visibility) / 1000, 0, 15) * 0.7;
        if (p.visibility < 10000) reasons.push("視程");
    }

    // Jet stream and ground wind.
    if (p.windHigh > 20) score -= (p.windHigh - 20) * 0.9;
    if (p.windLow > 4) score -= (p.windLow - 4) * 4;
    if (p.gust > 9) score -= (p.gust - 9) * 1.3;
    if (p.windHigh > 40) reasons.push("ジェット気流");
    else if (p.windLow > 7) reasons.push("地上風");

    // Condensation risk.
    const dewGap = p.temp - p.dewPoint;
    if (dewGap < 4) {
        score -= (4 - dewGap) * 7;
        if (dewGap < 2.5) reasons.push("結露");
    }
    if (p.humid > 90) score -= (p.humid - 90) * 1.2;

    // Moonlight load (no target separation is known, so this is deliberately conservative).
    if (p.moon.altitude > 0) {
        const moonLoad = p.moonIllum.fraction * clamp(Math.sin(p.moon.altitude), 0, 1);
        score -= moonLoad * 18;
        if (moonLoad > 0.25) reasons.push("月明");
    }

    // A small midnight preference only when conditions are already decent.
    const hour = Number(timeString.slice(11, 13));
    if ((hour >= 22 || hour <= 3) && score > 55) score += 3;

    const finalScore = clamp(Math.round(score), 0, 100);

    // Heuristic SQM estimate; not a calibrated photometer reading.
    let sqm = 21.8 - ((bortle - 1) * 0.45);
    if (p.moon.altitude > 0) {
        sqm -= p.moonIllum.fraction * clamp(Math.sin(p.moon.altitude), 0, 1) * 1.8;
    }
    sqm -= clamp(p.cloud, 0, 100) / 100 * 0.8;
    sqm = clamp(sqm, 16, 22).toFixed(2);

    return {
        time: timeString,
        date,
        score: finalScore,
        params: p,
        sqm: Number(sqm),
        reason: reasons[0] || "良好"
    };
}

function findBestStrict(data, lat, lon, bortle) {
    const hourly = data?.hourly;
    if (!hourly?.time?.length) {
        return { score: -1, reason: "天候予報データがありません" };
    }

    const evaluations = hourly.time
        .map((_, i) => scoreHour(hourly, i, lat, lon, bortle, data.utc_offset_seconds || 0))
        .filter(Boolean);

    if (!evaluations.length) {
        return { score: -1, reason: "この日の天文薄明終了後に有効な時間がありません" };
    }

    const best = evaluations.reduce((a, b) => {
        if (b.score !== a.score) return b.score > a.score ? b : a;
        return b.params.cloud < a.params.cloud ? b : a;
    });

    const darkHours = evaluations.length;

    // Build continuous usable windows from hourly samples.
    const windowThreshold = 60;
    const windows = [];
    let current = [];
    for (const item of evaluations) {
        if (item.score >= windowThreshold) {
            current.push(item);
        } else if (current.length) {
            windows.push(current);
            current = [];
        }
    }
    if (current.length) windows.push(current);

    const usableWindows = windows
        .filter(w => w.length >= 1)
        .map(w => ({
            start: w[0],
            end: w[w.length - 1],
            hours: w.length
        }))
        .sort((a, b) => b.hours - a.hours || b.end.score - a.end.score);

    const bestWindow = usableWindows[0] || null;

    // "Data coverage" is a factual completeness check, not a forecast probability.
    const required = ["temperature_2m", "relativehumidity_2m", "cloud_cover", "dewpoint_2m"];
    const present = required.filter(key => Array.isArray(hourly[key])).length;
    const coverage = Math.round((present / required.length) * 100);

    return {
        best,
        bestWindow,
        evaluations,
        darkHours,
        coverage
    };
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerText = value;
}

function setMetricClass(el, value, goodMax, warnMax) {
    el.classList.remove("metric-good", "metric-warn", "metric-bad");
    if (value <= goodMax) el.classList.add("metric-good");
    else if (value <= warnMax) el.classList.add("metric-warn");
    else el.classList.add("metric-bad");
}

function updateUI(result, meta = {}) {
    const gauge = document.getElementById("gauge");
    const scoreVal = document.getElementById("score-value");

    gauge.style.background = "conic-gradient(#27303a 0%, #27303a 100%)";

    if (result.score === -1) {
        scoreVal.innerText = "--";
        setText("time-display", "BEST TIME: --:--");
        setText("slm-output", result.reason);
        setText("best-window", "--:-- → --:--");
        setText("window-duration", "-- h");
        setText("data-status", "NO DATA");
        return;
    }

    const best = result.best;
    scoreVal.innerText = best.score;
    setText("time-display", `BEST TIME: ${localClock(best.time)}`);

    let comment = "";
    if (best.score >= 85) comment = "非常に良好。遠征候補。";
    else if (best.score >= 70) comment = "良好。撮影可能。";
    else if (best.score >= 55) comment = "条件は選択的。短時間撮影向き。";
    else comment = `厳しめ。主因: ${best.reason}`;
    setText("slm-output", comment);
    setText("val-sqm", best.sqm.toFixed(2));

    if (result.bestWindow) {
        const w = result.bestWindow;
        setText("best-window", `${localClock(w.start.time)} → ${localClock(w.end.time)}`);
        setText("window-duration", `${w.hours} h usable`);
    } else {
        setText("best-window", "NO USABLE WINDOW");
        setText("window-duration", "score < 60");
    }

    setText("val-cloud", Math.round(best.params.cloud));
    setText("val-rain", Math.round(best.params.rainProb));
    setText("val-wind", best.params.windHigh.toFixed(1));
    setText("val-visibility", (best.params.visibility / 1000).toFixed(1));
    setText("val-low-cloud", Math.round(best.params.cloudLow));
    setText("val-pressure", best.params.pressure ? Math.round(best.params.pressure) : "--");
    setText("val-dark-hours", result.darkHours.toFixed(0));

    const dewGap = best.params.temp - best.params.dewPoint;
    const dewEl = document.getElementById("val-dew");
    dewEl.innerText = dewGap.toFixed(1);
    dewEl.classList.remove("metric-good", "metric-warn", "metric-bad");
    if (dewGap >= 4) dewEl.classList.add("metric-good");
    else if (dewGap >= 2.5) dewEl.classList.add("metric-warn");
    else dewEl.classList.add("metric-bad");

    setMetricClass(document.getElementById("val-cloud"), best.params.cloud, 20, 50);
    setMetricClass(document.getElementById("val-rain"), best.params.rainProb, 15, 40);
    setMetricClass(document.getElementById("val-visibility"), 20000 - best.params.visibility / 1000, 0, 10000);
    setMetricClass(document.getElementById("val-low-cloud"), best.params.cloudLow, 20, 45);

    const color = best.score >= 80 ? "#00ffaa" : best.score >= 60 ? "#ffcc33" : "#ff5a5f";
    gauge.style.background = `conic-gradient(${color} ${best.score}%, #27303a ${best.score}%)`;

    setText("data-status", `LOADED • ${result.coverage}% CORE DATA`);
    setText("event-text", meta.locationLabel ? `${meta.locationLabel} • B${meta.bortle} • ${result.darkHours}h astronomical dark` : "Forecast loaded");
}

async function startAnalysis() {
    const dateVal = dateInput.value;
    const selected = locationSelect.value;
    if (!selected) {
        setText("event-text", "撮影地を選択するか、GPSを使用してください");
        setText("data-status", "INPUT NEEDED");
        return;
    }

    const [lat, lon] = selected.split(",").map(Number);
    const bortle = Number(bortleSelect.value);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !dateVal) return;

    setLoading(true);
    saveSettings(lat, lon, bortle);

    const label = locationSelect.selectedOptions[0]?.textContent || "Custom Location";
    setText("event-text", `Analyzing ${label} • B${bortle}`);
    setText("target-date", dateVal);

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
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const weatherData = await response.json();
        const result = findBestStrict(weatherData, lat, lon, bortle);
        updateUI(result, { locationLabel: label, bortle });
    } catch (e) {
        console.error(e);
        setText("data-status", "ERROR");
        setText("event-text", e.name === "AbortError" ? "予報取得がタイムアウトしました" : "予報データの取得に失敗しました");
        setText("slm-output", "ネットワークまたはAPIの状態を確認して、もう一度試してください。");
    } finally {
        clearTimeout(timeout);
        setLoading(false);
    }
}

function useGPS() {
    if (!navigator.geolocation) {
        setText("event-text", "お使いのブラウザは位置情報に対応していません");
        return;
    }

    navigator.geolocation.getCurrentPosition(pos => {
        const lat = Number(pos.coords.latitude.toFixed(3));
        const lon = Number(pos.coords.longitude.toFixed(3));

        const opt = document.createElement("option");
        opt.value = `${lat},${lon}`;
        opt.textContent = `現在地 (${lat}, ${lon})`;
        opt.setAttribute("data-bortle", bortleSelect.value);
        opt.dataset.gps = "true";
        locationSelect.add(opt);
        opt.selected = true;

        setText("event-text", `現在地を取得しました • B${bortleSelect.value} は手動設定で調整可能`);
        startAnalysis();
    }, err => {
        console.warn(err);
        setText("event-text", "位置情報の取得に失敗しました。ブラウザの権限を確認してください。");
        setText("data-status", "GPS ERROR");
    }, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000
    });
}

function setLoading(isLoading) {
    const btn = document.querySelector("button.primary");
    btn.innerText = isLoading ? "CALCULATING..." : "PREDICT NOW";
    btn.disabled = isLoading;
}

locationSelect.addEventListener("change", () => {
    const option = locationSelect.selectedOptions[0];
    const suggested = option?.dataset?.bortle;
    if (suggested) bortleSelect.value = suggested;
});

initDateLimits();
restoreSettings();
