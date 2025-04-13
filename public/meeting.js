// Import Socket.IO client
import { io } from 'socket.io-client';

// Get the API URL from environment variable or use default
const API_URL = import.meta.env.VITE_API_URL || 'https://altear-video-meeting.onrender.com';

// DOM Elements
const joinContainer = document.getElementById('joinContainer');
const meetingContainer = document.getElementById('meetingContainer');
const meetingIdInput = document.getElementById('meetingIdInput');
const usernameInput = document.getElementById('usernameInput');
const usernameInputJoin = document.getElementById('usernameInputJoin');
const joinButton = document.getElementById('joinButton');
const createButton = document.getElementById('createButton');
const leaveButton = document.getElementById('leaveButton');
const meetingIdDisplay = document.getElementById('meetingIdDisplay');
const usernameDisplay = document.getElementById('usernameDisplay');
const localVideo = document.getElementById('localVideo');
const remoteVideos = document.getElementById('remoteVideos');
const audioButton = document.getElementById('audioButton');
const videoButton = document.getElementById('videoButton');
const screenShareButton = document.getElementById('screenShareButton');
const speechToTextButton = document.getElementById('speechToTextButton');
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const speechText = document.getElementById('speechText');
const participantsList = document.getElementById('participantsList');
const participantCount = document.getElementById('participantCount');
const videoGrid = document.getElementById('videoGrid');
const participantCountDisplay = document.getElementById('participantCountDisplay');

// WebRTC Configuration
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { 
            urls: 'turn:numb.viagenie.ca',
            username: 'webrtc@live.com',
            credential: 'muazkh'
        },
        { 
            urls: 'turn:turn.anyfirewall.com:443?transport=tcp',
            username: 'webrtc',
            credential: 'webrtc'
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

// Socket.IO Connection
const socket = io(API_URL, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 20000
});

// Debug connection events
socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
});

socket.on('disconnect', (reason) => {
    console.log('Disconnected from server:', reason);
});

// Initialize Speech Recognition
function initializeSpeechToText() {
    if ('webkitSpeechRecognition' in window) {
        speechRecognition = new webkitSpeechRecognition();
        speechRecognition.continuous = true;
        speechRecognition.interimResults = true;

        speechRecognition.onresult = (event) => {
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

            if (finalTranscript) {
                const p = document.createElement('p');
                p.textContent = finalTranscript;
                speechText.appendChild(p);
            }
        };

        speechRecognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            stopSpeechToText();
        };
    }
}

// Toggle Speech to Text
function toggleSpeechToText() {
    if (!speechRecognition) {
        initializeSpeechToText();
    }

    if (isSpeechToTextActive) {
        stopSpeechToText();
    } else {
        startSpeechToText();
    }
}

function startSpeechToText() {
    if (speechRecognition) {
        speechRecognition.start();
        isSpeechToTextActive = true;
        speechToTextButton.classList.add('active');
    }
}

function stopSpeechToText() {
    if (speechRecognition) {
        speechRecognition.stop();
        isSpeechToTextActive = false;
        speechToTextButton.classList.remove('active');
    }
}

// Initialize media stream
async function initializeMedia() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: true
        });
        localVideo.srcObject = localStream;
    } catch (error) {
        console.error('Error accessing media devices:', error);
        alert('Could not access your camera and microphone. Please ensure you have granted the necessary permissions.');
    }
}

// Create a new meeting
function createMeeting() {
    const username = prompt('Enter your name:');
    if (username) {
        console.log('Creating meeting for user:', username);
        currentUsername = username;
        socket.emit('createMeeting', { username });
    }
}

// Join an existing meeting
function joinMeeting() {
    const meetingId = prompt('Enter meeting ID:');
    const username = prompt('Enter your name:');
    if (meetingId && username) {
        currentUsername = username;
        currentMeetingId = meetingId;
        socket.emit('joinMeeting', { meetingId, username });
    }
}

// Socket event handlers
socket.on('meetingCreated', ({ meetingId }) => {
    console.log('Meeting created with ID:', meetingId);
    currentMeetingId = meetingId;
    meetingIdDisplay.textContent = meetingId;
    usernameDisplay.textContent = currentUsername;
    joinContainer.style.display = 'none';
    meetingContainer.style.display = 'block';
    initializeMedia();
    updateParticipantsList([]);
});

socket.on('participantJoined', ({ socketId, username, audioEnabled, videoEnabled }) => {
    createPeerConnection(socketId, username);
    updateParticipantsList();
});

socket.on('participantLeft', ({ socketId }) => {
    if (peerConnections[socketId]) {
        peerConnections[socketId].close();
        delete peerConnections[socketId];
    }
    updateParticipantsList();
});

socket.on('offer', async ({ from, offer }) => {
    try {
        const peerConnection = peerConnections[from];
        if (peerConnection) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('answer', { to: from, answer });
        }
    } catch (error) {
        console.error('Error handling offer:', error);
    }
});

socket.on('answer', async ({ from, answer }) => {
    try {
        const peerConnection = peerConnections[from];
        if (peerConnection) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        }
    } catch (error) {
        console.error('Error handling answer:', error);
    }
});

socket.on('ice-candidate', async ({ from, candidate }) => {
    try {
        const peerConnection = peerConnections[from];
        if (peerConnection) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
    } catch (error) {
        console.error('Error handling ICE candidate:', error);
    }
});

socket.on('participantsList', (participants) => {
    participants.forEach(participant => {
        if (participant.socketId !== socket.id) {
            createPeerConnection(participant.socketId, participant.username);
        }
    });
    updateParticipantsList();
});

socket.on('error', ({ message }) => {
    console.error('Server error:', message);
    alert('Error: ' + message);
});

socket.on('chatMessage', ({ username, message }) => {
    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message';
    messageElement.innerHTML = `
        <span class="chat-username">${username}:</span>
        <span class="chat-content">${message}</span>
    `;
    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
});

// Create peer connection
function createPeerConnection(socketId, username) {
    if (!peerConnections[socketId]) {
        const peerConnection = new RTCPeerConnection(configuration);
        peerConnections[socketId] = peerConnection;

        // Add local stream to peer connection
        if (localStream) {
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
        }

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('ice-candidate', { to: socketId, candidate: event.candidate });
            }
        };

        // Handle remote stream
        peerConnection.ontrack = (event) => {
            const remoteVideo = document.createElement('video');
            remoteVideo.autoplay = true;
            remoteVideo.playsInline = true;
            remoteVideo.srcObject = event.streams[0];
            
            const videoContainer = document.createElement('div');
            videoContainer.className = 'video-container';
            videoContainer.appendChild(remoteVideo);
            
            const videoLabel = document.createElement('div');
            videoLabel.className = 'video-label';
            videoLabel.textContent = username;
            videoContainer.appendChild(videoLabel);
            
            videoGrid.appendChild(videoContainer);
        };
    }
}

// Update participants list
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
            if (participant.socketId !== socket.id) {
                const participantElement = document.createElement('div');
                participantElement.className = 'participant-item';
                participantElement.dataset.userId = participant.socketId;
                participantElement.innerHTML = `
                    <span class="participant-name">${participant.username}</span>
                    <div class="participant-status">
                        <i class="fas fa-microphone${participant.audioEnabled ? '' : '-slash'} status-icon ${participant.audioEnabled ? 'active' : ''}"></i>
                        <i class="fas fa-video${participant.videoEnabled ? '' : '-slash'} status-icon ${participant.videoEnabled ? 'active' : ''}"></i>
                    </div>
                `;
                participantsList.appendChild(participantElement);
            }
        });
    }
    
    // Update participant count
    participantCount.textContent = participantsList.children.length;
}

// Button event listeners
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

screenShareButton.addEventListener('click', async () => {
    try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        localStream.getVideoTracks().forEach(track => track.stop());
        screenStream.getVideoTracks().forEach(track => {
            localStream.addTrack(track);
            Object.values(peerConnections).forEach(peerConnection => {
                peerConnection.addTrack(track, localStream);
            });
        });
        localVideo.srcObject = localStream;
        screenShareButton.classList.add('active');
    } catch (error) {
        console.error('Error sharing screen:', error);
    }
});

speechToTextButton.addEventListener('click', toggleSpeechToText);

leaveButton.addEventListener('click', () => {
    if (confirm('Are you sure you want to leave the meeting?')) {
        // Stop all media tracks
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
        }
        
        // Close all peer connections
        Object.values(peerConnections).forEach(peerConnection => {
            peerConnection.close();
        });
        peerConnections = {};
        
        // Emit leave meeting event
        socket.emit('leaveMeeting', { meetingId: currentMeetingId });
        
        // Reset state
        currentMeetingId = null;
        currentUsername = null;
        localStream = null;
        
        // Update UI
        meetingContainer.style.display = 'none';
        joinContainer.style.display = 'block';
        videoGrid.innerHTML = '';
        participantsList.innerHTML = '';
    }
});

sendButton.addEventListener('click', () => {
    const message = messageInput.value.trim();
    if (message) {
        socket.emit('chatMessage', { meetingId: currentMeetingId, message, username: currentUsername });
        messageInput.value = '';
    }
});

// Share meeting functionality
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
                <button id="copyLinkButton">Copy</button>
            </div>
            <button class="close-button">Close</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Copy link functionality
    const copyButton = modal.querySelector('#copyLinkButton');
    copyButton.addEventListener('click', () => {
        const shareLinkInput = modal.querySelector('#shareLinkInput');
        shareLinkInput.select();
        document.execCommand('copy');
        copyButton.textContent = 'Copied!';
        setTimeout(() => {
            copyButton.textContent = 'Copy';
        }, 2000);
    });
    
    // Close modal functionality
    const closeButton = modal.querySelector('.close-button');
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

// Add event listener to the meeting info section for sharing
document.querySelector('.meeting-info').addEventListener('click', (e) => {
    if (e.target.closest('h2')) {
        shareMeeting();
    }
});

// Check URL parameters for meeting ID on page load
window.addEventListener('load', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const meetingId = urlParams.get('meetingId');
    if (meetingId) {
        meetingIdInput.value = meetingId;
    }
});

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    const action = prompt('Create new meeting (1) or join existing meeting (2)?');
    if (action === '1') {
        createMeeting();
    } else if (action === '2') {
        joinMeeting();
    }
});

// Add event listeners for join and create buttons
joinButton.addEventListener('click', () => {
    const meetingId = meetingIdInput.value.trim();
    const username = usernameInput.value.trim();
    if (meetingId && username) {
        currentUsername = username;
        currentMeetingId = meetingId;
        socket.emit('joinMeeting', { meetingId, username });
    } else {
        alert('Please enter both meeting ID and your name');
    }
});

createButton.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    if (username) {
        currentUsername = username;
        socket.emit('createMeeting', { username });
    } else {
        alert('Please enter your name');
    }
}); 