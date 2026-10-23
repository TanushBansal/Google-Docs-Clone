
const express = require("express");
const mongoose = require("mongoose");
const Document = require("../models/Document");

const router = express.Router();

// GET: Fetch all documents
router.get("/", async function (req, res) {
    try {
        const documents = await Document.find().sort({
            updatedAt: -1
        });

        res.json(documents);
    } catch (error) {
        res.status(500).json({
            message: "Failed to fetch documents"
        });
    }
});

// POST: Create a new document
router.post("/", async function (req, res) {
    try {
        const document = await Document.create({
            title: req.body.title || "Untitled document",
            content: req.body.content || ""
        });

        res.status(201).json(document);
    } catch (error) {
        res.status(500).json({
            message: "Failed to create document"
        });
    }
});

// GET: Fetch one document by ID
router.get("/:id", async function (req, res) {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({
                message: "Invalid document ID"
            });
        }

        const document = await Document.findById(req.params.id);

        if (!document) {
            return res.status(404).json({
                message: "Document not found"
            });
        }

        res.json(document);
    } catch (error) {
        res.status(500).json({
            message: "Failed to fetch document"
        });
    }
});

// PUT: Update a document
router.put("/:id", async function (req, res) {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({
                message: "Invalid document ID"
            });
        }

        const updates = {};

        if (typeof req.body.title === "string") {
            updates.title = req.body.title;
        }

        if (typeof req.body.content === "string") {
            updates.content = req.body.content;
        }

        const document = await Document.findByIdAndUpdate(
            req.params.id,
            { $set: updates },
            {
                new: true,
                runValidators: true
            }
        );

        if (!document) {
            return res.status(404).json({
                message: "Document not found"
            });
        }

        res.json(document);
    } catch (error) {
        res.status(500).json({
            message: "Failed to update document"
        });
    }
});

// DELETE: Delete a document
router.delete("/:id", async function (req, res) {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({
                message: "Invalid document ID"
            });
        }

        const document = await Document.findByIdAndDelete(
            req.params.id
        );

        if (!document) {
            return res.status(404).json({
                message: "Document not found"
            });
        }

        res.json({
            message: "Document deleted successfully",
            id: document.id
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to delete document"
        });
    }
});

module.exports = router;
