const express = require("express");
const router = express.Router();

// Temporary storage (resets when the server restarts)
let documents = [];

// GET: Fetch all documents
router.get("/", (req, res) => {
    res.json(documents);
});

// POST: Create a document
router.post("/", (req, res) => {
    const { title, content } = req.body;

    const document = {
        id: Date.now().toString(),
        title: title || "Untitled document",
        content: content || "",
        updatedAt: new Date()
    };

    documents.push(document);

    res.status(201).json(document);
});

// GET: Fetch one document by ID
router.get("/:id", (req, res) => {
    const document = documents.find(
        doc => doc.id === req.params.id
    );

    if (!document) {
        return res.status(404).json({
            message: "Document not found"
        });
    }

    res.json(document);
});

// PUT: Update a document
router.put("/:id", (req, res) => {
    const document = documents.find(
        doc => doc.id === req.params.id
    );

    if (!document) {
        return res.status(404).json({
            message: "Document not found"
        });
    }

    document.title = req.body.title ?? document.title;
    document.content = req.body.content ?? document.content;
    document.updatedAt = new Date();

    res.json(document);
});

// DELETE: Delete a document
router.delete("/:id", (req, res) => {
    const originalLength = documents.length;

    documents = documents.filter(
        doc => doc.id !== req.params.id
    );

    if (documents.length === originalLength) {
        return res.status(404).json({
            message: "Document not found"
        });
    }

    res.json({
        message: "Document deleted successfully"
    });
});

module.exports = router;