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
const wss = new WebSocket.Server({ server });

// Store active connections
const connections = new Map();

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('New client connected');

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            console.log('Received message:', data);

            switch (data.type) {
                case 'createMeeting':
                    const meetingId = generateMeetingId();
                    connections.set(meetingId, new Set([ws]));
                    ws.send(JSON.stringify({
                        type: 'meetingCreated',
                        meetingId
                    }));
                    break;

                case 'joinMeeting':
                    const { meetingId: joinId, username } = data;
                    if (connections.has(joinId)) {
                        connections.get(joinId).add(ws);
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
        // Clean up connections
        for (const [meetingId, participants] of connections.entries()) {
            if (participants.has(ws)) {
                participants.delete(ws);
                if (participants.size === 0) {
                    connections.delete(meetingId);
                }
            }
        }
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