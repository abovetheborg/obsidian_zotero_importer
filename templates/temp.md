<%*
const paper = await tp.user.zotero_picker(tp);
if (!paper) return;

const highlightsMd = paper.highlights && paper.highlights.length > 0
    ? paper.highlights.map((highlight, index) => `- **Highlight ${index + 1}**: ${highlight.text}
  - **Color**: ${highlight.color || "none"}
  - **Note**: ${highlight.note || "none"}`).join("\n")
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


