const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 3000;

app.use(cors({
    origin: [
        "http://127.0.0.1:5500",
        "http://localhost:5500"
    ]
}));

app.use(express.json());

app.get("/", (req, res) => {
    res.send("Google Docs Clone Backend is running!");
});

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        message: "Backend is working successfully!"
    });
});
const documentRoutes = require("./routes/docroutes");

app.use("/api/documents", documentRoutes);
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});