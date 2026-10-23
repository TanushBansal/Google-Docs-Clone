# Google Docs Clone — Google login and document sharing

## Run locally

1. Install Node.js 22.13 or newer (Node.js 24 LTS recommended).
2. In Google Cloud Console, configure the Google Auth Platform consent screen and create an **OAuth client ID** of type **Web application**. Add `http://localhost:3000` under **Authorized JavaScript origins**. This app uses the Google Identity Services popup flow; it does not require a client secret or redirect URI. If your app is in testing mode, add the Google accounts you will test with as test users where required by your consent-screen configuration.
3. Open PowerShell in the `backend` folder and run:

   ```powershell
   npm install
   Copy-Item .env.example .env
   notepad .env
   ```

4. Replace the placeholder `GOOGLE_CLIENT_ID` with your web client ID, save, and run:

   ```powershell
   npm start
   ```

5. Open **http://localhost:3000** and click **Sign in with Google**. The backend serves the frontend too; do not launch it through Live Server or open `index.html` directly.

Google setup and token verification references: [Google Identity Services setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid), [server-side verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

## Share a document

Sign in, create a document, and click **Share**. Enter the recipient's Google account email and select **Viewer** or **Editor**, then click **Save access**. Adding the same email again changes its role. Use **Copy document link** and send it to the recipient yourself; the app does not send email invitations. Recipients sign in with the invited account and see the document in their sidebar. Sharing works before their first sign-in. **Remove** immediately revokes API access; previously downloaded content cannot be recalled.

| Role | Read | Edit title/content | Delete | Manage sharing |
| --- | --- | --- | --- | --- |
| Owner | Yes | Yes | Yes | Yes |
| Editor | Yes | Yes | No | No |
| Viewer | Yes | No | No | No |

The link alone does not grant access. Only the owner sees an enabled Share button; only owners see Delete. Backend routes enforce the same rules, including when called directly. A stale editor whose permission was removed receives an error on their next save. Refresh to see role changes in an already-open tab.

## Storage and security

SQLite stores users, documents, permissions, and sessions in `backend/data/docs.sqlite`. It is created automatically; no MongoDB or separate database server is needed. Back up this file and keep the data directory on persistent storage. The old prototype's in-memory documents cannot be recovered after its server has stopped.

Google ID tokens are verified for signature, audience and expiry by Google's library, and checked against a login nonce. Sessions use random tokens in HttpOnly, SameSite cookies, expire after 24 hours, and are invalidated on logout. Write requests require the configured Origin and a custom request header. Document HTML is sanitized before storage. Environment files, dependencies and the database are excluded from Git.

For deployment, set `APP_ORIGIN` to your exact HTTPS origin, set `NODE_ENV=production` to enable Secure cookies, add the HTTPS origin to the Google OAuth client, and keep the app and API on the same origin. Change `PORT` if needed. Optionally set `DATABASE_PATH` to a persistent SQLite file path. This version is intended for a single backend instance. It does not implement real-time collaborative merging; concurrent edits use the last completed save.

## Validation

Run `npm test` from `backend`. Tests cover authentication failures, nonce checks, sessions/logout, owner/editor/viewer restrictions, private document listing, sharing updates and revocation, HTML sanitization, disk persistence, and flushing pending saves when switching documents. Tests inject an identity verifier; production always uses Google's verifier. Real Google popup/consent completion must be tested with your own OAuth client and Google accounts.

To check manually, sign in as account A, create a document, share it with account B as Viewer, and open it in a separate browser profile signed in as B. Verify editing is disabled. Change B to Editor, refresh B's page, and verify edits save. Remove B and verify its next read/save fails. Restart the server and verify A's document remains.
