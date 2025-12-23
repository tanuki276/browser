function findBestStrict(data, lat, lon, bortle) {
    let best = { score: -1, reason: "条件を満たす時間がありません" };

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

        const dewGap = p.temp - p.dewPoint;

        let s = 100 - ((bortle - 1) * 10);

        if (p.cloud > 0) {
            s -= Math.pow(p.cloud, 2) / 4; 
        }

        if (p.humid > 70) {
            s -= Math.pow(p.humid - 70, 1.8);
        }

        if (p.moon.altitude > 0) {
            const pollutionFactor = p.moonIllum.fraction * (Math.sin(p.moon.altitude));
            s -= pollutionFactor * 150;
        }

        if (p.windHigh > 15) {
            s -= (p.windHigh - 15) * 3;
        }

        if (p.windLow > 3) {
            s -= (p.windLow - 3) * 5;
        }

        if (dewGap < 2.0) {
            s -= (2.0 - dewGap) * 20;
        }

        const finalScore = Math.max(0, Math.round(s));

        if (finalScore > best.score) {
            best = { score: finalScore, time: t, params: p, date: d };
        }
    });

    return best;
}
