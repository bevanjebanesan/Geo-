# Altear Meeting App

A secure, peer-to-peer meeting and hand tracking web app. Features:
- Real-time video, audio, chat, and hand tracking
- Secure HTTPS local server for camera/mic access
- Broadcast hand sentence output to all participants (like captions)
- LAN-friendly meeting links

## Local Development
- Start server: `python3 serve_https.py 8000`
- Access via: `https://192.168.0.100:8000/`

## Deployment
- Deploys via Netlify (see `netlify.toml`)

## Security
- Uses HTTPS for all video/mic access
- Do not commit SSL certificate files
