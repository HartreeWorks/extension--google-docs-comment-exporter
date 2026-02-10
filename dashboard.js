(function() {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────────

  function getDocIdFromUrl(url) {
    const m = (url || '').match(/\/document\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/);
    return m ? m[1] : null;
  }

  function safeFilename(title, docId) {
    const raw = (title || `document-${docId}`).replace(/\s*-\s*Google Docs\s*$/i, '');
    return (raw || `document-${docId}`)
      .replace(/[^a-z0-9\-_.]+/gi, ' ')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 80)
      .replace(/\s/g, '-');
  }

  function cleanTitle(title) {
    return (title || 'Untitled').replace(/\s*-\s*Google Docs\s*$/i, '').trim() || 'Untitled';
  }

  const EXPORT_FORMATS = {
    txt: { label: 'TXT', param: 'txt', ext: 'txt' },
    docx: { label: 'DOCX', param: 'docx', ext: 'docx' },
    md: { label: 'MD', param: 'markdown', ext: 'md' },
    pdf: { label: 'PDF', param: 'pdf', ext: 'pdf' },
    html: { label: 'HTML', param: 'html', ext: 'html' }
  };

  function getSelectedFormat() {
    const active = document.querySelector('.format-option.is-active');
    const raw = active ? active.dataset.format : 'txt';
    return EXPORT_FORMATS[raw] ? raw : 'txt';
  }

  function setSelectedFormat(formatKey) {
    const normalized = EXPORT_FORMATS[formatKey] ? formatKey : 'txt';
    document.querySelectorAll('.format-option').forEach(btn => {
      const isActive = btn.dataset.format === normalized;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function getFormatConfig(formatKey) {
    return EXPORT_FORMATS[formatKey] || EXPORT_FORMATS.txt;
  }

  async function downloadDoc(docId, title, formatKey) {
    const format = getFormatConfig(formatKey);
    const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=${format.param}`;
    const filename = `${safeFilename(title, docId)}.${format.ext}`;

    if (chrome.downloads && chrome.downloads.download) {
      await chrome.downloads.download({ url: exportUrl, filename, saveAs: false });
      return { method: 'downloads', filename };
    }

    await chrome.tabs.create({ url: exportUrl, active: false });
    return { method: 'tab', filename };
  }

  // ─────────────────────────────────────────────────────────────
  // Data fetching
  // ─────────────────────────────────────────────────────────────

  async function getDocsGroupedByWindow() {
    const windows = await chrome.windows.getAll({ populate: true });
    const currentWindow = await chrome.windows.getCurrent();

    const windowGroups = [];

    for (const win of windows) {
      const docs = [];
      const seenIds = new Set();

      for (const tab of win.tabs || []) {
        const docId = getDocIdFromUrl(tab.url);
        if (docId && !seenIds.has(docId)) {
          seenIds.add(docId);
          docs.push({
            id: docId,
            title: tab.title,
            url: tab.url,
            tabId: tab.id
          });
        }
      }

      if (docs.length > 0) {
        windowGroups.push({
          windowId: win.id,
          isCurrentWindow: win.id === currentWindow.id,
          tabCount: win.tabs?.length || 0,
          docs
        });
      }
    }

    // Sort: current window first, then by number of docs
    windowGroups.sort((a, b) => {
      if (a.isCurrentWindow) return -1;
      if (b.isCurrentWindow) return 1;
      return b.docs.length - a.docs.length;
    });

    return windowGroups;
  }

  // ─────────────────────────────────────────────────────────────
  // Icons
  // ─────────────────────────────────────────────────────────────

  const icons = {
    download: `<svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    doc: `<svg class="doc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/></svg>`,
    empty: `<svg class="empty-state-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/></svg>`
  };

  // ─────────────────────────────────────────────────────────────
  // Rendering
  // ─────────────────────────────────────────────────────────────

  function renderEmptyState() {
    return `
      <div class="empty-state">
        ${icons.empty}
        <h2>No Google Docs found</h2>
        <p>Open some Google Docs in your browser tabs to export them.</p>
      </div>
    `;
  }

  function renderWindowCard(group, index, extension) {
    const windowLabel = group.isCurrentWindow
      ? 'Current window'
      : `Window ${index + 1}`;

    const badgeClass = group.isCurrentWindow
      ? 'window-badge current-window-badge'
      : 'window-badge';

    return `
      <div class="window-card" data-window-id="${group.windowId}">
        <div class="window-header">
          <div class="window-title">
            <span>${windowLabel}</span>
            <span class="${badgeClass}">${group.docs.length} doc${group.docs.length === 1 ? '' : 's'}</span>
          </div>
          <button class="btn btn-primary download-window-btn" data-window-id="${group.windowId}">
            ${icons.download}
            Download all
          </button>
        </div>
        <div class="download-status" data-status-for="${group.windowId}"></div>
        <ul class="doc-list">
          ${group.docs.map(doc => {
            const base = safeFilename(doc.title, doc.id);
            return `
              <li class="doc-item">
                ${icons.doc}
                <span class="doc-title">${escapeHtml(cleanTitle(doc.title))}</span>
                <span class="doc-filename" data-doc-basename="${base}">${escapeHtml(base)}.${extension}</span>
              </li>
            `;
          }).join('')}
        </ul>
      </div>
    `;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function render(windowGroups) {
    const main = document.getElementById('main');
    const format = getFormatConfig(getSelectedFormat());

    if (windowGroups.length === 0) {
      main.innerHTML = renderEmptyState();
      return;
    }

    main.innerHTML = windowGroups
      .map((group, index) => renderWindowCard(group, index, format.ext))
      .join('');

    // Attach event listeners
    document.querySelectorAll('.download-window-btn').forEach(btn => {
      btn.addEventListener('click', handleDownloadWindow);
    });
  }

  function updateFilenameExtensions(formatKey) {
    const format = getFormatConfig(formatKey);
    document.querySelectorAll('[data-doc-basename]').forEach(el => {
      const base = el.dataset.docBasename || '';
      if (!base) return;
      el.textContent = `${base}.${format.ext}`;
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Download handler
  // ─────────────────────────────────────────────────────────────

  let windowGroupsData = [];

  async function handleDownloadWindow(e) {
    const btn = e.currentTarget;
    const windowId = parseInt(btn.dataset.windowId, 10);
    const group = windowGroupsData.find(g => g.windowId === windowId);
    const formatKey = getSelectedFormat();

    if (!group) return;

    const statusEl = document.querySelector(`[data-status-for="${windowId}"]`);

    // Disable button
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner" style="width:14px;height:14px;margin-right:8px;border-width:2px;"></span>Downloading...`;

    statusEl.textContent = '';
    statusEl.className = 'download-status visible';

    let success = 0;
    let failed = 0;

    for (let i = 0; i < group.docs.length; i++) {
      const doc = group.docs[i];
      statusEl.textContent = `Downloading ${i + 1} of ${group.docs.length}...`;

      try {
        await downloadDoc(doc.id, doc.title, formatKey);
        success++;
        // Small delay between downloads to avoid rate limiting
        if (i < group.docs.length - 1) {
          await new Promise(r => setTimeout(r, 300));
        }
      } catch (err) {
        console.warn('Failed to download', doc.id, err);
        failed++;
      }
    }

    // Update status
    if (failed === 0) {
      statusEl.textContent = `Downloaded ${success} file${success === 1 ? '' : 's'}`;
      statusEl.className = 'download-status visible success';
    } else {
      statusEl.textContent = `Downloaded ${success}, ${failed} failed`;
      statusEl.className = 'download-status visible error';
    }

    // Re-enable button
    btn.disabled = false;
    btn.innerHTML = `${icons.download}Download all`;
  }

  // ─────────────────────────────────────────────────────────────
  // Init
  // ─────────────────────────────────────────────────────────────

  async function init() {
    try {
      document.querySelectorAll('.format-option').forEach(btn => {
        btn.addEventListener('click', () => {
          setSelectedFormat(btn.dataset.format);
          updateFilenameExtensions(getSelectedFormat());
        });
      });

      windowGroupsData = await getDocsGroupedByWindow();
      render(windowGroupsData);
    } catch (err) {
      console.error('Failed to load docs:', err);
      document.getElementById('main').innerHTML = `
        <div class="empty-state">
          <h2>Something went wrong</h2>
          <p>Failed to scan browser tabs. Please try again.</p>
        </div>
      `;
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
