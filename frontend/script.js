// ======================================
// GOOGLE DOCS CLONE - DOCUMENT MANAGER
// ======================================
const API_URL = "http://localhost:3000/api/documents";

async function apiRequest(endpoint = "", options = {}) {
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
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


// ======================================
// CREATE A NEW DOCUMENT OBJECT
// ======================================

function createDocument(title = "Untitled document") {
    return {
        id: crypto.randomUUID(),
        title: title,
        content: "<h1>Untitled document</h1><p>Start typing here...</p>",
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

        const savedActiveId = localStorage.getItem(ACTIVE_KEY);

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
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(documents)
        );

        localStorage.setItem(
            ACTIVE_KEY,
            activeDocumentId || ""
        );

        return true;
    } catch (error) {
        console.error("Could not save documents:", error);
        saveStatus.textContent = "Save failed";
        return false;
    }
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

    if (!doc) {
        return;
    }

    doc.title = titleInput.value.trim() || "Untitled document";
    doc.content = editor.innerHTML;
    doc.updatedAt = new Date().toISOString();

    saveStatus.textContent = "Saving...";
    updateWordCount();
    renderDocumentList();

    clearTimeout(saveTimer);

    saveTimer = setTimeout(async function() {
        try {
            await apiRequest("/" + doc.id, {
                method: "PUT",
                body: JSON.stringify({
                    title: doc.title,
                    content: doc.content
                })
            });

            saveStatus.textContent = "All changes saved";
        } catch (error) {
            console.error("Autosave failed:", error);
            saveStatus.textContent = "Save failed";
        }
    }, 500);
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
        item.appendChild(deleteButton);

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

function openDocument(id) {
    clearTimeout(saveTimer);

    const doc = documents.find(function(item) {
        return item.id === id;
    });

    if (!doc) {
        return;
    }

    activeDocumentId = doc.id;

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

        if (currentDoc) {
            currentDoc.title =
                titleInput.value.trim() || "Untitled document";

            currentDoc.content = editor.innerHTML;

            await apiRequest("/" + currentDoc.id, {
                method: "PUT",
                body: JSON.stringify({
                    title: currentDoc.title,
                    content: currentDoc.content
                })
            });
        }

        const newDoc = await apiRequest("", {
            method: "POST",
            body: JSON.stringify({
                title: "Untitled document",
                content: "<h1>Untitled document</h1><p>Start typing here...</p>"
            })
        });

        documents.unshift(newDoc);
        activeDocumentId = newDoc.id;

        localStorage.setItem(ACTIVE_KEY, activeDocumentId);

        renderDocumentList();
        openDocument(newDoc.id);

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

// Save the text selection before interacting with dropdowns
let savedRange = null;

editor.addEventListener("mouseup", saveEditorSelection);
editor.addEventListener("keyup", saveEditorSelection);

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
    if (!savedRange) return;

    editor.focus();

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(savedRange);
}

// Text style dropdown
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

// Font size dropdown
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
// ======================================
// EVENT LISTENERS
// ======================================

editor.addEventListener("input", markAsEdited);

titleInput.addEventListener("input", markAsEdited);

newDocumentButton.addEventListener("click", newDocument);

shareButton.addEventListener("click", function() {
    alert(
        "Sharing and permissions will be added when we build the backend."
    );
});


// ======================================
// START APPLICATION
// ======================================

loadDocuments();