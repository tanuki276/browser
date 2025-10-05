// このファイルは、HTMLのDOM要素をJavaScriptから簡単に参照できるように定義します。

// --- DOM Elements ---

const $id = (id) => document.getElementById(id);

window.$dom = {
    // Input Fields
    $googleClientId: $id('googleClientId'),
    $geminiApiKey: $id('geminiApiKey'),
    $dailyGoalMinutes: $id('dailyGoalMinutes'), // 目標設定

    // Buttons
    $authButton: $id('auth-button'),
    $fetchButton: $id('fetch-button'),
    $analyzeButton: $id('analyze-button'),

    // Display/Status
    $errorDisplay: $id('error-display'),

    // Stopwatch elements
    $timerButton: $id('timer-button'),
    $timerDisplay: $id('timer-display'),
    $timerStatus: $id('timer-status'),

    // Summary elements
    $summarySection: $id('summary-section'),
    $dailyTotal: $id('daily-total'),
    $weeklyTotal: $id('weekly-total'),
    $monthlyTotal: $id('monthly-total'),

    // Detail Metrics
    $detailMetricsSection: $id('detail-metrics-section'),
    $detailMetrics: $id('detail-metrics'),

    // Analysis elements
    $analysisControlSection: $id('analysis-control-section'),
    $analysisResultSection: $id('analysis-result-section'),
    $analysisTitle: $id('analysis-title'),
    $analysisContent: $id('analysis-content'),
};
