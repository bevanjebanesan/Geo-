# Altear - Secure Video Meetings

A secure, real-time video meeting application built with WebRTC, Socket.IO, and Node.js.

## Working Features

### Server Configuration
- ✅ HTTPS server running on port 8181
- ✅ Accessible both locally (localhost) and on the network (192.168.0.100)
- ✅ Automatic SSL certificate generation and management
- ✅ CORS support for cross-origin requests

### WebRTC Implementation
- ✅ TURN servers for NAT traversal
- ✅ STUN servers for peer discovery
- ✅ Proper ICE candidate handling
- ✅ Improved connection state management
- ✅ Automatic reconnection on connection failure
- ✅ Better error handling and logging

### Media Handling
- ✅ Video and audio streaming
- ✅ Screen sharing capability
- ✅ Media state management (mute/unmute, video on/off)
- ✅ Proper track handling for peer connections
- ✅ Improved signaling state management

### User Interface
- ✅ Clean and functional meeting interface
- ✅ Participant list with status indicators
- ✅ Working media controls
- ✅ Chat functionality
- ✅ Speech-to-text support
- ✅ Share meeting link feature

## Setup Instructions

1. Clone the repository:
```bash
git clone https://github.com/bevanjebanesan/Geo-.git
cd Geo-
```

2. Install dependencies:
```bash
npm install
```

3. Start the server:
```bash
node server.js
```

4. Access the application:
- Local: https://localhost:8181
- Network: https://192.168.0.100:8181

## Known Working Features

### Meeting Creation and Joining
- Create new meetings
- Join existing meetings
- Share meeting links
- Participant management

### Media Controls
- Toggle video on/off
- Toggle audio on/off
- Screen sharing
- Speech-to-text

### Connection Management
- Automatic reconnection
- NAT traversal
- Firewall traversal
- Connection state monitoring

## Troubleshooting

If you experience connection issues:
1. Ensure you have granted camera and microphone permissions
2. Check your network connection
3. Verify that port 8181 is accessible
4. Check the browser console for any error messages

## Security Features

- HTTPS encryption
- Secure WebRTC connections
- Protected media streams
- Secure signaling through Socket.IO

## Browser Support

- Chrome (recommended)
- Firefox
- Safari
- Edge

## Notes

- This is a working version of the application
- All features listed above are confirmed to be working
- The code is optimized for real-time communication
- Includes proper error handling and recovery mechanisms

## Features

- Create and join meetings with unique meeting IDs
- Real-time audio and video communication
- Screen sharing capability
- Mute/unmute audio and video
- Copy meeting link to clipboard
- Participant list with connection status
- Meeting timer
- Responsive design for desktop and mobile

## Technical Stack

- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js, Express
- **Real-time Communication**: Socket.IO
- **WebRTC**: For peer-to-peer audio and video streaming
- **HTTPS**: Secure communication with SSL certificates

## Architecture

The application uses a client-server architecture with WebRTC for peer-to-peer communication:

- **Server**: Handles signaling and meeting management
- **Client**: Manages WebRTC connections and UI
- **Signaling**: Uses Socket.IO for exchanging WebRTC signaling information

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [Socket.IO](https://socket.io/) for real-time communication
- [WebRTC](https://webrtc.org/) for peer-to-peer communication
- [Font Awesome](https://fontawesome.com/) for icons 