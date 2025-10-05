// このファイルは、Google Fit API/Gemini APIへの通信ロジックを管理します。

// data-logic.jsで定義されたwindow.stateを使用

// --- Constants ---
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/fitness/v1/rest"];
// ★★★ READ/WRITE両方の権限 ★★★
const SCOPES = "https://www.googleapis.com/auth/fitness.activity.read https://www.googleapis.com/auth/fitness.activity.write https://www.googleapis.com/auth/fitness.body.read"; 
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent`;
const MS_IN_DAY = 24 * 60 * 60 * 1000;

// --- GAPI Initialization --- (前回のコードとほぼ同じ)
function initClient() { /* ... */ }
function initGapiClient() { /* ... */ }
function updateSigninStatus(isSignedIn) { /* ... */ }
function handleAuthClick() { /* ... */ }
window.initClient = initClient;
window.initGapiClient = initGapiClient;
window.handleAuthClick = handleAuthClick;


// --- Google Fit Handlers (詳細データ取得) ---

/**
 * Fitのデータソースから集計値を取得
 * @param {number} startTimeMs - 開始時刻
 * @param {number} endTimeMs - 終了時刻
 * @param {string} dataType - 例: "com.google.heart_rate.bpm"
 * @param {string} dataSourceId - Fit APIのデータソースID
 * @param {number} bucketDurationMs - 集計間隔
 * @returns {Array} - 集計バケット
 */
async function aggregateFitData(startTimeMs, endTimeMs, dataType, dataSourceId, bucketDurationMs) {
    const requestBody = {
        aggregateBy: [{ 
            dataType: dataType,
            dataSourceId: dataSourceId 
        }],
        bucketByTime: { durationMillis: bucketDurationMs },
        startTimeMillis: startTimeMs,
        endTimeMillis: endTimeMs,
    };

    const response = await gapi.client.fitness.users.dataset.aggregate({
        userId: 'me',
        resource: requestBody
    });

    return response.result && response.result.bucket ? response.result.bucket : [];
}


async function handleFetchClick() {
    const state = window.state;
    if (!state.isSignedIn) return;

    state.loading = true;
    state.sessions = [];
    state.summaryData = null;
    state.analysis = null;
    window.updateUI();

    const now = new Date();
    const startTimeMillis = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30).getTime();
    const endTimeMillis = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - 1; 

    try {
        // 1. セッションリストを取得 (過去30日間)
        const sessionResponse = await gapi.client.fitness.users.sessions.list({
            userId: 'me',
            startTime: startTimeMillis,
            endTime: endTimeMillis,
            includeDeleted: false,
        });

        const rawSessions = sessionResponse.result.session || [];
        
        // 2. 各セッションの活動期間中の詳細データを取得し、集計する
        const sessionsWithDetails = await Promise.all(rawSessions
            .filter(s => s.activityType !== 0)
            .map(async s => {
                const sessionStart = parseInt(s.startTimeMillis);
                const sessionEnd = parseInt(s.endTimeMillis);
                const durationMs = sessionEnd - sessionStart;
                const durationMinutes = durationMs / (1000 * 60);

                // 各指標のデータ取得 (セッション期間中の合計/平均)
                const aggregates = await Promise.all([
                    // 歩数 (STEP_COUNT_DELTA)
                    aggregateFitData(sessionStart, sessionEnd, "com.google.step_count.delta", "raw:com.google.step_count.delta:*:*", durationMs),
                    // 距離 (DISTANCE_DELTA)
                    aggregateFitData(sessionStart, sessionEnd, "com.google.distance.delta", "raw:com.google.distance.delta:*:*", durationMs),
                    // カロリー (CALORIES_EXPENDED)
                    aggregateFitData(sessionStart, sessionEnd, "com.google.calories.expended", "raw:com.google.calories.expended:*:*", durationMs),
                    // 心拍数 (HEART_RATE_BPM) - 平均値を取得するため、時間バケットはそのまま
                    aggregateFitData(sessionStart, sessionEnd, "com.google.heart_rate.bpm", "raw:com.google.heart_rate.bpm:*:*", 1000 * 60)
                ]);

                // データの抽出
                const extractValue = (buckets, type) => {
                    let totalValue = 0;
                    let count = 0;

                    buckets.forEach(bucket => {
                        bucket.dataset.forEach(dataset => {
                            dataset.point.forEach(point => {
                                const value = point.value[0]?.fpVal || point.value[0]?.intVal || 0;
                                totalValue += value;
                                count++;

                                // 心拍数の場合は平均値を計算する必要がある
                                if (type === 'heartRate') {
                                    // 心拍数は平均を出すために、ここでは個々の値を合計
                                }
                            });
                        });
                    });

                    // 心拍数の場合は、合計をカウントで割って平均を出す
                    if (type === 'heartRate' && count > 0) return totalValue / count;
                    return totalValue;
                };

                const steps = extractValue(aggregates[0], 'steps');
                const distance = extractValue(aggregates[1], 'distance');
                const calories = extractValue(aggregates[2], 'calories');
                const avgHeartRate = extractValue(aggregates[3], 'heartRate');

                return {
                    startTime: sessionStart,
                    endTime: sessionEnd,
                    durationMinutes: durationMinutes,
                    steps: Math.round(steps),
                    distance: distance, // meter
                    calories: calories, // kcal
                    avgHeartRate: avgHeartRate, // bpm
                };
            })
        );
        
        state.sessions = sessionsWithDetails;
        state.summaryData = window.calculateSummary(); // 集計実行
        state.authError = null;

    } catch (error) {
        console.error("Fit Data Fetch Error:", error);
        state.authError = "データ取得中にエラーが発生しました。権限とClient IDを確認してください。";
    } finally {
        state.loading = false;
        window.updateUI();
    }
}
window.handleFetchClick = handleFetchClick;


// --- Google Fit Handlers (書き込み) ---

/**
 * 計測した活動時間をGoogle Fitにセッションとして書き込む
 */
async function writeActivityToFit(startTimeMs, endTimeMs) {
    const state = window.state;
    if (!state.isSignedIn) {
        alert("Google Fitにサインインしてから記録してください。");
        return false;
    }
    
    // 活動タイプ: 7 (ウォーキング), 8 (ランニング), 113 (ハイキング)
    // ここでは一般的な "OTHER" (9) または "WALKING" (7) を使用
    const activityType = 7; 
    const sessionId = `activity-tracker-${startTimeMs}-${endTimeMs}`;

    const requestBody = {
        id: sessionId,
        name: `計測活動 (${new Date(startTimeMs).toLocaleDateString()})`,
        description: `活動時間: ${window.formatTime(endTimeMs - startTimeMs)}`,
        startTimeMillis: startTimeMs,
        endTimeMillis: endTimeMs,
        activityType: activityType,
    };

    try {
        const response = await gapi.client.fitness.users.sessions.update({
            userId: 'me',
            sessionId: sessionId,
            resource: requestBody,
        });

        if (response.status === 200) {
             // 書き込み成功後、データを再取得して最新の状態を反映する
             await handleFetchClick(); 
             return true;
        } else {
            throw new Error(`Fit API failed with status: ${response.status}`);
        }

    } catch (error) {
        console.error("Fit Data Write Error:", error);
        alert(`活動の記録に失敗しました: ${error.message}`);
        return false;
    }
}
window.writeActivityToFit = writeActivityToFit;


// --- Gemini AI Analysis --- (前回のコードを流用し、目標設定を考慮)

async function handleAnalyzeClick() {
    const state = window.state;
    if (!state.geminiApiKey || !state.summaryData || state.isProcessing) return;

    state.isProcessing = true;
    state.analysis = { title: "AI詳細アドバイス", content: `<div class="flex items-center justify-center py-8">
        <span class="animate-spin h-8 w-8 mr-3 border-4 border-blue-600 border-solid rounded-full spinner border-r-transparent"></span>
        <span class="text-blue-600 font-semibold">Geminiがデータを解析し、アドバイスを作成しています...</span>
    </div>` };
    window.updateUI();

    const prompt = window.createAnalysisPrompt(state.summaryData, state.dailyGoalMinutes); 

    try {
        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': state.geminiApiKey, // API Keyをヘッダーで渡す（推奨）
            },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Gemini API Error: ${response.status} - ${errorData.error ? errorData.error.message : response.statusText}`);
        }

        const data = await response.json();
        const analysisText = data.candidates[0].content.parts[0].text;
        
        const { title, content } = window.parseAndFormatAnalysis(analysisText); // UI rendererで定義される
        
        state.analysis.title = title;
        state.analysis.content = content;
        state.authError = null;

    } catch (error) {
        console.error("Gemini Analysis Error:", error);
        state.authError = `AI解析エラー: ${error.message}. APIキーが正しいか確認してください。`;
        state.analysis = { title: "AI解析エラー", content: `<p class="text-red-600">${error.message}</p>` };
    } finally {
        state.isProcessing = false;
        window.updateUI();
    }
}
window.handleAnalyzeClick = handleAnalyzeClick;
