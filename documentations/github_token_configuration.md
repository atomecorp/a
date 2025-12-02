# GitHub Token Configuration

This guide explains how to configure a GitHub Personal Access Token for the auto-sync feature.

## Why Use a Token?

The Squirrel framework polls the GitHub API every 60 seconds to detect new commits. Without authentication:

| Mode | Rate Limit |
|------|------------|
| **Without token** | 60 requests/hour (per IP) |
| **With token** | 5,000 requests/hour |

At 1 request per minute, you'll hit the unauthenticated limit in just 1 hour. **A token is strongly recommended.**

## Creating a GitHub Token

### Step 1: Generate the Token

1. Go to GitHub → **Settings** → **Developer settings**
2. Click **Personal access tokens** → **Tokens (classic)**
3. Click **"Generate new token (classic)"**
4. Configure:
   - **Note**: `Squirrel Auto-Sync` (or any descriptive name)
   - **Expiration**: Choose based on your needs (90 days, 1 year, or no expiration)
   - **Scopes**: 
     - ✅ `repo` (for private repositories)
     - ✅ `public_repo` (for public repositories only)

5. Click **"Generate token"**
6. **Copy the token immediately** (it won't be shown again!)

### Step 2: Store the Token Securely

#### Option A: Using `.env` file (Recommended)

Create or edit the `.env` file in your project root:

```bash
# .env
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

> ⚠️ The `.env` file is already in `.gitignore` - it will **never** be committed to the repository.

#### Option B: Using `GH_TOKEN` (GitHub CLI compatible)

If you already use GitHub CLI, the same variable works:

```bash
# .env
GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### Option C: Export in shell (temporary)

```bash
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
./run.sh --server
```

## Verifying Token Configuration

When the server starts, check the logs:

### ✅ Token Configured
```
🔑 GitHub token configured for API access
🔄 Starting GitHub polling (every 60s)
```

### ⚠️ No Token
```
⚠️  No GITHUB_TOKEN found - using unauthenticated API (60 req/hour limit)
🔄 Starting GitHub polling (every 60s)
```

## Security Best Practices

### ✅ DO

- Store tokens in `.env` file (gitignored)
- Use environment variables in production
- Use GitHub Actions secrets for CI/CD
- Rotate tokens periodically
- Use minimal required scopes

### ❌ DON'T

- Commit tokens to the repository
- Hardcode tokens in source files
- Share tokens in chat/email
- Use tokens with excessive permissions

## Token Scopes Explained

| Scope | Access Level | Use Case |
|-------|--------------|----------|
| `public_repo` | Public repos only | Syncing from public repositories |
| `repo` | All repos | Syncing from private repositories |

For the Squirrel auto-sync feature, you only need **read access** to the repository contents.

## Troubleshooting

### Rate Limit Errors

```
⚠️  GitHub API rate limit reached
```

**Solutions:**
1. Add a `GITHUB_TOKEN` to your `.env`
2. Wait for the rate limit to reset (1 hour)
3. Check if another application is using your API quota

### Invalid Token

```
❌ Failed to fetch commit SHA: GitHub API error: 401
```

**Solutions:**
1. Verify the token is correct (no extra spaces)
2. Check if the token has expired
3. Regenerate a new token

### Token Missing Permissions

```
❌ Failed to fetch commit SHA: GitHub API error: 403
```

**Solutions:**
1. Ensure the token has `repo` or `public_repo` scope
2. Verify you have access to the repository

## Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `GITHUB_TOKEN` | GitHub Personal Access Token | Recommended |
| `GH_TOKEN` | Alternative (GitHub CLI compatible) | Alternative |
| `GITHUB_AUTO_SYNC` | Set to `false` to disable polling | Optional |

## Example `.env` Configuration

```bash
# GitHub Configuration
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Optional: Disable auto-sync
# GITHUB_AUTO_SYNC=false

# Server Configuration
PORT=3001
```

## Checking Rate Limit Status

You can check your current rate limit:

```bash
# With token
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/rate_limit

# Response shows remaining requests
{
  "rate": {
    "limit": 5000,
    "remaining": 4999,
    "reset": 1701234567
  }
}
```

## Revoking a Token

If you suspect a token has been compromised:

1. Go to GitHub → **Settings** → **Developer settings**
2. Click **Personal access tokens** → **Tokens (classic)**
3. Find the token and click **"Delete"**
4. Generate a new token
5. Update your `.env` file
