
const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
    {
        owner: { type: String, index: true },
        permissions: {
            type: [new mongoose.Schema({
                email: { type: String, required: true, lowercase: true },
                role: { type: String, enum: ['viewer', 'editor'], required: true }
            }, { _id: false })],
            default: []
        },
        title: {
            type: String,
            required: true,
            default: "Untitled document",
            trim: true
        },

        content: {
            type: String,
            default: ""
        }
    },
    {
        timestamps: true,
        toJSON: {
            virtuals: true,
            transform: function (doc, ret) {
                ret.id = ret._id.toString();
                delete ret._id;
                delete ret.__v;
                return ret;
            }
        }
    }
);

module.exports = mongoose.model("Document", documentSchema);
