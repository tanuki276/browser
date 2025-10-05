// --- DOM Elements ---
// このファイルは、すべてのDOM要素への参照を管理します。

const $id = (id) => document.getElementById(id);

window.$dom = {
    $googleClientId: $id('googleClientId'),
    $geminiApiKey: $id('geminiApiKey'),
    $authButton: $id('auth-button'),
    $fetchButton: $id('fetch-button'),
    $analyzeButton: $id('analyze-button'),
    $errorDisplay: $id('error-display'),
    $metricsSection: $id('metrics-section'),
    $dataChartSection: $id('data-chart-section'),
    $analysisResultSection: $id('analysis-result-section'),
    $summaryMetrics: $id('summary-metrics'),
    $dailyDataTable: $id('daily-data-table'),
    $analysisTitle: $id('analysis-title'),
    $analysisContent: $id('analysis-content'),
    $stepsDistanceViz: $id('steps-distance-visualization')
};
