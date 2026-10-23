
 // ======================================
// GOOGLE DOCS CLONE - DOCUMENT MANAGER
// ======================================
const API_URL = "/api/documents";

async function apiRequest(endpoint = "", options = {}) {
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            "X-Requested-With": "DocsApp",
            ...(options.headers || {})
        }
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error(
            data?.message || `API error: ${response.status}`
        );
    }

    return data;
}

const editor = document.getElementById("editor");
const titleInput = document.getElementById("document-title");
const saveStatus = document.getElementById("save-status");
const wordCount = document.getElementById("word-count");

const blockFormat = document.getElementById("block-format");
const fontSize = document.getElementById("font-size");
const fontFamily = document.getElementById("font-family");

const undoButton = document.getElementById("undo-btn");
const redoButton = document.getElementById("redo-btn");
const clearButton = document.getElementById("clear-format");
const shareButton = document.getElementById("share-btn");

const newDocumentButton =
    document.getElementById("new-document-btn");

const documentList =
    document.getElementById("document-list");

const STORAGE_KEY = "myDocsDocuments";
const ACTIVE_KEY = "myDocsActiveDocument";

// Current application state
let documents = [];
let activeDocumentId = null;
let saveTimer = null;
let pendingSave = Promise.resolve();
let dirtyDocuments = new Set();


// ======================================
// CREATE A NEW DOCUMENT OBJECT
// ======================================

function createDocument(title = "Untitled document") {
    return {
        id: crypto.randomUUID(),
        title: title,
        content:"",
        updatedAt: new Date().toISOString()
    };
}


// ======================================
// LOAD SAVED DOCUMENTS
// ======================================

async function loadDocuments() {
    try {
        saveStatus.textContent = "Loading documents...";

        documents = await apiRequest();

        const savedActiveId = new URLSearchParams(location.search).get("doc") || localStorage.getItem(ACTIVE_KEY);

        const activeExists = documents.some(function(doc) {
            return doc.id === savedActiveId;
        });

        if (documents.length === 0) {
            await newDocument();
            return;
        }

        activeDocumentId = activeExists
            ? savedActiveId
            : documents[0].id;

        renderDocumentList();
        openDocument(activeDocumentId);

    } catch (error) {
        console.error("Could not load documents:", error);
        saveStatus.textContent = "Could not connect to backend";
        alert("Could not load documents. Check that your backend is running.");
    }
}


// ======================================
// SAVE ALL DOCUMENTS TO BROWSER STORAGE
// ======================================

function saveAllDocuments() {
    localStorage.setItem(ACTIVE_KEY, activeDocumentId || '');
    return true;
}


// ======================================
// FIND THE CURRENT DOCUMENT
// ======================================

function getActiveDocument() {
    return documents.find(function(doc) {
        return doc.id === activeDocumentId;
    });
}


// ======================================
// UPDATE WORD COUNT
// ======================================

function updateWordCount() {
    const text = editor.innerText.trim();

    const words = text
        ? text.split(/\s+/).length
        : 0;

    wordCount.textContent = "Words: " + words;
}


// ======================================
// SCHEDULE AUTOSAVE
// ======================================

function markAsEdited() {
    const doc = getActiveDocument();
    if (!doc || doc.role === 'viewer') return;
    doc.title = titleInput.value.trim() || 'Untitled document';
    doc.content = editor.innerHTML;
    dirtyDocuments.add(doc.id);
    saveStatus.textContent = 'Saving...';
    updateWordCount();
    renderDocumentList();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persistDocument(doc).catch(() => {}), 500);
}

function persistDocument(doc) {
    if (!doc || doc.role === 'viewer' || !dirtyDocuments.has(doc.id)) return pendingSave;
    const snapshot = {title: doc.title, content: doc.content};
    const task = pendingSave.catch(() => {}).then(async () => {
        try {
            await apiRequest('/' + doc.id, {method:'PUT', body:JSON.stringify(snapshot)});
            if (doc.title === snapshot.title && doc.content === snapshot.content) dirtyDocuments.delete(doc.id);
            if(activeDocumentId === doc.id) saveStatus.textContent = dirtyDocuments.has(doc.id) ? 'Saving...' : 'All changes saved';
        } catch(error) {
            saveStatus.textContent = 'Save failed — keep this tab open and retry';
            throw error;
        }
    });
    pendingSave = task;
    return task;
}


// ======================================
// RENDER THE SIDEBAR DOCUMENT LIST
// ======================================

function renderDocumentList() {
    documentList.innerHTML = "";

    documents.forEach(function(doc) {
        const item = document.createElement("div");
        item.className = "document-item";

        if (doc.id === activeDocumentId) {
            item.classList.add("active");
        }

        const icon = document.createElement("span");
        icon.textContent = "📄";

        const name = document.createElement("span");
        name.className = "document-name";
        name.textContent = doc.title || "Untitled document";
        name.title = doc.title || "Untitled document";

        const deleteButton = document.createElement("button");
        deleteButton.className = "delete-document-btn";
        deleteButton.textContent = "×";
        deleteButton.title = "Delete document";
        deleteButton.setAttribute("aria-label", "Delete document");

        item.appendChild(icon);
        item.appendChild(name);
        if (doc.role === 'owner') item.appendChild(deleteButton);

        item.addEventListener("click", function() {
            openDocument(doc.id);
        });

        deleteButton.addEventListener("click", function(event) {
            event.stopPropagation();
            deleteDocument(doc.id);
        });

        documentList.appendChild(item);
    });
}


// ======================================
// OPEN AN EXISTING DOCUMENT
// ======================================

async function openDocument(id) {
    clearTimeout(saveTimer);
    try { await persistDocument(getActiveDocument()); } catch { return; }

    const doc = documents.find(function(item) {
        return item.id === id;
    });

    if (!doc) {
        return;
    }

    try { Object.assign(doc, await apiRequest('/' + doc.id)); }
    catch(error) { saveStatus.textContent = error.message; return; }
    activeDocumentId = doc.id;
    savedRange = null;
    const canEdit = doc.role !== 'viewer';
    editor.contentEditable = String(canEdit);
    titleInput.disabled = !canEdit;
    document.querySelectorAll('.toolbar button, .toolbar select, .toolbar input').forEach(control => control.disabled = !canEdit);
    shareButton.disabled = doc.role !== 'owner';
    document.getElementById('access-role').textContent = doc.role;
    history.replaceState(null, '', '?doc=' + encodeURIComponent(doc.id));

    titleInput.value = doc.title;
    editor.innerHTML = doc.content;

    saveAllDocuments();
    renderDocumentList();
    updateWordCount();

    saveStatus.textContent = "All changes saved";
}


// ======================================
// CREATE A DOCUMENT
// ======================================

async function newDocument() {
    try {
        clearTimeout(saveTimer);

        const currentDoc = getActiveDocument();

        await persistDocument(currentDoc);

        const newDoc = await apiRequest("", {
            method: "POST",
            body: JSON.stringify({
                title: "Untitled document",
                content: ""
            })
        });

        documents.unshift(newDoc);
        activeDocumentId = newDoc.id;

        localStorage.setItem(ACTIVE_KEY, activeDocumentId);

        renderDocumentList();
        await openDocument(newDoc.id);

    } catch (error) {
        console.error("Could not create document:", error);
        saveStatus.textContent = "Create failed";
        alert("Could not create the document. Check the backend.");
    }
}


// ======================================
// DELETE A DOCUMENT
// ======================================

async function deleteDocument(id) {
    const docToDelete = documents.find(function(doc) {
        return doc.id === id;
    });

    if (!docToDelete) {
        return;
    }

    const confirmed = confirm(
        "Are you sure you want to delete this document?"
    );

    if (!confirmed) {
        return;
    }

    try {
        await apiRequest("/" + id, {
            method: "DELETE"
        });

        documents = documents.filter(function(doc) {
            return doc.id !== id;
        });

        if (activeDocumentId === id) {
            if (documents.length > 0) {
                activeDocumentId = documents[0].id;
                localStorage.setItem(ACTIVE_KEY, activeDocumentId);
                renderDocumentList();
                openDocument(activeDocumentId);
            } else {
                activeDocumentId = null;
                await newDocument();
                return;
            }
        } else {
            renderDocumentList();
        }

        saveStatus.textContent = "Document deleted";
    } catch (error) {
        console.error("Delete failed:", error);
        saveStatus.textContent = "Delete failed";
        alert("Could not delete the document. Check the backend.");
    }
}


// ======================================
// FORMATTING CONTROLS
// ======================================

// Existing toolbar buttons: bold, italic, underline, alignment, etc.
document.querySelectorAll("[data-command]").forEach(function(button) {
    button.addEventListener("mousedown", function(event) {
        event.preventDefault();
    });

    button.addEventListener("click", function() {
        editor.focus();

        document.execCommand(
            button.dataset.command,
            false,
            null
        );

        markAsEdited();
    });
});


// ======================================
// SAVE AND RESTORE TEXT SELECTION
// ======================================

let savedRange = null;

function saveEditorSelection() {
    const selection = window.getSelection();

    if (
        selection &&
        selection.rangeCount > 0 &&
        editor.contains(selection.anchorNode) &&
        editor.contains(selection.focusNode)
    ) {
        savedRange = selection.getRangeAt(0).cloneRange();
    }
}

function restoreEditorSelection() {
    if (!savedRange) {
        return;
    }

    editor.focus();

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(savedRange);
}

editor.addEventListener("mouseup", saveEditorSelection);
editor.addEventListener("keyup", saveEditorSelection);


// ======================================
// TEXT STYLE DROPDOWN
// ======================================

blockFormat.addEventListener("mousedown", saveEditorSelection);

blockFormat.addEventListener("change", function() {
    restoreEditorSelection();

    document.execCommand(
        "formatBlock",
        false,
        blockFormat.value
    );

    markAsEdited();
});


function getCurrentBlock() {
    const selection = window.getSelection();

    if (!selection || !selection.rangeCount) return null;

    let node = selection.focusNode;

    if (!node) return null;

    if (node.nodeType === Node.TEXT_NODE) {
        node = node.parentElement;
    }

    if (!node || !editor.contains(node)) return null;

    return node.closest("p, h1, h2, h3, h4, blockquote");
}

function updateBlockFormat() {
    const block = getCurrentBlock();

    if (block && editor.contains(block)) {
        blockFormat.value = block.tagName.toLowerCase();
    } else if (editor.contains(document.activeElement)) {
        blockFormat.value = "p";
    }
}

// Apply the selected block style
blockFormat.addEventListener("mousedown", saveEditorSelection);

blockFormat.addEventListener("change", function() {
    restoreEditorSelection();

    document.execCommand(
        "formatBlock",
        false,
        blockFormat.value
    );

    markAsEdited();
    updateBlockFormat();
});

// When Enter is pressed inside a heading,
// make the new line normal text if the browser keeps it as a heading.
editor.addEventListener("keydown", function(event) {
    if (event.key !== "Enter" || event.shiftKey) return;

    const previousBlock = getCurrentBlock();

    if (
        !previousBlock ||
        !/^H[1-3]$/.test(previousBlock.tagName)
    ) {
        return;
    }

    setTimeout(function() {
        const currentBlock = getCurrentBlock();

        if (
            currentBlock &&
            /^H[1-3]$/.test(currentBlock.tagName)
        ) {
            document.execCommand("formatBlock", false, "p");
            markAsEdited();
        }

        updateBlockFormat();
    }, 0);
});

// Keep the selector synchronized with the cursor
editor.addEventListener("click", updateBlockFormat);
editor.addEventListener("keyup", updateBlockFormat);
editor.addEventListener("mouseup", updateBlockFormat);
editor.addEventListener("input", updateBlockFormat);

document.addEventListener("selectionchange", function() {
    if (editor.contains(document.activeElement)) {
        updateBlockFormat();
    }
});



// ======================================
// FONT FAMILY DROPDOWN
// ======================================

fontFamily.addEventListener("mousedown", saveEditorSelection);

fontFamily.addEventListener("change", function() {
    restoreEditorSelection();

    document.execCommand(
        "fontName",
        false,
        fontFamily.value
    );

    markAsEdited();
});


// ======================================
// FONT SIZE DROPDOWN
// ======================================

fontSize.addEventListener("mousedown", saveEditorSelection);

fontSize.addEventListener("change", function() {
    restoreEditorSelection();

    document.execCommand(
        "fontSize",
        false,
        fontSize.value
    );

    markAsEdited();
});

 // ======================================
// TEXT COLOUR AND HIGHLIGHT COLOUR
// ======================================


 // ======================================
// TEXT COLOUR AND HIGHLIGHT BUTTONS
// ======================================

const textColorBtn = document.getElementById("text-color-btn");
const textColorInput = document.getElementById("text-color");
const textColorIndicator = document.getElementById("text-color-indicator");

const highlightBtn = document.getElementById("highlight-btn");
const highlightInput = document.getElementById("highlight-color");
const highlightIndicator = document.getElementById("highlight-indicator");

let currentTextColor = "#000000";
let currentHighlightColor = "#ffff00";
let highlightMode = false;


// Prevent toolbar clicks from immediately losing editor selection
textColorBtn.addEventListener("mousedown", function(event) {
    event.preventDefault();
    saveEditorSelection();
});

highlightBtn.addEventListener("mousedown", function(event) {
    event.preventDefault();
    saveEditorSelection();
});


// Open text colour options
textColorBtn.addEventListener("click", function() {
    saveEditorSelection();
    textColorInput.click();
});


// Apply text colour only after the user picks a colour
textColorInput.addEventListener("input", function() {
    currentTextColor = textColorInput.value;
    textColorIndicator.style.backgroundColor = currentTextColor;
});

textColorInput.addEventListener("change", function() {
    restoreEditorSelection();

    document.execCommand(
        "foreColor",
        false,
        currentTextColor
    );

    markAsEdited();
    saveEditorSelection();
});



 // Toggle highlight mode


highlightBtn.addEventListener("click", function() {
    saveEditorSelection();
    restoreEditorSelection();

    highlightMode = !highlightMode;
    console.log("Highlight mode:", highlightMode);
console.log("Button clicked!");

    highlightBtn.classList.toggle("active", highlightMode);
    highlightBtn.setAttribute("aria-pressed", String(highlightMode));

    if (highlightMode) {
        highlightInput.click();
        return;
    }

    // Move the cursor to a position with no visible highlight.
    const selection = window.getSelection();

    if (!selection || !selection.rangeCount) return;

    const range = selection.getRangeAt(0).cloneRange();
    range.collapse(false);

    let node = range.startContainer;

    if (node.nodeType === Node.TEXT_NODE) {
        node = node.parentElement;
    }

    const highlightedElement = node?.closest?.(
        'mark, span[style*="background-color"], font[style*="background-color"]'
    );

    if (!highlightedElement || !editor.contains(highlightedElement)) {
        saveEditorSelection();
        return;
    }

    // Use the editor's white page background to mask
    // the highlight only for newly typed text.
    const marker = document.createElement("span");
    marker.style.backgroundColor = "#ffffff";

    const cursorText = document.createTextNode("\u200B");
    marker.appendChild(cursorText);

    range.insertNode(marker);

    const newRange = document.createRange();
    newRange.setStart(cursorText, 1);
    newRange.collapse(true);

    selection.removeAllRanges();
    selection.addRange(newRange);

    saveEditorSelection();
    markAsEdited();
});

editor.addEventListener("beforeinput", function(event) {
    if (highlightMode) return;

    // Do not interfere with deletions, formatting, or other edits.
    if (event.inputType !== "insertText") return;

    const selection = window.getSelection();

    if (!selection || !selection.rangeCount) return;

    const range = selection.getRangeAt(0);

    if (!editor.contains(range.startContainer)) return;

    let node = range.startContainer;

    if (node.nodeType === Node.TEXT_NODE) {
        node = node.parentElement;
    }

    const highlightedElement = node?.closest?.(
        'mark, span[style*="background-color"], font[style*="background-color"]'
    );

    if (highlightedElement && editor.contains(highlightedElement)) {
        // Remove the inherited highlight from the typing position only.
        const parent = highlightedElement.parentNode;
        const text = document.createTextNode("");
        parent.insertBefore(text, highlightedElement.nextSibling);

        const newRange = document.createRange();
        newRange.setStart(text, 0);
        newRange.collapse(true);

        selection.removeAllRanges();
        selection.addRange(newRange);
    }
});





// Preview the selected highlight colour
highlightInput.addEventListener("input", function() {
    currentHighlightColor = highlightInput.value;
    highlightIndicator.style.backgroundColor = currentHighlightColor;
});



highlightInput.addEventListener("change", function() {
    if (!highlightMode) return;

    restoreEditorSelection();

    document.execCommand("styleWithCSS", false, true);
    document.execCommand("hiliteColor", false, currentHighlightColor);

    markAsEdited();
    saveEditorSelection();
});




// ======================================
// UNDO AND REDO
// ======================================

undoButton.addEventListener("mousedown", function(event) {
    event.preventDefault();
});

undoButton.addEventListener("click", function() {
    editor.focus();
    document.execCommand("undo");
    markAsEdited();
});

redoButton.addEventListener("mousedown", function(event) {
    event.preventDefault();
});

redoButton.addEventListener("click", function() {
    editor.focus();
    document.execCommand("redo");
    markAsEdited();
});
///
////
function updateFormattingButtons() {
    const commands = ["bold", "italic", "underline"];

    commands.forEach(command => {
        const button = document.querySelector(
            `[data-command="${command}"]`
        );

        if (!button) return;

        const isActive = document.queryCommandState(command);

        button.classList.toggle("active", isActive);
    });
}

editor.addEventListener("keyup", updateFormattingButtons);
editor.addEventListener("mouseup", updateFormattingButtons);
editor.addEventListener("input", updateFormattingButtons);

document.addEventListener("selectionchange", () => {
    if (editor.contains(document.activeElement)) {
        updateFormattingButtons();
    }
});
// ======================================
// EVENT LISTENERS
// ======================================

editor.addEventListener("input", markAsEdited);

titleInput.addEventListener("input", markAsEdited);

newDocumentButton.addEventListener("click", newDocument);

shareButton.addEventListener('click', () => showSharing().catch(error => alert(error.message)));


// ======================================
// START APPLICATION
// ======================================

startAuthentication();

window.addEventListener('beforeunload', event => {
    if(dirtyDocuments.size) { event.preventDefault(); event.returnValue = ''; }
});
document.getElementById('retry-save').addEventListener('click', () => persistDocument(getActiveDocument()).catch(error => alert(error.message)));
