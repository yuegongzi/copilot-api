export const adminHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Copilot API - Dashboard</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0d1117;
      color: #c9d1d9;
      min-height: 100vh;
      padding: 2rem;
    }
    .container { max-width: 900px; margin: 0 auto; }
    h1 {
      font-size: 1.5rem;
      margin-bottom: 1.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    h1 svg { width: 24px; height: 24px; }
    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 1rem;
      margin-bottom: 1rem;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }
    .card-title { font-size: 1rem; font-weight: 600; }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      border: 1px solid #30363d;
      border-radius: 6px;
      background: #21262d;
      color: #c9d1d9;
      cursor: pointer;
      font-size: 0.875rem;
      transition: all 0.15s;
    }
    .btn:hover { background: #30363d; }
    .btn-primary { background: #238636; border-color: #238636; color: #fff; }
    .btn-primary:hover { background: #2ea043; }
    .btn-danger { background: #da3633; border-color: #da3633; color: #fff; }
    .btn-danger:hover { background: #f85149; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-sm { padding: 0.25rem 0.5rem; font-size: 0.75rem; }
    .tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
      border-bottom: 1px solid #30363d;
      padding-bottom: 0.5rem;
    }
    .tab {
      padding: 0.5rem 1rem;
      border: none;
      background: transparent;
      color: #8b949e;
      cursor: pointer;
      font-size: 0.875rem;
      border-radius: 6px 6px 0 0;
      transition: all 0.15s;
    }
    .tab:hover { color: #c9d1d9; background: #21262d; }
    .tab.active { color: #c9d1d9; background: #21262d; border-bottom: 2px solid #238636; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .account-list { list-style: none; }
    .account-item {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.75rem;
      border-radius: 6px;
      margin-bottom: 0.5rem;
      background: #0d1117;
      border: 1px solid #30363d;
    }
    .account-item.active { border-color: #238636; }
    .account-avatar { width: 40px; height: 40px; border-radius: 50%; background: #30363d; }
    .account-info { flex: 1; }
    .account-name { font-weight: 600; }
    .account-type { font-size: 0.75rem; color: #8b949e; text-transform: capitalize; }
    .account-badge { font-size: 0.75rem; padding: 0.125rem 0.5rem; border-radius: 9999px; background: #238636; color: #fff; }
    .account-actions { display: flex; gap: 0.5rem; }
    .empty-state { text-align: center; padding: 2rem; color: #8b949e; }
    .models-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.75rem; }
    .model-card { background: #0d1117; border: 1px solid #30363d; border-radius: 6px; padding: 0.75rem; transition: all 0.15s; }
    .model-card:hover { border-color: #58a6ff; }
    .model-name { font-weight: 600; font-size: 0.875rem; color: #58a6ff; margin-bottom: 0.25rem; word-break: break-all; }
    .model-id { font-size: 0.75rem; color: #8b949e; font-family: monospace; }
    .model-badge { display: inline-block; font-size: 0.625rem; padding: 0.125rem 0.375rem; border-radius: 9999px; background: #21262d; color: #8b949e; margin-top: 0.5rem; }
    .model-badge.premium { background: #9333ea; color: #fff; }
    .usage-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem; }
    .usage-card { background: #0d1117; border: 1px solid #30363d; border-radius: 6px; padding: 1rem; }
    .usage-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
    .usage-title { font-weight: 600; text-transform: capitalize; }
    .usage-percent { font-size: 0.875rem; color: #8b949e; }
    .usage-bar { height: 8px; background: #21262d; border-radius: 4px; overflow: hidden; margin-bottom: 0.5rem; }
    .usage-bar-fill { height: 100%; border-radius: 4px; transition: width 0.3s ease; }
    .usage-bar-fill.green { background: #238636; }
    .usage-bar-fill.yellow { background: #d29922; }
    .usage-bar-fill.red { background: #da3633; }
    .usage-bar-fill.blue { background: #58a6ff; }
    .usage-stats { display: flex; justify-content: space-between; font-size: 0.75rem; color: #8b949e; }
    .usage-info { margin-top: 1rem; padding: 0.75rem; background: #161b22; border-radius: 6px; font-size: 0.875rem; }
    .usage-info-row { display: flex; justify-content: space-between; padding: 0.25rem 0; }
    .usage-info-label { color: #8b949e; }
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: none; align-items: center; justify-content: center; z-index: 100; }
    .modal-overlay.active { display: flex; }
    .modal { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 1.5rem; max-width: 400px; width: 100%; }
    .modal-title { font-size: 1.25rem; margin-bottom: 1rem; }
    .device-code { font-family: monospace; font-size: 2rem; text-align: center; padding: 1rem; background: #0d1117; border-radius: 6px; margin: 1rem 0; letter-spacing: 0.25rem; }
    .modal-text { color: #8b949e; margin-bottom: 1rem; text-align: center; }
    .modal-actions { display: flex; gap: 0.5rem; justify-content: flex-end; }
    .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid #30363d; border-top-color: #c9d1d9; border-radius: 50%; animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .select { padding: 0.5rem; border: 1px solid #30363d; border-radius: 6px; background: #21262d; color: #c9d1d9; font-size: 0.875rem; margin-bottom: 1rem; width: 100%; }
    .label { font-size: 0.875rem; color: #8b949e; margin-bottom: 0.25rem; display: block; }
    .status-bar { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; background: #161b22; border: 1px solid #30363d; border-radius: 6px; margin-bottom: 1rem; font-size: 0.875rem; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #da3633; }
    .status-dot.online { background: #238636; }
    .refresh-btn { margin-left: auto; }
    .refresh-btn.loading svg { animation: spin 1s linear infinite; }
  </style>
</head>
<body>
  <div class="container">
    <h1>
      <svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"></path></svg>
      Copilot API - Dashboard
    </h1>
    <div class="status-bar" id="statusBar">
      <div class="status-dot" id="statusDot"></div>
      <span id="statusText">Checking status...</span>
    </div>
    <div class="tabs">
      <button class="tab active" data-tab="accounts">Accounts</button>
      <button class="tab" data-tab="models">Models</button>
      <button class="tab" data-tab="usage">Usage</button>
    </div>
    <div class="tab-content active" id="tab-accounts">
      <div class="card">
        <div class="card-header">
          <span class="card-title">GitHub Accounts</span>
          <button class="btn btn-primary" id="addAccountBtn">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M7.75 2a.75.75 0 0 1 .75.75V7h4.25a.75.75 0 0 1 0 1.5H8.5v4.25a.75.75 0 0 1-1.5 0V8.5H2.75a.75.75 0 0 1 0-1.5H7V2.75A.75.75 0 0 1 7.75 2Z"></path></svg>
            Add Account
          </button>
        </div>
        <ul class="account-list" id="accountList"><li class="empty-state">Loading accounts...</li></ul>
      </div>
    </div>
    <div class="tab-content" id="tab-models">
      <div class="card">
        <div class="card-header">
          <span class="card-title">Available Models</span>
          <button class="btn btn-sm refresh-btn" id="refreshModels">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834ZM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5Z"></path></svg>
            Refresh
          </button>
        </div>
        <div class="models-grid" id="modelsList"><div class="empty-state">Loading models...</div></div>
      </div>
    </div>
    <div class="tab-content" id="tab-usage">
      <div class="card">
        <div class="card-header">
          <span class="card-title">Usage Statistics</span>
          <button class="btn btn-sm refresh-btn" id="refreshUsage">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M1.705 8.005a.75.75 0 0 1 .834.656 5.5 5.5 0 0 0 9.592 2.97l-1.204-1.204a.25.25 0 0 1 .177-.427h3.646a.25.25 0 0 1 .25.25v3.646a.25.25 0 0 1-.427.177l-1.38-1.38A7.002 7.002 0 0 1 1.05 8.84a.75.75 0 0 1 .656-.834ZM8 2.5a5.487 5.487 0 0 0-4.131 1.869l1.204 1.204A.25.25 0 0 1 4.896 6H1.25A.25.25 0 0 1 1 5.75V2.104a.25.25 0 0 1 .427-.177l1.38 1.38A7.002 7.002 0 0 1 14.95 7.16a.75.75 0 0 1-1.49.178A5.5 5.5 0 0 0 8 2.5Z"></path></svg>
            Refresh
          </button>
        </div>
        <div id="usageContent"><div class="empty-state">Loading usage data...</div></div>
      </div>
    </div>
  </div>
  <div class="modal-overlay" id="authModal">
    <div class="modal">
      <h2 class="modal-title">Add GitHub Account</h2>
      <div id="authStep1">
        <label class="label">Account Type</label>
        <select class="select" id="accountType">
          <option value="individual">Individual</option>
          <option value="business">Business</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <p class="modal-text">Click below to start the authorization process.</p>
        <div class="modal-actions">
          <button class="btn" id="cancelAuth">Cancel</button>
          <button class="btn btn-primary" id="startAuth">Start Authorization</button>
        </div>
      </div>
      <div id="authStep2" style="display:none">
        <p class="modal-text">Enter this code at GitHub:</p>
        <div class="device-code" id="deviceCode">--------</div>
        <p class="modal-text"><a href="" id="verificationLink" target="_blank" style="color:#58a6ff">Open GitHub</a></p>
        <p class="modal-text"><span class="spinner"></span> Waiting for authorization...</p>
        <div class="modal-actions"><button class="btn" id="cancelAuth2">Cancel</button></div>
      </div>
      <div id="authStep3" style="display:none">
        <p class="modal-text" style="color:#238636">Account added successfully!</p>
        <div class="modal-actions"><button class="btn btn-primary" id="closeAuth">Close</button></div>
      </div>
    </div>
  </div>
  <script>
    const API_BASE = '/admin/api';
    let pollInterval = null;
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
        if (tab.dataset.tab === 'models') fetchModels();
        if (tab.dataset.tab === 'usage') fetchUsage();
      });
    });
    async function fetchAccounts() {
      try {
        const res = await fetch(API_BASE + '/accounts');
        const data = await res.json();
        renderAccounts(data);
      } catch (e) {
        document.getElementById('accountList').innerHTML = '<li class="empty-state">Failed to load accounts</li>';
      }
    }
    async function fetchStatus() {
      try {
        const res = await fetch(API_BASE + '/auth/status');
        const data = await res.json();
        const dot = document.getElementById('statusDot');
        const text = document.getElementById('statusText');
        if (data.authenticated) {
          dot.classList.add('online');
          text.textContent = 'Connected as ' + (data.activeAccount?.login || 'Unknown');
        } else {
          dot.classList.remove('online');
          text.textContent = 'Not authenticated';
        }
      } catch (e) {
        document.getElementById('statusText').textContent = 'Connection error';
      }
    }
    function renderAccounts(data) {
      const list = document.getElementById('accountList');
      if (!data.accounts || data.accounts.length === 0) {
        list.innerHTML = '<li class="empty-state">No accounts configured. Click "Add Account" to get started.</li>';
        return;
      }
      list.innerHTML = data.accounts.map(acc => '<li class="account-item ' + (acc.isActive ? 'active' : '') + '">' +
        '<img class="account-avatar" src="' + (acc.avatarUrl || '') + '" alt="" onerror="this.style.display=\\'none\\'">' +
        '<div class="account-info"><div class="account-name">' + acc.login + '</div><div class="account-type">' + acc.accountType + '</div></div>' +
        (acc.isActive ? '<span class="account-badge">Active</span>' : '') +
        '<div class="account-actions">' +
        (!acc.isActive ? '<button class="btn btn-sm" onclick="switchAccount(\\'' + acc.id + '\\')">Switch</button>' : '') +
        '<button class="btn btn-sm btn-danger" onclick="deleteAccount(\\'' + acc.id + '\\', \\'' + acc.login + '\\')">Delete</button>' +
        '</div></li>').join('');
    }
    async function switchAccount(id) {
      if (!confirm('Switch to this account?')) return;
      try {
        const res = await fetch(API_BASE + '/accounts/' + id + '/activate', { method: 'POST' });
        if (res.ok) { fetchAccounts(); fetchStatus(); }
        else { const data = await res.json(); alert(data.error?.message || 'Failed to switch account'); }
      } catch (e) { alert('Failed to switch account'); }
    }
    async function deleteAccount(id, login) {
      if (!confirm('Delete account "' + login + '"? This cannot be undone.')) return;
      try {
        const res = await fetch(API_BASE + '/accounts/' + id, { method: 'DELETE' });
        if (res.ok) { fetchAccounts(); fetchStatus(); }
        else { const data = await res.json(); alert(data.error?.message || 'Failed to delete account'); }
      } catch (e) { alert('Failed to delete account'); }
    }
    async function fetchModels() {
      const btn = document.getElementById('refreshModels');
      btn.classList.add('loading');
      try {
        const res = await fetch('/v1/models');
        const data = await res.json();
        renderModels(data);
      } catch (e) {
        document.getElementById('modelsList').innerHTML = '<div class="empty-state">Failed to load models. Please add an account first.</div>';
      } finally { btn.classList.remove('loading'); }
    }
    function renderModels(data) {
      const container = document.getElementById('modelsList');
      if (!data.data || data.data.length === 0) {
        container.innerHTML = '<div class="empty-state">No models available</div>';
        return;
      }
      container.innerHTML = data.data.map(model => {
        const isPremium = model.id.includes('o1') || model.id.includes('o3') || model.id.includes('claude');
        return '<div class="model-card"><div class="model-name">' + model.id + '</div><div class="model-id">' + (model.object || 'model') + '</div>' +
          (isPremium ? '<span class="model-badge premium">Premium</span>' : '') + '</div>';
      }).join('');
    }
    async function fetchUsage() {
      const btn = document.getElementById('refreshUsage');
      btn.classList.add('loading');
      try {
        const res = await fetch('/usage');
        const data = await res.json();
        renderUsage(data);
      } catch (e) {
        document.getElementById('usageContent').innerHTML = '<div class="empty-state">Failed to load usage data. Please add an account first.</div>';
      } finally { btn.classList.remove('loading'); }
    }
    function renderUsage(data) {
      const container = document.getElementById('usageContent');
      if (!data.quota_snapshots) {
        container.innerHTML = '<div class="empty-state">No usage data available</div>';
        return;
      }
      const quotas = data.quota_snapshots;
      let html = '<div class="usage-grid">';
      for (const [key, quota] of Object.entries(quotas)) {
        const percentUsed = quota.unlimited ? 0 : (100 - quota.percent_remaining);
        const used = quota.unlimited ? 0 : (quota.entitlement - quota.remaining);
        let barColor = 'green';
        if (percentUsed > 75) barColor = 'yellow';
        if (percentUsed > 90) barColor = 'red';
        if (quota.unlimited) barColor = 'blue';
        html += '<div class="usage-card"><div class="usage-header"><span class="usage-title">' + key.replace(/_/g, ' ') + '</span>' +
          '<span class="usage-percent">' + (quota.unlimited ? 'Unlimited' : percentUsed.toFixed(1) + '% used') + '</span></div>' +
          '<div class="usage-bar"><div class="usage-bar-fill ' + barColor + '" style="width: ' + (quota.unlimited ? 100 : percentUsed) + '%"></div></div>' +
          '<div class="usage-stats"><span>' + (quota.unlimited ? '∞' : used.toLocaleString()) + ' / ' + (quota.unlimited ? '∞' : quota.entitlement.toLocaleString()) + '</span>' +
          '<span>' + (quota.unlimited ? '∞' : quota.remaining.toLocaleString()) + ' remaining</span></div></div>';
      }
      html += '</div>';
      html += '<div class="usage-info"><div class="usage-info-row"><span class="usage-info-label">Plan</span><span>' + (data.copilot_plan || 'Unknown') + '</span></div>' +
        '<div class="usage-info-row"><span class="usage-info-label">Quota Reset Date</span><span>' + (data.quota_reset_date ? new Date(data.quota_reset_date).toLocaleDateString() : 'N/A') + '</span></div>' +
        '<div class="usage-info-row"><span class="usage-info-label">Chat Enabled</span><span>' + (data.chat_enabled ? 'Yes' : 'No') + '</span></div></div>';
      container.innerHTML = html;
    }
    function showModal(show) {
      document.getElementById('authModal').classList.toggle('active', show);
      if (!show && pollInterval) { clearInterval(pollInterval); pollInterval = null; }
    }
    function showStep(step) {
      document.getElementById('authStep1').style.display = step === 1 ? 'block' : 'none';
      document.getElementById('authStep2').style.display = step === 2 ? 'block' : 'none';
      document.getElementById('authStep3').style.display = step === 3 ? 'block' : 'none';
    }
    async function startAuth() {
      try {
        const res = await fetch(API_BASE + '/auth/device-code', { method: 'POST' });
        const data = await res.json();
        if (data.error) { alert(data.error.message); return; }
        document.getElementById('deviceCode').textContent = data.userCode;
        document.getElementById('verificationLink').href = data.verificationUri;
        showStep(2);
        const accountType = document.getElementById('accountType').value;
        let currentInterval = data.interval || 5;
        pollInterval = setInterval(() => pollAuth(data.deviceCode, accountType), currentInterval * 1000);
      } catch (e) { alert('Failed to start authorization'); }
    }
    let currentInterval = 5;
    async function pollAuth(deviceCode, accountType) {
      try {
        const res = await fetch(API_BASE + '/auth/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceCode, accountType })
        });
        const data = await res.json();
        console.log('Poll response:', data);
        if (data.success) {
          clearInterval(pollInterval);
          pollInterval = null;
          showStep(3);
          setTimeout(() => { fetchAccounts(); fetchStatus(); }, 500);
        } else if (data.error) {
          clearInterval(pollInterval);
          pollInterval = null;
          alert(data.error.message);
          showStep(1);
        } else if (data.slowDown && data.interval) {
          // GitHub asked us to slow down, update the polling interval
          console.log('Slow down requested, new interval:', data.interval);
          clearInterval(pollInterval);
          currentInterval = data.interval;
          pollInterval = setInterval(() => pollAuth(deviceCode, accountType), currentInterval * 1000);
        }
        // If data.pending is true (without slowDown), continue polling at current interval
      } catch (e) {
        console.error('Poll error:', e);
      }
    }
    document.getElementById('addAccountBtn').addEventListener('click', () => { showStep(1); showModal(true); });
    document.getElementById('cancelAuth').addEventListener('click', () => showModal(false));
    document.getElementById('cancelAuth2').addEventListener('click', () => showModal(false));
    document.getElementById('closeAuth').addEventListener('click', () => { showModal(false); showStep(1); });
    document.getElementById('startAuth').addEventListener('click', startAuth);
    document.getElementById('refreshModels').addEventListener('click', fetchModels);
    document.getElementById('refreshUsage').addEventListener('click', fetchUsage);

    fetchAccounts();
    fetchStatus();
  </script>
</body>
</html>`
