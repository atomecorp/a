# Configuring the GitHub Repository to Monitor

This guide explains how to configure the GitHub repository that the auto-sync system monitors for updates.

## Overview

The Squirrel framework includes an automatic synchronization feature that:

- Polls a GitHub repository every 60 seconds for new commits
- Downloads and extracts updates from the repository's ZIP archive
- Broadcasts version updates to all connected clients via WebSocket

## Configuration Location

The GitHub repository settings are defined in:

```
server/githubSync.js
```

### Default Configuration

```javascript
const CONFIG = {
    github: {
        owner: 'atomecorp',      // GitHub organization or username
        repo: 'a',               // Repository name
        branch: 'main'           // Branch to monitor
    },
    pollIntervalMs: 60000,       // Polling interval (60 seconds)
    versionFilePath: path.join(PROJECT_ROOT, 'src', 'version.json')
};
```

## How to Change the Monitored Repository

### Option 1: Edit the Configuration File

1. Open `server/githubSync.js`
2. Locate the `CONFIG` object at the top of the file
3. Modify the values:

```javascript
const CONFIG = {
    github: {
        owner: 'your-organization',  // Your GitHub org or username
        repo: 'your-repo-name',      // Your repository name
        branch: 'develop'            // Branch to monitor (main, develop, etc.)
    },
    pollIntervalMs: 60000,
    versionFilePath: path.join(PROJECT_ROOT, 'src', 'version.json')
};
```

4. Restart the Fastify server

### Option 2: Environment Variables (Recommended for Production)

You can also use environment variables by modifying the CONFIG initialization:

```javascript
const CONFIG = {
    github: {
        owner: process.env.GITHUB_SYNC_OWNER || 'atomecorp',
        repo: process.env.GITHUB_SYNC_REPO || 'a',
        branch: process.env.GITHUB_SYNC_BRANCH || 'main'
    },
    pollIntervalMs: parseInt(process.env.GITHUB_POLL_INTERVAL_MS) || 60000,
    versionFilePath: path.join(PROJECT_ROOT, 'src', 'version.json')
};
```

Then set in your `.env` file:

```bash
GITHUB_SYNC_OWNER=your-organization
GITHUB_SYNC_REPO=your-repo-name
GITHUB_SYNC_BRANCH=main
GITHUB_POLL_INTERVAL_MS=60000
```

## GitHub Token Configuration

### Why a Token?

Without a token, GitHub API has a rate limit of **60 requests per hour** (per IP).
With a token, the limit increases to **5,000 requests per hour**.

### Setting Up the Token

1. **Create a Personal Access Token on GitHub:**
   - Go to: GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Click "Generate new token (classic)"
   - Select scope: `repo` (for private repos) or `public_repo` (for public only)
   - Copy the generated token

2. **Store the token securely (NEVER commit to git):**

   In your `.env` file (already in `.gitignore`):

   ```bash
   GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

   Or use `GH_TOKEN` (compatible with GitHub CLI):

   ```bash
   GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

3. **Verify the token is loaded:**

   When the server starts, you should see:

   ```
   🔑 GitHub token configured for API access
   ```

   If not configured:

   ```
   ⚠️  No GITHUB_TOKEN found - using unauthenticated API (60 req/hour limit)
   ```

### Security Best Practices

- ✅ Store tokens in `.env` file (already gitignored)
- ✅ Use environment variables in production
- ✅ Use GitHub Actions secrets for CI/CD
- ❌ NEVER commit tokens to the repository
- ❌ NEVER hardcode tokens in source files

## Disabling Auto-Sync

To disable the automatic GitHub polling:

```bash
GITHUB_AUTO_SYNC=false ./run.sh --server
```

Or add to `.env`:

```bash
GITHUB_AUTO_SYNC=false
```

## Manual Sync Trigger

You can manually trigger a sync via the API:

```bash
curl -X POST http://localhost:3001/api/admin/sync-from-zip \
  -H "Content-Type: application/json" \
  -d '{
    "zipUrl": "https://github.com/your-org/your-repo/archive/refs/heads/main.zip",
    "protectedPaths": ["src/application/temp"]
  }'
```

## Monitoring Sync Status

### Check Connected Clients

```bash
curl http://localhost:3001/api/admin/sync-clients
```

### View Current Version

```bash
curl http://localhost:3001/version.json
```

## Troubleshooting

### Rate Limit Errors

```
⚠️  GitHub API rate limit reached
```

**Solution:** Configure a `GITHUB_TOKEN` in your `.env` file.

### Connection Errors

```
❌ Failed to fetch commit SHA: GitHub API error: 404
```

**Solution:** Verify the owner, repo, and branch names are correct.

### Sync Not Triggering

**Check:**

1. Is `GITHUB_AUTO_SYNC` set to `false`?
2. Is the server running in `--server` mode?
3. Check logs: `tail -f /tmp/fastify.log`
