# GitHub Credential (Plug and Say)

Use this credential to allow agents and workflows inside Plug and Say to interact securely with the GitHub API.

This credential enables automation such as creating issues, managing pull requests, and triggering repository workflows.

---

## Supported Integrations

This credential can be used with:

- GitHub (core integration)
- GitHub Trigger (event-based automation)
- GitHub Document Loader (API token only — OAuth not supported)

---

## When to Use

Use this credential when agents need to:

- Create GitHub Issues
- Create or manage Pull Requests
- Trigger GitHub Actions workflows
- Read repository data
- Access organization repositories (if permitted)

---

## Supported Authentication Methods

Plug and Say supports two authentication methods:

### 1. API Access Token (Recommended)

Use a Personal Access Token (Classic) for most use cases.  
This method works with all GitHub-related tools.

### 2. OAuth2 (Advanced)

Use OAuth2 for centralized governance, token rotation, and enterprise compliance.

OAuth2 is supported for:
- GitHub
- GitHub Trigger

OAuth2 is **not supported** for GitHub Document Loader.

---

# Using API Access Token

## Prerequisites

- A valid GitHub account
- Verified email address in GitHub

---

## Step 1 — Generate a Personal Access Token (Classic)

GitHub fine-grained tokens are still limited and may not support all endpoints.  
Plug and Say recommends using a **Personal Access Token (Classic)**.

### To generate your token:

1. Open your GitHub profile.
2. Go to **Settings**.
3. Select **Developer settings**.
4. Under **Personal access tokens**, choose **Tokens (classic)**.
5. Click **Generate new token** → **Generate new token (classic)**.
6. Add a descriptive name (example: `Plug and Say Integration`).
7. Choose an expiration (or No expiration if allowed by policy).
8. Select required scopes.

### Recommended scopes:

- `repo` (required for issues, PRs, and repository access)
- `read:org` (if accessing organization repositories)
- `workflow` (if triggering GitHub Actions)

⚠ A token without scopes can only access public information.

9. Click **Generate token**.
10. Copy the generated token immediately (it won't be shown again).

Official documentation:
- Creating a Personal Access Token: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token
- OAuth scopes reference: https://docs.github.com/en/developers/apps/building-oauth-apps/scopes-for-oauth-apps

---

## Step 2 — Configure Credential in Plug and Say

Inside Plug and Say:

- **GitHub Server**:  
  Leave as default `https://api.github.com`  
  (Only change if using GitHub Enterprise Server)

- **User**:  
  Your GitHub username (as shown in your profile)

- **Access Token**:  
  Paste the generated Personal Access Token

- **Default Repository (optional)**:  
  Format: `owner/repository`  
  Example: `luizbrazao/mission-control`

Save the credential.

---

# Using OAuth2 (Advanced Mode)

OAuth2 is recommended for teams that require centralized authentication management.

---

## GitHub Cloud Users

No manual connection details required.  
Use the **Connect GitHub Account** button inside Plug and Say and complete the authorization flow in your browser.

---

## Self-Hosted / Enterprise Setup

If using GitHub Enterprise or custom infrastructure:

### Step 1 — Create a GitHub OAuth App

1. Open GitHub → **Settings**
2. Go to **Developer settings**
3. Select **OAuth Apps**
4. Click **New OAuth App**
5. Fill in:

- **Application Name**: `Plug and Say Integration`
- **Homepage URL**: Your Plug and Say instance URL
- **Authorization Callback URL**:  
  Copy the OAuth Redirect URL from Plug and Say and paste it here

6. Click **Register Application**
7. Copy the generated:
   - Client ID
   - Client Secret

---

### Step 2 — Configure in Plug and Say

Enter:

- Client ID
- Client Secret
- GitHub Server URL (if Enterprise)

Save and complete the OAuth authorization flow.

Official OAuth documentation:
https://docs.github.com/en/developers/apps/building-oauth-apps/authorizing-oauth-apps

---

# Troubleshooting

### 401 Unauthorized
- Token expired
- Token revoked
- Incorrect token pasted

### 403 Forbidden
- Missing required scope
- Repository permission insufficient
- API rate limit exceeded

### 404 Not Found
- Incorrect `owner/repo` format
- Repository does not exist
- No access permission to repository

---

# Tools Mapped to This Credential

- `create_github_issue`
- `create_pull_request`
- `trigger_github_workflow`
- `list_repository_issues`
- `get_repository_content`

---

# Security Best Practices

- Never share your Access Token.
- Use expiration dates when possible.
- Revoke unused tokens regularly.
- Prefer OAuth2 for team environments.
- Limit scopes to minimum required access.

---

# GitHub API Reference

For complete API documentation:
https://docs.github.com/en/rest

---

Plug and Say uses the official GitHub REST API v3 and OAuth2 flows to ensure secure and compliant integration.
