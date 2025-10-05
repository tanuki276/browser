// このファイルは、グローバル状態、定数、およびGoogle Fit/Gemini APIへの通信ロジックを管理します。

// --- Global State ---
window.state = {
    googleClientId: "",
    geminiApiKey: "",
    isGapiLoaded: false,
    isSignedIn: false,
    loading: false,
    isProcessing: false,
    authError: null,
    rows: [], // Raw time-series data
    metrics: null, // Aggregated metrics (summary + dailyData)
    analysis: null,
};

// --- Constants ---
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/fitness/v1/rest"];
const SCOPES = "https://www.googleapis.com/auth/fitness.activity.read https://www.googleapis.com/auth/fitness.body.read";
const GEMINI_MODEL = "gemini-2.5-flash-preview-05-20";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;


// --- GAPI Initialization ---

function initClient() {
    window.state.isGapiLoaded = true;
    window.updateUI();
    if (window.state.googleClientId) {
        initGapiClient();
    }
}

function initGapiClient() {
    if (!window.state.googleClientId) return;
    gapi.client.init({
        apiKey: 'DUMMY', 
        clientId: window.state.googleClientId,
        discoveryDocs: DISCOVERY_DOCS,
        scope: SCOPES,
    }).then(() => {
        gapi.auth2.getAuthInstance().isSignedIn.listen(updateSigninStatus);
        updateSigninStatus(gapi.auth2.getAuthInstance().isSignedIn.get());
        window.state.isGapiLoaded = true;
        window.updateUI();
    }).catch(error => {
        console.error("GAPI Client Init Error:", error);
        window.state.authError = "Google APIクライアントの初期化に失敗しました。Client IDを確認してください。";
        window.updateUI();
    });
}

function updateSigninStatus(isSignedIn) {
    window.state.isSignedIn = isSignedIn;
    window.state.authError = null;
    window.updateUI();
}

// --- Google Fit Handlers ---

function handleAuthClick() {
    if (gapi.auth2.getAuthInstance().isSignedIn.get()) {
        gapi.auth2.getAuthInstance().signOut();
    } else {
        gapi.auth2.getAuthInstance().signIn();
    }
}

async function handleFetchClick() {
    const state = window.state;
    if (!state.isSignedIn) return;

    state.loading = true;
    state.rows = [];
    state.metrics = null;
    state.analysis = null;
    window.updateUI();

    const MS_IN_DAY = 24 * 60 * 60 * 1000;
    const now = new Date();
    const startTimeMillis = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7).getTime();
    const endTimeMillis = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - 1; 

    try {
        const requestBody = {
            aggregateBy: [
                { dataType: "com.google.step_count.delta", dataSourceId: "raw:com.google.step_count.delta:*" },
                { dataType: "com.google.distance.delta", dataSourceId: "raw:com.google.distance.delta:*" },
                { dataType: "com.google.calories.expended", dataSourceId: "raw:com.google.calories.expended:*" },
                { dataType: "com.google.sleep.segment", dataSourceId: "raw:com.google.sleep.segment:*" }
            ],
            bucketByTime: { durationMillis: MS_IN_DAY },
            startTimeMillis: startTimeMillis,
            endTimeMillis: endTimeMillis,
        };

        const response = await gapi.client.fitness.users.dataset.aggregate({
            userId: 'me',
            resource: requestBody
        });

        if (response.result && response.result.bucket) {
            state.rows = response.result.bucket;
            state.metrics = window.processFitData(state.rows); 
            state.authError = null;
        } else {
            state.authError = "Google Fitデータが取得できませんでした。権限を確認してください。";
        }

    } catch (error) {
        console.error("Fit Data Fetch Error:", error);
        state.authError = "データ取得中にエラーが発生しました。";
    } finally {
        state.loading = false;
        window.updateUI();
    }
}

// --- Gemini AI Analysis ---

async function handleAnalyzeClick() {
    const state = window.state;
    if (!state.geminiApiKey || !state.metrics || state.isProcessing) return;

    state.isProcessing = true;
    state.analysis = { title: "AI詳細分析結果", content: `<div class="flex items-center justify-center py-8">
        <span class="animate-spin h-8 w-8 mr-3 border-4 border-blue-600 border-solid rounded-full spinner border-r-transparent"></span>
        <span class="text-blue-600 font-semibold">Geminiがデータを解析しています...</span>
    </div>` };
    window.updateUI();

    const prompt = window.createAnalysisPrompt(state.metrics); 

    try {
        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                config: {
                    apiKey: state.geminiApiKey,
                },
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Gemini API Error: ${response.status} - ${errorData.error ? errorData.error.message : response.statusText}`);
        }

        const data = await response.json();
        const analysisText = data.candidates[0].content.parts[0].text;
        
        const { title, content } = window.parseAndFormatAnalysis(analysisText);

        state.analysis.title = title;
        state.analysis.content = content;
        state.authError = null;

    } catch (error) {
        console.error("Gemini Analysis Error:", error);
        state.authError = `AI解析エラー: ${error.message}. APIキーが正しいか、レート制限に達していないか確認してください。`;
        state.analysis = { title: "AI解析エラー", content: `<p class="text-red-600">${error.message}</p>` };
    } finally {
        state.isProcessing = false;
        window.updateUI();
    }
}

// 他のJSファイルから参照できるようにグローバルに公開
window.initClient = initClient;
window.initGapiClient = initGapiClient;
window.handleAuthClick = handleAuthClick;
window.handleFetchClick = handleFetchClick;
window.handleAnalyzeClick = handleAnalyzeClick;
