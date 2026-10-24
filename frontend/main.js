
import './style.css';

import { Editor, Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import FontFamily from '@tiptap/extension-font-family';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
const FontSize = Extension.create({
    name: 'fontSize',

    addGlobalAttributes() {
        return [
            {
                types: ['textStyle'],
                attributes: {
                    fontSize: {
                        default: null,

                        parseHTML: element =>
                            element.style.fontSize || null,

                        renderHTML: attributes => {
                            if (!attributes.fontSize) {
                                return {};
                            }

                            return {
                                style: `font-size: ${attributes.fontSize}`,
                            };
                        },
                    },
                },
            },
        ];
    },
});

const editorElement = document.getElementById('editor');

let resolveEditorReady;

window.tiptapEditorReady = new Promise((resolve) => {
    resolveEditorReady = resolve;
});

if (editorElement) {
    const editor = new Editor({
        element: editorElement,
        extensions: [
    StarterKit,
    TextStyle,
    FontSize,
    Color,
    Highlight.configure({ multicolor: true }),
    FontFamily,
    TextAlign.configure({
        types: ['heading', 'paragraph'],
    })
],
        content: '',
        editorProps: {
            attributes: {
                class: 'tiptap',
                spellcheck: 'true',
                role: 'textbox',
                'aria-multiline': 'true',
            },
        },
        onUpdate: ({ editor }) => {
            if (typeof window.handleTiptapUpdate === 'function') {
                window.handleTiptapUpdate(editor.getHTML());
            }
        },
        onSelectionUpdate: ({ editor }) => {
            if (typeof window.handleTiptapSelectionUpdate === 'function') {
                window.handleTiptapSelectionUpdate(editor);
            }
        },
    });

    window.tiptapEditor = editor;
    resolveEditorReady(editor);
} else {
    resolveEditorReady(null);
}
