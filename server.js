const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Create Express app
const app = express();
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ 
    server,
    path: '/ws',
    clientTracking: true,
    perMessageDeflate: {
        zlibDeflateOptions: {
            chunkSize: 1024,
            memLevel: 7,
            level: 3
        },
        zlibInflateOptions: {
            chunkSize: 10 * 1024
        },
        clientNoContextTakeover: true,
        serverNoContextTakeover: true,
        serverMaxWindowBits: 10,
        concurrencyLimit: 10,
        threshold: 1024
    }
});

// Store active connections and participants
const connections = new Map();
const participants = new Map();

// WebSocket connection handling
wss.on('connection', (ws, req) => {
    console.log('New client connected from:', req.headers.origin);
    let currentMeetingId = null;
    let currentUsername = null;

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Received message:', data);

            switch (data.type) {
                case 'createMeeting':
                    const meetingId = generateMeetingId();
                    currentMeetingId = meetingId;
                    currentUsername = data.username;
                    
                    connections.set(meetingId, new Set([ws]));
                    participants.set(ws, { meetingId, username: currentUsername });
                    
                    ws.send(JSON.stringify({
                        type: 'meetingCreated',
                        meetingId
                    }));
                    break;

                case 'joinMeeting':
                    const { meetingId: joinId, username } = data;
                    if (connections.has(joinId)) {
                        currentMeetingId = joinId;
                        currentUsername = username;
                        
                        connections.get(joinId).add(ws);
                        participants.set(ws, { meetingId: joinId, username });
                        
                        // Notify all participants in the meeting
                        connections.get(joinId).forEach(participant => {
                            if (participant !== ws) {
                                participant.send(JSON.stringify({
                                    type: 'participantJoined',
                                    username,
                                    meetingId: joinId
                                }));
                            }
                        });
                        
                        ws.send(JSON.stringify({
                            type: 'meetingJoined',
                            meetingId: joinId
                        }));
                    } else {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Meeting not found'
                        }));
                    }
                    break;

                case 'offer':
                case 'answer':
                case 'ice-candidate':
                    // Forward WebRTC signaling messages
                    const targetWs = Array.from(connections.get(data.meetingId) || [])
                        .find(conn => conn !== ws);
                    if (targetWs) {
                        targetWs.send(JSON.stringify(data));
                    }
                    break;

                case 'audioStateChange':
                case 'videoStateChange':
                    // Broadcast state changes to all participants
                    connections.get(data.meetingId).forEach(participant => {
                        if (participant !== ws) {
                            participant.send(JSON.stringify({
                                type: data.type,
                                username: currentUsername,
                                ...data
                            }));
                        }
                    });
                    break;

                case 'chatMessage':
                    // Broadcast chat messages to all participants
                    connections.get(data.meetingId).forEach(participant => {
                        participant.send(JSON.stringify({
                            type: 'chatMessage',
                            username: currentUsername,
                            message: data.message
                        }));
                    });
                    break;

                case 'leaveMeeting':
                    if (currentMeetingId && connections.has(currentMeetingId)) {
                        connections.get(currentMeetingId).delete(ws);
                        participants.delete(ws);
                        
                        // Notify remaining participants
                        connections.get(currentMeetingId).forEach(participant => {
                            participant.send(JSON.stringify({
                                type: 'participantLeft',
                                username: currentUsername
                            }));
                        });
                        
                        // Clean up empty meetings
                        if (connections.get(currentMeetingId).size === 0) {
                            connections.delete(currentMeetingId);
                        }
                    }
                    break;
            }
        } catch (error) {
            console.error('Error handling message:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Internal server error'
            }));
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        if (currentMeetingId && connections.has(currentMeetingId)) {
            connections.get(currentMeetingId).delete(ws);
            participants.delete(ws);
            
            // Notify remaining participants
            connections.get(currentMeetingId).forEach(participant => {
                participant.send(JSON.stringify({
                    type: 'participantLeft',
                    username: currentUsername
                }));
            });
            
            // Clean up empty meetings
            if (connections.get(currentMeetingId).size === 0) {
                connections.delete(currentMeetingId);
            }
        }
    });

    // Send ping every 30 seconds to keep connection alive
    const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
        }
    }, 30000);

    ws.on('close', () => {
        clearInterval(pingInterval);
    });
});

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://bevan_admin:bevan_123@lemon0.ybuuqu2.mongodb.net/ashlin?retryWrites=true&w=majority&appName=Lemon0';

mongoose.connect(MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Generate random meeting ID
function generateMeetingId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Start the server
const PORT = process.env.PORT || 8181;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Server URL: https://altear-video-meeting.onrender.com`);
}); 