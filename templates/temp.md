<%*
const paper = await tp.user.zotero_picker(tp);
if (!paper) return;

if (paper.citekey) {
    await tp.file.rename(`@${paper.citekey}`);
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
        return `> [!${callout}] ${colorText}
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

# Abstract
<% paper.abstract %>

# Highlights
<% highlightsMd %>
