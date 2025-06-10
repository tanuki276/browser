function navigateTo(input) {
  let url;
  if (/^https?:\/\//.test(input)) {
    if (input.includes("wikipedia.org")) {
      url = input;
    } else {
      alert("WikipediaのURLのみ対応しています");
      return;
    }
  } else {
    const keyword = encodeURIComponent(input.trim());
    url = `https://ja.wikipedia.org/wiki/${keyword}`;
  }
  
  iframe.src = url;
  urlBox.value = url;

  if (currentIndex === -1 || historyStack[currentIndex] !== url) {
    historyStack = historyStack.slice(0, currentIndex + 1);
    historyStack.push(url);
    currentIndex++;
    saveHistory(url);
    updateNavButtons();
  }
}