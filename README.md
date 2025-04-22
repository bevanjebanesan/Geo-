# Altear Meeting App

A secure, peer-to-peer meeting and hand tracking web app. Features:
- Real-time video, audio, chat, and hand tracking
- Secure HTTPS local server for camera/mic access
- Broadcast hand sentence output to all participants (like captions)
- LAN-friendly meeting links

---

## Features

- 🔒 **Secure & Private**: Peer-to-peer video, audio, and chat with no central server storing your data.
- ✋ **Hand Tracking**: Real-time sign/gesture recognition using MediaPipe Hands, with suggestions and buffer for workplace vocabulary.
- 💬 **Live Sentence Sharing**: Hand sentence output is broadcast to all participants like captions.
- 🌐 **LAN & HTTPS Ready**: Secure local server for camera/mic access and easy LAN link sharing.
- 🏷️ **Participant Labels**: Clear video labels for local/remote users.
- 🗣️ **Chat & Captions**: Text chat and speech-to-text captions included.

---

## Quick Start

1. **Install dependencies:**
   - Python 3 (for local HTTPS server)
   - [PeerJS](https://peerjs.com/) (uses CDN by default)

2. **Start the server:**
   ```bash
   python3 serve_https.py 8000
   ```
   Open `https://192.168.186.144:8000/` in your browser (accept the SSL warning if using self-signed certs).

3. **Join or create a meeting:**
   - Enter your name and meeting ID, then share the LAN link for others to join.

---

## Deployment

- **Netlify:** Static deployment supported (see `netlify.toml`).
- **Vercel/Render:** Also compatible; use a static frontend and a PeerJS/Express backend if needed.
- **HTTPS:** Required for camera/mic—certificates are not included in the repo.

---

## Project Structure

- `index.html` — Main UI
- `script.js` — App logic (hand tracking, peer, chat, etc.)
- `styles.css` — Styling
- `workplace_words.txt` — Custom workplace vocabulary for suggestions
- `serve_https.py` — Simple HTTPS server for local development

---

## Security Notes

- All video/audio/caption data is peer-to-peer and not stored on any server.
- Use your own SSL certificates for production.
- Add your own TURN server for best WebRTC reliability across networks.

---

## Credits
- Built with [MediaPipe Hands](https://google.github.io/mediapipe/solutions/hands.html), [PeerJS](https://peerjs.com/), and vanilla JS.

---

## License
MIT

## Local Development
- Start server: `python3 serve_https.py 8000`
- Access via: `https://192.168.186.144:8000/`

## Deployment
- Deploys via Netlify (see `netlify.toml`)

## Security
- Uses HTTPS for all video/mic access
- Do not commit SSL certificate files
