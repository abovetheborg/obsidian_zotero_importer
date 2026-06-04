<%*
const paper = await tp.user.zotero_picker(tp);
if (!paper) return;

const colorMap = {
    "#5fb236": "I am in agreement",
    "#ffd400": "Interesting",
    "#e56eee": "Data",
    "#f19837": "Definition",
    "#ff6666": "I disagree",
    "#a28ae5": "I am confused"
};

const highlightsMd = paper.highlights && paper.highlights.length > 0
    ? paper.highlights.slice().reverse().map((highlight) => {
        const pageInfo = highlight.page ? ` - ***(page ${highlight.page})***` : "";
        const noteText = highlight.note ? highlight.note.split('\n').map(line => `> ${line}`).join('\n') : "> __";
        const colorText = colorMap[highlight.color] || highlight.color || "Color";
        return `> [!quote] ${colorText}
> **${highlight.text}**${pageInfo}
${noteText}`;
    }).join("\n\n")
    : "_No highlights found._";
-%>
---
citekey: <% paper.citekey %>
collections: <% paper.collections.join(", ") %>
authors: <% paper.authors %>
year: <% paper.year %>
journal: <% paper.journal %>
doi: <% paper.doi %>
url: <% paper.url %>
type: <% paper.type %>
---
> [!info] Metadata
> - **Authors**: <% paper.authors %>
> - **Year**: <% paper.year %>
> - **Journal**: <% paper.journal %> (<% paper.year %>)
> - **DOI**: <% paper.doi %>
> - **Tags**: <% paper.collections.map(c => "#" + c.replace(/ /g, "_")).join(" ") %>
> - **Link**: [Zotero](<% paper.zoteroLink %>) | [DOI](https://doi.org/<% paper.doi %>)

## Highlights
<% highlightsMd %>

## Abstract
<% paper.abstract %>


