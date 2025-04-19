const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const socketIo = require('socket.io');
const path = require('path');
const net = require('net');
const { execSync } = require('child_process');

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Don't exit the process, just log the error
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit the process, just log the error
});

// Function to check if a port is in use
function isPortInUse(port) {
    return new Promise((resolve) => {
        const server = net.createServer()
            .once('error', () => resolve(true))
            .once('listening', () => {
                server.once('close', () => resolve(false)).close();
            })
            .listen(port);
    });
}

// Function to find an available port
async function findAvailablePort(startPort) {
    let port = startPort;
    while (await isPortInUse(port)) {
        port++;
    }
    return port;
}

// SSL Configuration
let sslOptions;
try {
    sslOptions = {
        key: fs.readFileSync('key.pem'),
        cert: fs.readFileSync('cert.pem')
    };
    console.log('SSL certificates loaded successfully');
} catch (error) {
    console.log('Generating new SSL certificates...');
    try {
        execSync('openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:192.168.0.100"');
        sslOptions = {
            key: fs.readFileSync('key.pem'),
            cert: fs.readFileSync('cert.pem')
        };
        console.log('SSL certificates generated successfully');
    } catch (error) {
        console.error('Failed to generate SSL certificates:', error);
        process.exit(1);
    }
}

// Create Express app
const app = express();

// CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Favicon handling
app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'favicon.ico'));
});

// Create HTTPS server
const httpsServer = https.createServer(sslOptions, app);

// Socket.IO Configuration
const io = socketIo(httpsServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["my-custom-header"],
        credentials: true
    },
    transports: ['polling', 'websocket'],
    pingTimeout: 60000,
    pingInterval: 25000
});

// Start the server
httpsServer.listen(8181, '0.0.0.0', async () => {
    const networkInterfaces = require('os').networkInterfaces();
    let localIp = 'localhost';
    
    // Find the first non-internal IPv4 address
    Object.keys(networkInterfaces).forEach((interfaceName) => {
        networkInterfaces[interfaceName].forEach((interface) => {
            if (interface.family === 'IPv4' && !interface.internal) {
                localIp = interface.address;
            }
        });
    });
    
    console.log(`HTTPS Server running on port 8181`);
    console.log(`Local: https://localhost:8181`);
    console.log(`Network: https://${localIp}:8181`);
    console.log(`\nTo join from another device on the same network:`);
    console.log(`1. Make sure both devices are connected to the same network`);
    console.log(`2. Open https://${localIp}:8181 in the browser`);
    console.log(`3. Accept the security warning (this is normal for local development)`);
});

// Active meetings and participants
const activeMeetings = new Map();
const participants = new Map();

// Function to handle socket connections
function handleSocketConnection(socket, isSecure) {
    console.log(`New client connected: ${socket.id} (${isSecure ? 'HTTPS' : 'HTTP'})`);
    
    // Handle authentication
    socket.on('authenticate', (data) => {
        const { userName } = data;
        participants.set(socket.id, {
            id: socket.id,
            userName,
            meetingId: null,
            audioEnabled: true,
            videoEnabled: true
        });
        console.log(`Client authenticated: ${socket.id} (${userName})`);
        socket.emit('authenticated', { userName });
    });
    
    // Handle meeting creation
    socket.on('createMeeting', (data) => {
        const { username } = data;
        const meetingId = generateMeetingId();
        const participant = {
            id: socket.id,
            userName: username,
            audioEnabled: true,
            videoEnabled: true
        };
        
        activeMeetings.set(meetingId, {
            id: meetingId,
            participants: [socket.id],
            createdBy: socket.id
        });
        
        participants.set(socket.id, {
            ...participant,
            meetingId
        });
        
        console.log(`Meeting created: ${meetingId} by ${username}`);
        socket.emit('meetingCreated', { meetingId });
    });
    
    // Handle joining meeting
    socket.on('joinMeeting', (data) => {
        const { meetingId, username } = data;
        const meeting = activeMeetings.get(meetingId);
        
        if (!meeting) {
            socket.emit('error', { message: 'Meeting not found' });
            return;
        }
        
        const participant = {
            id: socket.id,
            userName: username,
            audioEnabled: true,
            videoEnabled: true
        };
        
        meeting.participants.push(socket.id);
        participants.set(socket.id, {
            ...participant,
            meetingId
        });
        
        console.log(`User ${username} joined meeting: ${meetingId}`);
        console.log(`Current participants in meeting ${meetingId}:`, meeting.participants.map(id => participants.get(id)?.userName));
        
        // Notify all participants in the meeting
        meeting.participants.forEach(participantId => {
            const participantSocket = io.sockets.sockets.get(participantId);
            if (participantSocket) {
                participantSocket.emit('participantJoined', {
                    userId: socket.id,
                    userName: username,
                    audioEnabled: true,
                    videoEnabled: true
                });
            }
        });
        
        socket.emit('meetingJoined', {
            meetingId,
            participants: meeting.participants.map(id => ({
                userId: id,
                userName: participants.get(id)?.userName,
                audioEnabled: participants.get(id)?.audioEnabled,
                videoEnabled: participants.get(id)?.videoEnabled
            }))
        });
    });
    
    // Handle WebRTC signaling
    socket.on('offer', (data) => {
        const { offer, to } = data;
        const targetSocket = io.sockets.sockets.get(to);
        if (targetSocket) {
            targetSocket.emit('offer', { offer, from: socket.id });
        }
    });
    
    socket.on('answer', (data) => {
        const { answer, to } = data;
        const targetSocket = io.sockets.sockets.get(to);
        if (targetSocket) {
            targetSocket.emit('answer', { answer, from: socket.id });
        }
    });
    
    socket.on('iceCandidate', (data) => {
        const { candidate, to } = data;
        const targetSocket = io.sockets.sockets.get(to);
        if (targetSocket) {
            targetSocket.emit('iceCandidate', { candidate, from: socket.id });
        }
    });
    
    // Handle media state changes
    socket.on('audioStateChange', (data) => {
        const { enabled } = data;
        const participant = participants.get(socket.id);
        
        if (participant) {
            participant.audioEnabled = enabled;
            
            // Notify other participants in the same meeting
            if (participant.meetingId) {
                const meeting = activeMeetings.get(participant.meetingId);
                if (meeting) {
                    meeting.participants.forEach(participantId => {
                        if (participantId !== socket.id) {
                            const participantSocket = io.sockets.sockets.get(participantId);
                            if (participantSocket) {
                                participantSocket.emit('participantAudioStateChange', {
                                    id: socket.id,
                                    enabled
                                });
                            }
                        }
                    });
                }
            }
        }
    });
    
    socket.on('videoStateChange', (data) => {
        const { enabled } = data;
        const participant = participants.get(socket.id);
        
        if (participant) {
            participant.videoEnabled = enabled;
            
            // Notify other participants in the same meeting
            if (participant.meetingId) {
                const meeting = activeMeetings.get(participant.meetingId);
                if (meeting) {
                    meeting.participants.forEach(participantId => {
                        if (participantId !== socket.id) {
                            const participantSocket = io.sockets.sockets.get(participantId);
                            if (participantSocket) {
                                participantSocket.emit('participantVideoStateChange', {
                                    id: socket.id,
                                    enabled
                                });
                            }
                        }
                    });
                }
            }
        }
    });
    
    // Handle chat messages
    socket.on('chatMessage', (data) => {
        const { meetingId, message, username } = data;
        const meeting = activeMeetings.get(meetingId);
        
        if (meeting) {
            meeting.participants.forEach(participantId => {
                const participantSocket = io.sockets.sockets.get(participantId);
                if (participantSocket) {
                    participantSocket.emit('chatMessage', { message, username });
                }
            });
        }
    });
    
    // Handle leaving meeting
    socket.on('leaveMeeting', (data) => {
        const { meetingId } = data;
        const participant = participants.get(socket.id);
        
        if (participant && participant.meetingId === meetingId) {
            const meeting = activeMeetings.get(meetingId);
            if (meeting) {
                // Remove participant from meeting
                meeting.participants = meeting.participants.filter(id => id !== socket.id);
                
                // Notify other participants
                meeting.participants.forEach(participantId => {
                    const participantSocket = io.sockets.sockets.get(participantId);
                    if (participantSocket) {
                        participantSocket.emit('participantLeft', {
                            id: socket.id
                        });
                    }
                });
                
                // Update participant's meeting
                participant.meetingId = null;
                
                // Remove meeting if empty
                if (meeting.participants.length === 0) {
                    activeMeetings.delete(meetingId);
                }
            }
        }
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        const participant = participants.get(socket.id);
        
        if (participant && participant.meetingId) {
            const meeting = activeMeetings.get(participant.meetingId);
            if (meeting) {
                // Remove participant from meeting
                meeting.participants = meeting.participants.filter(id => id !== socket.id);
                
                // Notify other participants
                meeting.participants.forEach(participantId => {
                    const participantSocket = io.sockets.sockets.get(participantId);
                    if (participantSocket) {
                        participantSocket.emit('participantLeft', {
                            id: socket.id
                        });
                    }
                });
                
                // Remove meeting if empty
                if (meeting.participants.length === 0) {
                    activeMeetings.delete(participant.meetingId);
                }
            }
        }
        
        participants.delete(socket.id);
    });
}

// Set up Socket.IO event handlers
io.on('connection', (socket) => {
    handleSocketConnection(socket, true);
});

// Handle process termination
process.on('SIGINT', () => {
    console.log('Server shutting down...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Server shutting down...');
    process.exit(0);
});

// Helper function to generate a unique meeting ID
function generateMeetingId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 10; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
} 