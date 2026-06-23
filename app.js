// 國字學習儀表板 核心邏輯 (Hanzi Learning Dashboard Core Logic)

// 全局狀態管理
let state = {
  allCards: [],         // 所有的字卡資料（從 cards_data.js 讀取）
  activeQueue: [],      // 當前學習佇列（已排除「已學會」的字卡，可能已洗牌）
  currentIndex: 0,      // 當前正在學習的字卡索引
  currentMode: 'card',  // 'card' (圖卡模式), 'text' (國字考驗), 'dashboard' (進度管理)
  isShuffled: false,    // 是否隨機洗牌
  masteredCards: new Set(), // 已學會的國字集合 (存於 localStorage)
  customVocab: {},      // 自訂詞彙對照表 { "日": ["詞1", "詞2", ...] } (存於 localStorage)
  selectedVoiceName: "", // 使用者手動選擇的語音名稱 (存於 localStorage)
  
  // 編輯詞彙暫存
  editingChar: null
};

// 初始化設定
document.addEventListener("DOMContentLoaded", () => {
  // 載入資料
  if (typeof CARDS_DATA !== "undefined") {
    state.allCards = CARDS_DATA;
  } else {
    console.error("找不到 CARDS_DATA 資料，請確認 cards_data.js 是否正確載入。");
    // 後備空白資料
    state.allCards = [];
  }

  // 讀取 LocalStorage 進度
  loadProgress();

  // 綁定 UI 事件
  setupEventListeners();

  // 初始化學習佇列
  rebuildQueue();

  // 初始化語音模組 (iOS Safari 語音解鎖)
  window.speechSynthesis.getVoices();

  // 渲染頁面
  render();
});

// 載入進度與設定
function loadProgress() {
  // 讀取已學會國字
  const mastered = localStorage.getItem("hanzi_mastered");
  if (mastered) {
    try {
      const arr = JSON.parse(mastered);
      state.masteredCards = new Set(arr);
    } catch (e) {
      state.masteredCards = new Set();
    }
  }

  // 讀取自訂詞彙
  const customVoc = localStorage.getItem("hanzi_custom_vocab");
  if (customVoc) {
    try {
      state.customVocab = JSON.parse(customVoc);
    } catch (e) {
      state.customVocab = {};
    }
  }

  // 讀取使用者選取的語音
  state.selectedVoiceName = localStorage.getItem("hanzi_selected_voice") || "";

  // 讀取洗牌設定
  const shuffled = localStorage.getItem("hanzi_shuffled");
  state.isShuffled = shuffled === "true";
  document.getElementById("shuffle-toggle").checked = state.isShuffled;

  // 讀取上次學習模式
  const mode = localStorage.getItem("hanzi_mode");
  if (mode && ['card', 'text', 'dashboard'].includes(mode)) {
    state.currentMode = mode;
  }
}

// 儲存進度
function saveProgress() {
  localStorage.setItem("hanzi_mastered", JSON.stringify(Array.from(state.masteredCards)));
  localStorage.setItem("hanzi_custom_vocab", JSON.stringify(state.customVocab));
  localStorage.setItem("hanzi_shuffled", state.isShuffled ? "true" : "false");
  localStorage.setItem("hanzi_mode", state.currentMode);
  localStorage.setItem("hanzi_selected_voice", state.selectedVoiceName);
}

// 重建學習佇列
function rebuildQueue() {
  // 過濾掉已移除（已學會）的字卡
  let queue = state.allCards.filter(card => !state.masteredCards.has(card.char));

  // 隨機洗牌
  if (state.isShuffled) {
    // Fisher-Yates Shuffle
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [queue[i], queue[j]] = [queue[j], queue[i]];
    }
  }

  state.activeQueue = queue;
  
  // 調整當前索引，確保不溢出
  if (state.currentIndex >= queue.length) {
    state.currentIndex = Math.max(0, queue.length - 1);
  }
}

// 設定事件監聽器
function setupEventListeners() {
  // 切換模式分頁
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const mode = e.target.getAttribute("data-mode");
      switchMode(mode);
    });
  });

  // 語音選擇器變更監聽
  const voiceSelect = document.getElementById("voice-select");
  if (voiceSelect) {
    voiceSelect.addEventListener("change", (e) => {
      state.selectedVoiceName = e.target.value;
      saveProgress();
    });
  }

  // Web Speech API 語音清單變更監聽 (解決非同步載入問題)
  if (typeof window.speechSynthesis !== "undefined") {
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = populateVoices;
    }
    populateVoices();
  }

  // 隨機洗牌切換
  document.getElementById("shuffle-toggle").addEventListener("change", (e) => {
    state.isShuffled = e.target.checked;
    saveProgress();
    
    // 記錄當前卡片，洗牌後儘量停留在同一張卡片
    const currentCard = getActiveCard();
    rebuildQueue();
    
    if (currentCard) {
      const newIdx = state.activeQueue.findIndex(c => c.char === currentCard.char);
      if (newIdx !== -1) {
        state.currentIndex = newIdx;
      } else {
        state.currentIndex = 0;
      }
    }
    render();
  });

  // 編輯詞彙彈窗 - 取消
  document.getElementById("btn-modal-cancel").addEventListener("click", closeEditModal);
  
  // 編輯詞彙彈窗 - 儲存
  document.getElementById("btn-modal-save").addEventListener("click", saveEditModal);

  // 點擊 Modal 外部關閉
  document.getElementById("edit-modal").addEventListener("click", (e) => {
    if (e.target.id === "edit-modal") {
      closeEditModal();
    }
  });
}

// 填充可用的中文語音選單
function populateVoices() {
  const voiceSelect = document.getElementById("voice-select");
  if (!voiceSelect) return;

  const voices = window.speechSynthesis.getVoices();

  // 篩選出中文語音 (zh-TW, zh-HK, zh-CN, cmn, chi)
  let zhVoices = voices.filter(voice => 
    voice.lang.toLowerCase().includes("zh") || 
    voice.lang.toLowerCase().includes("cmn") || 
    voice.lang.toLowerCase().includes("chi") ||
    voice.name.includes("Chinese") ||
    voice.name.includes("Google 國語")
  );

  // 若沒找到中文語音，後備列出所有語音
  if (zhVoices.length === 0) {
    zhVoices = voices;
  }

  // 排序：將台灣(zh-TW)放在最上方
  zhVoices.sort((a, b) => {
    const aTW = a.lang.toLowerCase().includes("zh-tw");
    const bTW = b.lang.toLowerCase().includes("zh-tw");
    if (aTW && !bTW) return -1;
    if (!aTW && bTW) return 1;
    return 0;
  });

  voiceSelect.innerHTML = "";

  // 系統預設語音選項
  const defaultOpt = document.createElement("option");
  defaultOpt.value = "";
  defaultOpt.textContent = "系統預設 (Taiwan)";
  voiceSelect.appendChild(defaultOpt);

  zhVoices.forEach(voice => {
    const option = document.createElement("option");
    option.value = voice.name;

    let displayName = voice.name;
    if (voice.lang.toLowerCase().includes("zh-tw")) {
      displayName = "🇹🇼 " + displayName;
    } else if (voice.lang.toLowerCase().includes("zh-hk")) {
      displayName = "🇭🇰 " + displayName;
    } else if (voice.lang.toLowerCase().includes("zh-cn")) {
      displayName = "🇨🇳 " + displayName;
    }

    option.textContent = displayName;

    if (state.selectedVoiceName === voice.name) {
      option.selected = true;
    }
    
    voiceSelect.appendChild(option);
  });
}

// 取得目前正在讀的卡片
function getActiveCard() {
  if (state.activeQueue.length > 0 && state.currentIndex < state.activeQueue.length) {
    return state.activeQueue[state.currentIndex];
  }
  return null;
}

// 切換分頁模式
function switchMode(mode) {
  state.currentMode = mode;
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-mode") === mode);
  });
  saveProgress();
  render();
}

// 播放語音 (Web Speech API)
function speakText(text) {
  if (!text) return;
  
  // 停止先前的朗讀，避免聲音重疊
  window.speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-TW"; // 預設語言
  utterance.rate = 0.8;    // 慢速，對幼兒更清晰
  
  const voices = window.speechSynthesis.getVoices();
  
  if (state.selectedVoiceName) {
    const selectedVoice = voices.find(voice => voice.name === state.selectedVoiceName);
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
    }
  } else {
    // 預設尋找台灣本地語音
    const twVoice = voices.find(voice => 
      voice.lang.includes("zh-TW") || 
      voice.name.includes("Taiwan") || 
      voice.name.includes("Mei-Jia") || 
      voice.name.includes("Yating")
    );
    if (twVoice) {
      utterance.voice = twVoice;
    }
  }
  
  window.speechSynthesis.speak(utterance);
}

// 點擊上一張
function prevCard() {
  if (state.currentIndex > 0) {
    state.currentIndex--;
    render();
  }
}

// 點擊下一張
function nextCard() {
  if (state.currentIndex < state.activeQueue.length - 1) {
    state.currentIndex++;
    render();
  }
}

// 標記為「我會了（移除卡片）」
function markAsMastered() {
  const card = getActiveCard();
  if (!card) return;
  
  // 播放歡呼音效或是單純語音提示
  speakText(card.char + "，學會了！真棒！");

  // 加入已移除清單
  state.masteredCards.add(card.char);
  saveProgress();
  
  // 重建佇列
  rebuildQueue();
  
  render();
}

// 開啟詞彙編輯彈窗
function openEditModal(char) {
  state.editingChar = char;
  const card = state.allCards.find(c => c.char === char);
  if (!card) return;
  
  // 取得目前詞彙
  const vocab = state.customVocab[char] || card.vocab;
  
  document.getElementById("modal-title-char").textContent = char;
  
  // 填入輸入框
  for (let i = 0; i < 5; i++) {
    document.getElementById(`vocab-input-${i}`).value = vocab[i] || "";
  }
  
  document.getElementById("edit-modal").classList.add("open");
}

// 關閉編輯彈窗
function closeEditModal() {
  document.getElementById("edit-modal").classList.remove("open");
  state.editingChar = null;
}

// 儲存編輯彈窗
function saveEditModal() {
  const char = state.editingChar;
  if (!char) return;
  
  const newVocab = [];
  for (let i = 0; i < 5; i++) {
    const val = document.getElementById(`vocab-input-${i}`).value.trim();
    newVocab.push(val || `${char}字${i+1}`);
  }
  
  state.customVocab[char] = newVocab;
  saveProgress();
  closeEditModal();
  render();
}

// 恢復學習某個國字
function restoreCard(char) {
  state.masteredCards.delete(char);
  saveProgress();
  rebuildQueue();
  render();
}

// 重設所有學習進度
function resetAllProgress() {
  if (confirm("確定要重設所有學習進度嗎？所有字卡將重新放回學習清單。")) {
    state.masteredCards.clear();
    state.currentIndex = 0;
    saveProgress();
    rebuildQueue();
    render();
  }
}

// 渲染畫面核心函數
function render() {
  const mainElement = document.getElementById("main-content");
  mainElement.innerHTML = "";
  
  // 更新統計數據與進度條
  updateStats();

  if (state.currentMode === 'dashboard') {
    // 渲染進度管理牆
    renderDashboard(mainElement);
    return;
  }

  // 以下為學習模式（圖卡或國字考驗）
  if (state.activeQueue.length === 0) {
    // 沒有字卡（全數過關）
    renderEmptyState(mainElement);
    return;
  }

  const card = getActiveCard();
  if (!card) return;

  // 建立學習面板
  const studyContainer = document.createElement("div");
  studyContainer.className = "study-container";

  if (state.currentMode === 'card') {
    // 1. 圖卡學習模式
    const imgWrapper = document.createElement("div");
    imgWrapper.className = "card-image-wrapper";
    
    // 點圖片發音國字
    imgWrapper.addEventListener("click", () => speakText(card.char));
    
    const img = document.createElement("img");
    img.className = "card-image";
    img.src = card.filePath;
    img.alt = card.char;
    
    // 載入失敗後備處理
    img.onerror = () => {
      imgWrapper.innerHTML = `<span style="font-size: 5rem; font-weight:800;">${card.char}</span>`;
    };
    
    imgWrapper.appendChild(img);
    studyContainer.appendChild(imgWrapper);
    
    // 顯示 5 組詞彙
    renderVocabSection(studyContainer, card, true);
    
  } else if (state.currentMode === 'text') {
    // 2. 國字考驗模式 (清爽、預設隱藏詞彙)
    const textWrapper = document.createElement("div");
    textWrapper.className = "huge-text-wrapper";
    textWrapper.textContent = card.char;
    
    // 點巨大字發音國字
    textWrapper.addEventListener("click", () => speakText(card.char));
    
    studyContainer.appendChild(textWrapper);
    
    // 顯示詞彙（傳入 false 表示預設隱藏）
    renderVocabSection(studyContainer, card, false);
  }

  // 建立控制導覽列
  const navBar = document.createElement("div");
  navBar.className = "navigation-bar";

  // 上一張按鈕
  const prevBtn = document.createElement("button");
  prevBtn.className = "nav-btn btn-prev";
  prevBtn.innerHTML = "⬅ 上一張";
  prevBtn.disabled = state.currentIndex === 0;
  prevBtn.style.opacity = state.currentIndex === 0 ? "0.4" : "1";
  prevBtn.addEventListener("click", prevCard);

  // 我會了（移除）按鈕
  const masterBtn = document.createElement("button");
  masterBtn.className = "nav-btn btn-master";
  masterBtn.innerHTML = "✨ 我會了";
  masterBtn.addEventListener("click", markAsMastered);

  // 下一張按鈕
  const nextBtn = document.createElement("button");
  nextBtn.className = "nav-btn btn-next";
  nextBtn.innerHTML = "下一張 ➡";
  nextBtn.disabled = state.currentIndex === state.activeQueue.length - 1;
  nextBtn.style.opacity = state.currentIndex === state.activeQueue.length - 1 ? "0.4" : "1";
  nextBtn.addEventListener("click", nextCard);

  navBar.appendChild(prevBtn);
  navBar.appendChild(masterBtn);
  navBar.appendChild(nextBtn);

  mainElement.appendChild(studyContainer);
  mainElement.appendChild(navBar);
}

// 渲染詞彙區塊
function renderVocabSection(container, card, defaultVisible) {
  const vocabSection = document.createElement("div");
  vocabSection.className = "vocab-section";

  const vocab = state.customVocab[card.char] || card.vocab;

  if (!defaultVisible) {
    // 國字考驗模式：預設隱藏，建立提示按鈕
    const hintBtn = document.createElement("button");
    hintBtn.className = "hint-trigger-btn";
    hintBtn.innerHTML = "💡 顯示詞彙提示";
    
    const vocabGrid = document.createElement("div");
    vocabGrid.className = "vocab-grid";
    vocabGrid.style.display = "none";
    
    hintBtn.addEventListener("click", () => {
      if (vocabGrid.style.display === "none") {
        vocabGrid.style.display = "flex";
        hintBtn.innerHTML = "💡 隱藏詞彙提示";
      } else {
        vocabGrid.style.display = "none";
        hintBtn.innerHTML = "💡 顯示詞彙提示";
      }
    });
    
    buildVocabItems(vocabGrid, card, vocab);
    vocabSection.appendChild(hintBtn);
    vocabSection.appendChild(vocabGrid);
  } else {
    // 圖卡學習模式：預設直接顯示
    const vocabGrid = document.createElement("div");
    vocabGrid.className = "vocab-grid";
    buildVocabItems(vocabGrid, card, vocab);
    vocabSection.appendChild(vocabGrid);
  }

  container.appendChild(vocabSection);
}

// 建立 5 個詞彙按鈕
function buildVocabItems(gridContainer, card, vocabList) {
  vocabList.forEach((word) => {
    const vocabItem = document.createElement("div");
    vocabItem.className = "vocab-item";

    const btn = document.createElement("button");
    btn.className = "vocab-btn";
    btn.textContent = word;
    
    // 點擊詞彙播放詞彙語音 (點一個讀一個)
    btn.addEventListener("click", () => speakText(word));

    // 編輯圖示
    const editIcon = document.createElement("span");
    editIcon.className = "vocab-edit-icon";
    editIcon.innerHTML = "✏️";
    editIcon.title = "編輯詞彙";
    editIcon.addEventListener("click", (e) => {
      e.stopPropagation(); // 阻止發音事件
      openEditModal(card.char);
    });

    btn.appendChild(editIcon);
    vocabItem.appendChild(btn);
    gridContainer.appendChild(vocabItem);
  });
}

// 更新統計資料與進度條
function updateStats() {
  const total = state.allCards.length;
  const mastered = state.masteredCards.size;
  const learning = total - mastered;
  const percentage = total > 0 ? Math.round((mastered / total) * 100) : 0;

  // 更新進度條
  const pBar = document.getElementById("progress-bar");
  if (pBar) pBar.style.width = `${percentage}%`;

  // 更新文字進度
  const pText = document.getElementById("progress-text");
  if (pText) pText.textContent = `已學會: ${mastered} / ${total} (${percentage}%)`;
}

// 渲染字卡牆 (Dashboard Mode)
function renderDashboard(container) {
  // 建立統計摘要面板
  const statsSummary = document.createElement("div");
  statsSummary.className = "stats-summary";

  const total = state.allCards.length;
  const mastered = state.masteredCards.size;
  const learning = total - mastered;

  statsSummary.innerHTML = `
    <div class="stat-box">
      <div class="stat-val">${total}</div>
      <div class="stat-lbl">總字卡數</div>
    </div>
    <div class="stat-box" style="color: var(--success-color)">
      <div class="stat-val">${mastered}</div>
      <div class="stat-lbl">已學會</div>
    </div>
    <div class="stat-box">
      <div class="stat-val">${learning}</div>
      <div class="stat-lbl">學習中</div>
    </div>
  `;
  container.appendChild(statsSummary);

  // 建立字卡牆網格
  const grid = document.createElement("div");
  grid.className = "dashboard-grid";

  state.allCards.forEach(card => {
    const isMastered = state.masteredCards.has(card.char);
    const item = document.createElement("div");
    item.className = `grid-item ${isMastered ? 'mastered' : ''}`;
    
    // 點擊字卡發音
    item.addEventListener("click", () => speakText(card.char));

    const charDiv = document.createElement("div");
    charDiv.className = "grid-char";
    charDiv.textContent = card.char;

    const statusDiv = document.createElement("div");
    statusDiv.className = "grid-status";
    statusDiv.textContent = isMastered ? "已移除" : "學習中";

    // 點擊狀態標籤可直接切換狀態
    statusDiv.addEventListener("click", (e) => {
      e.stopPropagation(); // 阻止發音
      if (isMastered) {
        restoreCard(card.char);
      } else {
        state.masteredCards.add(card.char);
        saveProgress();
        rebuildQueue();
        render();
      }
    });

    item.appendChild(charDiv);
    item.appendChild(statusDiv);
    grid.appendChild(item);
  });

  container.appendChild(grid);

  // 底部重設按鈕列
  const actionRow = document.createElement("div");
  actionRow.style.display = "flex";
  actionRow.style.justifyContent = "center";
  actionRow.style.marginTop = "1rem";
  
  const resetBtn = document.createElement("button");
  resetBtn.className = "btn-reset";
  resetBtn.style.backgroundColor = "var(--danger-color)";
  resetBtn.textContent = "🔄 重設全部學習進度";
  resetBtn.addEventListener("click", resetAllProgress);
  
  actionRow.appendChild(resetBtn);
  container.appendChild(actionRow);
}

// 渲染過關完成頁面
function renderEmptyState(container) {
  const emptyState = document.createElement("div");
  emptyState.className = "empty-state";

  emptyState.innerHTML = `
    <div class="empty-icon">🏆</div>
    <div class="empty-title">恭喜你！全都學會了！</div>
    <div class="empty-desc">你已經完成了目前所有的字卡學習。如果需要重新挑戰，可以點擊下方按鈕重設所有進度。</div>
    <button class="btn-reset" id="btn-empty-reset">🔄 重新學習全部</button>
  `;

  container.appendChild(emptyState);

  document.getElementById("btn-empty-reset").addEventListener("click", () => {
    state.masteredCards.clear();
    state.currentIndex = 0;
    saveProgress();
    rebuildQueue();
    render();
  });
}
