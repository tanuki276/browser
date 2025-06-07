const iframe = document.getElementById("viewer");
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

window.addEventListener("message", event => {
  if (event.origin.includes("google") && event.data?.type === "query") {
    const url = event.data.query;
    navigateTo("https://www.google.com/search?q=" + encodeURIComponent(url));
  }
});

function navigateTo(url) {
  if (!/^https?:\/\//.test(url)) {
    url = "https://www.google.com/search?q=" + encodeURIComponent(url);
  }
  iframe.src = url;
  if (currentIndex === -1 || historyStack[currentIndex] !== url) {
    historyStack = historyStack.slice(0, currentIndex + 1);
    historyStack.push(url);
    currentIndex++;
    saveHistory(url);
  }
}

function goBack() {
  if (currentIndex > 0) {
    currentIndex--;
    iframe.src = historyStack[currentIndex];
  }
}

function goForward() {
  if (currentIndex < historyStack.length - 1) {
    currentIndex++;
    iframe.src = historyStack[currentIndex];
  }
}

function saveHistory(url) {
  const history = JSON.parse(localStorage.getItem("history") || "[]");
  history.unshift({ url, time: new Date().toISOString() });
  localStorage.setItem("history", JSON.stringify(history.slice(0, 100)));
}

function addBookmark() {
  const bookmarks = JSON.parse(localStorage.getItem("bookmarks") || "[]");
  if (!bookmarks.find(b => b.url === iframe.src)) {
    bookmarks.unshift({ url: iframe.src });
    localStorage.setItem("bookmarks", JSON.stringify(bookmarks));
  }
}

function openModal(type) {
  modal.classList.remove("hidden");
  modalTitle.textContent = type === "history" ? "履歴" : "ブックマーク";
  modalList.innerHTML = "";

  const data = JSON.parse(localStorage.getItem(type) || "[]");
  data.forEach(entry => {
    const li = document.createElement("li");
    li.textContent = entry.url;
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

backBtn.onclick = goBack;
forwardBtn.onclick = goForward;
bookmarkBtn.onclick = addBookmark;
showHistoryBtn.onclick = () => openModal("history");
showBookmarksBtn.onclick = () => openModal("bookmarks");