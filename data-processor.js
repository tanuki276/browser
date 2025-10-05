// このファイルは、生のFitデータからメトリクスを計算し、AI用プロンプトを生成するロジックを管理します。

// --- Utility Functions ---

function formatDuration(ms) {
    if (ms === 0) return 'N/A';
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    return `${hours}時間 ${minutes}分`;
}

// --- Data Processing Functions ---

function processFitData(buckets) {
    let totalSteps = 0;
    let totalDistance = 0;
    let totalCalories = 0;
    let totalSleep = 0;
    let dailyData = [];
    let sleepCount = 0;

    buckets.forEach(bucket => {
        const dayStart = parseInt(bucket.startTimeMillis);
        let daySteps = 0;
        let dayDistance = 0;
        let dayCalories = 0;
        let daySleep = 0;

        bucket.dataset.forEach(dataset => {
            dataset.point.forEach(point => {
                const value = point.value[0].intVal || point.value[0].fpVal;

                // Steps
                if (dataset.dataSourceId.includes('step_count.delta') && value) {
                    daySteps += value;
                }

                // Distance (in meters)
                if (dataset.dataSourceId.includes('distance.delta') && value) {
                    dayDistance += value;
                }

                // Calories
                if (dataset.dataSourceId.includes('calories.expended') && value) {
                    dayCalories += value;
                }

                // Sleep: intVal === 109 means 'sleep'
                if (dataset.dataSourceId.includes('sleep.segment') && point.value[0].intVal === 109) { 
                    daySleep += (parseInt(point.endTimeNanos) - parseInt(point.startTimeNanos)) / 1000000; // Nanos to Millis
                }
            });
        });
        
        if (daySleep > 0) {
            totalSleep += daySleep;
            sleepCount++;
        }

        totalSteps += daySteps;
        totalDistance += dayDistance;
        totalCalories += dayCalories;

        dailyData.push({
            date: dayStart,
            steps: daySteps,
            distanceKm: dayDistance / 1000, 
            calories: dayCalories,
            sleepMillis: daySleep,
        });
    });

    dailyData = dailyData.filter(d => d.steps > 0 || d.calories > 0 || d.sleepMillis > 0).sort((a, b) => a.date - b.date);

    return {
        summary: {
            totalSteps: totalSteps,
            totalDistance: totalDistance,
            totalCalories: totalCalories,
            averageSleep: sleepCount > 0 ? totalSleep / sleepCount : 0, 
        },
        dailyData: dailyData,
    };
}
window.processFitData = processFitData;

// --- Gemini Formatting Functions ---

function createAnalysisPrompt(metrics) {
    const summary = metrics.summary;
    const dailyData = metrics.dailyData;

    const summaryText = `
        - 合計歩数: ${summary.totalSteps.toLocaleString()} 歩
        - 合計距離: ${(summary.totalDistance / 1000).toFixed(2)} km
        - 合計消費カロリー: ${summary.totalCalories.toFixed(0)} kcal
        - 平均睡眠時間: ${formatDuration(summary.averageSleep)}
    `;

    const dailyDataText = dailyData.map(d => {
        const dateStr = new Date(d.date).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' });
        return `日付: ${dateStr}, 歩数: ${d.steps.toLocaleString()}, 距離: ${d.distanceKm.toFixed(2)}km, カロリー: ${d.calories.toFixed(0)}kcal, 睡眠: ${formatDuration(d.sleepMillis)}`;
    }).join('\n');

    return `
        あなたは専門の健康分析AIです。以下の過去7日間の健康データ（歩数、距離、カロリー、睡眠時間）を分析してください。

        ---
        ## 総合サマリー
        ${summaryText}

        ---
        ## 日別データ
        ${dailyDataText}
        ---

        このデータを基に、以下の3つのポイントについて日本語で詳細に分析し、Markdown形式で出力してください。

        1.  **活動量（歩数・距離）の評価と変動分析:** 7日間の歩数と距離の傾向（例: 週末と平日の差、特定日の突出や低下）を評価し、全体的な活動レベルについてコメントしてください。
        2.  **睡眠パターンの評価:** 平均睡眠時間と日ごとの変動を評価し、健康維持の観点から推奨事項を提案してください。
        3.  **総合的な健康インサイトと次のステップ:** 全ての指標を総合し、ユーザーの健康状態に関する最も重要なインサイトを提供し、次の7日間で改善すべき具体的な目標や行動を1～2つ提案してください。
    `;
}
window.createAnalysisPrompt = createAnalysisPrompt;

function markdownToHtml(markdown) {
    let html = markdown
        .replace(/^###\s*(.*)$/gm, '<h4>$1</h4>')
        .replace(/^##\s*(.*)$/gm, '<h3>$1</h3>')
        .replace(/^#\s*(.*)$/gm, '<h2>$1</h2>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/^- (.*)$/gm, '<li>$1</li>')
        .replace(/(\n<li>.*<\/li>)+/gs, '<ul class="list-disc ml-5 space-y-1 my-2">$1</ul>')
        .replace(/(\n\n)/g, '<p class="mt-4">')
        .replace(/\n(?!<p|h|u|l)/g, ' ') 
        .replace(/<p class="mt-4">/g, '</p><p class="mt-4">') 
        .trim();
    
    if (!html.startsWith('<') && html.length > 0) {
         html = '<p class="mt-4">' + html + '</p>';
    }
    
    html = html.replace(/<p class="mt-4"><\/p>/g, '');
    
    return html;
}

function parseAndFormatAnalysis(analysisText) {
    const lines = analysisText.split('\n');
    let title = "AI詳細分析結果";
    let content = analysisText;

    if (lines[0].startsWith('##') || lines[0].startsWith('#')) {
        title = lines[0].replace(/#+\s*/, '').trim();
        content = lines.slice(1).join('\n');
    }
    
    content = markdownToHtml(content);

    return { title, content };
}
window.parseAndFormatAnalysis = parseAndFormatAnalysis;
window.formatDuration = formatDuration; 
