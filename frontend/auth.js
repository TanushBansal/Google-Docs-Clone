async function authRequest(path, options = {}) {
    const response = await fetch('/api/auth/' + path, { ...options, headers: { 'Content-Type':'application/json', 'X-Requested-With':'DocsApp' } });
    const data = await response.json();
    if(!response.ok) throw new Error(data.message);
    return data;
}
async function startAuthentication() {
    const message = document.getElementById('login-message');
    try {
        const config = await authRequest('config');
        const signedIn = async user => {
            document.getElementById('login-screen').hidden = true;
            document.getElementById('workspace').hidden = false;
            document.getElementById('account-name').textContent = user.email;
            await loadDocuments();
        };
        if(config.user) return signedIn(config.user);
        if(!config.clientId) throw new Error('Set GOOGLE_CLIENT_ID in backend/.env and restart the server.');
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.onerror = () => message.textContent = 'Google sign-in could not load. Check your connection and reload.';
        script.onload = () => {
            google.accounts.id.initialize({ client_id:config.clientId, nonce:config.nonce, callback:async response => {
                try {
                    message.textContent = 'Signing in…';
                    const result = await authRequest('google', {method:'POST', body:JSON.stringify({credential:response.credential})});
                    await signedIn(result.user);
                } catch(error) { message.textContent = error.message; }
            }});
            google.accounts.id.renderButton(document.getElementById('google-signin'), {theme:'outline',size:'large'});
            message.textContent = '';
        };
        document.head.appendChild(script);
    } catch(error) { message.textContent = error.message; }
}
document.getElementById('logout-btn').addEventListener('click', async () => {
    try {
        clearTimeout(saveTimer);
        await persistDocument(getActiveDocument());
        await authRequest('logout', {method:'POST', body:'{}'});
        localStorage.removeItem(ACTIVE_KEY);
        localStorage.removeItem(STORAGE_KEY);
        location.href = '/';
    } catch(error) { alert(error.message); }
});
let sharingDocumentId;
async function showSharing() {
    sharingDocumentId = activeDocumentId;
    document.getElementById('share-message').textContent = '';
    await renderPermissions();
    document.getElementById('share-dialog').showModal();
}
async function renderPermissions() {
    const permissions = await apiRequest('/' + sharingDocumentId + '/permissions');
    const list = document.getElementById('permission-list');
    list.replaceChildren();
    for(const permission of permissions) {
        const row = document.createElement('p');
        const label = document.createElement('span');
        label.textContent = `${permission.email} — ${permission.role} `;
        const remove = document.createElement('button');
        remove.type = 'button'; remove.textContent = 'Remove';
        remove.addEventListener('click', async () => {
            try {
                await apiRequest('/' + sharingDocumentId + '/permissions', {method:'DELETE',body:JSON.stringify({email:permission.email})});
                await renderPermissions();
            } catch(error) { document.getElementById('share-message').textContent = error.message; }
        });
        row.append(label,remove); list.append(row);
    }
}
document.getElementById('share-form').addEventListener('submit', async event => {
    event.preventDefault();
    try {
        await apiRequest('/' + sharingDocumentId + '/permissions', {method:'PUT',body:JSON.stringify({email:document.getElementById('share-email').value,role:document.getElementById('share-role').value})});
        document.getElementById('share-email').value = '';
        document.getElementById('share-message').textContent = 'Access saved. Send the document link to this person.';
        await renderPermissions();
    } catch(error) { document.getElementById('share-message').textContent = error.message; }
});
document.getElementById('copy-link').addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText(location.origin + '/?doc=' + encodeURIComponent(sharingDocumentId));
        document.getElementById('share-message').textContent = 'Link copied. Only invited accounts can open it.';
    } catch { document.getElementById('share-message').textContent = 'Copy the link from your browser address bar.'; }
});
document.getElementById('close-sharing').addEventListener('click', () => document.getElementById('share-dialog').close());
