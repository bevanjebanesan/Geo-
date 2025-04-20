// Reverted to last known working version for hand tracking and suggestions.

(() => {
  const landing = document.getElementById('landing');
  const meeting = document.getElementById('meeting');
  const roomInput = document.getElementById('room-input');
  const createBtn = document.getElementById('create-button');
  const joinBtn = document.getElementById('join-button');
  const meetingIdSpan = document.getElementById('meeting-id');
  const shareBtn = document.getElementById('share-button');
  const cameraToggle = document.getElementById('camera-toggle');
  const micToggle = document.getElementById('mic-toggle');
  const captionsToggle = document.getElementById('captions-toggle');
  const handsToggle = document.getElementById('hands-toggle');
  const participantsList = document.getElementById('participants-list');
  const localVideo = document.getElementById('local-video');
  const remoteVideo = document.getElementById('remote-video');
  const overlay = document.getElementById('overlay');
  const overlayCtx = overlay.getContext('2d');
  const captionsDiv = document.getElementById('captions');
  const signTextDiv = document.getElementById('sign-text');
  const suggestionsDiv = document.getElementById('suggestions');
  const nameInput = document.getElementById('name-input');
  const toastEl = document.getElementById('toast');
  const chatInput = document.getElementById('chat-input');
  const chatSend = document.getElementById('chat-send');
  const chatMessages = document.getElementById('chat-messages');
  const leaveBtn = document.getElementById('leave-button');

  let peer, localStream, currentCall;
  const participants = new Set();
  let dataConnections = [];

  let cameraOn = true, micOn = true, captionsOn = false, handsOn = false;
  let recognition, lastSign = '', prefixSign = '';
  let userName = '';

  let letterBuffer = '';
  let sentenceBuffer = '';
  let suggestionOwner = userName;
  let lastDetectedLetter = '';
  let lastLetterTimeout = null;

  // --- Map peer IDs to user names ---
  const peerIdToName = {};

  // --- Dictionary loading state for suggestions ---
  let dictLoaded = false;

  // --- Trie and dictionary loader (workplace_words.txt) ---
  const trie = new (function() {
    this.root = { children: {}, isEnd: false };
    this.insert = function(word) {
      let node = this.root;
      for (const char of word) {
        if (!node.children[char]) node.children[char] = { children: {}, isEnd: false };
        node = node.children[char];
      }
      node.isEnd = true;
    };
    this.getWordsWithPrefix = function(prefix) {
      let node = this.root;
      for (const char of prefix) {
        if (!node.children[char]) return [];
        node = node.children[char];
      }
      const results = [];
      (function dfs(curr, path) {
        if (curr.isEnd) results.push(prefix + path);
        for (const c in curr.children) dfs(curr.children[c], path + c);
      })(node, '');
      return results;
    };
  })();
  (async () => {
    const res = await fetch('workplace_words.txt');
    const words = (await res.text()).split('\n').map(w => w.trim()).filter(w => w);
    for (const w of words) trie.insert(w.toLowerCase());
    dictLoaded = true;
  })();

  // Show loading for suggestions if dictionary is not ready
  function showSuggestionsLoading() {
    suggestionsDiv.innerHTML = '<span style="color:#888">Loading dictionary...</span>';
    suggestionsDiv.hidden = false;
  }

  // Add backspace button for letter buffer
  function addBackspaceButton() {
    let backspaceBtn = document.getElementById('backspace-letter');
    if (!backspaceBtn) {
      backspaceBtn = document.createElement('button');
      backspaceBtn.id = 'backspace-letter';
      backspaceBtn.textContent = '⌫';
      backspaceBtn.style = 'margin-left:8px;';
      suggestionsDiv.parentNode.insertBefore(backspaceBtn, suggestionsDiv);
    }
    backspaceBtn.onclick = () => {
      if (letterBuffer.length > 0) {
        letterBuffer = letterBuffer.slice(0, -1);
        updateSuggestionsAndBroadcast();
      }
    };
  }

  suggestionsDiv.onclick = e => {
    if (e.target.tagName === 'SPAN' && e.target.dataset.word) {
      // When a suggestion is clicked, add it to the sentence buffer and clear the letter buffer
      sentenceBuffer += (sentenceBuffer ? ' ' : '') + e.target.dataset.word;
      letterBuffer = '';
      updateSuggestionsAndBroadcast();
    }
  };

  // --- Helper: get only real words from trie for prefix ---
  function getRealWordSuggestions(prefix, max=5) {
    let node = trie.root;
    prefix = prefix.toLowerCase();
    for (const char of prefix) {
      if (!node.children[char]) return [];
      node = node.children[char];
    }
    const results = [];
    (function dfs(curr, path) {
      if (results.length >= max) return;
      const word = prefix + path;
      // Only accept real words: at least 2 chars, all lowercase a-z
      if (curr.isEnd && /^[a-z]{2,}$/.test(word)) results.push(word);
      for (const c in curr.children) dfs(curr.children[c], path + c);
    })(node, '');
    return results;
  }

  // --- updateSuggestionsUI: only show real words, persist while buffer is valid ---
  function updateSuggestionsUI(suggestions, owner, sentence) {
    if (!dictLoaded) {
      showSuggestionsLoading();
      return;
    }
    // Only show suggestions if buffer is non-empty, alphabetic, and matches a prefix in trie
    if (!letterBuffer.match(/^[a-z]+$/i) || getRealWordSuggestions(letterBuffer).length === 0) {
      suggestionsDiv.innerHTML = `<span style='color:#888'>No suggestions</span>`;
      suggestionsDiv.hidden = false;
      let sentenceEl = document.getElementById('sentence-buffer');
      if (sentenceEl) sentenceEl.innerHTML = `<b>Sentence (${owner || suggestionOwner}):</b> ${sentenceBuffer || ''} <button id=\"clear-sentence\" style=\"margin-left:8px;\">Clear</button>`;
      return;
    }
    suggestions = suggestions || getRealWordSuggestions(letterBuffer, 5);
    owner = owner || suggestionOwner;
    sentence = sentence !== undefined ? sentence : sentenceBuffer;
    if (suggestions.length > 0) {
      suggestionsDiv.innerHTML = `<b>Suggestions (${owner}):</b> ` +
        suggestions.map(w => `<span data-word=\"${w}\" style=\"cursor:pointer;color:#0077cc;margin-right:8px;\">${w}</span>`).join(' ');
      suggestionsDiv.hidden = false;
    } else {
      suggestionsDiv.innerHTML = `<span style='color:#888'>No suggestions</span>`;
      suggestionsDiv.hidden = false;
    }
    addBackspaceButton();
    // Show sentence buffer below suggestions
    let sentenceEl = document.getElementById('sentence-buffer');
    if (!sentenceEl) {
      sentenceEl = document.createElement('div');
      sentenceEl.id = 'sentence-buffer';
      sentenceEl.style = 'margin-top:6px;padding:6px 8px;background:#f1f1f1;border-radius:4px;min-height:24px;';
      suggestionsDiv.parentNode.insertBefore(sentenceEl, suggestionsDiv.nextSibling);
    }
    sentenceEl.innerHTML = `<b>Sentence (${owner}):</b> ${sentence || ''} <button id=\"clear-sentence\" style=\"margin-left:8px;\">Clear</button>`;
    document.getElementById('clear-sentence').onclick = () => {
      sentenceBuffer = '';
      updateSuggestionsUI();
      broadcastSuggestions();
    };
  }

  // --- Visual buffer indicator ---
  function updateBufferIndicator() {
    let bufferEl = document.getElementById('letter-buffer-indicator');
    if (!bufferEl) {
      bufferEl = document.createElement('div');
      bufferEl.id = 'letter-buffer-indicator';
      bufferEl.style = 'margin: 6px 0; color: #444; font-size: 1.1em; text-align:center;';
      suggestionsDiv.parentNode.insertBefore(bufferEl, suggestionsDiv);
    }
    bufferEl.innerHTML = `<b>Current Buffer:</b> <span style='color:#0077cc'>${letterBuffer || '(empty)'}</span>`;
  }

  // Patch updateSuggestionsUI to update buffer indicator
  const _updateSuggestionsUI = updateSuggestionsUI;
  updateSuggestionsUI = function(...args) {
    updateBufferIndicator();
    return _updateSuggestionsUI.apply(this, args);
  };

  function broadcastSuggestions() {
    if (!dictLoaded) return;
    const suggestions = getRealWordSuggestions(letterBuffer, 5);
    for (const conn of dataConnections) {
      if (conn.open) conn.send({type:'suggestions', name:userName, suggestions, sentence: sentenceBuffer});
    }
    updateSuggestionsUI(suggestions, userName, sentenceBuffer);
  }

  function updateSuggestionsAndBroadcast() {
    updateSuggestionsUI();
    broadcastSuggestions();
  }

  // --- Broadcast sentenceBuffer to all participants when changed ---
  function broadcastSentenceBuffer() {
    for (const conn of dataConnections) {
      if (conn.open) conn.send({type:'sentence', name:userName, sentence: sentenceBuffer});
    }
  }

  // Patch updateSuggestionsAndBroadcast to also send the sentenceBuffer
  const _updateSuggestionsAndBroadcast = updateSuggestionsAndBroadcast;
  updateSuggestionsAndBroadcast = function() {
    _updateSuggestionsAndBroadcast();
    broadcastSentenceBuffer();
  };

  createBtn.onclick = () => {
    if (!nameInput.value.trim()) return alert('Enter your name');
    userName = nameInput.value.trim();
    roomInput.value = roomInput.value || uuidv4();
    startMeeting(roomInput.value, true);
  };
  joinBtn.onclick = () => {
    if (!nameInput.value.trim()) return alert('Enter your name');
    if (!roomInput.value) return alert('Enter Meeting ID');
    userName = nameInput.value.trim();
    startMeeting(roomInput.value, false);
  };

  async function startMeeting(roomId, isCreator) {
    landing.hidden = true; meeting.hidden = false;
    meetingIdSpan.textContent = roomId;
    participants.clear();
    if (isCreator) participants.add(userName);
    updateParticipants();
    try {
      // Restore the original working code, but add a fallback error toast
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera/microphone access is not supported in this browser. Please use a modern browser like Chrome or Firefox.');
      }
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideo.srcObject = localStream;
    } catch (err) {
      showToast(err.message || 'Camera/microphone access failed.');
      landing.hidden = false;
      meeting.hidden = true;
      return;
    }
    initPeer(roomId, isCreator);
    setupControls();
  }

  function initPeer(roomId, isCreator) {
    peer = isCreator ? new Peer(roomId) : new Peer();
    peer.on('open', id => {
      if (!isCreator) callPeer(roomId);
      participants.add(userName);
      updateParticipants();
    });
    peer.on('call', call => {
      call.answer(localStream);
      handleCall(call);
    });
    peer.on('connection', conn => {
      addDataConnection(conn);
      conn.send({type:'name', name:userName, peerId:peer.id});
    });
  }

  function addDataConnection(conn) {
    if (!dataConnections.includes(conn)) dataConnections.push(conn);
    conn.on('data', handleData);
  }

  function callPeer(peerId) {
    const call = peer.call(peerId, localStream);
    handleCall(call);
    const conn = peer.connect(peerId);
    addDataConnection(conn);
    conn.on('open', () => {
      conn.send({type:'name', name:userName, peerId:peer.id});
    });
  }

  function handleData(data) {
    if (data.type === 'name' && data.name && data.peerId) {
      peerIdToName[data.peerId] = data.name;
      participants.add(data.name);
      updateParticipants();
      updateVideoLabels();
      return;
    }
    if (data.type === 'caption') {
      showRemoteCaption(data.name, data.text);
    }
    if (data.type === 'chat') {
      appendChatMessage(data.name, data.text, false);
    }
    if (data.type === 'suggestions') {
      suggestionOwner = data.name;
      updateSuggestionsUI(data.suggestions, data.name, data.sentence);
    }
    if (data.type === 'participants') {
      participants.clear();
      for (const name of data.participants) participants.add(name);
      updateParticipants();
    }
    if (data.type === 'request_participants' && peer && peer.id === currentCall.peer) {
      broadcastParticipants();
    }
    if (data.type === 'sentence') {
      showRemoteSentence(data.name, data.sentence);
      return;
    }
    handleData.call(this, data);
  }

  function handleCall(call) {
    participants.add(call.peer);
    updateParticipants();
    call.on('stream', stream => {
      remoteVideo.srcObject = stream;
      overlay.width = remoteVideo.videoWidth;
      overlay.height = remoteVideo.videoHeight;
    });
    call.on('close', () => { participants.delete(call.peer); updateParticipants(); });
    currentCall = call;
  }

  // --- updateParticipants: only show names, never peer IDs ---
  function updateParticipants() {
    participantsList.innerHTML = '';
    participants.forEach(name => {
      // Only show if not a peer ID (IDs are long and alphanumeric, names are from user input)
      if (typeof name === 'string' && name.length <= 30 && /[a-zA-Z]/.test(name)) {
        const li = document.createElement('li');
        li.textContent = name;
        participantsList.appendChild(li);
      }
    });
    broadcastParticipants();
  }

  function broadcastParticipants() {
    for (const conn of dataConnections) {
      if (conn.open) conn.send({type:'participants', participants: Array.from(participants)});
    }
  }

  // --- Share Meeting URL with IP Only ---
  function getShareableUrl(roomId) {
    // Always use the LAN IP for sharing
    let baseUrl = window.location.origin.replace(window.location.hostname, '192.168.0.100');
    return `${baseUrl}?room=${encodeURIComponent(roomId)}`;
  }

  shareBtn.onclick = () => {
    const meetingId = meetingIdSpan.textContent;
    const url = getShareableUrl(meetingId);
    navigator.clipboard.writeText(url)
      .then(() => showToast('Meeting link copied'))
      .catch(err => console.error('Share error', err));
  };

  cameraToggle.onclick = () => {
    cameraOn = !cameraOn;
    localStream.getVideoTracks()[0].enabled = cameraOn;
    cameraToggle.textContent = cameraOn ? 'Camera Off' : 'Camera On';
  };
  micToggle.onclick = () => {
    micOn = !micOn;
    localStream.getAudioTracks()[0].enabled = micOn;
    micToggle.textContent = micOn ? 'Mute' : 'Unmute';
  };

  captionsToggle.onclick = () => {
    captionsOn = !captionsOn;
    captionsToggle.textContent = captionsOn ? 'Captions On' : 'Captions Off';
    if (captionsOn) startSpeech(); else stopSpeech();
  };

  handsToggle.onclick = () => {
    if (handsToggle.disabled) return;
    handsOn = !handsOn;
    handsToggle.textContent = handsOn ? 'Hands On' : 'Hands Off';
    handsToggle.disabled = true;
    ensureHandTrackingActive();
    setTimeout(() => { handsToggle.disabled = false; }, 1000);
  };

  function setupControls() {
    cameraToggle.textContent = 'Camera Off';
    micToggle.textContent = 'Mute';
    captionsToggle.textContent = 'Captions Off';
    handsToggle.textContent = 'Hands Off';
    captionsDiv.hidden = true;
    signTextDiv.hidden = true;
    suggestionsDiv.hidden = true;
  }

  let hands = null;
  function createHands() {
    if (hands && hands.close) hands.close();
    hands = new Hands({ locateFile: f => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${f}` });
    hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.5, minTrackingConfidence: 0.3 });
    hands.onResults(onHandsResults);
  }
  createHands();

  function ensureHandTrackingActive() {
    if (handsOn) {
      // Always show overlays and request video frame if handsOn
      showHandTrackingLoading(false);
      overlay.hidden = false;
      signTextDiv.hidden = false;
      suggestionsDiv.hidden = false;
      // Defensive: ensure localVideo is ready before requesting frame
      if (localVideo.readyState >= 2) {
        requestVideoFrame();
      } else {
        localVideo.onloadeddata = () => {
          requestVideoFrame();
        };
      }
    } else {
      showHandTrackingLoading(false);
      overlay.hidden = true;
      signTextDiv.hidden = true;
      suggestionsDiv.hidden = true;
    }
  }

  function requestVideoFrame() {
    if (!handsOn) return;
    if (!hands || !localVideo || localVideo.readyState < 2) {
      setTimeout(requestVideoFrame, 100);
      return;
    }
    localVideo.requestVideoFrameCallback(async () => {
      if (!handsOn) return;
      try {
        await hands.send({ image: localVideo });
      } catch (e) {
        if (e && e.message && e.message.includes('HEAP8')) {
          showToast('Hand tracking crashed, restarting...');
          createHands();
          setTimeout(requestVideoFrame, 300);
          return;
        } else {
          showToast('Hand tracking error: ' + (e.message || e));
        }
      }
      setTimeout(requestVideoFrame, 60); // Throttle to ~16 FPS
    });
  }

  function showHandTrackingLoading(show) {
    let loading = document.getElementById('hands-loading');
    if (!loading) {
      loading = document.createElement('div');
      loading.id = 'hands-loading';
      loading.style = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;padding:1.2em 2em;border-radius:8px;box-shadow:0 2px 8px #0002;z-index:300;font-size:1.1em;color:#1976d2;';
      loading.innerText = 'Initializing hand tracking...';
      document.body.appendChild(loading);
    }
    loading.hidden = !show;
  }

  function onHandsResults(results) {
    try {
      overlayCtx.save();
      overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
      if (results && results.image && overlay.width && overlay.height)
        overlayCtx.drawImage(results.image, 0, 0, overlay.width, overlay.height);
      // --- HAND TRACKING ACTIVATION PATCH ---
      if (handsOn && results.multiHandLandmarks && results.multiHandLandmarks[0]) {
        const landmarks = results.multiHandLandmarks[0];
        let finger = {
          thumb: { angle_sum: 0 },
          index: { angle_sum: 0 },
          middle: { angle_sum: 0 },
          ring: { angle_sum: 0 },
          pinky: { angle_sum: 0 }
        };
        const L = landmarks;
        for (let i = 0; i < L.length; i++) {
          L[i].x -= L[0].x;
          L[i].y -= L[0].y;
          L[i].z -= L[0].z;
        }
        finger.thumb.angle_sum = angle(L[1], L[2], L[3]) + angle(L[2], L[3], L[4]);
        finger.index.angle_sum = angle(L[5], L[6], L[7]) + angle(L[6], L[7], L[8]);
        finger.middle.angle_sum = angle(L[9], L[10], L[11]) + angle(L[10], L[11], L[12]);
        finger.ring.angle_sum = angle(L[13], L[14], L[15]) + angle(L[14], L[15], L[16]);
        finger.pinky.angle_sum = angle(L[17], L[18], L[19]) + angle(L[18], L[19], L[20]);
        let index_middle_tip_dist = distance3d(
          L[8].x, L[8].y, L[8].z,
          L[12].x, L[12].y, L[12].z
        );
        let predicted_letter = letter(
          finger.thumb.angle_sum,
          finger.index.angle_sum,
          finger.middle.angle_sum,
          finger.ring.angle_sum,
          finger.pinky.angle_sum,
          index_middle_tip_dist
        );
        signTextDiv.textContent = predicted_letter;
        signTextDiv.hidden = false;
        // --- Only update buffer if new letter is shown ---
        if (dictLoaded && /^[A-Za-z]$/.test(predicted_letter)) {
          if (predicted_letter !== lastDetectedLetter) {
            // Replace last letter in buffer with new letter
            if (letterBuffer.length === 0) {
              letterBuffer = predicted_letter.toLowerCase();
            } else {
              letterBuffer = letterBuffer.slice(0, -1) + predicted_letter.toLowerCase();
            }
            lastDetectedLetter = predicted_letter;
            updateSuggestionsAndBroadcast();
            if (lastLetterTimeout) clearTimeout(lastLetterTimeout);
            lastLetterTimeout = setTimeout(() => { lastDetectedLetter = ''; }, 1000);
          } else {
            // Keep buffer at current state (do not add more letters)
            updateSuggestionsUI();
          }
        } else if (!/^[A-Za-z]$/.test(predicted_letter)) {
          lastDetectedLetter = '';
          if (lastLetterTimeout) clearTimeout(lastLetterTimeout);
          lastLetterTimeout = setTimeout(() => {
            letterBuffer = '';
            updateSuggestionsAndBroadcast();
            suggestionsDiv.hidden = true;
          }, 1000);
        }
        // If you have a valid prediction, show overlays
        console.log('Hand detected, overlays shown');
        signTextDiv.hidden = false;
        suggestionsDiv.hidden = false;
        overlay.hidden = false;
      } else {
        console.log('No hand detected, overlays hidden');
        signTextDiv.hidden = true;
        overlay.hidden = true;
        suggestionsDiv.hidden = true;
        if (lastLetterTimeout) clearTimeout(lastLetterTimeout);
        lastLetterTimeout = setTimeout(() => {
          letterBuffer = '';
          updateSuggestionsAndBroadcast();
          suggestionsDiv.hidden = true;
        }, 1000);
      }
      overlayCtx.restore();
    } catch (e) {
      showToast('Hand tracking failed: ' + (e.message || e));
      console.error(e);
    }
  };

  // Sign detection via MediaPipe
  function letter(thumb, index, middle, ring, pinky, tip_dist) {
    if (index > 50 && middle > 50 && ring > 50 && pinky > 50) {
      if (middle <= 170 && ring <= 170) {
        if (thumb > 80) {
          return "C";
        } else {
          return "O";
        }
      }
      if (thumb > 80) {
        return "E";
      } else if (thumb > 20 && thumb <= 80) {
        return "T";
      } else {
        return "A";
      }
    }
    if (middle > 50 && ring > 50 && pinky > 50) {
      if (thumb > 70) {
        return "D";
      } else {
        return "L";
      }
    }
    if (index > 50 && middle > 50 && ring > 50) {
      if (thumb > 70) {
        return "I";
      } else {
        return "Y";
      }
    }
    if (ring > 50 && pinky > 50) {
      if (thumb > 70) {
        if (tip_dist > 0.2) {
          return "V";
        } else {
          return "U";
        }
      } else {
        if (tip_dist > 0.2) {
          return "K";
        } else {
          return "H";
        }
      }
    }
    if (middle > 70 && ring > 70) {
      if (thumb < 20) {
        return "i<3u";
      }
    }
    if (pinky > 50) {
      if (thumb > 20) {
        return "W";
      }
    }
    if (index > 50) {
      if (thumb > 20) {
        return "F";
      }
    }
    if (thumb > 40) {
      return "B";
    }
    if (thumb > 15) {
      return "Hi";
    }
    return "NA";
  }

  function distance3d(x1, y1, z1, x2, y2, z2) {
    return Math.sqrt(
      Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2) + Math.pow(z2 - z1, 2)
    );
  }
  function angle(l1, l2, l3) {
    const v1 = [l2.x - l1.x, l2.y - l1.y, l2.z - l1.z];
    const v2 = [l3.x - l2.x, l3.y - l2.y, l3.z - l2.z];
    const dotproduct = v1.reduce((a, b, i) => a + b * v2[i], 0);
    const v1_mag = Math.hypot(v1[0], v1[1], v1[2]);
    const v2_mag = Math.hypot(v2[0], v2[1], v2[2]);
    const rad = Math.acos(dotproduct / (v1_mag * v2_mag));
    return (rad * 180) / Math.PI;
  }

  // --- Video label updater for local/remote video elements ---
  function updateVideoLabels() {
    let localLabel = document.getElementById('local-video-label');
    if (!localLabel) {
      localLabel = document.createElement('div');
      localLabel.id = 'local-video-label';
      localLabel.style = 'text-align:center;font-size:1em;color:#444;margin-top:4px;';
      localVideo.parentNode.appendChild(localLabel);
    }
    localLabel.textContent = userName || 'You';
    let remoteLabel = document.getElementById('remote-video-label');
    if (!remoteLabel) {
      remoteLabel = document.createElement('div');
      remoteLabel.id = 'remote-video-label';
      remoteLabel.style = 'text-align:center;font-size:1em;color:#444;margin-top:4px;';
      remoteVideo.parentNode.appendChild(remoteLabel);
    }
    // Find the remote participant's peerId and map to name
    if (currentCall && currentCall.peer && peerIdToName[currentCall.peer]) {
      remoteLabel.textContent = peerIdToName[currentCall.peer];
    } else {
      // fallback: try to find any participant that's not me
      let others = Array.from(participants).filter(n => n !== userName);
      remoteLabel.textContent = others[0] || 'Remote';
    }
  }

  // Patch updateParticipants to also update video labels
  const _updateParticipants2 = updateParticipants;
  updateParticipants = function() {
    _updateParticipants2();
    updateVideoLabels();
  };

  // Also update video labels after joining/starting meeting
  const _startMeeting = startMeeting;
  startMeeting = async function(roomId, isCreator) {
    await _startMeeting(roomId, isCreator);
    updateVideoLabels();
  };

  // Call requestParticipantsFromHost after joining
  const _handleCall = handleCall;
  handleCall = function(call) {
    _handleCall(call);
    requestParticipantsFromHost();
  };

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    setTimeout(() => { toastEl.hidden = true; }, 2000);
  }

  leaveBtn.onclick = leaveMeeting;

  function leaveMeeting() {
    // Close PeerJS connections
    if (peer) {
      peer.destroy();
      peer = null;
    }
    // Stop local media stream
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }
    // Clear remote video
    if (remoteVideo.srcObject) remoteVideo.srcObject = null;
    if (localVideo.srcObject) localVideo.srcObject = null;
    // Hide meeting, show landing
    meeting.hidden = true;
    landing.hidden = false;
    // Clear participants, chat, captions
    participants.clear();
    updateParticipants();
    chatMessages.innerHTML = '';
    captionsDiv.hidden = true;
    signTextDiv.hidden = true;
    suggestionsDiv.hidden = true;
    overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
    overlay.hidden = true;
    // Reset toggles
    handsOn = false;
    handsToggle.textContent = 'Hands Off';
    overlay.hidden = true;
    signTextDiv.hidden = true;
    suggestionsDiv.hidden = true;
    // Optionally: reset other state variables if needed
  }

  // --- Keyboard navigation for suggestions (arrow keys + enter) ---
  let suggestionIndex = 0;
  let lastSuggestions = [];

  function highlightSuggestion(index) {
    const spans = suggestionsDiv.querySelectorAll('span[data-word]');
    spans.forEach((el, i) => {
      el.style.background = i === index ? '#e3f1ff' : '';
      el.style.borderRadius = i === index ? '4px' : '';
      el.style.padding = i === index ? '2px 4px' : '';
    });
  }

  document.addEventListener('keydown', function(e) {
    if (!handsOn || suggestionsDiv.hidden || lastSuggestions.length === 0) return;
    if (["ArrowLeft","ArrowUp"].includes(e.key)) {
      e.preventDefault();
      suggestionIndex = (suggestionIndex - 1 + lastSuggestions.length) % lastSuggestions.length;
      highlightSuggestion(suggestionIndex);
    } else if (["ArrowRight","ArrowDown"].includes(e.key)) {
      e.preventDefault();
      suggestionIndex = (suggestionIndex + 1) % lastSuggestions.length;
      highlightSuggestion(suggestionIndex);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (lastSuggestions[suggestionIndex]) {
        sentenceBuffer += (sentenceBuffer ? ' ' : '') + lastSuggestions[suggestionIndex];
        letterBuffer = '';
        updateSuggestionsAndBroadcast();
        suggestionIndex = 0;
        lastSuggestions = [];
      }
    }
  });

  // Patch updateSuggestionsUI to support keyboard navigation
  const _updateSuggestionsUI2 = updateSuggestionsUI;
  updateSuggestionsUI = function(suggestions, ...args) {
    if (!Array.isArray(suggestions)) suggestions = getRealWordSuggestions(letterBuffer, 5);
    lastSuggestions = suggestions;
    if (suggestionIndex >= suggestions.length) suggestionIndex = 0;
    setTimeout(() => highlightSuggestion(suggestionIndex), 0);
    return _updateSuggestionsUI2.call(this, suggestions, ...args);
  };

  // --- Participant Sync: Broadcast full participant list on join/leave ---
  function broadcastParticipants() {
    for (const conn of dataConnections) {
      if (conn.open) conn.send({type:'participants', participants: Array.from(participants)});
    }
  }

  // Patch handleData to handle participants sync
  const _handleData = handleData;
  handleData = function(data) {
    if (data.type === 'participants') {
      participants.clear();
      for (const name of data.participants) participants.add(name);
      updateParticipants();
      return;
    }
    _handleData.call(this, data);
  };

  // When joining, request full participant list from host
  function requestParticipantsFromHost() {
    if (dataConnections.length > 0 && dataConnections[0].open) {
      dataConnections[0].send({type:'request_participants'});
    }
  }

  // Host responds to participant list requests
  const _handleData2 = handleData;
  handleData = function(data) {
    if (data.type === 'request_participants' && peer && peer.id === currentCall.peer) {
      broadcastParticipants();
      return;
    }
    _handleData2.call(this, data);
  };

  // Call broadcastParticipants on join/leave
  const _updateParticipants = updateParticipants;
  updateParticipants = function() {
    _updateParticipants();
    broadcastParticipants();
  };

  // Display remote participant's hand sentence output
  function showRemoteSentence(name, sentence) {
    let sentenceDiv = document.getElementById('remote-sentence');
    if (!sentenceDiv) {
      sentenceDiv = document.createElement('div');
      sentenceDiv.id = 'remote-sentence';
      sentenceDiv.className = 'captions';
      document.body.appendChild(sentenceDiv);
    }
    sentenceDiv.innerHTML = `<b>${name} (Hands):</b> ${sentence}`;
    sentenceDiv.hidden = !sentence;
    if (sentence) {
      sentenceDiv.hidden = false;
      setTimeout(() => { sentenceDiv.hidden = true; }, 5000);
    }
  }

})();

function uuidv4() {
  return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4))).toString(16)
  );
}
