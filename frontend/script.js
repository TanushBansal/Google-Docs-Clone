
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

const fontSizes = {
    "2": "10px",
    "3": "12px",
    "4": "14px",
    "5": "18px",
    "6": "24px",
    "7": "36px"
};

/* ======================================
   APPLICATION STATE
====================================== */

let documents = [];
let activeDocumentId = null;
let saveTimer = null;
let pendingSave = Promise.resolve();
const dirtyDocuments = new Set();

let highlightMode = false;
let currentHighlightColor = highlightInput?.value || "#ffff00";
let currentTextColor = textColorInput?.value || "#000000";

function getTiptapEditor() {
    return window.tiptapEditor || null;
}

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
    const tiptap = getTiptapEditor();
    if (!wordCount) return;

    const text = tiptap ? tiptap.getText().trim() : "";
    const count = text ? text.split(/\s+/).length : 0;

    wordCount.textContent = `Words: ${count}`;
}

/* ======================================
   AUTOSAVE
====================================== */

function markAsEdited() {
    const doc = getActiveDocument();
    const tiptap = getTiptapEditor();

    if (!doc || !tiptap || doc.role === "viewer") return;

    doc.title = titleInput.value.trim() || "Untitled document";
    doc.content = tiptap.getHTML();
    doc.updatedAt = new Date().toISOString();

    dirtyDocuments.add(doc.id);
    saveStatus.textContent = "Saving...";

    updateWordCount();
    renderDocumentList();

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

            if (activeDocumentId === doc.id) {
                saveStatus.textContent = dirtyDocuments.has(doc.id)
                    ? "Saving..."
                    : "All changes saved";
            }
        } catch (error) {
            if (activeDocumentId === doc.id) {
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
        await window.tiptapEditorReady;

        if (!getTiptapEditor()) {
            throw new Error("Tiptap could not initialize.");
        }

        saveStatus.textContent = "Loading documents...";
        documents = await apiRequest();

        const urlId = new URLSearchParams(location.search).get("doc");
        const savedId = urlId || localStorage.getItem(ACTIVE_KEY);

        if (documents.length === 0) {
            await newDocument();
            return;
        }

        activeDocumentId = documents.some(doc => doc.id === savedId)
            ? savedId
            : documents[0].id;

        renderDocumentList();
        await openDocument(activeDocumentId);
    } catch (error) {
        console.error("Could not load documents:", error);
        saveStatus.textContent = "Could not load documents";
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
    await window.tiptapEditorReady;

    const tiptap = getTiptapEditor();

    if (!tiptap) {
        saveStatus.textContent = "The editor could not initialize.";
        return;
    }

    clearTimeout(saveTimer);

    try {
        await persistDocument(getActiveDocument());
    } catch (error) {
        console.error("Could not save the previous document:", error);
        return;
    }

    const doc = documents.find(item => item.id === id);
    if (!doc) return;

    try {
        Object.assign(
            doc,
            await apiRequest("/" + encodeURIComponent(doc.id))
        );
    } catch (error) {
        saveStatus.textContent = error.message;
        return;
    }

    activeDocumentId = doc.id;

    const canEdit = doc.role !== "viewer";
    tiptap.setEditable(canEdit);

    titleInput.disabled = !canEdit;

    document.querySelectorAll(
        ".toolbar button, .toolbar select, .toolbar input"
    ).forEach(control => {
        control.disabled = !canEdit;
    });

    if (shareButton) {
        shareButton.disabled = doc.role !== "owner";
    }

    const roleLabel = document.getElementById("access-role");
    if (roleLabel) roleLabel.textContent = doc.role || "owner";

    history.replaceState(
        null,
        "",
        "?doc=" + encodeURIComponent(doc.id)
    );

    titleInput.value = doc.title || "Untitled document";

    // Reset the temporary highlight mode when switching documents.
    highlightMode = false;
    updateHighlightButton();

    tiptap.commands.setContent(doc.content || "", {
        emitUpdate: false
    });

    saveAllDocuments();
    renderDocumentList();
    updateWordCount();
    updateToolbarState();

    saveStatus.textContent = dirtyDocuments.has(doc.id)
        ? "Unsaved changes"
        : "All changes saved";
}

/* ======================================
   CREATE DOCUMENT
====================================== */

async function newDocument() {
    try {
        clearTimeout(saveTimer);
        await persistDocument(getActiveDocument());

        const doc = await apiRequest("", {
            method: "POST",
            body: JSON.stringify({
                title: "Untitled document",
                content: ""
            })
        });

        documents.unshift(doc);
        activeDocumentId = doc.id;

        saveAllDocuments();
        renderDocumentList();
        await openDocument(doc.id);
    } catch (error) {
        console.error("Could not create document:", error);
        saveStatus.textContent = "Create failed";
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
                activeDocumentId = documents[0].id;
                saveAllDocuments();
                renderDocumentList();
                await openDocument(activeDocumentId);
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
        alert("Could not delete the document.");
    }
}

/* ======================================
   FORMATTING TOOLBAR
====================================== */

function runTiptapCommand(callback) {
    const tiptap = getTiptapEditor();

    if (!tiptap || !tiptap.isEditable) return;

    callback(tiptap);
}

function updateToolbarState() {
    const tiptap = getTiptapEditor();
    if (!tiptap) return;

    document.querySelectorAll("[data-command]").forEach(button => {
        const command = button.dataset.command;
        let active = false;

        if (["bold", "italic", "underline"].includes(command)) {
            active = tiptap.isActive(command);
        } else if (command === "insertUnorderedList") {
            active = tiptap.isActive("bulletList");
        } else if (command === "insertOrderedList") {
            active = tiptap.isActive("orderedList");
        } else if (command === "justifyLeft") {
            active = tiptap.isActive({ textAlign: "left" });
        } else if (command === "justifyCenter") {
            active = tiptap.isActive({ textAlign: "center" });
        } else if (command === "justifyRight") {
            active = tiptap.isActive({ textAlign: "right" });
        }

        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
    });

    if (blockFormat) {
        if (tiptap.isActive("heading", { level: 1 })) {
            blockFormat.value = "h1";
        } else if (tiptap.isActive("heading", { level: 2 })) {
            blockFormat.value = "h2";
        } else if (tiptap.isActive("heading", { level: 3 })) {
            blockFormat.value = "h3";
        } else {
            blockFormat.value = "p";
        }
    }

    const textStyle = tiptap.getAttributes("textStyle");

    if (fontSize) {
        const entry = Object.entries(fontSizes).find(
            ([, size]) => size === textStyle.fontSize
        );

        fontSize.value = entry ? entry[0] : "";
    }

    if (fontFamily && textStyle.fontFamily) {
        const exists = Array.from(fontFamily.options).some(
            option => option.value === textStyle.fontFamily
        );

        if (exists) fontFamily.value = textStyle.fontFamily;
    }

    if (highlightBtn) {
        highlightBtn.classList.toggle(
            "active",
            highlightMode || tiptap.isActive("highlight")
        );

        highlightBtn.setAttribute(
            "aria-pressed",
            String(highlightMode || tiptap.isActive("highlight"))
        );
    }
}

window.handleTiptapSelectionUpdate = updateToolbarState;
window.handleTiptapUpdate = markAsEdited;

// Standard toolbar commands
document.querySelectorAll("[data-command]").forEach(button => {
    button.addEventListener("mousedown", event => event.preventDefault());

    button.addEventListener("click", () => {
        runTiptapCommand(tiptap => {
            const chain = tiptap.chain().focus();

            switch (button.dataset.command) {
                case "bold":
                    chain.toggleBold().run();
                    break;
                case "italic":
                    chain.toggleItalic().run();
                    break;
                case "underline":
                    chain.toggleUnderline().run();
                    break;
                case "insertUnorderedList":
                    chain.toggleBulletList().run();
                    break;
                case "insertOrderedList":
                    chain.toggleOrderedList().run();
                    break;
                case "justifyLeft":
                    chain.setTextAlign("left").run();
                    break;
                case "justifyCenter":
                    chain.setTextAlign("center").run();
                    break;
                case "justifyRight":
                    chain.setTextAlign("right").run();
                    break;
            }
        });

        updateToolbarState();
    });
});

// Block format dropdown
if (blockFormat) {
    blockFormat.addEventListener("mousedown", event => event.preventDefault());

    blockFormat.addEventListener("change", () => {
        runTiptapCommand(tiptap => {
            if (blockFormat.value === "p") {
                tiptap.chain().focus().setParagraph().run();
            } else {
                const level = Number(blockFormat.value.slice(1));

                if ([1, 2, 3].includes(level)) {
                    tiptap.chain().focus().setHeading({ level }).run();
                }
            }
        });

        updateToolbarState();
    });
}

// Font family
if (fontFamily) {
    fontFamily.addEventListener("mousedown", event => event.preventDefault());

    fontFamily.addEventListener("change", () => {
        runTiptapCommand(tiptap => {
            tiptap.chain().focus().setFontFamily(fontFamily.value).run();
        });

        updateToolbarState();
    });
}

// Font size (requires the custom FontSize extension in main.js)
if (fontSize) {
    fontSize.addEventListener("mousedown", event => event.preventDefault());

    fontSize.addEventListener("change", () => {
        const size = fontSizes[fontSize.value];
        if (!size) return;

        runTiptapCommand(tiptap => {
            tiptap.chain()
                .focus()
                .setMark("textStyle", { fontSize: size })
                .run();
        });

        updateToolbarState();
    });
}

/* ======================================
   TEXT COLOUR
====================================== */

if (textColorBtn && textColorInput) {
    textColorBtn.addEventListener("mousedown", event => {
        event.preventDefault();
    });

    textColorBtn.addEventListener("click", () => {
        textColorInput.click();
    });

    textColorInput.addEventListener("input", () => {
        currentTextColor = textColorInput.value;

        if (textColorIndicator) {
            textColorIndicator.style.backgroundColor = currentTextColor;
        }
    });

    textColorInput.addEventListener("change", () => {
        runTiptapCommand(tiptap => {
            tiptap.chain().focus().setColor(currentTextColor).run();
        });

        updateToolbarState();
    });
}

/* ======================================
   HIGHLIGHT BUTTON — PRESERVED MODE
====================================== */

// Remove only the highlight mark from stored marks.
// This changes future typing at the cursor, not existing highlighted text.
function clearStoredHighlight(tiptap) {
    const { state, view } = tiptap;
    const highlightType = state.schema.marks.highlight;

    if (!highlightType) {
        console.error("Tiptap Highlight extension is missing.");
        return;
    }

    const storedMarks = state.storedMarks || state.selection.$from.marks();
    const nextMarks = storedMarks.filter(
        mark => mark.type !== highlightType
    );

    view.dispatch(state.tr.setStoredMarks(nextMarks));
}

function updateHighlightButton() {
    if (!highlightBtn) return;

    const tiptap = getTiptapEditor();
    const selectedTextIsHighlighted = tiptap
        ? tiptap.isActive("highlight")
        : false;

    highlightBtn.classList.toggle(
        "active",
        highlightMode || selectedTextIsHighlighted
    );

    highlightBtn.setAttribute(
        "aria-pressed",
        String(highlightMode || selectedTextIsHighlighted)
    );
}

if (highlightBtn && highlightInput) {
    highlightBtn.addEventListener("mousedown", event => {
        // Preserve the editor selection when the toolbar is clicked.
        event.preventDefault();
    });

    highlightBtn.addEventListener("click", () => {
        const tiptap = getTiptapEditor();
        if (!tiptap || !tiptap.isEditable) return;

        highlightMode = !highlightMode;

        if (highlightMode) {
            // Keep the last chosen colour and open the picker.
            highlightInput.click();
        } else {
            // Stop future typing from inheriting highlight.
            clearStoredHighlight(tiptap);
        }

        updateHighlightButton();
    });

    highlightInput.addEventListener("input", () => {
        currentHighlightColor = highlightInput.value;

        if (highlightIndicator) {
            highlightIndicator.style.backgroundColor =
                currentHighlightColor;
        }
    });

    highlightInput.addEventListener("change", () => {
        const tiptap = getTiptapEditor();
        if (!tiptap || !tiptap.isEditable || !highlightMode) return;

        currentHighlightColor = highlightInput.value;

        // Apply the chosen colour to a selection, or set it for typing
        // when the selection is just a cursor.
        tiptap.chain()
            .focus()
            .setHighlight({ color: currentHighlightColor })
            .run();

        markAsEdited();
        updateHighlightButton();
        updateToolbarState();
    });
}

/* ======================================
   UNDO AND REDO
====================================== */

if (undoButton) {
    undoButton.addEventListener("mousedown", event => event.preventDefault());

    undoButton.addEventListener("click", () => {
        runTiptapCommand(tiptap => {
            tiptap.chain().focus().undo().run();
        });
    });
}

if (redoButton) {
    redoButton.addEventListener("mousedown", event => event.preventDefault());

    redoButton.addEventListener("click", () => {
        runTiptapCommand(tiptap => {
            tiptap.chain().focus().redo().run();
        });
    });
}

/* ======================================
   SELECTION AND EDITOR STATE
====================================== */

document.addEventListener("selectionchange", () => {
    const tiptap = getTiptapEditor();

    if (tiptap && tiptap.isFocused) {
        updateToolbarState();
        updateHighlightButton();
    }
});

/* ======================================
   EVENT LISTENERS
====================================== */

if (titleInput) {
    titleInput.addEventListener("input", () => {
        const doc = getActiveDocument();
        if (!doc || doc.role === "viewer") return;

        doc.title = titleInput.value.trim() || "Untitled document";
        dirtyDocuments.add(doc.id);

        renderDocumentList();
        saveStatus.textContent = "Saving...";

        clearTimeout(saveTimer);

        saveTimer = setTimeout(() => {
            persistDocument(doc).catch(error => {
                console.error("Title save failed:", error);
            });
        }, 500);
    });
}

if (newDocumentButton) {
    newDocumentButton.addEventListener("click", newDocument);
}

if (shareButton) {
    shareButton.addEventListener("click", () => {
        if (typeof showSharing === "function") {
            showSharing().catch(error => alert(error.message));
        }
    });
}

const retrySaveButton = document.getElementById("retry-save");

if (retrySaveButton) {
    retrySaveButton.addEventListener("click", () => {
        persistDocument(getActiveDocument()).catch(error => {
            alert(error.message);
        });
    });
}

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
