
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const documentRoutes = require("./routes/docroutes");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: [
        "http://127.0.0.1:5500",
        "http://localhost:5500"
    ]
}));

app.use(express.json());

app.use("/api/documents", documentRoutes);

async function startServer() {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error("MONGODB_URI is missing from the .env file");
        }

        await mongoose.connect(process.env.MONGODB_URI);

        console.log("Connected to MongoDB successfully!");

        app.listen(PORT, function () {
            console.log(`Server running at http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("Failed to start server:", error.message);
        process.exit(1);
    }
}

startServer();
