# Altear - Video Meeting Application

Altear is a WebRTC-based video meeting application that allows users to create and join meetings with real-time audio and video communication.

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

## Setup and Installation

### Prerequisites

- Node.js (v14 or higher)
- npm (v6 or higher)
- SSL certificates for HTTPS

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/altear.git
   cd altear
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Generate SSL certificates (if not already available):
   ```
   mkcert create-ca
   mkcert create-cert
   ```

4. Start the server:
   ```
   node server.js
   ```

5. Access the application:
   - Local: https://localhost:8181
   - Network: https://your-ip-address:8181

## Usage

1. **Creating a Meeting**:
   - Enter your name
   - Click "Create Meeting"
   - Share the meeting ID with others

2. **Joining a Meeting**:
   - Enter your name
   - Enter the meeting ID
   - Click "Join Meeting"

3. **During a Meeting**:
   - Toggle audio/video using the respective buttons
   - Share your screen using the screen share button
   - Copy the meeting link to invite others
   - End the meeting using the end call button

## Architecture

The application uses a client-server architecture with WebRTC for peer-to-peer communication:

- **Server**: Handles signaling and meeting management
- **Client**: Manages WebRTC connections and UI
- **Signaling**: Uses Socket.IO for exchanging WebRTC signaling information

## Security Considerations

- HTTPS is used for all communications
- Authentication is required for socket connections
- WebRTC connections are encrypted

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [Socket.IO](https://socket.io/) for real-time communication
- [WebRTC](https://webrtc.org/) for peer-to-peer communication
- [Font Awesome](https://fontawesome.com/) for icons 