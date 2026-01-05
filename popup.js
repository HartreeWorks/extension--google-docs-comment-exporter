(function() {
  'use strict';

  // ─────────────────────────────────────────────────────────────
  // Shared utilities
  // ─────────────────────────────────────────────────────────────

  function getDocIdFromUrl(url) {
    // Supports /document/d/<id>/... and /document/u/<n>/d/<id>/...
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

  async function downloadDoc(docId, title) {
    const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`;
    const filename = `${safeFilename(title, docId)}.txt`;

    if (chrome.downloads && chrome.downloads.download) {
      await chrome.downloads.download({ url: exportUrl, filename, saveAs: false });
      return { method: 'downloads', filename };
    }

    // Fallback: open export URL in a new tab
    await chrome.tabs.create({ url: exportUrl, active: false });
    return { method: 'tab', filename };
  }

  // ─────────────────────────────────────────────────────────────
  // Current doc download
  // ─────────────────────────────────────────────────────────────

  async function downloadCurrentDoc() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) throw new Error('No active tab');

    const docId = getDocIdFromUrl(tab.url);
    if (!docId) throw new Error('Not a Google Doc');

    return downloadDoc(docId, tab.title);
  }

  // ─────────────────────────────────────────────────────────────
  // Batch download
  // ─────────────────────────────────────────────────────────────

  async function findAllGoogleDocs() {
    const tabs = await chrome.tabs.query({});
    const docs = [];
    const seenIds = new Set();

    for (const tab of tabs) {
      const docId = getDocIdFromUrl(tab.url);
      if (docId && !seenIds.has(docId)) {
        seenIds.add(docId);
        docs.push({
          id: docId,
          title: tab.title,
          url: tab.url
        });
      }
    }

    return docs;
  }

  async function downloadAllDocs(docs, statusEl) {
    let success = 0;
    let failed = 0;

    for (const doc of docs) {
      statusEl.textContent = `Downloading ${success + failed + 1} of ${docs.length}...`;
      try {
        await downloadDoc(doc.id, doc.title);
        success++;
      } catch (err) {
        console.warn('Failed to download', doc.id, err);
        failed++;
      }
    }

    return { success, failed };
  }

  // ─────────────────────────────────────────────────────────────
  // UI setup
  // ─────────────────────────────────────────────────────────────

  document.addEventListener('DOMContentLoaded', async () => {
    const downloadCurrentBtn = document.getElementById('download-current');
    const currentStatus = document.getElementById('current-status');
    const findDocsBtn = document.getElementById('find-docs');
    const docListEl = document.getElementById('doc-list');
    const downloadAllBtn = document.getElementById('download-all');
    const batchStatus = document.getElementById('batch-status');

    let foundDocs = [];

    // Check if current tab is a Google Doc
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const isGoogleDoc = tab && tab.url && getDocIdFromUrl(tab.url);
      if (!isGoogleDoc) {
        downloadCurrentBtn.disabled = true;
        currentStatus.textContent = 'Current tab is not a Google Doc';
      }
    } catch (_) {
      downloadCurrentBtn.disabled = true;
    }

    // Download current doc
    downloadCurrentBtn.addEventListener('click', async () => {
      downloadCurrentBtn.disabled = true;
      currentStatus.textContent = 'Starting download...';
      currentStatus.className = 'status';

      try {
        const { method, filename } = await downloadCurrentDoc();
        currentStatus.textContent = method === 'downloads'
          ? `Downloaded: ${filename}`
          : 'Opened export in new tab';
        currentStatus.className = 'status success';
      } catch (err) {
        currentStatus.textContent = err.message || 'Download failed';
        currentStatus.className = 'status error';
      } finally {
        setTimeout(() => {
          downloadCurrentBtn.disabled = false;
        }, 1000);
      }
    });

    // Find all docs
    findDocsBtn.addEventListener('click', async () => {
      findDocsBtn.disabled = true;
      batchStatus.textContent = 'Scanning tabs...';
      batchStatus.className = 'status';

      try {
        foundDocs = await findAllGoogleDocs();

        if (foundDocs.length === 0) {
          docListEl.innerHTML = '<div class="empty">No Google Docs found in open tabs</div>';
          docListEl.classList.remove('hidden');
          downloadAllBtn.classList.add('hidden');
          batchStatus.textContent = '';
        } else {
          docListEl.innerHTML = foundDocs.map(doc => {
            const title = safeFilename(doc.title, doc.id);
            return `<div class="doc-item" title="${doc.url}">${title}.txt</div>`;
          }).join('');
          docListEl.classList.remove('hidden');
          downloadAllBtn.classList.remove('hidden');
          downloadAllBtn.textContent = `Download all (${foundDocs.length})`;
          batchStatus.textContent = `Found ${foundDocs.length} doc${foundDocs.length === 1 ? '' : 's'}`;
          batchStatus.className = 'status success';
        }
      } catch (err) {
        batchStatus.textContent = 'Failed to scan tabs';
        batchStatus.className = 'status error';
      } finally {
        findDocsBtn.disabled = false;
      }
    });

    // Download all docs
    downloadAllBtn.addEventListener('click', async () => {
      if (foundDocs.length === 0) return;

      downloadAllBtn.disabled = true;
      findDocsBtn.disabled = true;

      const { success, failed } = await downloadAllDocs(foundDocs, batchStatus);

      batchStatus.textContent = `Done: ${success} downloaded${failed > 0 ? `, ${failed} failed` : ''}`;
      batchStatus.className = failed > 0 ? 'status' : 'status success';

      downloadAllBtn.disabled = false;
      findDocsBtn.disabled = false;
    });
  });
})();
