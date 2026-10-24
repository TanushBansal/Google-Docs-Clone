
/* ======================================
   GOOGLE DOCS CLONE - DOCUMENT MANAGER
====================================== */

const API_URL = "/api/documents";
const ACTIVE_KEY = "myDocsActiveDocument";

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
        throw new Error(data?.message || `API error: ${response.status}`);
    }

    return data;
}

/* ======================================
   DOM ELEMENTS
====================================== */

const editor = document.getElementById("editor");
const titleInput = document.getElementById("document-title");
const saveStatus = document.getElementById("save-status");
const wordCount = document.getElementById("word-count");

const blockFormat = document.getElementById("block-format");
const fontSize = document.getElementById("font-size");
const fontFamily = document.getElementById("font-family");

const undoButton = document.getElementById("undo-btn");
const redoButton = document.getElementById("redo-btn");
const shareButton = document.getElementById("share-btn");
const newDocumentButton = document.getElementById("new-document-btn");
const documentList = document.getElementById("document-list");

const textColorBtn = document.getElementById("text-color-btn");
const textColorInput = document.getElementById("text-color");
const textColorIndicator = document.getElementById("text-color-indicator");

const highlightBtn = document.getElementById("highlight-btn");
const highlightInput = document.getElementById("highlight-color");
const highlightIndicator = document.getElementById("highlight-indicator");

const retrySaveButton = document.getElementById("retry-save");
const accessRole = document.getElementById("access-role");

/* ======================================
   APPLICATION STATE
====================================== */

let documents = [];
let activeDocumentId = null;
let saveTimer = null;
let pendingSave = Promise.resolve();
const dirtyDocuments = new Set();

let savedRange = null;
let highlightMode = false;
let currentTextColor = textColorInput?.value || "#000000";
let currentHighlightColor = highlightInput?.value || "#ffff00";

const fontSizes = {
    "2": "10px",
    "3": "12px",
    "4": "14px",
    "5": "18px",
    "6": "24px",
    "7": "36px"
};

/* ======================================
   DOCUMENT HELPERS
====================================== */

function getActiveDocument() {
    return documents.find(doc => doc.id === activeDocumentId);
}

function saveAllDocuments() {
    localStorage.setItem(ACTIVE_KEY, activeDocumentId || "");
}

function updateWordCount() {
    if (!wordCount || !editor) return;

    const text = editor.innerText.trim();
    const count = text ? text.split(/\s+/).length : 0;

    wordCount.textContent = `Words: ${count}`;
}

/* ======================================
   AUTOSAVE
====================================== */

function markAsEdited() {
    const doc = getActiveDocument();

    if (!doc || doc.role === "viewer") return;

    doc.title = titleInput.value.trim() || "Untitled document";
    doc.content = editor.innerHTML;
    doc.updatedAt = new Date().toISOString();

    dirtyDocuments.add(doc.id);

    if (saveStatus) saveStatus.textContent = "Saving...";

    updateWordCount();
    renderDocumentList();
    saveAllDocuments();

    clearTimeout(saveTimer);

    saveTimer = setTimeout(() => {
        persistDocument(doc).catch(error => {
            console.error("Autosave failed:", error);
        });
    }, 500);
}

function persistDocument(doc) {
    if (!doc || doc.role === "viewer" || !dirtyDocuments.has(doc.id)) {
        return pendingSave;
    }

    const snapshot = {
        title: doc.title,
        content: doc.content
    };

    const task = pendingSave.catch(() => {}).then(async () => {
        try {
            await apiRequest("/" + encodeURIComponent(doc.id), {
                method: "PUT",
                body: JSON.stringify(snapshot)
            });

            if (
                doc.title === snapshot.title &&
                doc.content === snapshot.content
            ) {
                dirtyDocuments.delete(doc.id);
            }

            if (activeDocumentId === doc.id && saveStatus) {
                saveStatus.textContent = dirtyDocuments.has(doc.id)
                    ? "Saving..."
                    : "All changes saved";
            }
        } catch (error) {
            if (activeDocumentId === doc.id && saveStatus) {
                saveStatus.textContent =
                    "Save failed — keep this tab open and retry";
            }

            throw error;
        }
    });

    pendingSave = task;
    return task;
}

/* ======================================
   LOAD DOCUMENTS
====================================== */

async function loadDocuments() {
    try {
        if (saveStatus) saveStatus.textContent = "Loading documents...";

        documents = await apiRequest();

        const savedActiveId =
            new URLSearchParams(location.search).get("doc") ||
            localStorage.getItem(ACTIVE_KEY);

        if (!documents.length) {
            await newDocument();
            return;
        }

        activeDocumentId = documents.some(
            doc => doc.id === savedActiveId
        )
            ? savedActiveId
            : documents[0].id;

        renderDocumentList();
        await openDocument(activeDocumentId);
    } catch (error) {
        console.error("Could not load documents:", error);

        if (saveStatus) {
            saveStatus.textContent = "Could not load documents";
        }

        alert("Could not load documents. Check the backend and console.");
    }
}

window.loadDocuments = loadDocuments;

/* ======================================
   SIDEBAR
====================================== */

function renderDocumentList() {
    if (!documentList) return;

    documentList.innerHTML = "";

    documents.forEach(doc => {
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
        name.title = name.textContent;

        item.append(icon, name);

        if (doc.role === "owner") {
            const deleteButton = document.createElement("button");
            deleteButton.className = "delete-document-btn";
            deleteButton.textContent = "×";
            deleteButton.title = "Delete document";
            deleteButton.setAttribute("aria-label", "Delete document");

            deleteButton.addEventListener("click", event => {
                event.stopPropagation();
                deleteDocument(doc.id);
            });

            item.appendChild(deleteButton);
        }

        item.addEventListener("click", () => {
            openDocument(doc.id).catch(console.error);
        });

        documentList.appendChild(item);
    });
}

/* ======================================
   OPEN DOCUMENT
====================================== */

async function openDocument(id) {
    clearTimeout(saveTimer);

    // Save the previous document before changing the active ID.
    const previousDoc = getActiveDocument();

    try {
        if (previousDoc) {
            await persistDocument(previousDoc);
        }
    } catch (error) {
        console.error("Could not save previous document:", error);
        return;
    }

    try {
        const fetchedDoc = await apiRequest(
            "/" + encodeURIComponent(id)
        );

        const index = documents.findIndex(doc => doc.id === id);

        if (index === -1) {
            documents.push(fetchedDoc);
        } else {
            documents[index] = {
                ...documents[index],
                ...fetchedDoc
            };
        }

        const doc = documents.find(item => item.id === id);
        if (!doc) return;

        activeDocumentId = doc.id;
        savedRange = null;

        const canEdit = doc.role !== "viewer";

        editor.contentEditable = String(canEdit);
        titleInput.disabled = !canEdit;

        document.querySelectorAll(
            ".toolbar button, .toolbar select, .toolbar input"
        ).forEach(control => {
            control.disabled = !canEdit;
        });

        if (shareButton) {
            shareButton.disabled = doc.role !== "owner";
        }

        if (accessRole) {
            accessRole.textContent = doc.role || "owner";
        }

        history.replaceState(
            null,
            "",
            "?doc=" + encodeURIComponent(doc.id)
        );

        titleInput.value = doc.title || "Untitled document";
        editor.innerHTML = doc.content || "";

        highlightMode = false;
        updateHighlightButton();
        updateBlockFormat();

        saveAllDocuments();
        renderDocumentList();
        updateWordCount();
        updateFormattingButtons();

        if (saveStatus) {
            saveStatus.textContent = dirtyDocuments.has(doc.id)
                ? "Unsaved changes"
                : "All changes saved";
        }
    } catch (error) {
        console.error("Could not open document:", error);

        if (saveStatus) {
            saveStatus.textContent = error.message;
        }
    }
}

/* ======================================
   CREATE DOCUMENT
====================================== */

async function newDocument() {
    try {
        clearTimeout(saveTimer);

        const currentDoc = getActiveDocument();

        if (currentDoc) {
            await persistDocument(currentDoc);
        }

        const newDoc = await apiRequest("", {
            method: "POST",
            body: JSON.stringify({
                title: "Untitled document",
                content: ""
            })
        });

        if (!newDoc || !newDoc.id) {
            throw new Error("Server did not return a document ID.");
        }

        documents.unshift(newDoc);

        await openDocument(newDoc.id);
    } catch (error) {
        console.error("Could not create document:", error);

        if (saveStatus) saveStatus.textContent = "Create failed";

        alert("Could not create the document. Check the backend.");
    }
}

/* ======================================
   DELETE DOCUMENT
====================================== */

async function deleteDocument(id) {
    const doc = documents.find(item => item.id === id);

    if (!doc || doc.role !== "owner") return;

    if (!confirm("Are you sure you want to delete this document?")) {
        return;
    }

    try {
        if (activeDocumentId === id) {
            clearTimeout(saveTimer);
            await persistDocument(doc);
        }

        await apiRequest("/" + encodeURIComponent(id), {
            method: "DELETE"
        });

        dirtyDocuments.delete(id);
        documents = documents.filter(item => item.id !== id);

        if (activeDocumentId === id) {
            if (documents.length) {
                await openDocument(documents[0].id);
            } else {
                activeDocumentId = null;
                await newDocument();
                return;
            }
        } else {
            renderDocumentList();
        }

        saveAllDocuments();

        if (saveStatus) saveStatus.textContent = "Document deleted";
    } catch (error) {
        console.error("Delete failed:", error);
        alert("Could not delete the document.");
    }
}

/* ======================================
   SAVE AND RESTORE SELECTION
====================================== */

function saveEditorSelection() {
    const selection = window.getSelection();

    if (!selection || !selection.rangeCount) return;

    const range = selection.getRangeAt(0);

    if (
        editor.contains(range.startContainer) &&
        editor.contains(range.endContainer)
    ) {
        savedRange = range.cloneRange();
    }
}

function restoreEditorSelection() {
    if (!savedRange) return;

    editor.focus();

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(savedRange);
}

/* ======================================
   FORMATTING BUTTONS
====================================== */

document.querySelectorAll("[data-command]").forEach(button => {
    button.addEventListener("mousedown", event => {
        event.preventDefault();
        saveEditorSelection();
    });

    button.addEventListener("click", () => {
        if (editor.contentEditable !== "true") return;

        restoreEditorSelection();

        document.execCommand(
            button.dataset.command,
            false,
            null
        );

        markAsEdited();
        updateFormattingButtons();
    });
});

editor.addEventListener("mouseup", saveEditorSelection);
editor.addEventListener("keyup", saveEditorSelection);

/* ======================================
   TEXT STYLE DROPDOWN
====================================== */

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
    if (!blockFormat) return;

    const block = getCurrentBlock();

    if (block) {
        blockFormat.value = block.tagName.toLowerCase();
    } else if (editor.contains(document.activeElement)) {
        blockFormat.value = "p";
    }
}

if (blockFormat) {
    blockFormat.addEventListener("mousedown", saveEditorSelection);

    blockFormat.addEventListener("change", () => {
        restoreEditorSelection();

        document.execCommand("formatBlock", false, blockFormat.value);

        markAsEdited();
        updateBlockFormat();
    });
}

editor.addEventListener("keydown", event => {
    if (event.key !== "Enter" || event.shiftKey) return;

    const previousBlock = getCurrentBlock();

    if (!previousBlock || !/^H[1-3]$/.test(previousBlock.tagName)) {
        return;
    }

    setTimeout(() => {
        const currentBlock = getCurrentBlock();

        if (currentBlock && /^H[1-3]$/.test(currentBlock.tagName)) {
            document.execCommand("formatBlock", false, "p");
            markAsEdited();
        }

        updateBlockFormat();
    }, 0);
});

editor.addEventListener("click", updateBlockFormat);
editor.addEventListener("keyup", updateBlockFormat);
editor.addEventListener("mouseup", updateBlockFormat);
editor.addEventListener("input", updateBlockFormat);

document.addEventListener("selectionchange", () => {
    if (editor.contains(document.activeElement)) {
        updateBlockFormat();
    }
});

/* ======================================
   FONT FAMILY
====================================== */

if (fontFamily) {
    fontFamily.addEventListener("mousedown", saveEditorSelection);

    fontFamily.addEventListener("change", () => {
        restoreEditorSelection();

        document.execCommand("fontName", false, fontFamily.value);

        markAsEdited();
    });
}

/* ======================================
   FONT SIZE
====================================== */

if (fontSize) {
    fontSize.addEventListener("mousedown", saveEditorSelection);

    fontSize.addEventListener("change", () => {
        restoreEditorSelection();

        document.execCommand("fontSize", false, fontSize.value);

        markAsEdited();
    });
}

/* ======================================
   TEXT COLOUR
====================================== */

if (textColorBtn && textColorInput) {
    textColorBtn.addEventListener("mousedown", event => {
        event.preventDefault();
        saveEditorSelection();
    });

    textColorBtn.addEventListener("click", () => {
        saveEditorSelection();
        textColorInput.click();
    });

    textColorInput.addEventListener("input", () => {
        currentTextColor = textColorInput.value;

        if (textColorIndicator) {
            textColorIndicator.style.backgroundColor = currentTextColor;
        }
    });

    textColorInput.addEventListener("change", () => {
        restoreEditorSelection();

        document.execCommand("foreColor", false, currentTextColor);

        markAsEdited();
        saveEditorSelection();
    });
}

/* ======================================
   HIGHLIGHT
====================================== */

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

/* ======================================
   UNDO AND REDO
====================================== */

if (undoButton) {
    undoButton.addEventListener("mousedown", event => event.preventDefault());

    undoButton.addEventListener("click", () => {
        editor.focus();
        document.execCommand("undo");
        markAsEdited();
    });
}

if (redoButton) {
    redoButton.addEventListener("mousedown", event => event.preventDefault());

    redoButton.addEventListener("click", () => {
        editor.focus();
        document.execCommand("redo");
        markAsEdited();
    });
}

/* ======================================
   ACTIVE FORMATTING BUTTONS
====================================== */

function updateFormattingButtons() {
    ["bold", "italic", "underline"].forEach(command => {
        const button = document.querySelector(
            `[data-command="${command}"]`
        );

        if (!button) return;

        button.classList.toggle(
            "active",
            document.queryCommandState(command)
        );
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

/* ======================================
   TITLE AND EDITOR INPUT
====================================== */

if (titleInput) {
    titleInput.addEventListener("input", markAsEdited);
}

editor.addEventListener("input", markAsEdited);

if (newDocumentButton) {
    newDocumentButton.addEventListener("click", newDocument);
}

/* ======================================
   SHARING
====================================== */

if (shareButton) {
    shareButton.addEventListener("click", () => {
        if (typeof showSharing === "function") {
            showSharing().catch(error => alert(error.message));
        }
    });
}

/* ======================================
   RETRY SAVE
====================================== */

if (retrySaveButton) {
    retrySaveButton.addEventListener("click", () => {
        persistDocument(getActiveDocument()).catch(error => {
            alert(error.message);
        });
    });
}

/* ======================================
   WARN BEFORE LEAVING UNSAVED CHANGES
====================================== */

window.addEventListener("beforeunload", event => {
    if (dirtyDocuments.size > 0) {
        event.preventDefault();
        event.returnValue = "";
    }
});

/* ======================================
   START APPLICATION
====================================== */

if (typeof startAuthentication === "function") {
    startAuthentication();
} else {
    console.error("startAuthentication() was not found. Check auth.js.");
}
