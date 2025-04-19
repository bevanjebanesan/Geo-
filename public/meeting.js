// DOM Elements
const joinContainer = document.getElementById('joinContainer');
const meetingContainer = document.getElementById('meetingContainer');
const meetingIdInput = document.getElementById('meetingIdInput');
const usernameInput = document.getElementById('usernameInput');
const usernameInputJoin = document.getElementById('usernameInputJoin');
const joinButton = document.getElementById('joinButton');
const createButton = document.getElementById('createButton');
const leaveButtonBottom = document.getElementById('leaveButtonBottom');
const meetingIdDisplay = document.getElementById('meetingIdDisplay');
const usernameDisplay = document.getElementById('usernameDisplay');
const localVideo = document.getElementById('localVideo');
const handTrackingVideo = document.getElementById('handTrackingVideo');
const remoteVideos = document.getElementById('remoteVideos');
const audioButton = document.getElementById('audioButton');
const videoButton = document.getElementById('videoButton');
const speechToTextButton = document.getElementById('speechToTextButton');
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const speechText = document.getElementById('speechText');
const speechStatus = document.getElementById('speechStatus');
const participantsList = document.getElementById('participantsList');
const participantCount = document.getElementById('participantCount');
const shareMeetingButtonBottom = document.getElementById('shareMeetingButtonBottom');

// WebRTC Configuration
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { 
            urls: 'turn:numb.viagenie.ca',
            username: 'webrtc@live.com',
            credential: 'muazkh'
        },
        { 
            urls: 'turn:turn.anyfirewall.com:443?transport=tcp',
            username: 'webrtc',
            credential: 'webrtc'
        },
        {
            urls: 'turn:openrelay.metered.ca:80',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:80?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        },
        {
            urls: 'turn:openrelay.metered.ca:443?transport=tcp',
            username: 'openrelayproject',
            credential: 'openrelayproject'
        }
    ],
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'all',
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
};

// State variables
let localStream = null;
let peerConnections = {};
let currentMeetingId = null;
let currentUsername = null;
let isAudioEnabled = true;
let isVideoEnabled = true;
let isSpeechToTextActive = false;
let speechRecognition = null;
let isListening = false;

// ASL Detection Variables
let letterBuffer = [];
let gestureHistory = [];
let isGestureDetectionActive = false;
let hands = null;
const BUFFER_SIZE = 5;
const GESTURE_TIMEOUT = 2000; // 2 seconds between words
let lastGestureTime = 0;

// Socket.IO Connection
const socket = io(window.location.origin, {
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    secure: true,
    rejectUnauthorized: false,
    path: '/socket.io'
});

// Trie Implementation
class TrieNode {
    constructor() {
        this.children = {};
        this.isEnd = false;
    }
}

class Trie {
    constructor() {
        this.root = new TrieNode();
        this.initializeDictionary();
    }
    
    initializeDictionary() {
        const words = [
            'apple', 'book', 'call', 'drink', 'eat',
            'food', 'go', 'help', 'like', 'more',
            'no', 'please', 'question', 'restroom',
            'stop', 'thanks', 'urgent', 'water', 'yes',
            'audio', 'video', 'mute', 'unmute', 'share',
            'connection', 'internet', 'lag', 'volume',
            'ambulance', 'doctor', 'fire', 'police', 'danger'
        ];
        words.forEach(word => this.insert(word));
    }

    insert(word) {
        let node = this.root;
        for (const char of word.toLowerCase()) {
            if (!node.children[char]) {
                node.children[char] = new TrieNode();
            }
            node = node.children[char];
        }
        node.isEnd = true;
    }

    getSuggestions(prefix) {
        let node = this.root;
        const suggestions = [];
        
        for (const char of prefix.toLowerCase()) {
            if (!node.children[char]) return suggestions;
            node = node.children[char];
        }
        
        this.dfs(node, prefix, suggestions);
        return suggestions.slice(0, 3);
    }

    dfs(node, currentWord, suggestions) {
        if (node.isEnd) {
            suggestions.push(currentWord);
        }
        
        for (const char in node.children) {
            if (suggestions.length >= 3) return;
            this.dfs(node.children[char], currentWord + char, suggestions);
        }
    }
}

const dictionary = new Trie();

// ASL Detection Helper Functions
function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function calculateFingerCurl(landmarks, mcp, pip, tip) {
    const mcpToPip = distance(landmarks[mcp], landmarks[pip]);
    const pipToTip = distance(landmarks[pip], landmarks[tip]);
    return pipToTip / (mcpToPip + pipToTip);
}

function calculateThumbCurl(landmarks) {
    const mcpToIp = distance(landmarks[2], landmarks[3]);
    const ipToTip = distance(landmarks[3], landmarks[4]);
    return ipToTip / (mcpToIp + ipToTip);
}

function detectASLLetter(landmarks) {
    // Cross-browser compatibility detection
    if (!landmarks || landmarks.length < 21) {
        console.warn('Insufficient hand landmarks');
        return null;
    }

    // Normalize coordinates relative to palm base
    const palmBase = landmarks[0];
    const normalized = landmarks.map(l => ({
        x: l.x - palmBase.x,
        y: l.y - palmBase.y
    }));

    // Calculate key vectors
    const thumbTip = normalized[4];
    const indexTip = normalized[8];
    const middleTip = normalized[12];
    const ringTip = normalized[16];
    const pinkyTip = normalized[20];
    
    // Calculate finger curl ratios (0 = straight, 1 = fully curled)
    const indexCurl = calculateFingerCurl(normalized, 5, 6, 8);  // Index finger
    const middleCurl = calculateFingerCurl(normalized, 9, 10, 12); // Middle
    const ringCurl = calculateFingerCurl(normalized, 13, 14, 16); // Ring
    const pinkyCurl = calculateFingerCurl(normalized, 17, 18, 20); // Pinky
    const thumbCurl = calculateThumbCurl(normalized);

    // Detect letters A-E (add more as needed)
    if (
        thumbCurl > 0.8 &&
        indexCurl > 0.8 &&
        middleCurl > 0.8 &&
        ringCurl > 0.8 &&
        pinkyCurl > 0.8
    ) {
        return 'a'; // Closed fist
    }

    if (
        thumbCurl < 0.2 &&
        indexCurl < 0.2 &&
        middleCurl < 0.2 &&
        ringCurl < 0.2 &&
        pinkyCurl < 0.2
    ) {
        return 'b'; // Flat hand
    }

    if (
        Math.abs(thumbTip.x - indexTip.x) > 0.15 &&
        indexCurl < 0.3 &&
        middleCurl > 0.7 &&
        ringCurl > 0.7 &&
        pinkyCurl > 0.7
    ) {
        return 'c'; // Curved C shape
    }

    if (
        thumbCurl < 0.3 &&
        indexCurl > 0.7 &&
        middleCurl < 0.3 &&
        ringCurl > 0.7 &&
        pinkyCurl > 0.7
    ) {
        return 'd'; // Index finger up
    }

    if (
        thumbCurl < 0.3 &&
        indexCurl < 0.3 &&
        middleCurl < 0.3 &&
        ringCurl > 0.7 &&
        pinkyCurl > 0.7
    ) {
        return 'e'; // Three fingers extended
    }

    return null;
}

function detectGestures(results) {
    const currentTime = Date.now();
    const gestures = [];
    
    // Browser-specific gesture detection
    if (browserInfo.isFirefox) {
        // Simplified detection for Firefox
        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            const indexTip = landmarks[8];
            const indexMcp = landmarks[5];
            
            // Basic gesture detection
            const gesture = indexTip.y < indexMcp.y ? 'b' : 'a';
            gestures.push(gesture);
        }
    } else if (results.multiHandLandmarks) {
        // Standard detection for Chrome and other browsers
        for (const landmarks of results.multiHandLandmarks) {
            const detectedChar = detectASLLetter(landmarks);
            if (detectedChar) {
                gestureHistory.push({
                    char: detectedChar,
                    timestamp: currentTime
                });
                gestures.push(detectedChar);
            }
        }
    }
    
    // Remove old gestures (500ms window)
    gestureHistory = gestureHistory.filter(
        g => currentTime - g.timestamp < 500
    );
    
    // Get most frequent gesture in last 500ms
    const charCount = {};
    gestureHistory.forEach(g => {
        charCount[g.char] = (charCount[g.char] || 0) + 1;
    });
    
    const mostFrequent = Object.entries(charCount)
        .sort((a, b) => b[1] - a[1])[0];
    
    return mostFrequent ? [mostFrequent[0]] : [];
}

function updateGestureDisplay(gestures) {
    const gestureOutput = document.getElementById('gestureOutput');
    const currentTime = Date.now();
    
    if (gestures.length > 0) {
        letterBuffer.push(...gestures);
        if (letterBuffer.length > BUFFER_SIZE) {
            letterBuffer = letterBuffer.slice(-BUFFER_SIZE);
        }
        
        // Handle word timeout
        if (currentTime - lastGestureTime > GESTURE_TIMEOUT) {
            letterBuffer = [];
        }
        lastGestureTime = currentTime;
        
        const prefix = letterBuffer.join('');
        const suggestions = dictionary.getSuggestions(prefix);
        
        gestureOutput.innerHTML = `
            <div class="current-word">${prefix}</div>
            ${suggestions.map(word => `
                <button class="suggestion" onclick="selectSuggestion('${word}')">
                    ${word}
                </button>
            `).join('')}
        `;
    }
}

function selectSuggestion(word) {
    const chatInput = document.getElementById('messageInput');
    chatInput.value = word;
    letterBuffer = [];
    document.getElementById('gestureOutput').innerHTML = '';
}

// Browser Detection and Compatibility Flags
const browserInfo = {
    isChrome: /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor),
    isSafari: /Safari/.test(navigator.userAgent) && /Apple Computer/.test(navigator.vendor),
    isFirefox: navigator.userAgent.toLowerCase().indexOf('firefox') > -1,
    isEdge: /Edge/.test(navigator.userAgent),
    supportsWebGL: (() => {
        try {
            const canvas = document.getElementById('handTrackingCanvas');
            return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
        } catch(e) {
            return false;
        }
    })()
};

function initializeHandTracking() {
    // Comprehensive error handling for hand tracking
    if (!browserInfo.supportsWebGL) {
        console.error('WebGL not supported in this browser');
        alert('Hand tracking requires WebGL support. Please use a modern browser like Chrome.');
        return;
    }

    if (!window.Hands) {
        console.error('MediaPipe Hands library not loaded');
        alert('Hand tracking requires MediaPipe. Please check your internet connection.');
        return;
    }

    // Check for WebRTC and MediaDevices support
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.error('WebRTC not supported in this browser');
        alert('Your browser does not support WebRTC. Please use Google Chrome.');
        return;
    }

    try {
        // Dynamically create a hands instance with advanced configuration
        hands = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
            // Add custom error handling configuration
            onError: (error) => {
                console.error('MediaPipe Hands Initialization Error:', error);
                alert(`Hand tracking initialization failed: ${error.message}`);
            }
        });

        // Enhanced configuration for better cross-browser compatibility
        hands.setOptions({
            maxNumHands: 2,
            modelComplexity: 1,
            minDetectionConfidence: 0.5,  // Slightly lower threshold
            minTrackingConfidence: 0.5
        });

        hands.onResults(results => {
            try {
                if (results.multiHandLandmarks && isGestureDetectionActive) {
                    const gestures = detectGestures(results);
                    updateGestureDisplay(gestures);
                }
            } catch (processingError) {
                console.error('Error processing hand tracking results:', processingError);
            }
        });

        // Fallback mechanism for unsupported browsers
        if (!hands) {
            throw new Error('Hand tracking initialization failed');
        }

    } catch (error) {
        console.error('Comprehensive Hand Tracking Initialization Error:', {
            errorMessage: error.message,
            browserInfo: {
                isChrome,
                isSafari,
                isFirefox,
                userAgent: navigator.userAgent
            }
        });
        
        // Show detailed browser compatibility warning
        showBrowserWarning();
        alert('Hand tracking is not fully supported. Please use Google Chrome for best results.');
    }
}

// Initialize Speech Recognition
function initializeSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window)) {
        showNotification('Speech recognition is not supported in this browser', 'error');
        return;
    }

    speechRecognition = new webkitSpeechRecognition();
    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;
    speechRecognition.lang = 'en-US';

    speechRecognition.onstart = () => {
        console.log('Speech recognition started');
    };

    speechRecognition.onend = () => {
        console.log('Speech recognition ended');
        if (isListening) {
            // Restart if it was supposed to be listening
            try {
                speechRecognition.start();
            } catch (error) {
                console.error('Error restarting speech recognition:', error);
                isListening = false;
                const button = document.getElementById('speechToTextButton');
                button.classList.remove('active');
                showNotification('Speech recognition stopped unexpectedly', 'error');
            }
        }
    };

    speechRecognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        isListening = false;
        const button = document.getElementById('speechToTextButton');
        button.classList.remove('active');
        showNotification(`Speech recognition error: ${event.error}`, 'error');
    };

    speechRecognition.onresult = (event) => {
        const speechText = document.getElementById('speechText');
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript;
            } else {
                interimTranscript += transcript;
            }
        }

        speechText.innerHTML = finalTranscript + '<span style="color: #666;">' + interimTranscript + '</span>';
    };
}

// Toggle Speech to Text
function toggleSpeechToText() {
    const button = document.getElementById('speechToTextButton');
    const container = document.querySelector('.speech-text-container');
    
    if (!speechRecognition) {
        initializeSpeechRecognition();
    }

    if (isListening) {
        // Stop listening
        speechRecognition.stop();
        isListening = false;
        button.classList.remove('active');
        container.classList.remove('visible');
        showNotification('Speech-to-text stopped', 'info');
    } else {
        // Start listening
        try {
            speechRecognition.start();
            isListening = true;
            button.classList.add('active');
            container.classList.add('visible');
            showNotification('Speech-to-text started', 'success');
        } catch (error) {
            console.error('Error starting speech recognition:', error);
            showNotification('Failed to start speech-to-text', 'error');
        }
    }
}

// Function to handle leaving the meeting
function leaveMeeting() {
    if (currentMeetingId) {
        socket.emit('leaveMeeting', { meetingId: currentMeetingId });
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    Object.values(peerConnections).forEach(pc => pc.close());
    peerConnections = {};
    currentMeetingId = null;
    currentUsername = null;
    joinContainer.style.display = 'block';
    meetingContainer.style.display = 'none';
    stopSpeechToText();
}

// Function to handle sharing the meeting
function shareMeeting() {
    const meetingUrl = `${window.location.origin}?meetingId=${currentMeetingId}`;
    
    // Create a modal dialog for the share link
    const modal = document.createElement('div');
    modal.className = 'share-modal';
    modal.innerHTML = `
        <div class="share-modal-content">
            <h3>Share Meeting Link</h3>
            <div class="share-link-container">
                <input type="text" value="${meetingUrl}" readonly id="shareLinkInput">
                <button id="copyLinkButton">
                    <i class="fas fa-copy"></i> Copy
                </button>
            </div>
            <button id="closeShareModal" class="close-button">
                <i class="fas fa-times"></i> Close
            </button>
        </div>
    `;
    document.body.appendChild(modal);

    // Add event listeners for the modal
    const copyButton = modal.querySelector('#copyLinkButton');
    const closeButton = modal.querySelector('#closeShareModal');
    const shareInput = modal.querySelector('#shareLinkInput');

    copyButton.addEventListener('click', () => {
        shareInput.select();
        document.execCommand('copy');
        copyButton.innerHTML = '<i class="fas fa-check"></i> Copied!';
        setTimeout(() => {
            copyButton.innerHTML = '<i class="fas fa-copy"></i> Copy';
        }, 2000);
    });

    closeButton.addEventListener('click', () => {
        modal.remove();
    });

    // Close modal when clicking outside
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// Button Event Listeners
createButton.addEventListener('click', () => {
    console.log('Create Meeting Button Clicked');
    console.log('Current Socket Status:', socket.connected);
    console.log('Socket ID:', socket.id);
    const username = usernameInput.value.trim();
    if (!username) {
        alert('Please enter your name');
        return;
    }
    currentUsername = username;
    socket.emit('createMeeting', { username });
});

joinButton.addEventListener('click', () => {
    const meetingId = meetingIdInput.value.trim();
    const username = usernameInputJoin.value.trim();
    if (!meetingId || !username) {
        alert('Please enter both meeting ID and your name');
        return;
    }
    currentUsername = username;
    socket.emit('joinMeeting', { meetingId, username });
});

leaveButtonBottom.addEventListener('click', leaveMeeting);

audioButton.addEventListener('click', () => {
    if (localStream) {
        isAudioEnabled = !isAudioEnabled;
        localStream.getAudioTracks().forEach(track => track.enabled = isAudioEnabled);
        audioButton.classList.toggle('active', isAudioEnabled);
        socket.emit('audioStateChange', { meetingId: currentMeetingId, enabled: isAudioEnabled });
    }
});

videoButton.addEventListener('click', () => {
    if (localStream) {
        isVideoEnabled = !isVideoEnabled;
        localStream.getVideoTracks().forEach(track => track.enabled = isVideoEnabled);
        videoButton.classList.toggle('active', isVideoEnabled);
        socket.emit('videoStateChange', { meetingId: currentMeetingId, enabled: isVideoEnabled });
    }
});

speechToTextButton.addEventListener('click', toggleSpeechToText);

sendButton.addEventListener('click', () => {
    const message = messageInput.value.trim();
    if (message) {
        socket.emit('chatMessage', { meetingId: currentMeetingId, message, username: currentUsername });
        messageInput.value = '';
    }
});

shareMeetingButtonBottom.addEventListener('click', shareMeeting);

// Function to update participants list
function updateParticipantsList(participants) {
    participantsList.innerHTML = '';
    
    // Add local participant first
    const localParticipant = document.createElement('div');
    localParticipant.className = 'participant-item';
    localParticipant.dataset.userId = socket.id;
    localParticipant.innerHTML = `
        <span class="participant-name">${currentUsername} (You)</span>
        <div class="participant-status">
            <i class="fas fa-microphone${isAudioEnabled ? '' : '-slash'} status-icon ${isAudioEnabled ? 'active' : ''}"></i>
            <i class="fas fa-video${isVideoEnabled ? '' : '-slash'} status-icon ${isVideoEnabled ? 'active' : ''}"></i>
        </div>
    `;
    participantsList.appendChild(localParticipant);
    
    // Add remote participants
    if (Array.isArray(participants)) {
        participants.forEach(participant => {
            if (participant.userId !== socket.id) {
                const participantElement = document.createElement('div');
                participantElement.className = 'participant-item';
                participantElement.dataset.userId = participant.userId;
                participantElement.innerHTML = `
                    <span class="participant-name">${participant.userName}</span>
                    <div class="participant-status">
                        <i class="fas fa-microphone${participant.audioEnabled ? '' : '-slash'} status-icon ${participant.audioEnabled ? 'active' : ''}"></i>
                        <i class="fas fa-video${participant.videoEnabled ? '' : '-slash'} status-icon ${participant.videoEnabled ? 'active' : ''}"></i>
                    </div>
                `;
                participantsList.appendChild(participantElement);
                createPeerConnection(participant.userId);
            }
        });
    }
    
    // Update participant count
    participantCount.textContent = participantsList.children.length;
}

// Initialize the application
// Browser Compatibility Check
const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
const isSafari = /Safari/.test(navigator.userAgent) && /Apple Computer/.test(navigator.vendor);
const isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;

function showBrowserWarning() {
    const warningDiv = document.createElement('div');
    warningDiv.style.position = 'fixed';
    warningDiv.style.top = '10px';
    warningDiv.style.left = '10px';
    warningDiv.style.backgroundColor = 'red';
    warningDiv.style.color = 'white';
    warningDiv.style.padding = '10px';
    warningDiv.style.zIndex = '1000';
    warningDiv.innerHTML = `
        <strong>Browser Compatibility Warning:</strong><br>
        Hand tracking works best in Google Chrome. 
        Other browsers may have limited support.
    `;
    document.body.appendChild(warningDiv);
}

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Hand Tracking
    initializeHandTracking();
    
    // Gesture Detection Button
    const gestureButton = document.getElementById('gestureButton');
    const gestureContainer = document.getElementById('gestureContainer');
    
    gestureButton.addEventListener('click', async () => {
        // Browser compatibility warning
        if (!browserInfo.isChrome) {
            const warningDiv = document.createElement('div');
            warningDiv.style.position = 'fixed';
            warningDiv.style.top = '10px';
            warningDiv.style.left = '10px';
            warningDiv.style.backgroundColor = 'orange';
            warningDiv.style.color = 'white';
            warningDiv.style.padding = '15px';
            warningDiv.style.zIndex = '1000';
            warningDiv.style.borderRadius = '5px';
            warningDiv.innerHTML = `
                <strong>Browser Compatibility Notice:</strong><br>
                Hand tracking works best in Google Chrome.<br>
                Other browsers may have limited functionality.
            `;
            document.body.appendChild(warningDiv);
            setTimeout(() => warningDiv.remove(), 5000);
        }
        // Browser Compatibility Check
        if (!isChrome) {
            showBrowserWarning();
            alert('Hand tracking is most reliable in Google Chrome. Some features may be limited.');
        }

        // Detailed Logging for Debugging
        console.log('Browser Info:', {
            isChrome, 
            isSafari, 
            isFirefox, 
            userAgent: navigator.userAgent
        });
        isGestureDetectionActive = !isGestureDetectionActive;
        gestureButton.classList.toggle('active', isGestureDetectionActive);
        gestureContainer.style.display = isGestureDetectionActive ? 'block' : 'none';
        
        if (isGestureDetectionActive) {
            try {
                // Ensure camera access
                let stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: { ideal: 640 },
                        height: { ideal: 480 },
                        facingMode: 'user'
                    },
                    audio: false
                });

                localVideo.srcObject = stream;
                handTrackingVideo.srcObject = stream;
                console.log('Video element:', localVideo);
                console.log('Video element srcObject:', localVideo.srcObject);
                localVideo.onloadedmetadata = () => {
                    localVideo.play();
                    handTrackingVideo.play();
                    console.log('Video element should be playing now');
                };

                localVideo.onloadedmetadata = () => {
                    const camera = new Camera(handTrackingVideo, {
                        onFrame: async () => {
                            console.log('Hand tracking onFrame called');
                            console.log('Video element:', localVideo);
                            console.log('Video element srcObject:', localVideo.srcObject);
                            console.log('Video element readyState:', localVideo.readyState);
                            try {
                                await hands.send({ image: handTrackingVideo });
                            } catch (handError) {
                                console.error('Hand tracking frame error:', handError);
                            }
                        },
                        width: 640,
                        height: 480
                    });
                    camera.start();
                };
            } catch (error) {
                console.error('Camera access error:', error);
                alert('Could not access camera. Please check permissions.');
                isGestureDetectionActive = false;
                gestureButton.classList.remove('active');
                gestureContainer.style.display = 'none';
            }
        }
    });
    // Initialize speech recognition
    initializeSpeechRecognition();
    
    // Check URL parameters for meeting ID
    const urlParams = new URLSearchParams(window.location.search);
    const meetingId = urlParams.get('meetingId');
    if (meetingId) {
        meetingIdInput.value = meetingId;
    }
});

// Socket.IO Event Handlers
socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
});

socket.on('disconnect', (reason) => {
    console.log('Disconnected from server:', reason);
});

socket.on('meetingCreated', ({ meetingId }) => {
    currentMeetingId = meetingId;
    meetingIdDisplay.textContent = meetingId;
    usernameDisplay.textContent = currentUsername;
    joinContainer.style.display = 'none';
    meetingContainer.style.display = 'block';
    initializeMedia();
    updateParticipantsList([]);
});

socket.on('meetingJoined', ({ meetingId, participants }) => {
    console.log('Meeting joined:', meetingId, 'Participants:', participants);
    currentMeetingId = meetingId;
    meetingIdDisplay.textContent = meetingId;
    usernameDisplay.textContent = currentUsername;
    joinContainer.style.display = 'none';
    meetingContainer.style.display = 'block';
    initializeMedia();
    
    // Clear existing participants list
    participantsList.innerHTML = '';
    
    // Add local participant first
    const localParticipant = document.createElement('div');
    localParticipant.className = 'participant-item';
    localParticipant.dataset.userId = socket.id;
    localParticipant.innerHTML = `
        <span class="participant-name">${currentUsername} (You)</span>
        <div class="participant-status">
            <i class="fas fa-microphone${isAudioEnabled ? '' : '-slash'} status-icon ${isAudioEnabled ? 'active' : ''}"></i>
            <i class="fas fa-video${isVideoEnabled ? '' : '-slash'} status-icon ${isVideoEnabled ? 'active' : ''}"></i>
        </div>
    `;
    participantsList.appendChild(localParticipant);
    
    // Add remote participants
    if (Array.isArray(participants)) {
        participants.forEach(participant => {
            if (participant.userId !== socket.id) {
                const participantElement = document.createElement('div');
                participantElement.className = 'participant-item';
                participantElement.dataset.userId = participant.userId;
                participantElement.innerHTML = `
                    <span class="participant-name">${participant.userName}</span>
                    <div class="participant-status">
                        <i class="fas fa-microphone${participant.audioEnabled ? '' : '-slash'} status-icon ${participant.audioEnabled ? 'active' : ''}"></i>
                        <i class="fas fa-video${participant.videoEnabled ? '' : '-slash'} status-icon ${participant.videoEnabled ? 'active' : ''}"></i>
                    </div>
                `;
                participantsList.appendChild(participantElement);
                
                // Create peer connection for each existing participant
                createPeerConnection(participant.userId);
                
                // Create and send offer to each existing participant
                createOffer(participant.userId);
            }
        });
    }
    
    // Update participant count
    participantCount.textContent = participantsList.children.length;
});

socket.on('participantJoined', ({ userId, userName, audioEnabled, videoEnabled }) => {
    console.log('Participant joined:', userId, userName);
    
    // Check if participant already exists
    const existingParticipant = document.querySelector(`[data-user-id="${userId}"]`);
    if (existingParticipant) {
        console.log('Participant already exists:', userId);
        return;
    }
    
    // Add the new participant to the list
    const participantElement = document.createElement('div');
    participantElement.className = 'participant-item';
    participantElement.dataset.userId = userId;
    participantElement.innerHTML = `
        <span class="participant-name">${userName}</span>
        <div class="participant-status">
            <i class="fas fa-microphone${audioEnabled ? '' : '-slash'} status-icon ${audioEnabled ? 'active' : ''}"></i>
            <i class="fas fa-video${videoEnabled ? '' : '-slash'} status-icon ${videoEnabled ? 'active' : ''}"></i>
        </div>
    `;
    participantsList.appendChild(participantElement);
    participantCount.textContent = participantsList.children.length;
    
    // Create peer connection for the new participant
    createPeerConnection(userId);
    
    // Create and send offer to the new participant
    createOffer(userId);
});

socket.on('participantLeft', ({ id }) => {
    console.log('Participant left:', id);
    if (peerConnections[id]) {
        peerConnections[id].close();
        delete peerConnections[id];
    }
    const videoElement = document.getElementById(`video-${id}`);
    if (videoElement) {
        videoElement.parentElement.remove();
    }
    const participantElement = document.querySelector(`[data-user-id="${id}"]`);
    if (participantElement) {
        participantElement.remove();
        participantCount.textContent = participantsList.children.length;
    }
});

socket.on('participantAudioStateChange', ({ id, enabled }) => {
    const participantElement = Array.from(participantsList.children)
        .find(el => el.dataset.userId === id);
    if (participantElement) {
        const audioIcon = participantElement.querySelector('.fa-microphone, .fa-microphone-slash');
        audioIcon.className = `fas fa-microphone${enabled ? '' : '-slash'} status-icon ${enabled ? 'active' : ''}`;
    }
});

socket.on('participantVideoStateChange', ({ id, enabled }) => {
    const participantElement = Array.from(participantsList.children)
        .find(el => el.dataset.userId === id);
    if (participantElement) {
        const videoIcon = participantElement.querySelector('.fa-video, .fa-video-slash');
        videoIcon.className = `fas fa-video${enabled ? '' : '-slash'} status-icon ${enabled ? 'active' : ''}`;
    }
});

socket.on('offer', async ({ offer, from }) => {
    console.log('Received offer from:', from);
    try {
        const pc = createPeerConnection(from);
        
        // Check if we're in a state where we can set the remote description
        if (pc.signalingState === 'stable') {
            // Set remote description first
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            
            // Create and set local description
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            
            console.log('Sending answer to:', from);
            socket.emit('answer', { answer, to: from });
        } else {
            console.warn('Cannot set remote description in state:', pc.signalingState);
            // If we're not in a stable state, we need to reset the connection
            pc.close();
            delete peerConnections[from];
            
            // Create a new connection and send an offer back
            setTimeout(() => {
                console.log('Retrying connection to:', from);
                createPeerConnection(from);
                createOffer(from);
            }, 1000);
        }
    } catch (error) {
        console.error('Error handling offer:', error);
        // Try to recreate the connection if there was an error
        setTimeout(() => {
            console.log('Retrying connection to:', from);
            createPeerConnection(from);
            createOffer(from);
        }, 2000);
    }
});

socket.on('answer', async ({ answer, from }) => {
    console.log('Received answer from:', from);
    try {
        const pc = peerConnections[from];
        if (pc) {
            // Check if we're in the right state to set the remote description
            if (pc.signalingState === 'have-local-offer') {
                await pc.setRemoteDescription(new RTCSessionDescription(answer));
            } else {
                console.warn('Cannot set remote description in state:', pc.signalingState);
                // If we're not in the right state, we need to reset the connection
                pc.close();
                delete peerConnections[from];
                
                // Create a new connection and send an offer back
                setTimeout(() => {
                    console.log('Retrying connection to:', from);
                    createPeerConnection(from);
                    createOffer(from);
                }, 1000);
            }
        }
    } catch (error) {
        console.error('Error handling answer:', error);
    }
});

socket.on('iceCandidate', async ({ candidate, from }) => {
    console.log('Received ICE candidate from:', from);
    try {
        const pc = peerConnections[from];
        if (pc) {
            try {
                // Try to add the ICE candidate immediately
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
                console.log('Added ICE candidate successfully');
            } catch (error) {
                // If it fails, store it for later
                console.log('Storing ICE candidate for later:', error.message);
                if (!pc.iceCandidates) {
                    pc.iceCandidates = [];
                }
                pc.iceCandidates.push(candidate);
            }
        }
    } catch (error) {
        console.error('Error handling ICE candidate:', error);
    }
});

socket.on('chatMessage', ({ message, username }) => {
    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message';
    messageElement.innerHTML = `<strong>${username}:</strong> ${message}`;
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

// WebRTC Functions
async function initializeMedia() {
    // Comprehensive camera access logging and error handling
    console.log('Available Media Devices:', await navigator.mediaDevices.enumerateDevices());
    
    // Check for camera and microphone permissions
    try {
        const permissionStatus = await navigator.permissions.query({ name: 'camera' });
        const micPermissionStatus = await navigator.permissions.query({ name: 'microphone' });
        
        console.log('Camera Permission Status:', permissionStatus.state);
        console.log('Microphone Permission Status:', micPermissionStatus.state);
    } catch (permissionError) {
        console.error('Permission Query Error:', permissionError);
    }
    try {
        // First check if we already have a stream
        if (localStream) {
            console.log('Local stream already exists');
            return;
        }
        
        // Check browser support for getUserMedia
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Browser does not support getUserMedia');
        }
        
        console.log('Requesting media permissions');
        
        // Detailed media constraints
        const constraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30, max: 60 }
            }
        };
        
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // Validate stream
        if (!localStream || localStream.getTracks().length === 0) {
            throw new Error('No media tracks found');
        }
        
        console.log('Media permissions granted');
        console.log('Video tracks:', localStream.getVideoTracks());
        console.log('Audio tracks:', localStream.getAudioTracks());
        
        localVideo.srcObject = localStream;
        handTrackingVideo.srcObject = localStream;
        console.log('Video element:', localVideo);
        console.log('Video srcObject:', localVideo.srcObject);
        localVideo.onloadedmetadata = () => {
            localVideo.play();
            handTrackingVideo.play();
            console.log('Video element should be playing now');
        };
        
        // Ensure audio is enabled by default
        localStream.getAudioTracks().forEach(track => {
            track.enabled = isAudioEnabled;
            console.log('Audio track enabled:', track.enabled);
        });
        
        // Ensure video is enabled by default
        localStream.getVideoTracks().forEach(track => {
            track.enabled = isVideoEnabled;
            console.log('Video track enabled:', track.enabled);
        });
        
        // Add local tracks to existing peer connections
        Object.keys(peerConnections).forEach(participantId => {
            const pc = peerConnections[participantId];
            
            localStream.getTracks().forEach(track => {
                try {
                    pc.addTrack(track, localStream);
                    console.log('Added track to peer connection:', track.kind);
                    
                    // If the connection is stable, we need to renegotiate
                    if (pc.signalingState === 'stable') {
                        console.log('Renegotiating connection for:', participantId);
                        createOffer(participantId);
                    }
                } catch (trackError) {
                    console.error(`Error adding ${track.kind} track to peer connection:`, trackError);
                }
            });
        });
    } catch (error) {
        console.error('Error accessing media devices:', error);
        
        // Detailed error handling
        let errorMessage = 'Error accessing camera and microphone.';
        if (error.name === 'NotAllowedError') {
            errorMessage += ' Please grant camera and microphone permissions.';
        } else if (error.name === 'NotFoundError') {
            errorMessage += ' No camera or microphone found.';
        } else if (error.name === 'OverconstrainedError') {
            errorMessage += ' Device does not support specified constraints.';
        }
        
        alert(errorMessage);
    }
}

function createPeerConnection(participantId) {
    if (peerConnections[participantId]) {
        console.log('Peer connection already exists for:', participantId);
        return peerConnections[participantId];
    }

    console.log('Creating new peer connection for:', participantId);
    const pc = new RTCPeerConnection(configuration);
    peerConnections[participantId] = pc;

    // Add local tracks to the peer connection
    if (localStream) {
        localStream.getTracks().forEach(track => {
            console.log('Adding local track to peer connection:', track.kind);
            pc.addTrack(track, localStream);
        });
    } else {
        console.warn('Local stream not available when creating peer connection');
        // We'll add tracks later when the stream becomes available
    }

    // Store ICE candidates until remote description is set
    pc.iceCandidates = [];
    
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log('Sending ICE candidate to:', participantId);
            socket.emit('iceCandidate', { candidate: event.candidate, to: participantId });
        }
    };

    pc.ontrack = (event) => {
        console.log('Received track from:', participantId, 'Track kind:', event.track.kind);
        
        // Check if video element already exists
        let videoElement = document.getElementById(`video-${participantId}`);
        if (!videoElement) {
            videoElement = document.createElement('video');
            videoElement.id = `video-${participantId}`;
            videoElement.autoplay = true;
            videoElement.playsInline = true;
            videoElement.muted = false; // Ensure audio is not muted
            
            const videoContainer = document.createElement('div');
            videoContainer.className = 'video-container';
            videoContainer.appendChild(videoElement);
            
            const videoLabel = document.createElement('div');
            videoLabel.className = 'video-label';
            const participant = Array.from(participantsList.children)
                .find(el => el.dataset.userId === participantId);
            if (participant) {
                videoLabel.textContent = participant.querySelector('.participant-name').textContent;
            }
            videoContainer.appendChild(videoLabel);
            
            remoteVideos.appendChild(videoContainer);
        }
        
        // Set the stream to the video element
        if (event.streams && event.streams[0]) {
            videoElement.srcObject = event.streams[0];
            console.log('Set remote stream to video element');
        } else {
            console.warn('No streams in track event');
        }
    };

    pc.oniceconnectionstatechange = () => {
        console.log(`ICE connection state for ${participantId}:`, pc.iceConnectionState);
        if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
            console.log('ICE connection failed or disconnected for:', participantId);
            // Try to restart ICE
            pc.restartIce();
            
            // If that doesn't work, try to reconnect after a delay
            setTimeout(() => {
                if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
                    console.log('Closing peer connection after timeout for:', participantId);
                    pc.close();
                    delete peerConnections[participantId];
                    const videoElement = document.getElementById(`video-${participantId}`);
                    if (videoElement) {
                        videoElement.parentElement.remove();
                    }
                    
                    // Try to recreate the connection
                    setTimeout(() => {
                        console.log('Attempting to recreate connection for:', participantId);
                        createPeerConnection(participantId);
                        createOffer(participantId);
                    }, 1000);
                }
            }, 5000);
        }
    };

    // Add signaling state change handler
    pc.onsignalingstatechange = () => {
        console.log(`Signaling state for ${participantId}:`, pc.signalingState);
        
        // If we're in the 'stable' state and have pending ICE candidates, add them now
        if (pc.signalingState === 'stable' && pc.iceCandidates && pc.iceCandidates.length > 0) {
            console.log(`Adding ${pc.iceCandidates.length} pending ICE candidates for ${participantId}`);
            pc.iceCandidates.forEach(candidate => {
                pc.addIceCandidate(new RTCIceCandidate(candidate))
                    .catch(err => console.error('Error adding pending ICE candidate:', err));
            });
            // Clear the queue
            pc.iceCandidates = [];
        }
    };

    return pc;
}

async function createOffer(participantId) {
    console.log('Creating offer for:', participantId);
    const pc = createPeerConnection(participantId);
    try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        console.log('Sending offer to:', participantId);
        socket.emit('offer', { offer, to: participantId });
    } catch (error) {
        console.error('Error creating offer:', error);
    }
}

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
} 