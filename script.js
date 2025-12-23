const API_BASE = "https://api.open-meteo.com/v1/forecast";

document.getElementById('date-input').valueAsDate = new Date();

function findBestStrict(data, lat, lon, bortle) {
    let best = { score: -1, reason: "天文薄明、または晴天の時間がありません" };
    
    if (!data || !data.hourly || !data.hourly.time) return best;

    data.hourly.time.forEach((t, i) => {
        const d = new Date(t);
        const sun = SunCalc.getPosition(d, lat, lon);

        if (sun.altitude > -0.314) return; 

        const p = {
            cloud: data.hourly.cloud_cover[i],
            humid: data.hourly.relativehumidity_2m[i],
            dewPoint: data.hourly.dewpoint_2m[i],
            temp: data.hourly.temperature_2m[i],
            windHigh: data.hourly.windspeed_250hPa[i],
            windLow: data.hourly.windspeed_10m[i],
            moon: SunCalc.getMoonPosition(d, lat, lon),
            moonIllum: SunCalc.getMoonIllumination(d)
        };

        let s = 100;
        let reasons = [];

        s -= (bortle - 1) * 10; 

        if (p.cloud > 0) {
            const deduction = Math.pow(p.cloud, 1.5) / 2; 
            s -= deduction;
            if(p.cloud > 30) reasons.push("雲");
        }

        if (p.moon.altitude > 0) {
            const moonFactor = p.moonIllum.fraction * Math.sin(p.moon.altitude);
            const deduction = moonFactor * 120;
            s -= deduction;
            if (deduction > 20) reasons.push("月明");
        }

        if (p.windHigh > 20) {
            s -= (p.windHigh - 20) * 1.5;
            if(p.windHigh > 40) reasons.push("気流乱");
        }

        if (p.windLow > 3) {
            s -= (p.windLow - 3) * 8;
        }

        const dewGap = p.temp - p.dewPoint;
        if (dewGap < 3.0) {
            s -= (3.0 - dewGap) * 15;
            reasons.push("結露");
        }

        if (p.humid > 85) {
            s -= (p.humid - 85) * 2;
        }

        const hour = d.getHours();
        if ((hour >= 22 || hour <= 3) && s > 40) {
            s += 5;
        }

        const finalScore = Math.max(0, Math.min(100, Math.round(s)));

        let estimatedSQM = 22.0 - ((bortle - 1) * 0.5);
        if (p.moon.altitude > 0) estimatedSQM -= (p.moonIllum.fraction * 4.0);
        if (p.cloud > 50) estimatedSQM -= 1.0;
        estimatedSQM = Math.max(16, estimatedSQM.toFixed(2));

        if (finalScore > best.score) {
            best = { 
                score: finalScore, 
                time: t, 
                params: p, 
                date: d, 
                sqm: estimatedSQM,
                primaryReason: reasons.length > 0 ? reasons[0] : "良好" 
            };
        }
    });

    return best;
}

async function startAnalysis() {
    const dateVal = document.getElementById('date-input').value;
    const locSelect = document.getElementById('location-select');
    let lat, lon, bortle;

    if (locSelect.value) {
        const parts = locSelect.value.split(',');
        lat = parseFloat(parts[0]);
        lon = parseFloat(parts[1]);
        bortle = parseInt(locSelect.selectedOptions[0].getAttribute('data-bortle'));
    } else {
        alert("場所を選択するか、GPSを使用してください。");
        return;
    }

    setLoading(true);

    try {
        const url = `${API_BASE}?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,relativehumidity_2m,dewpoint_2m,cloud_cover,windspeed_10m,windspeed_250hPa&start_date=${dateVal}&end_date=${dateVal}&timezone=auto`;

        const response = await fetch(url);
        const weatherData = await response.json();

        const result = findBestStrict(weatherData, lat, lon, bortle);
        updateUI(result);

    } catch (e) {
        console.error(e);
        alert("データ取得に失敗しました。");
    } finally {
        setLoading(false);
    }
}

function updateUI(result) {
    const scoreVal = document.getElementById('score-value');
    const timeDisp = document.getElementById('time-display');
    const output = document.getElementById('slm-output');
    const gauge = document.getElementById('gauge');

    gauge.style.background = `conic-gradient(#333 0%, #333 100%)`;

    if (result.score === -1) {
        scoreVal.innerText = "--";
        timeDisp.innerText = "NO WINDOW";
        output.innerText = result.reason;
        return;
    }

    scoreVal.innerText = result.score;
    
    const bestDate = new Date(result.time);
    const timeStr = bestDate.getHours().toString().padStart(2, '0') + ":00";
    timeDisp.innerText = `BEST TIME: ${timeStr}`;

    let comment = "";
    if (result.score >= 90) comment = "完璧な夜。遠征推奨。";
    else if (result.score >= 70) comment = "良好。撮影可能。";
    else if (result.score >= 50) comment = "妥協が必要。";
    else comment = `厳しい。要因: ${result.primaryReason}`;
    
    output.innerText = comment;
    document.getElementById('val-sqm').innerText = result.sqm;

    document.getElementById('val-cloud').innerText = result.params.cloud;
    document.getElementById('val-moon').innerText = (result.params.moonIllum.fraction * 100).toFixed(0) + "%";
    document.getElementById('val-wind').innerText = result.params.windHigh.toFixed(1);
    
    const gap = (result.params.temp - result.params.dewPoint).toFixed(1);
    const dewElem = document.getElementById('val-dew');
    dewElem.innerText = gap;
    if(gap < 3.0) dewElem.style.color = "#ff4444";
    else dewElem.style.color = "var(--text-main)";

    const color = result.score > 80 ? '#00ffaa' : (result.score > 50 ? '#ffdd00' : '#ff4444');
    gauge.style.background = `conic-gradient(${color} ${result.score}%, #333 ${result.score}%)`;
}

function useGPS() {
    if (!navigator.geolocation) {
        alert("お使いのブラウザはGPSに対応していません");
        return;
    }
    navigator.geolocation.getCurrentPosition(pos => {
        const lat = pos.coords.latitude.toFixed(3);
        const lon = pos.coords.longitude.toFixed(3);
        
        const select = document.getElementById('location-select');
        const opt = document.createElement('option');
        opt.value = `${lat},${lon}`;
        opt.text = `現在地 (${lat}, ${lon})`;
        opt.setAttribute('data-bortle', "5");
        opt.selected = true;
        select.add(opt);
        
        alert(`現在地を取得しました。\nBortle値は暫定的に「5」で計算します。`);
        startAnalysis();
    }, err => {
        alert("位置情報の取得に失敗しました");
    });
}

function toggleMode() {
    alert("Normal Mode is not implemented yet. Stay Professional.");
}

function setLoading(isLoading) {
    const btn = document.querySelector('button.primary');
    if(isLoading) {
        btn.innerText = "CALCULATING...";
        btn.disabled = true;
    } else {
        btn.innerText = "PREDICT NOW";
        btn.disabled = false;
    }
}
