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
const speechToTextButton = document.getElementById('speechToTextButton');
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const speechText = document.getElementById('speechText');
const participantsList = document.getElementById('participantsList');
const participantCount = document.getElementById('participantCount');
const shareMeetingButton = document.getElementById('shareMeetingButton');

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
const socket = io('https://192.168.0.100:8181', {
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 20000,
    secure: true,
    rejectUnauthorized: false
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

// Button Event Listeners
createButton.addEventListener('click', () => {
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

leaveButton.addEventListener('click', () => {
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
});

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

// Share meeting functionality
shareMeetingButton.addEventListener('click', () => {
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
});

// Check URL parameters for meeting ID on page load
window.addEventListener('load', () => {
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
            // Only add ICE candidates if we have a remote description
            if (pc.remoteDescription && pc.remoteDescription.type) {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } else {
                // Store the candidate for later
                console.log('Storing ICE candidate for later');
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
    try {
        // First check if we already have a stream
        if (localStream) {
            console.log('Local stream already exists');
            return;
        }
        
        console.log('Requesting media permissions');
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: true
        });
        
        console.log('Media permissions granted');
        localVideo.srcObject = localStream;
        
        // Ensure audio is enabled by default
        localStream.getAudioTracks().forEach(track => {
            track.enabled = true;
        });
        
        // Update audio button state
        audioButton.classList.add('active');
        
        // If we're in a meeting, add tracks to existing peer connections
        if (currentMeetingId) {
            Object.keys(peerConnections).forEach(participantId => {
                const pc = peerConnections[participantId];
                // Remove any existing tracks first
                const senders = pc.getSenders();
                senders.forEach(sender => {
                    pc.removeTrack(sender);
                });
                
                // Add the tracks
                localStream.getTracks().forEach(track => {
                    console.log('Adding local track to existing peer connection:', participantId, track.kind);
                    pc.addTrack(track, localStream);
                });
                
                // If the connection is stable, we need to renegotiate
                if (pc.signalingState === 'stable') {
                    console.log('Renegotiating connection for:', participantId);
                    createOffer(participantId);
                }
            });
        }
    } catch (error) {
        console.error('Error accessing media devices:', error);
        alert('Error accessing camera and microphone. Please make sure you have granted the necessary permissions.');
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
    const iceCandidates = [];
    
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
        videoElement.srcObject = event.streams[0];
    };

    pc.oniceconnectionstatechange = () => {
        console.log(`ICE connection state for ${participantId}:`, pc.iceConnectionState);
        if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
            console.log('ICE connection failed or disconnected for:', participantId);
            // Don't close the connection immediately, try to reconnect
            setTimeout(() => {
                if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
                    console.log('Closing peer connection after timeout for:', participantId);
                    pc.close();
                    delete peerConnections[participantId];
                    const videoElement = document.getElementById(`video-${participantId}`);
                    if (videoElement) {
                        videoElement.parentElement.remove();
                    }
                }
            }, 5000); // Wait 5 seconds before closing
        }
    };

    // Add signaling state change handler
    pc.onsignalingstatechange = () => {
        console.log(`Signaling state for ${participantId}:`, pc.signalingState);
        
        // If we're in the 'stable' state and have pending ICE candidates, add them now
        if (pc.signalingState === 'stable' && iceCandidates.length > 0) {
            console.log(`Adding ${iceCandidates.length} pending ICE candidates for ${participantId}`);
            iceCandidates.forEach(candidate => {
                pc.addIceCandidate(new RTCIceCandidate(candidate))
                    .catch(err => console.error('Error adding pending ICE candidate:', err));
            });
            // Clear the queue
            iceCandidates.length = 0;
        }
    };

    // Store the iceCandidates array in the peer connection object
    pc.iceCandidates = iceCandidates;

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

// Initialize the application
initializeSpeechToText(); 