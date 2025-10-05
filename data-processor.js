// このファイルは、グローバル状態、ローカルストレージ、およびデータ処理を管理します。

// --- Global State ---
window.state = {
    googleClientId: "",
    geminiApiKey: "",
    dailyGoalMinutes: 30, // 初期目標値
    isGapiLoaded: false,
    isSignedIn: false,
    loading: false,
    authError: null,
    
    // Stopwatch State
    stopwatchStartTime: null,
    isTiming: false,
    stopwatchIntervalId: null,
    
    // Fit Data State
    // 全てのセッションデータを保持: { startTime: number, endTime: number, durationMinutes: number, ... }
    sessions: [], 
    // 集計結果を保持: { daily: { minutes, steps, ... }, weekly: {...}, monthly: {...} }
    summaryData: null, 
    analysis: null,
};

// --- Constants ---
const GOOGLE_CLIENT_ID_KEY = 'googleClientId';
const GEMINI_API_KEY_KEY = 'geminiApiKey';
const DAILY_GOAL_KEY = 'dailyGoalMinutes';

// --- Local Storage Key Management (永続化) ---

function loadState() {
    const state = window.state;
    state.googleClientId = localStorage.getItem(GOOGLE_CLIENT_ID_KEY) || "";
    state.geminiApiKey = localStorage.getItem(GEMINI_API_KEY_KEY) || "";
    state.dailyGoalMinutes = parseInt(localStorage.getItem(DAILY_GOAL_KEY)) || 30;

    // DOM要素に反映
    if (window.$dom) {
        if (window.$dom.$googleClientId) window.$dom.$googleClientId.value = state.googleClientId;
        if (window.$dom.$geminiApiKey) window.$dom.$geminiApiKey.value = state.geminiApiKey;
        if (window.$dom.$dailyGoalMinutes) window.$dom.$dailyGoalMinutes.value = state.dailyGoalMinutes;
    }
}
window.loadState = loadState;

function saveState() {
    localStorage.setItem(GOOGLE_CLIENT_ID_KEY, window.state.googleClientId);
    localStorage.setItem(GEMINI_API_KEY_KEY, window.state.geminiApiKey);
    localStorage.setItem(DAILY_GOAL_KEY, window.state.dailyGoalMinutes.toString());
}
window.saveState = saveState;


// --- Utility Functions ---

function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    const pad = (num) => String(num).padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
window.formatTime = formatTime;

/**
 * タイムスタンプがその日/週/月の範囲内にあるかチェックする
 */
function isWithinPeriod(timestamp, now, period) {
    const checkDate = new Date(timestamp);
    const nowCopy = new Date(now);
    
    const checkYMD = checkDate.getFullYear() * 10000 + (checkDate.getMonth() + 1) * 100 + checkDate.getDate();
    const nowYMD = nowCopy.getFullYear() * 10000 + (nowCopy.getMonth() + 1) * 100 + nowCopy.getDate();

    if (period === 'day') {
        return checkYMD === nowYMD;

    } else if (period === 'week') {
        const todayDay = nowCopy.getDay(); // 0=日, 6=土
        const weekStart = new Date(nowCopy);
        weekStart.setDate(nowCopy.getDate() - todayDay);
        weekStart.setHours(0, 0, 0, 0);

        return timestamp >= weekStart.getTime() && checkYMD <= nowYMD;

    } else if (period === 'month') {
        return checkDate.getFullYear() === nowCopy.getFullYear() && 
               checkDate.getMonth() === nowCopy.getMonth() &&
               checkYMD <= nowYMD;
    }
    return false;
}


// --- Data Processing (集計ロジック) ---

const INITIAL_METRICS = {
    minutes: 0, steps: 0, distance: 0, calories: 0, 
    // 心拍数は合計値/回数で平均を出すため
    totalHeartRate: 0, heartRateCount: 0, avgHeartRate: 0,
    // 時速は距離/時間で出すため
    durationMs: 0, avgSpeed: 0 
};

/**
 * Fitセッションデータから日/週/月ごとの合計値を計算する
 */
function calculateSummary() {
    const now = new Date();
    
    let daily = { ...INITIAL_METRICS };
    let weekly = { ...INITIAL_METRICS };
    let monthly = { ...INITIAL_METRICS };

    window.state.sessions.forEach(session => {
        const duration = session.durationMinutes;
        const endTime = session.endTime;
        
        const targetPeriods = [];
        if (isWithinPeriod(endTime, now, 'day')) targetPeriods.push(daily);
        if (isWithinPeriod(endTime, now, 'week')) targetPeriods.push(weekly);
        if (isWithinPeriod(endTime, now, 'month')) targetPeriods.push(monthly);

        targetPeriods.forEach(period => {
            period.minutes += duration;
            period.steps += session.steps;
            period.distance += session.distance;
            period.calories += session.calories;
            
            period.totalHeartRate += session.avgHeartRate * session.durationMinutes; // 重み付き平均の準備
            period.heartRateCount += session.durationMinutes; // 分を重みとして利用
            
            period.durationMs += (session.endTime - session.startTime);
        });
    });
    
    // 最終的な平均と時速を計算
    [daily, weekly, monthly].forEach(period => {
        // 平均心拍数
        if (period.heartRateCount > 0) {
            period.avgHeartRate = period.totalHeartRate / period.heartRateCount;
        }
        // 平均時速 (km/h) = (距離m / 1000) / (時間ms / 3600000)
        if (period.durationMs > 0) {
            const distanceKm = period.distance / 1000;
            const durationHours = period.durationMs / 3600000;
            period.avgSpeed = distanceKm / durationHours; 
        }
    });

    return { daily, weekly, monthly };
}
window.calculateSummary = calculateSummary;


// --- Gemini Formatting Functions ---

function createAnalysisPrompt(summaryData, dailyGoal) {
    const d = summaryData.daily;
    const w = summaryData.weekly;
    const m = summaryData.monthly;

    const goalStatus = d.minutes >= dailyGoal ? "達成" : "未達成";
    const goalDiff = d.minutes - dailyGoal;

    const summaryText = `
        ## ユーザー活動データと目標

        - **日次目標**: ${dailyGoal} 分
        - **本日達成状況**: ${d.minutes.toFixed(1)} 分 (目標${goalStatus}, 差分: ${goalDiff.toFixed(1)} 分)
        
        ---
        ### 今週の合計
        - 活動時間: ${w.minutes.toFixed(1)} 分
        - 歩数: ${w.steps.toLocaleString()} 歩
        - 距離: ${(w.distance / 1000).toFixed(2)} km
        - 消費カロリー: ${w.calories.toFixed(0)} kcal
        - 平均時速: ${w.avgSpeed.toFixed(1)} km/h
        - 平均心拍数: ${w.avgHeartRate.toFixed(0)} bpm

        ### 今月の合計
        - 活動時間: ${m.minutes.toFixed(1)} 分
        - 歩数: ${m.steps.toLocaleString()} 歩
        - 距離: ${(m.distance / 1000).toFixed(2)} km
        - 消費カロリー: ${m.calories.toFixed(0)} kcal
        - 平均時速: ${m.avgSpeed.toFixed(1)} km/h
        - 平均心拍数: ${m.avgHeartRate.toFixed(0)} bpm
    `;

    return `
        あなたは専門のフィットネスコーチAIです。以下の活動データを分析し、設定された目標に基づいてアドバイスを提供してください。

        ---
        ${summaryText}
        ---

        このデータを基に、以下の3つのポイントについて日本語で詳細に分析し、Markdown形式で出力してください。

        1.  **日次目標達成度と週間・月間進捗の評価:** 今日の目標達成状況に基づき、週間と月間の活動レベルを評価してください。目標達成に向けたモチベーション維持に関するアドバイスを含めてください。
        2.  **活動強度（心拍数・時速）の評価:** 平均心拍数と平均時速から、活動の強度を評価してください。運動効率を高めるための具体的な強度調整（例: 有酸素運動の推奨）を提案してください。
        3.  **総合的なアドバイスと次の目標設定の提案:** 全ての指標を総合し、ユーザーの健康状態に関するインサイトと、次の一週間で挑戦すべき具体的な行動目標（例: 歩数を〇〇歩増やす、活動時間を〇〇分増やす）を1～2つ提案してください。
    `;
}
window.createAnalysisPrompt = createAnalysisPrompt;

// Markdown to HTML変換は前回コードと同じロジックを使用（api-handlers.jsまたはui-renderer.jsに配置を想定）
