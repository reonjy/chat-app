# Chat App

A minimalist AI chat interface with OpenAI-compatible API integration.

## Features

- 🎨 Light pink & blue theme, responsive for mobile & desktop
- ⚙️ Configurable Base URL, API Key & Model via Settings
- 📎 Image & file upload (click or drag-and-drop)
- 🔄 Streaming responses with markdown rendering
- 🚀 Vercel-ready (Next.js 14 + Edge Runtime)

## Getting Started

```bash
# Install dependencies
npm install

# Run locally
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

1. Push this project to a Git repository (GitHub, GitLab, or Bitbucket).
2. Go to [vercel.com/new](https://vercel.com/new) and import the repository.
3. Vercel auto-detects Next.js — click **Deploy**.

Or use the Vercel CLI:

```bash
npm i -g vercel
vercel
```

## Configuration

Click the ⚙️ icon in the top-right corner to set:

| Setting   | Description                              | Default                   |
| --------- | ---------------------------------------- | ------------------------- |
| Base URL  | Your OpenAI-compatible API endpoint      | —                         |
| API Key   | Your API key                             | —                         |
| Model     | Model identifier to use                  | `claude-opus-5-thinking`  |

Settings are saved in your browser's localStorage.
