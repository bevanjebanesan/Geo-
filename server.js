const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const { execSync } = require('child_process');
require('dotenv').config();

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
app.use(cors({
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST'],
    credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Create HTTP server
const server = http.createServer(app);

// Socket.IO Configuration
const io = socketIo(server, {
    cors: {
        origin: process.env.FRONTEND_URL || '*',
        methods: ['GET', 'POST'],
        credentials: true
    }
});

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://bevan_admin:bevan_123@lemon0.ybuuqu2.mongodb.net/ashlin?retryWrites=true&w=majority&appName=Lemon0';

mongoose.connect(MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Meeting Schema
const meetingSchema = new mongoose.Schema({
    meetingId: { type: String, required: true, unique: true },
    participants: [{
        socketId: String,
        username: String,
        audioEnabled: { type: Boolean, default: true },
        videoEnabled: { type: Boolean, default: true }
    }],
    createdAt: { type: Date, default: Date.now }
});

const Meeting = mongoose.model('Meeting', meetingSchema);

// Store active meetings
const activeMeetings = new Map();

// Socket.IO Connection Handling
io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);

    // Create a new meeting
    socket.on('createMeeting', async ({ username }) => {
        try {
            const meetingId = generateMeetingId();
            const meeting = new Meeting({
                meetingId,
                participants: [{
                    socketId: socket.id,
                    username,
                    audioEnabled: true,
                    videoEnabled: true
                }]
            });
            await meeting.save();
            
            activeMeetings.set(meetingId, meeting);
            socket.join(meetingId);
            socket.emit('meetingCreated', { meetingId });
            console.log(`Meeting created: ${meetingId} by ${username}`);
        } catch (error) {
            console.error('Error creating meeting:', error);
            socket.emit('error', { message: 'Failed to create meeting' });
        }
    });

    // Join an existing meeting
    socket.on('joinMeeting', async ({ meetingId, username }) => {
        try {
            const meeting = await Meeting.findOne({ meetingId });
            if (!meeting) {
                socket.emit('error', { message: 'Meeting not found' });
                return;
            }

            meeting.participants.push({
                socketId: socket.id,
                username,
                audioEnabled: true,
                videoEnabled: true
            });
            await meeting.save();
            
            activeMeetings.set(meetingId, meeting);
            socket.join(meetingId);
            
            // Notify existing participants
            socket.to(meetingId).emit('participantJoined', {
                socketId: socket.id,
                username,
                audioEnabled: true,
                videoEnabled: true
            });

            // Send list of existing participants to the new joiner
            const participants = meeting.participants.map(p => ({
                socketId: p.socketId,
                username: p.username,
                audioEnabled: p.audioEnabled,
                videoEnabled: p.videoEnabled
            }));
            socket.emit('participantsList', participants);
            
            console.log(`${username} joined meeting: ${meetingId}`);
        } catch (error) {
            console.error('Error joining meeting:', error);
            socket.emit('error', { message: 'Failed to join meeting' });
        }
    });

    // Handle WebRTC signaling
    socket.on('offer', ({ to, offer }) => {
        socket.to(to).emit('offer', { from: socket.id, offer });
    });

    socket.on('answer', ({ to, answer }) => {
        socket.to(to).emit('answer', { from: socket.id, answer });
    });

    socket.on('ice-candidate', ({ to, candidate }) => {
        socket.to(to).emit('ice-candidate', { from: socket.id, candidate });
    });

    // Handle media state changes
    socket.on('audioStateChange', async ({ meetingId, enabled }) => {
        try {
            const meeting = await Meeting.findOne({ meetingId });
            if (meeting) {
                const participant = meeting.participants.find(p => p.socketId === socket.id);
                if (participant) {
                    participant.audioEnabled = enabled;
                    await meeting.save();
                    socket.to(meetingId).emit('participantAudioChanged', {
                        socketId: socket.id,
                        enabled
                    });
                }
            }
        } catch (error) {
            console.error('Error updating audio state:', error);
        }
    });

    socket.on('videoStateChange', async ({ meetingId, enabled }) => {
        try {
            const meeting = await Meeting.findOne({ meetingId });
            if (meeting) {
                const participant = meeting.participants.find(p => p.socketId === socket.id);
                if (participant) {
                    participant.videoEnabled = enabled;
                    await meeting.save();
                    socket.to(meetingId).emit('participantVideoChanged', {
                        socketId: socket.id,
                        enabled
                    });
                }
            }
        } catch (error) {
            console.error('Error updating video state:', error);
        }
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
        console.log('Client disconnected:', socket.id);
        
        // Find and update all meetings where this socket was a participant
        const meetings = await Meeting.find({ 'participants.socketId': socket.id });
        for (const meeting of meetings) {
            const participantIndex = meeting.participants.findIndex(p => p.socketId === socket.id);
            if (participantIndex !== -1) {
                const participant = meeting.participants[participantIndex];
                meeting.participants.splice(participantIndex, 1);
                
                if (meeting.participants.length === 0) {
                    // If no participants left, delete the meeting
                    await Meeting.findByIdAndDelete(meeting._id);
                    activeMeetings.delete(meeting.meetingId);
                } else {
                    await meeting.save();
                    // Notify remaining participants
                    socket.to(meeting.meetingId).emit('participantLeft', {
                        socketId: socket.id,
                        username: participant.username
                    });
                }
            }
        }
    });
});

// Helper function to generate a unique meeting ID
function generateMeetingId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Start server
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
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