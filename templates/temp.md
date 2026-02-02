<%*
const paper = await tp.user.zotero_picker(tp);
if (!paper) return;
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

## Abstract
<% paper.abstract %>


