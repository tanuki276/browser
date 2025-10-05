// このファイルは、DOM操作、UIのレンダリング、イベントリスナーの設定を管理します。

// api-handlers.jsで定義された状態とdom-elements.jsで定義されたDOM参照を使用
const state = window.state;
const $dom = window.$dom;

// --- UI Rendering Functions ---

function updateUI() {
    // 1. Error Display
    if (state.authError) {
        $dom.$errorDisplay.textContent = state.authError;
        $dom.$errorDisplay.classList.remove('hidden');
    } else {
        $dom.$errorDisplay.classList.add('hidden');
    }

    // 2. Auth Button
    $dom.$authButton.disabled = !state.isGapiLoaded && state.googleClientId.length > 0;
    if (!state.googleClientId) {
        $dom.$authButton.textContent = "IDを入力してください";
        $dom.$authButton.className = 'px-4 py-2 font-semibold text-white rounded-lg transition duration-300 bg-gray-400';
    } else if (!state.isGapiLoaded) {
        $dom.$authButton.textContent = "APIロード中...";
        $dom.$authButton.className = 'px-4 py-2 font-semibold text-white rounded-lg transition duration-300 bg-yellow-600';
    } else {
        $dom.$authButton.textContent = state.isSignedIn ? "Google Fitからログアウト" : "Google Fitにサインイン";
        $dom.$authButton.className = `px-4 py-2 font-semibold text-white rounded-lg transition duration-300 ${state.isSignedIn ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'} shadow-md`;
    }

    // 3. Fetch Button
    $dom.$fetchButton.disabled = !state.isSignedIn || state.loading;
    $dom.$fetchButton.className = `flex-1 px-6 py-3 font-semibold text-white rounded-lg transition duration-300 ${state.isSignedIn && !state.loading ? 'bg-indigo-600 hover:bg-indigo-700 shadow-lg' : 'bg-gray-400 cursor-not-allowed'}`;
    if (state.loading && !state.metrics) {
        $dom.$fetchButton.innerHTML = `<span class="animate-spin h-5 w-5 mr-3 border-4 border-white border-solid rounded-full spinner border-r-transparent"></span> データ取得中...`;
    } else {
        $dom.$fetchButton.textContent = "Fitデータ取得 (過去7日間)";
    }

    // 4. Metrics Section & Summary Cards
    if (state.metrics && state.metrics.summary) {
        $dom.$metricsSection.classList.remove('hidden');
        renderSummaryMetrics(state.metrics.summary);
    } else {
        $dom.$metricsSection.classList.add('hidden');
    }

    // 5. Data Chart Section
    if (state.rows.length > 0 && state.metrics) {
        $dom.$dataChartSection.classList.remove('hidden');
        renderCssBars(state.metrics.dailyData);
        renderDailyDataTable(state.metrics.dailyData);
    } else {
        $dom.$dataChartSection.classList.add('hidden');
    }

    // 6. Analyze Button
    $dom.$analyzeButton.disabled = !state.geminiApiKey || !state.metrics || state.isProcessing;
    $dom.$analyzeButton.className = `w-full px-6 py-3 font-semibold text-white rounded-lg transition duration-300 ${!$dom.$analyzeButton.disabled ? 'bg-blue-600 hover:bg-blue-700 shadow-lg' : 'bg-gray-400 cursor-not-allowed'} flex items-center justify-center`;
    if (state.isProcessing) {
        $dom.$analyzeButton.innerHTML = `<span class="animate-spin h-5 w-5 mr-3 border-4 border-white border-solid rounded-full spinner border-r-transparent"></span> Gemini解析中...`;
    } else {
        $dom.$analyzeButton.textContent = "Geminiで詳細解析開始";
    }

    // 7. Analysis Result Section
    if (state.analysis) {
        $dom.$analysisResultSection.classList.remove('hidden');
        $dom.$analysisTitle.textContent = state.analysis.title || "AI詳細分析結果";
        $dom.$analysisContent.innerHTML = state.analysis.content;
    } else {
        $dom.$analysisResultSection.classList.add('hidden');
    }
}
window.updateUI = updateUI; // api-handlers.jsから参照可能にする


function renderSummaryMetrics(summary) {
    $dom.$summaryMetrics.innerHTML = '';
    const metricsList = [
        { title: "合計歩数", value: summary.totalSteps.toLocaleString(), unit: "歩" },
        { title: "合計距離", value: (summary.totalDistance / 1000).toFixed(2), unit: "km" },
        { title: "平均睡眠時間", value: window.formatDuration(summary.averageSleep), unit: "" },
    ];

    metricsList.forEach(m => {
        const card = `
            <div class="bg-white p-4 rounded-lg shadow-md border border-gray-100">
                <p class="text-xs font-medium text-gray-500">${m.title}</p>
                <p class="text-2xl font-bold text-gray-900 mt-1">
                    ${m.value}<span class="text-base font-semibold text-gray-500 ml-1">${m.unit}</span>
                </p>
            </div>
        `;
        $dom.$summaryMetrics.insertAdjacentHTML('beforeend', card);
    });
}

function renderCssBars(dailyData) {
    $dom.$stepsDistanceViz.innerHTML = '';
    // X軸ラベルコンテナは $stepsDistanceViz の2つ後の要素 (HTML構造依存)
    const labelsContainer = $dom.$stepsDistanceViz.parentNode.querySelector('.flex.justify-around.mt-1'); 
    labelsContainer.innerHTML = '';

    if (dailyData.length === 0) return;

    const maxSteps = Math.max(...dailyData.map(d => d.steps));
    const maxDistance = Math.max(...dailyData.map(d => d.distanceKm));
    const maxVal = Math.max(maxSteps, maxDistance);

    dailyData.forEach(d => {
        const stepsHeight = maxVal > 0 ? (d.steps / maxVal) * 90 : 0; 
        const distanceHeight = maxVal > 0 ? (d.distanceKm / maxVal) * 90 : 0; 
        const dateLabel = new Date(d.date).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' });

        const dayContainer = document.createElement('div');
        dayContainer.className = 'w-1/7 h-full flex items-end justify-center relative px-1';

        const stepsBar = document.createElement('div');
        stepsBar.className = 'bar w-5/12 bg-blue-500 mr-0.5';
        stepsBar.style.height = `${stepsHeight}%`;

        const distBar = document.createElement('div');
        distBar.className = 'bar w-5/12 bg-green-500';
        distBar.style.height = `${distanceHeight}%`;

        dayContainer.appendChild(stepsBar);
        dayContainer.appendChild(distBar);
        
        $dom.$stepsDistanceViz.appendChild(dayContainer);

        const labelSpan = document.createElement('span');
        labelSpan.className = 'text-xs text-gray-600 w-1/7 text-center';
        labelSpan.textContent = dateLabel;
        labelsContainer.appendChild(labelSpan);
    });
}

function renderDailyDataTable(dailyData) {
    const tableHeaders = ['日付', '歩数', '距離 (km)', '消費カロリー (kcal)', '睡眠時間'];
    
    let tableHTML = `
        <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr>
                    ${tableHeaders.map(h => `<th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">${h}</th>`).join('')}
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
    `;

    dailyData.forEach(d => {
        const dateStr = new Date(d.date).toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
        tableHTML += `
            <tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${dateStr}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${d.steps.toLocaleString()}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${d.distanceKm.toFixed(2)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${d.calories.toFixed(0)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${window.formatDuration(d.sleepMillis)}</td>
            </tr>
        `;
    });

    tableHTML += '</tbody></table>';
    $dom.$dailyDataTable.innerHTML = tableHTML;
}

// --- Event Handlers & Initialization ---

function handleClientIdInput(e) {
    if (e.target.id === 'googleClientId') {
        state.googleClientId = e.target.value;
        if (window.gapi && window.gapi.client && window.gapi.client.init) {
            window.initGapiClient();
        }
    } else if (e.target.id === 'geminiApiKey') {
        state.geminiApiKey = e.target.value;
    }
    updateUI();
}

function initializeApp() {
    
    // Input field listeners
    $dom.$googleClientId.addEventListener('input', handleClientIdInput);
    $dom.$geminiApiKey.addEventListener('input', handleClientIdInput);

    // Button listeners (api-handlers.jsで定義したグローバル関数を呼び出す)
    $dom.$authButton.addEventListener('click', window.handleAuthClick);
    $dom.$fetchButton.addEventListener('click', window.handleFetchClick);
    $dom.$analyzeButton.addEventListener('click', window.handleAnalyzeClick);

    // Google API Client Libraryのロードを待って、api-handlers.jsのinitClientが呼ばれる
    
    updateUI(); 
}

// DOMコンテンツがロードされたらアプリケーションを初期化
document.addEventListener('DOMContentLoaded', initializeApp);
