'use strict';

// ===== 定数 =====
const CHANNEL_ID = 'UCFkzEMq8QYFHa9RFNqULgFg';
const API_KEY_STORAGE = 'asa8_yt_api_key';
const API_BASE = 'https://www.googleapis.com/youtube/v3';
const MAX_RESULTS = 20;

// ===== 状態 =====
let apiKey = 'AIzaSyBhoufIhhbtavdh7IENAqKXrX3-edCn5zE';
let nextPageToken = '';
let currentQuery = '';
let currentOrder = 'date';
let isLoading = false;
let expandedChapterCard = null; // 現在チャプターを展開中のカードID

// ===== DOM 取得 =====
const modalOverlay   = document.getElementById('modal-overlay');
const apiKeyInput    = document.getElementById('api-key-input');
const modalSaveBtn   = document.getElementById('modal-save-btn');
const settingsBtn    = document.getElementById('settings-btn');
const searchInput    = document.getElementById('search-input');
const searchClear    = document.getElementById('search-clear');
const statusBar      = document.getElementById('status-bar');
const videoList      = document.getElementById('video-list');
const loadMoreBtn    = document.getElementById('load-more-btn');
const resultCount    = document.getElementById('result-count');
const sortBtns       = document.querySelectorAll('.sort-btn');

// ===== 初期化 =====
document.addEventListener('DOMContentLoaded', init);

function init() {
  apiKey = localStorage.getItem(API_KEY_STORAGE) || '';

  if (!apiKey) {
    showModal();
  } else {
    fetchVideos(true);
  }

  // イベント登録
  modalSaveBtn.addEventListener('click', saveApiKey);
  apiKeyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveApiKey(); });
  settingsBtn.addEventListener('click', showModal);
  searchInput.addEventListener('input', onSearchInput);
  searchClear.addEventListener('click', clearSearch);
  loadMoreBtn.addEventListener('click', () => fetchVideos(false));

  sortBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.order === currentOrder) return;
      sortBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentOrder = btn.dataset.order;
      fetchVideos(true);
    });
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

// ===== API キー管理 =====
function showModal() {
  apiKeyInput.value = apiKey;
  modalOverlay.classList.remove('hidden');
  setTimeout(() => apiKeyInput.focus(), 100);
}

function hideModal() {
  modalOverlay.classList.add('hidden');
}

function saveApiKey() {
  const key = apiKeyInput.value.trim();
  if (!key) {
    apiKeyInput.focus();
    return;
  }
  apiKey = key;
  localStorage.setItem(API_KEY_STORAGE, key);
  hideModal();
  fetchVideos(true);
}

// ===== 検索 =====
let searchTimer = null;
function onSearchInput() {
  const q = searchInput.value.trim();
  searchClear.classList.toggle('hidden', !q);
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    currentQuery = q;
    fetchVideos(true);
  }, 400);
}

function clearSearch() {
  searchInput.value = '';
  searchClear.classList.add('hidden');
  currentQuery = '';
  fetchVideos(true);
}

// ===== YouTube API =====
async function fetchVideos(reset) {
  if (isLoading) return;
  if (!apiKey) { showModal(); return; }

  isLoading = true;
  loadMoreBtn.classList.add('hidden');

  if (reset) {
    nextPageToken = '';
    expandedChapterCard = null;
    videoList.innerHTML = '';
    renderSkeletons(4);
  }

  showStatus('動画を取得中…', 'loading');

  try {
    // 検索または一覧取得
    const searchParams = new URLSearchParams({
      part: 'snippet',
      channelId: CHANNEL_ID,
      type: 'video',
      maxResults: MAX_RESULTS,
      order: currentOrder,
      key: apiKey,
    });
    if (currentQuery) searchParams.set('q', currentQuery);
    if (nextPageToken) searchParams.set('pageToken', nextPageToken);

    const searchRes = await apiFetch(`${API_BASE}/search?${searchParams}`);

    if (!searchRes.items || searchRes.items.length === 0) {
      clearSkeletons();
      showStatus('', '');
      if (reset) renderEmpty();
      resultCount.textContent = '0件';
      return;
    }

    // 動画IDリストで詳細（duration）を取得
    const ids = searchRes.items.map((i) => i.id.videoId).join(',');
    const detailParams = new URLSearchParams({
      part: 'snippet,contentDetails',
      id: ids,
      key: apiKey,
    });
    const detailRes = await apiFetch(`${API_BASE}/videos?${detailParams}`);

    clearSkeletons();
    hideStatus();

    const detailMap = {};
    (detailRes.items || []).forEach((item) => { detailMap[item.id] = item; });

    searchRes.items.forEach((item) => {
      const detail = detailMap[item.id.videoId];
      if (detail) renderVideoCard(detail);
    });

    nextPageToken = searchRes.nextPageToken || '';
    if (nextPageToken) loadMoreBtn.classList.remove('hidden');

    const total = searchRes.pageInfo?.totalResults ?? 0;
    resultCount.textContent = currentQuery ? `約${total.toLocaleString()}件` : '';

  } catch (err) {
    clearSkeletons();
    showStatus(errorMessage(err), 'error');
  } finally {
    isLoading = false;
  }
}

async function apiFetch(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body?.error?.message || `HTTPエラー ${res.status}`;
    throw new Error(msg);
  }
  return res.json();
}

function errorMessage(err) {
  const msg = err.message || '';
  if (msg.includes('API key')) return 'APIキーが無効です。設定を確認してください。';
  if (msg.includes('quota')) return 'APIのクォータ（使用上限）に達しました。しばらく待つか別のキーをお試しください。';
  if (msg.includes('403')) return 'APIキーの権限エラー。YouTube Data API v3が有効か確認してください。';
  if (!navigator.onLine) return 'インターネット接続がありません。';
  return `エラーが発生しました: ${msg || '不明なエラー'}`;
}

// ===== チャプター抽出 =====
function extractChapters(description) {
  if (!description) return [];
  const chapters = [];
  // 0:00 や 1:23:45 形式のタイムスタンプを抽出
  const re = /^[ \t]*(\d{1,2}:\d{2}(?::\d{2})?)[ \t]+(.+)$/gm;
  let match;
  while ((match = re.exec(description)) !== null) {
    const timeStr = match[1].trim();
    const title = match[2].trim();
    const seconds = timeToSeconds(timeStr);
    chapters.push({ timeStr, title, seconds });
  }
  return chapters;
}

function timeToSeconds(timeStr) {
  const parts = timeStr.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

// ===== ISO 8601 duration パース (PT1H2M3S) =====
function parseDuration(iso) {
  if (!iso) return '';
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return '';
  const h = parseInt(m[1] || 0);
  const min = parseInt(m[2] || 0);
  const sec = parseInt(m[3] || 0);
  if (h > 0) return `${h}:${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${min}:${String(sec).padStart(2,'0')}`;
}

// ===== 日付フォーマット =====
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`;
}

// ===== レンダリング =====
function renderVideoCard(item) {
  const snippet = item.snippet;
  const videoId = item.id;
  const thumb = snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || '';
  const duration = parseDuration(item.contentDetails?.duration);
  const chapters = extractChapters(snippet.description);
  const hasChapters = chapters.length > 0;

  const card = document.createElement('div');
  card.className = 'video-card';
  card.dataset.videoId = videoId;

  card.innerHTML = `
    <div class="thumb-wrap">
      <img src="${escHtml(thumb)}" alt="${escHtml(snippet.title)}" loading="lazy">
      ${duration ? `<span class="duration-badge">${escHtml(duration)}</span>` : ''}
      <div class="play-overlay"><div class="play-icon">▶</div></div>
    </div>
    <div class="card-body">
      <div class="card-title">${escHtml(snippet.title)}</div>
      <div class="card-meta">
        <span>${formatDate(snippet.publishedAt)}</span>
        ${hasChapters ? `<span>${chapters.length}チャプター</span>` : ''}
      </div>
    </div>
    ${hasChapters ? renderChapterPanel(videoId, chapters) : ''}
  `;

  // サムネイルタップ → YouTubeを開く
  card.querySelector('.thumb-wrap').addEventListener('click', (e) => {
    e.stopPropagation();
    window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank', 'noopener');
  });

  // カードタイトル部タップ → チャプター展開
  if (hasChapters) {
    const chapterPanel = card.querySelector('#chapter-panel');
    const chapterHeader = card.querySelector('.chapter-header');
    const toggleIcon = card.querySelector('.chapter-toggle-icon');

    chapterHeader.addEventListener('click', () => {
      const isOpen = !chapterPanel.classList.contains('hidden');
      chapterPanel.classList.toggle('hidden', isOpen);
      toggleIcon.classList.toggle('open', !isOpen);
    });
  }

  videoList.appendChild(card);
}

function renderChapterPanel(videoId, chapters) {
  const items = chapters.map((ch) => `
    <a class="chapter-item"
       href="https://www.youtube.com/watch?v=${escHtml(videoId)}&t=${ch.seconds}s"
       target="_blank" rel="noopener noreferrer">
      <span class="chapter-time">${escHtml(ch.timeStr)}</span>
      <span class="chapter-title">${escHtml(ch.title)}</span>
    </a>
  `).join('');

  return `
    <div id="chapter-panel" class="hidden">
      <div class="chapter-header">
        <span class="chapter-header-label">📋 チャプター一覧</span>
        <span class="chapter-toggle-icon">▾</span>
      </div>
      <div class="chapter-list">${items}</div>
    </div>
  `;
}

function renderSkeletons(n) {
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = 'skeleton-card skeleton-placeholder';
    el.innerHTML = `
      <div class="skeleton-thumb"><div class="skeleton"></div></div>
      <div class="skeleton-body">
        <div class="skeleton skeleton-line"></div>
        <div class="skeleton skeleton-line short"></div>
      </div>
    `;
    videoList.appendChild(el);
  }
}

function clearSkeletons() {
  videoList.querySelectorAll('.skeleton-placeholder').forEach((el) => el.remove());
}

function renderEmpty() {
  const el = document.createElement('div');
  el.className = 'empty-state';
  el.innerHTML = `<div class="icon">🔍</div><p>動画が見つかりませんでした</p>`;
  videoList.appendChild(el);
}

// ===== ステータスバー =====
function showStatus(msg, type) {
  statusBar.textContent = msg;
  statusBar.className = type ? `${type}` : '';
  if (!type || !msg) { statusBar.classList.add('hidden'); }
}
function hideStatus() { statusBar.classList.add('hidden'); }

// ===== XSS 対策 =====
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
