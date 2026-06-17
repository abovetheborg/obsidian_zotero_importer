<%*
const paper = await tp.user.zotero_picker(tp);
if (!paper) return;

if (paper.citekey) {
    try {
        await tp.file.rename(`@${paper.citekey}`);
    } catch (err) {
        // If destination exists or rename fails, fallback to a unique name
        const safeName = `@${paper.citekey}-${tp.date.now("YYYYMMDD-HHmmss")}`;
        await tp.file.rename(safeName);
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
title: <% paper.title %>
citekey: <% paper.citekey %>
collections: <% paper.collections.join(", ") %>
authors: <% paper.authors %>
year: <% paper.year %>
journal: <% paper.journal %>
doi: <% paper.doi %>
url: <% paper.url %>
type: <% paper.type %>
imported_date: <% tp.date.now("YYYY-MM-DD HH:mm:ss") %>
zotero_link: <% paper.zoteroLink %>
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

---
**Debug: raw Zotero data**
```json
<% JSON.stringify({notes: paper.notes || [], highlights: paper.highlights || []}, null, 2) %>
```
