// 井戸端会議 AI — フロントエンド
(function () {
  'use strict';

  const API = '/api';
  let currentThreadId = null;
  let pollTimer = null;
  // Map nickname -> color index for consistent coloring
  const speakerColors = {};
  let colorIndex = 0;

  // --- DOM refs ---
  const $tabs = document.querySelectorAll('.tab');
  const $tabContents = document.querySelectorAll('.tab-content');
  const $jsonInput = document.getElementById('json-input');
  const $btnPreview = document.getElementById('btn-preview');
  const $btnRegister = document.getElementById('btn-register');
  const $previewArea = document.getElementById('preview-area');
  const $previewContent = document.getElementById('preview-content');
  const $previewPromptText = document.getElementById('preview-prompt-text');
  const $agentsList = document.getElementById('agents-list');
  const $questionInput = document.getElementById('question-input');
  const $btnAsk = document.getElementById('btn-ask');
  const $loading = document.getElementById('loading');
  const $conversationArea = document.getElementById('conversation-area');
  const $conversationQuestion = document.getElementById('conversation-question');
  const $messagesList = document.getElementById('messages-list');
  const $followupInput = document.getElementById('followup-input');
  const $btnFollowup = document.getElementById('btn-followup');

  // --- Tab navigation ---
  $tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      var target = this.dataset.tab;
      $tabs.forEach(function (t) { t.classList.remove('active'); });
      $tabContents.forEach(function (c) { c.classList.remove('active'); });
      this.classList.add('active');
      document.getElementById('tab-' + target).classList.add('active');
    });
  });

  // --- Utility ---
  function showToast(msg) {
    var toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(function () { toast.remove(); }, 4000);
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function getSpeakerColor(nickname) {
    if (!(nickname in speakerColors)) {
      speakerColors[nickname] = colorIndex % 5;
      colorIndex++;
    }
    return speakerColors[nickname];
  }

  // --- system_prompt builder (mirrors §4.1.3) ---
  function buildSystemPrompt(profile) {
    var bg = profile.background || {};
    var bgParts = [bg.age_group, bg.occupation, bg.family].filter(Boolean);
    var tone = profile.tone || {};
    var samples = (tone.samples || []).map(function (s) { return '- \u300c' + s + '\u300d'; }).join('\n');
    var episodes = (profile.episodes || []).map(function (e) { return '- ' + e; }).join('\n');
    var values = (profile.values || []).join('\u3001');

    var prompt = '\u3042\u306a\u305f\u306f\u300c' + profile.nickname + '\u300d\u3068\u3057\u3066\u3001\u4e95\u6238\u7aef\u4f1a\u8b70\u306b\u53c2\u52a0\u3057\u3066\u3044\u307e\u3059\u3002\n\n';
    prompt += '\u3010\u3042\u306a\u305f\u306e\u30d7\u30ed\u30d5\u30a3\u30fc\u30eb\u3011\n';
    if (bgParts.length) prompt += '- ' + bgParts.join('\u3001') + '\n';
    prompt += '- \u5f97\u610f\u306a\u8a71\u984c: ' + (profile.expertise || []).join('\u3001') + '\n';
    prompt += '- \u6027\u683c\u30bf\u30a4\u30d7: ' + profile.personality + '\n';
    if (values) prompt += '- \u5927\u5207\u306b\u3057\u3066\u3044\u308b\u3053\u3068: ' + values + '\n';
    prompt += '\n\u3010\u3042\u306a\u305f\u306e\u53e3\u8abf\u3011\n' + (tone.characteristics || '') + '\n\n';
    prompt += '\u53e3\u8abf\u306e\u4f8b:\n' + samples + '\n\n';
    prompt += '\u3010\u3042\u306a\u305f\u306e\u7d4c\u9a13\u30fb\u30a8\u30d4\u30bd\u30fc\u30c9\u3011\n' + episodes + '\n\n';
    prompt += '\u3010\u4f1a\u8a71\u306e\u30eb\u30fc\u30eb\u3011\n';
    prompt += '- \u5c02\u9580\u5bb6\u306e\u52a9\u8a00\u3067\u306f\u306a\u304f\u3001\u3042\u304f\u307e\u3067\u81ea\u5206\u306e\u7d4c\u9a13\u306b\u57fa\u3065\u3044\u305f\u610f\u898b\u3068\u3057\u3066\u8a71\u3057\u3066\u304f\u3060\u3055\u3044\n';
    prompt += '- \u4e0a\u8a18\u306e\u30a8\u30d4\u30bd\u30fc\u30c9\u3092\u81ea\u7136\u306b\u4f1a\u8a71\u306b\u7e54\u308a\u8fbc\u3093\u3067\u304f\u3060\u3055\u3044\n';
    prompt += '- \u4ed6\u306e\u53c2\u52a0\u8005\u306e\u767a\u8a00\u306b\u5bfe\u3057\u3066\u3001\u540c\u610f\u30fb\u88dc\u8db3\u30fb\u5225\u306e\u8996\u70b9\u306a\u3069\u81ea\u7136\u306a\u4f1a\u8a71\u306e\u6d41\u308c\u3092\u610f\u8b58\u3057\u3066\u304f\u3060\u3055\u3044\n';
    prompt += '- \u5177\u4f53\u7684\u306a\u4f53\u9a13\u8ac7\u3092\u4ea4\u3048\u308b\u3068\u8aac\u5f97\u529b\u304c\u51fa\u307e\u3059\n';
    prompt += '- 1\u301c3\u6bb5\u843d\u7a0b\u5ea6\u3067\u7c21\u6f54\u306b';

    return prompt;
  }

  // --- Preview ---
  $btnPreview.addEventListener('click', function () {
    var raw = $jsonInput.value.trim();
    if (!raw) {
      showToast('JSONを入力してください');
      return;
    }
    var data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      showToast('JSONの形式が正しくありません: ' + e.message);
      return;
    }
    // Validate required fields
    var missing = [];
    if (!data.nickname) missing.push('nickname');
    if (!data.expertise || !data.expertise.length) missing.push('expertise');
    if (!data.personality) missing.push('personality');
    if (!data.tone || !data.tone.characteristics || !data.tone.samples) missing.push('tone (characteristics, samples)');
    if (!data.episodes || !data.episodes.length) missing.push('episodes');
    if (missing.length) {
      showToast('必須項目が不足しています: ' + missing.join(', '));
      return;
    }

    // Build preview HTML
    var html = '';
    html += '<div class="preview-field"><span class="label">ニックネーム:</span> <span class="value">' + escapeHtml(data.nickname) + '</span></div>';
    html += '<div class="preview-field"><span class="label">得意分野:</span> <span class="value">' + escapeHtml((data.expertise || []).join(', ')) + '</span></div>';
    html += '<div class="preview-field"><span class="label">性格タイプ:</span> <span class="value">' + escapeHtml(data.personality) + '</span></div>';
    if (data.tone && data.tone.samples) {
      html += '<div class="preview-field"><span class="label">口調サンプル:</span> <span class="value">' + escapeHtml(data.tone.samples.join(' / ')) + '</span></div>';
    }
    if (data.episodes) {
      html += '<div class="preview-field"><span class="label">エピソード:</span><ul>';
      data.episodes.forEach(function (ep) {
        html += '<li>' + escapeHtml(ep) + '</li>';
      });
      html += '</ul></div>';
    }

    $previewContent.innerHTML = html;
    $previewPromptText.textContent = buildSystemPrompt(data);
    $previewArea.classList.remove('hidden');
    $btnRegister.disabled = false;
  });

  // --- Register Agent ---
  $btnRegister.addEventListener('click', function () {
    var raw = $jsonInput.value.trim();
    if (!raw) return;
    var data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      showToast('JSONの形式が正しくありません');
      return;
    }

    $btnRegister.disabled = true;
    $btnRegister.textContent = '登録中...';

    var isSelf = document.getElementById('is-self-check').checked;
    data.is_self = isSelf;

    fetch(API + '/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
      .then(function (res) {
        if (!res.ok) return res.json().then(function (e) { throw new Error(e.detail || 'Registration failed'); });
        return res.json();
      })
      .then(function () {
        $jsonInput.value = '';
        $previewArea.classList.add('hidden');
        $btnRegister.textContent = '登録する';
        loadAgents();
      })
      .catch(function (err) {
        showToast('登録に失敗しました: ' + err.message);
        $btnRegister.disabled = false;
        $btnRegister.textContent = '登録する';
      });
  });

  // --- Load Agents ---
  function loadAgents() {
    fetch(API + '/agents')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var agents = data.agents || [];
        if (!agents.length) {
          $agentsList.innerHTML = '<p class="empty-message">まだ代理AIが登録されていません。</p>';
          return;
        }
        var html = '';
        agents.forEach(function (agent) {
          var selfClass = agent.is_self ? ' agent-card--self' : '';
          html += '<div class="agent-card' + selfClass + '">';
          if (agent.is_self) {
            html += '<span class="self-badge">自分</span>';
          }
          html += '<div class="nickname">' + escapeHtml(agent.nickname) + '</div>';
          html += '<div class="personality">' + escapeHtml(agent.personality || '') + '</div>';
          html += '<div class="expertise-tags">';
          (agent.expertise || []).forEach(function (tag) {
            html += '<span class="expertise-tag">' + escapeHtml(tag) + '</span>';
          });
          html += '</div></div>';
        });
        $agentsList.innerHTML = html;
      })
      .catch(function () {
        // Silently fail on initial load; agents will load when server is ready
      });
  }

  // --- Ask Question ---
  $btnAsk.addEventListener('click', function () {
    var question = $questionInput.value.trim();
    if (!question) {
      showToast('質問を入力してください');
      return;
    }

    $btnAsk.disabled = true;
    $loading.classList.remove('hidden');
    $conversationArea.classList.add('hidden');

    fetch(API + '/threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: question })
    })
      .then(function (res) {
        if (!res.ok) return res.json().then(function (e) { throw new Error(e.detail || 'Failed to create thread'); });
        return res.json();
      })
      .then(function (thread) {
        currentThreadId = thread.id;
        $conversationQuestion.textContent = question;
        startPolling();
      })
      .catch(function (err) {
        showToast('質問の送信に失敗しました: ' + err.message);
        $btnAsk.disabled = false;
        $loading.classList.add('hidden');
      });
  });

  // --- Polling ---
  function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      if (!currentThreadId) return;
      fetch(API + '/threads/' + currentThreadId)
        .then(function (res) { return res.json(); })
        .then(function (data) {
          renderMessages(data.messages || []);
          if (data.status === 'completed' || data.status === 'error') {
            stopPolling();
            $loading.classList.add('hidden');
            $conversationArea.classList.remove('hidden');
            $btnAsk.disabled = false;
            if (data.status === 'error') {
              showToast('会話生成中にエラーが発生しました');
            }
          }
        })
        .catch(function () {
          // Keep polling on transient errors
        });
    }, 3000);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  // --- Render Messages ---
  function renderMessages(messages) {
    if (!messages.length) return;
    var html = '';
    messages.forEach(function (msg) {
      var nickname = msg.agent_nickname || 'Unknown';
      var colorClass = 'message-color-' + getSpeakerColor(nickname);
      html += '<div class="message-bubble ' + colorClass + '">';
      html += '<div class="speaker">' + escapeHtml(nickname) + 'の代理</div>';
      html += '<div class="content">' + escapeHtml(msg.content) + '</div>';
      html += '</div>';
    });
    $messagesList.innerHTML = html;
  }

  // --- Follow-up ---
  $btnFollowup.addEventListener('click', function () {
    var question = $followupInput.value.trim();
    if (!question || !currentThreadId) {
      showToast('追加質問を入力してください');
      return;
    }

    $btnFollowup.disabled = true;
    $loading.classList.remove('hidden');

    fetch(API + '/threads/' + currentThreadId + '/follow-up', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: question })
    })
      .then(function (res) {
        if (!res.ok) return res.json().then(function (e) { throw new Error(e.detail || 'Failed'); });
        return res.json();
      })
      .then(function () {
        $followupInput.value = '';
        startPolling();
      })
      .catch(function (err) {
        showToast('追加質問の送信に失敗しました: ' + err.message);
        $loading.classList.add('hidden');
      })
      .finally(function () {
        $btnFollowup.disabled = false;
      });
  });

  // --- Init ---
  loadAgents();
})();
