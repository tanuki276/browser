const iframe = document.getElementById("viewer");
const urlBox = document.getElementById("urlBox");
const clearInputBtn = document.getElementById("clearInput");
const goBtn = document.getElementById("goBtn");
const backBtn = document.getElementById("backBtn");
const forwardBtn = document.getElementById("forwardBtn");
const bookmarkBtn = document.getElementById("bookmarkBtn");
const showHistoryBtn = document.getElementById("showHistory");
const showBookmarksBtn = document.getElementById("showBookmarks");
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalList = document.getElementById("modalList");

let historyStack = [];
let currentIndex = -1;

function navigateTo(url) {
  if (!url) return;
  if (!/^https?:\/\//.test(url)) {
    url = "https://ja.wikipedia.org/wiki/" + encodeURIComponent(url.trim());
  }
  iframe.src = url;
  urlBox.value = url;

  if (currentIndex === -1 || historyStack[currentIndex] !== url) {
    historyStack = historyStack.slice(0, currentIndex + 1);
    historyStack.push(url);
    currentIndex++;
    saveHistory(url);
  }

  updateNavigationButtons();
}

function saveHistory(url) {
  const history = JSON.parse(localStorage.getItem("history") || "[]");
  const existsIndex = history.findIndex(h => h.url === url);
  if (existsIndex !== -1) history.splice(existsIndex, 1);
  history.unshift({ url, time: new Date().toISOString() });
  localStorage.setItem("history", JSON.stringify(history.slice(0, 100)));
}

function goBack() {
  if (currentIndex > 0) {
    currentIndex--;
    iframe.src = historyStack[currentIndex];
    urlBox.value = historyStack[currentIndex];
  }
  updateNavigationButtons();
}

function goForward() {
  if (currentIndex < historyStack.length - 1) {
    currentIndex++;
    iframe.src = historyStack[currentIndex];
    urlBox.value = historyStack[currentIndex];
  }
  updateNavigationButtons();
}

function addBookmark() {
  const bookmarks = JSON.parse(localStorage.getItem("bookmarks") || "[]");
  if (!bookmarks.find(b => b.url === iframe.src)) {
    bookmarks.unshift({ url: iframe.src });
    localStorage.setItem("bookmarks", JSON.stringify(bookmarks));
    alert("ブックマークに追加しました！");
  } else {
    alert("すでにブックマークにあります。");
  }
}

function openModal(type) {
  modal.classList.remove("hidden");
  modalTitle.textContent = (type === "history") ? "履歴" : "ブックマーク";
  modalList.innerHTML = "";

  const data = JSON.parse(localStorage.getItem(type) || "[]");

  if (!data.length) {
    const noDataLi = document.createElement("li");
    noDataLi.textContent = "データがありません。";
    noDataLi.style.color = "#888";
    modalList.appendChild(noDataLi);
    return;
  }

  data.forEach(entry => {
    const li = document.createElement("li");
    li.textContent = entry.url;
    li.style.cursor = "pointer";
    li.onclick = () => {
      navigateTo(entry.url);
      closeModal();
    };
    modalList.appendChild(li);
  });
}

function closeModal() {
  modal.classList.add("hidden");
}

function updateNavigationButtons() {
  backBtn.disabled = currentIndex <= 0;
  forwardBtn.disabled = currentIndex >= historyStack.length - 1;
}


goBtn.onclick = () => navigateTo(urlBox.value.trim());

urlBox.onkeydown = e => {
  if (e.key === "Enter") {
    navigateTo(urlBox.value.trim());
  }
};

urlBox.addEventListener("input", () => {
  clearInputBtn.style.display = urlBox.value ? "inline" : "none";
});

clearInputBtn.onclick = () => {
  urlBox.value = "";
  clearInputBtn.style.display = "none";
  urlBox.focus();
};

backBtn.onclick = goBack;
forwardBtn.onclick = goForward;
bookmarkBtn.onclick = addBookmark;
showHistoryBtn.onclick = () => openModal("history");
showBookmarksBtn.onclick = () => openModal("bookmarks");

updateNavigationButtons();