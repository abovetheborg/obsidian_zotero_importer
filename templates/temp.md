<%*
const paper = await tp.user.zotero_picker(tp);
if (!paper) return;

const targetFolder = "3000_Litterature_Notes/3200_Zotero";
try {
    if (typeof app !== "undefined" && app.vault?.createFolder) {
        await app.vault.createFolder(targetFolder);
    }
} catch (err) {
    // Folder creation is best-effort; Templater rename may still work if the folder exists.
}

const activeFile = typeof app !== "undefined" && app.workspace ? app.workspace.getActiveFile() : null;
if (paper.citekey && activeFile) {
    try {
        await app.vault.createFolder(targetFolder);
    } catch (err) {
        // ignore if folder already exists or creation fails
    }

    const targetPath = `${targetFolder}/@${paper.citekey}.md`;
    try {
        await app.vault.rename(activeFile, targetPath);
    } catch (err) {
        const safeName = `${targetFolder}/@${paper.citekey}-${tp.date.now("YYYYMMDD-HHmmss")}.md`;
        try {
            await app.vault.rename(activeFile, safeName);
        } catch (err2) {
            // fallback: leave the file where it is
        }
    }
}

const colorMap = {
    "#5fb236": "I am in agreement",
    "#ffd400": "Interesting",
    "#e56eee": "Data",
    "#f19837": "Definition",
    "#ff6666": "I disagree",
    "#a28ae5": "I am confused"
};

const calloutMap = {
    "#5fb236": "agree",
    "#ff6666": "disagree",
    "#ffd400": "interesting",
    "#e56eee": "data",
    "#a28ae5": "confused",
    "#f19837": "definition"
};

const sanitizePropertyValue = (value) => {
    const text = String(value ?? "")
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
        .replace(/\r?\n+/g, " ")
        .trim();
    const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `"${escaped}"`;
};

const highlightsMd = paper.highlights && paper.highlights.length > 0
    ? paper.highlights.slice().reverse().map((highlight) => {
        const pageInfo = highlight.page ? ` - ***(page ${highlight.page})***` : "";
        const noteText = highlight.note ? highlight.note.split('\n').map(line => `> ${line}`).join('\n') : "> __";
        const colorText = colorMap[highlight.color] || highlight.color || "Color";
        const callout = calloutMap[highlight.color] || "quote";
        const imagePart = highlight.imagePath ? `\n\n![](${highlight.imagePath})` : (highlight.imageError ? `\n\n_Image error: ${highlight.imageError}_` : "");
        return `> [!${callout}] ${colorText}
> **${highlight.text}**${pageInfo}
${noteText}${imagePart}`;
    }).join("\n\n")
    : "_No highlights found._";
-%>
---
Gov_type: litterature_notes
title: <% sanitizePropertyValue(paper.title) %>
citekey: <% sanitizePropertyValue(paper.citekey) %>
collections: <% sanitizePropertyValue((paper.collections || []).join(", ")) %>
authors: <% sanitizePropertyValue(paper.authors) %>
year: <% sanitizePropertyValue(paper.year) %>
journal: <% sanitizePropertyValue(paper.journal) %>
doi: <% sanitizePropertyValue(paper.doi) %>
url: <% sanitizePropertyValue(paper.url) %>
type: <% sanitizePropertyValue(paper.type) %>
imported_date: <% sanitizePropertyValue(tp.date.now("YYYY-MM-DD HH:mm:ss")) %>
zotero_link: <% sanitizePropertyValue(paper.zoteroLink) %>
---

# Abstract
<% paper.abstract %>

# Highlights
<% highlightsMd %>

# Notes
<%*
const notesMd = paper.notes && paper.notes.length > 0
    ? paper.notes.slice().map((n, i) => {
        const content = n.content || '';
        return `## Note ${i+1}\n\n${content}`;
    }).join('\n\n')
    : "_No notes found._";
%>
<% notesMd %>
