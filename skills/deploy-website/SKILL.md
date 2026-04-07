---
name: deploy-website
description: Guide for deploying generated websites to Vercel or GitHub Pages from the DMV Atlas chatbot. Use when the user wants to deploy, publish, or go live with a generated website.
---

# Website Deployment Skill

## Deploy Targets

### Vercel
- One-click deploy via the Rocket button in the preview
- Creates a new Vercel project with each deploy
- Live URL available in ~30-60 seconds
- Supports React (Vite) and vanilla HTML/CSS/JS
- Requires `DEPLOY_VERCEL_TOKEN` environment variable

### GitHub Pages
- Creates a new GitHub repository automatically
- Pushes scaffolded project with GitHub Actions workflow
- GitHub Actions builds and deploys to Pages
- Live URL at `https://<username>.github.io/<repo-name>/`
- Takes ~60-120 seconds for first deploy
- Requires `GITHUB_TOKEN` environment variable

## Project Scaffold

When deploying, the system automatically wraps generated code in a complete project:

**React projects:**
- `package.json` with react, react-dom, vite, @vitejs/plugin-react
- `vite.config.js` with React plugin
- `index.html` with Tailwind CDN + Google Fonts
- `src/main.jsx` entry point
- `src/App.jsx` (generated code)
- `.github/workflows/deploy.yml` (for GitHub Pages)

**Vanilla projects:**
- `package.json` with vite
- `index.html`, `style.css`, `main.js` (generated code)

## Workflow

1. Generate website via chat ("build me a portfolio")
2. Preview in Sandpack (500px default, fullscreen available)
3. Iterate ("change the header color", "add a contact section")
4. When satisfied, click Rocket → choose Vercel or GitHub Pages
5. Wait for status bar: Deploying → Ready → click live URL

## Troubleshooting

- **Deploy fails**: Check that tokens are set in `.env` or Vercel env vars
- **GitHub Pages 404**: Wait ~2 minutes for GitHub Actions to complete
- **Vercel build error**: The scaffold uses Vite, ensure generated code is valid React/JSX
