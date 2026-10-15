// Helper: dump text from a PDF using only Node built-ins.
// Usage: node tools/pdf-extract.js <file.pdf>
// Writes <file>.extracted.txt next to the input.
const fs = require("fs");
const zlib = require("zlib");

const file = process.argv[2];
if (!file) {
    console.error("usage: node pdf-extract.js <file.pdf>");
    process.exit(1);
}

const buffer = fs.readFileSync(file);

// Collect every FlateDecode stream in the file.
const raw = buffer.toString("latin1");
const streamRegex = /stream\r?\n/g;
const chunks = [];
let match;
while ((match = streamRegex.exec(raw)) !== null) {
    const start = match.index + match[0].length;
    const end = raw.indexOf("endstream", start);
    if (end === -1) continue;
    chunks.push(buffer.subarray(start, end));
}

let text = "";
for (const chunk of chunks) {
    let inflated;
    try {
        inflated = zlib.inflateSync(chunk);
    } catch {
        continue;
    }
    const body = inflated.toString("latin1");
    if (!/(Tj|TJ)/.test(body)) continue;

    // Extract literal strings and hex strings from text-showing operators.
    const tokenRegex = /\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]+>|\bTd\b|\bTD\b|\bT\*\b|\bTJ\b|\bTj\b/g;
    let token;
    const parts = [];
    while ((token = tokenRegex.exec(body)) !== null) {
        const value = token[0];
        if (value.startsWith("(")) {
            parts.push(value.slice(1, -1)
                .replace(/\\([nrtbf()\\])/g, (_, c) => ({ n: "\n", r: "\r", t: "\t", b: "", f: "" }[c] ?? c))
                .replace(/\\([0-7]{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8))));
        } else if (value.startsWith("<")) {
            const hex = value.slice(1, -1).replace(/\s+/g, "");
            let decoded = "";
            for (let i = 0; i + 1 < hex.length; i += 2) {
                const code = parseInt(hex.substr(i, 2), 16);
                if (code >= 32 && code < 127) decoded += String.fromCharCode(code);
            }
            if (decoded) parts.push(decoded);
        } else if (value === "Td" || value === "TD" || value === "T*") {
            parts.push("\n");
        }
    }
    const page = parts.join("").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n");
    if (page.trim()) text += page + "\n\n===== PAGE BREAK =====\n\n";
}

fs.writeFileSync(file.replace(/\.pdf$/i, ".extracted.txt"), text, "utf8");
console.log("wrote", file.replace(/\.pdf$/i, ".extracted.txt"), "chars:", text.length);
