# Nature Frontiers Auto Publisher

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.12](https://img.shields.io/badge/python-3.12-blue.svg)](https://www.python.org/downloads/release/python-3120/)

Automatically detect new YouTube videos (including Shorts) from Nature Frontiers channels and intelligently cross-post them to multiple platforms with AI-generated content.

## 🎯 Features

- **Hybrid Detection**: YouTube Data API v3 + RSS fallback for reliable video detection
- **AI-Powered Content**: Qwen LLM (DashScope) generates platform-specific captions
- **Multi-Platform Support**:
  - X/Twitter (OAuth 2.0)
  - Instagram (Graph API - Reels & Videos)
  - TikTok (Content Posting API)
  - LinkedIn (Community Management / Videos API)
- **Smart Short Detection**: Automatically identifies Shorts (<60s or #Shorts in title)
- **Content Generation**:
  - Optimized titles per platform
  - Engaging captions with emojis and hashtags
  - Blog-ready Markdown posts
  - HTML embed codes
- **Automated Scheduling**: GitHub Actions runs every 30 minutes
- **Robust Error Handling**: Exponential backoff, detailed logging, graceful fallbacks
- **Quota Management**: Intelligent YouTube API usage

## 📁 Repository Structure

```
naturefrontiers-auto-publisher/
├── .github/
│   └── workflows/
│       └── auto-publish.yml      # GitHub Actions workflow
├── logs/                         # Runtime logs (gitignored)
├── output/                       # Generated content (gitignored)
│   ├── atom.xml                  # RSS feed
│   ├── latest-videos.json        # JSON for website
│   └── posts/                    # Individual blog posts
├── config.py                     # Configuration management
├── main.py                       # Main orchestration script
├── youtube_fetcher.py            # YouTube API + RSS fetching
├── content_generator.py          # Qwen LLM content generation
├── social_poster.py              # Multi-platform posting logic
├── twitter_poster.py             # X/Twitter specific poster
├── instagram_poster.py           # Instagram specific poster
├── tiktok_poster.py              # TikTok specific poster
├── linkedin_poster.py            # LinkedIn specific poster
├── requirements.txt              # Python dependencies
├── .env.example                  # Environment variables template
├── .gitignore                    # Git ignore rules
└── README.md                     # This file
```

## 🚀 Quick Start

### Prerequisites

- Python 3.12+
- GitHub account with repository access
- API credentials for each platform (see Setup section)

### Installation

1. **Clone the repository**:
```bash
git clone https://github.com/your-org/naturefrontiers-auto-publisher.git
cd naturefrontiers-auto-publisher
```

2. **Install dependencies**:
```bash
pip install -r requirements.txt
```

3. **Configure environment variables**:
```bash
cp .env.example .env
# Edit .env with your API keys
```

4. **Test locally** (optional):
```bash
python main.py
```

5. **Enable GitHub Actions**:
   - Push to GitHub
   - Go to Settings → Actions → General → Enable Actions
   - Add secrets (see below)
   - Workflow runs automatically every 30 minutes

## 🔐 Setup Guide

### 1. YouTube Data API v3

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing (`stately-ally-470108-r5`)
3. Enable **YouTube Data API v3**
4. Create credentials → API Key
5. Add to GitHub Secrets as `YOUTUBE_API_KEY`

**Quota Tips**:
- Default quota: 10,000 units/day
- `videos.list` costs 1 unit
- `search.list` costs 100 units (use sparingly)
- This bot uses ~50-100 units per run

### 2. Alibaba Cloud DashScope (Qwen LLM)

1. Visit [Alibaba Cloud DashScope](https://dashscope.console.aliyun.com/)
2. Sign up / Log in
3. Create API Key
4. Add to GitHub Secrets as `DASHSCOPE_API_KEY`

**Supported Models**:
- `qwen-turbo` (fast, cost-effective)
- `qwen-plus` (balanced)
- `qwen-max` (best quality)

Configure in `.env`:
```bash
QWEN_MODEL=qwen-plus
```

### 3. X/Twitter (OAuth 2.0)

1. Go to [Twitter Developer Portal](https://developer.twitter.com/)
2. Create a Project and App
3. Generate OAuth 2.0 credentials:
   - API Key → `TWITTER_API_KEY`
   - API Secret → `TWITTER_API_SECRET`
   - Access Token → `TWITTER_ACCESS_TOKEN`
   - Access Token Secret → `TWITTER_ACCESS_TOKEN_SECRET`
   - Bearer Token → `TWITTER_BEARER_TOKEN`
4. Add all to GitHub Secrets

**Permissions**: Ensure app has "Read and Write" permissions

### 4. Instagram Graph API

1. Convert to **Business Account** or **Creator Account**
2. Go to [Meta Developers](https://developers.facebook.com/)
3. Create App → Business type
4. Add Instagram Graph API product
5. Get Long-Lived Access Token:
   ```bash
   # First get short-lived token via OAuth
   # Then exchange for long-lived (60 days)
   curl -g -i "https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret={app-secret}&access_token={short-lived-token}"
   ```
6. Get Account ID from: `https://graph.instagram.com/me?fields=id,username`
7. Add to GitHub Secrets:
   - `INSTAGRAM_ACCESS_TOKEN`
   - `INSTAGRAM_ACCOUNT_ID`

**Note**: Token expires every 60 days. Set up renewal reminder.

### 5. TikTok Content Posting API

1. Visit [TikTok Developers](https://developers.tiktok.com/)
2. Create App → Select "Content Posting API"
3. Submit for review (required for production)
4. Get Access Token via OAuth flow
5. Add to GitHub Secrets as `TIKTOK_ACCESS_TOKEN`

**Important**: 
- Direct Post supports `PULL_FROM_URL` (preferred) and `FILE_UPLOAD`
- `PULL_FROM_URL` requires publicly accessible video URL
- Fallback to `FILE_UPLOAD` using yt-dlp if needed

### 6. LinkedIn API

1. Go to [LinkedIn Developer](https://www.linkedin.com/developers/)
2. Create App
3. Request permissions:
   - `w_member_social` (for text posts)
   - `w_organization_social` (for company pages)
   - `rw_organization_admin` (for video uploads)
4. Get Credentials:
   - Access Token → `LINKEDIN_ACCESS_TOKEN`
   - Person URN (e.g., `urn:li:person:ABC123`) → `LINKEDIN_PERSON_URN`
   - OR Organization URN → `LINKEDIN_ORGANIZATION_URN`
5. Add to GitHub Secrets

**Video Upload Modes** (configure in `.env`):
```bash
# Default: Link post with thumbnail (recommended for testing)
LINKEDIN_POST_MODE=link

# Advanced: Native video upload (requires approval)
LINKEDIN_POST_MODE=native
```

### 7. GitHub Secrets Configuration

Go to your repository → Settings → Secrets and variables → Actions → New repository secret

Add these secrets:

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `YOUTUBE_API_KEY` | YouTube Data API key | `AIzaSy...` |
| `DASHSCOPE_API_KEY` | Qwen API key | `sk-...` |
| `TWITTER_API_KEY` | Twitter API key | `...` |
| `TWITTER_API_SECRET` | Twitter API secret | `...` |
| `TWITTER_ACCESS_TOKEN` | Twitter access token | `...` |
| `TWITTER_ACCESS_TOKEN_SECRET` | Twitter token secret | `...` |
| `TWITTER_BEARER_TOKEN` | Twitter bearer token | `AAAAAAAA...` |
| `INSTAGRAM_ACCESS_TOKEN` | Instagram long-lived token | `IGQVJ...` |
| `INSTAGRAM_ACCOUNT_ID` | Instagram business account ID | `178414...` |
| `TIKTOK_ACCESS_TOKEN` | TikTok access token | `act.eyJ...` |
| `LINKEDIN_ACCESS_TOKEN` | LinkedIn access token | `AQV...` |
| `LINKEDIN_PERSON_URN` | LinkedIn person URN | `urn:li:person:ABC123` |
| `LINKEDIN_ORGANIZATION_URN` | LinkedIn org URN (optional) | `urn:li:organization:123` |

### 8. GitHub Pages (for RSS + JSON)

1. Go to Settings → Pages
2. Source: Deploy from branch → `main` → `/output` folder
3. Save
4. Your feed will be available at: `https://your-username.github.io/naturefrontiers-auto-publisher/atom.xml`

## 🌐 Website Integration

Embed the latest video on www.naturefrontieers.com:

### Option 1: JavaScript Widget

```html
<div id="naturefrontiers-latest-video"></div>
<script>
fetch('https://your-username.github.io/naturefrontiers-auto-publisher/latest-videos.json')
  .then(response => response.json())
  .then(data => {
    const video = data.videos[0];
    const container = document.getElementById('naturefrontiers-latest-video');
    container.innerHTML = `
      <div class="latest-video">
        <h3>${video.title}</h3>
        <iframe width="560" height="315" 
                src="https://www.youtube.com/embed/${video.id}" 
                frameborder="0" allowfullscreen></iframe>
        <p>${video.description.substring(0, 200)}...</p>
        <a href="${video.url}" target="_blank">Watch on YouTube</a>
      </div>
    `;
  })
  .catch(err => console.error('Error loading video:', err));
</script>
<style>
.latest-video {
  max-width: 600px;
  margin: 20px auto;
  padding: 20px;
  border: 1px solid #ddd;
  border-radius: 8px;
}
</style>
```

### Option 2: RSS Feed Parser

```html
<div id="naturefrontiers-feed"></div>
<script>
fetch('https://your-username.github.io/naturefrontiers-auto-publisher/atom.xml')
  .then(response => response.text())
  .then(str => new window.DOMParser().parseFromString(str, "text/xml"))
  .then(xml => {
    const entries = xml.querySelectorAll("entry");
    const container = document.getElementById('naturefrontiers-feed');
    let html = '<ul>';
    entries.forEach(entry => {
      const title = entry.querySelector("title").textContent;
      const link = entry.querySelector("link").getAttribute("href");
      html += `<li><a href="${link}">${title}</a></li>`;
    });
    html += '</ul>';
    container.innerHTML = html;
  });
</script>
```

## ⚙️ Configuration

Edit `.env` to customize behavior:

```bash
# YouTube
YOUTUBE_CHANNEL_ID=UC41xXhw22o6Q2I2pTKB2kOg
CHECK_INTERVAL_MINUTES=30

# Qwen LLM
QWEN_MODEL=qwen-plus
MAX_TITLE_LENGTH=100

# Platform Toggles
ENABLE_TWITTER=true
ENABLE_INSTAGRAM=true
ENABLE_TIKTOK=true
ENABLE_LINKEDIN=true

# LinkedIn Mode: 'link' (default) or 'native'
LINKEDIN_POST_MODE=link

# Logging
LOG_LEVEL=INFO
```

## 🔄 How It Works

### Video Detection Flow

1. **Primary**: Query YouTube Data API v3 for recent uploads
2. **Fallback**: Parse RSS feeds if API fails
3. **Check Playlists**: Monitor 4 curated playlists
4. **Compare**: Check against `processed_videos.txt` to avoid duplicates

### Content Generation Flow

1. Fetch video metadata (title, description, tags, thumbnails)
2. Detect if Short (duration < 60s OR "#Shorts" in title)
3. Send to Qwen LLM with platform-specific prompts
4. Receive optimized content:
   - Short titles (≤100 chars)
   - Platform-tailored captions
   - Hashtags and CTAs
   - Blog markdown

### Posting Flow

For each enabled platform:
1. Prepare content (caption + media)
2. Attempt post with exponential backoff
3. On failure:
   - Retry up to 3 times
   - Fall back to simpler format (e.g., link instead of video)
4. Log result and update `processed_videos.txt`

## 🛡️ Error Handling

- **Exponential Backoff**: Retries with delays (1s, 2s, 4s, 8s...)
- **Graceful Degradation**: If native video upload fails, post link instead
- **Detailed Logging**: All actions logged to `logs/app.log`
- **Quota Protection**: Skip API calls if quota low
- **State Persistence**: Track processed videos to avoid duplicates

## 📊 Monitoring

### Logs

Check GitHub Actions logs or download `logs/app.log` artifact.

### Output Files

- `output/atom.xml`: RSS feed (updated per run)
- `output/latest-videos.json`: Latest 10 videos for website
- `output/posts/*.md`: Individual blog posts

## 🧪 Testing Locally

```bash
# Install dependencies
pip install -r requirements.txt

# Copy and edit .env
cp .env.example .env

# Run once manually
python main.py

# Check logs
tail -f logs/app.log
```

## 🚨 Troubleshooting

### Common Issues

**YouTube API Quota Exceeded**
- Reduce check frequency
- Use RSS fallback more aggressively
- Request quota increase from Google

**Instagram Token Expired**
- Tokens last 60 days
- Set calendar reminder to refresh
- Use Meta's token debugger to check status

**LinkedIn Video Upload Fails**
- Start with `LINKEDIN_POST_MODE=link`
- Native video upload requires app approval
- Ensure proper permissions (`rw_organization_admin`)

**TikTok PULL_FROM_URL Fails**
- Video URL must be publicly accessible
- Some regions restrict direct URL access
- Fallback to FILE_UPLOAD (slower but reliable)

**Qwen API Errors**
- Check API key validity
- Verify network connectivity to Alibaba Cloud
- Try different model (`qwen-turbo` vs `qwen-max`)

## 📝 Monitored Sources

### Channel
- **ID**: UC41xXhw22o6Q2I2pTKB2kOg
- **Username**: naturefrontiers-life

### Playlists
- PLhErNUuDxs_2F8ayJ_XDrgCbH-CiAqRcd
- PLhErNUuDxs_04gGj-HoaSkXNQ1bno89I8
- PLhErNUuDxs_0OFY1a8itinxcWutV7oN78
- PLhErNUuDxs_3s5P3kfBg1wZdWJY_PmAfC

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📄 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- Nature Frontiers for amazing wildlife content
- YouTube Data API team
- Alibaba Cloud DashScope
- Meta Developers
- TikTok Developer Platform
- LinkedIn API Team

---

**Recommendation**: Start with link posts to all platforms. Once stable, enable native video uploads one platform at a time with thorough testing.

For support, open an issue on GitHub.
