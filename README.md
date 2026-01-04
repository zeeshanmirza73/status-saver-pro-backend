# Status Saver Pro - Backend API

A Node.js/Express backend API for extracting media URLs from public Instagram posts, reels, and videos.

## Features

- 🎬 Extract media from Instagram Reels, Posts, and Videos
- 🔒 Rate limiting (100 requests/15min per IP)
- 🛡️ Security headers with Helmet
- ✅ URL validation
- ⚡ Error handling for private content

## API Endpoints

### Health Check
```
GET /health
```

### Download Media
```
POST /instagram/download
Content-Type: application/json

{
  "url": "https://www.instagram.com/reel/ABC123/"
}
```

**Response:**
```json
{
  "status": "success",
  "type": "reel",
  "media_url": "https://...",
  "thumbnail_url": "https://...",
  "caption": "..."
}
```

## Setup

1. Clone the repository:
```bash
git clone https://github.com/YOUR_USERNAME/status-saver-pro-backend.git
cd status-saver-pro-backend
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Start the server:
```bash
# Development
npm run dev

# Production
npm start
```

## Deployment on Render

1. Create a new **Web Service** on [Render](https://render.com)
2. Connect your GitHub repository
3. Configure:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Environment:** Node
4. Deploy!

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `NODE_ENV` | development | Environment mode |

## Error Codes

| Code | Description |
|------|-------------|
| `MISSING_URL` | No URL provided |
| `INVALID_URL` | URL format not recognized |
| `PRIVATE_CONTENT` | Content is private |
| `NOT_FOUND` | Post not found |
| `RATE_LIMIT_EXCEEDED` | Too many requests |

## License

MIT License

## Disclaimer

This API is for educational purposes only. Users are responsible for respecting copyright and Instagram's Terms of Service.
