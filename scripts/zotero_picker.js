/**
 * zotero_picker.js
 * Fetch metadata using the Zotero Local API and Obsidian's internal suggester
 */
module.exports = async (tp) => {
    const ZOTERO_API = "http://localhost:23119/api/users/0/items";
    const ZOTERO_WEB_API_BASE = "https://api.zotero.org";
    const SECRET_CONFIG_PATH = "scripts/zotero_secrets.json";

    const loadSecretConfig = async () => {
        try {
            if (typeof app !== "undefined" && app.vault?.adapter?.exists) {
                const exists = await app.vault.adapter.exists(SECRET_CONFIG_PATH);
                if (!exists) return {};
                const text = await app.vault.adapter.read(SECRET_CONFIG_PATH);
                return JSON.parse(text);
            }
        } catch (error) {
            console.warn("Unable to load Zotero secret config:", error);
        }
        return {};
    };

    const secretConfig = await loadSecretConfig();
    const ZOTERO_WEB_USER_ID = secretConfig.webUserId || ""; // Set this in scripts/zotero_secrets.json instead of committing to git.
    const ZOTERO_WEB_API_KEY = secretConfig.webApiKey || ""; // Optional: your Zotero Web API key.

    const buildWebApiHeaders = () => {
        const headers = {
            "Content-Type": "application/json"
        };
        if (ZOTERO_WEB_API_KEY) {
            headers.Authorization = `Bearer ${ZOTERO_WEB_API_KEY}`;
        }
        return headers;
    };

    const parseAnnotationItem = (annotation) => {
        const text = annotation.data.annotationText || annotation.data.note || annotation.data.content || "";
        const color = annotation.data.annotationColor || annotation.data.color || "";
        const note = annotation.data.annotationNote || annotation.data.annotationComment || annotation.data.note || "";
        const page = annotation.data.annotationPageLabel || annotation.data.annotationPage || "";
        const key = annotation.key || "";
        return {
            text,
            color,
            note,
            page,
            key,
            raw: annotation.data
        };
    };

    const fetchAttachmentKeysForItem = async (itemKey) => {
        try {
            const attachmentResponse = await requestUrl({
                url: `${ZOTERO_API}/${itemKey}/children?format=json&limit=1000`,
                headers: {
                    "Zotero-Allowed-Request": "true"
                }
            });

            if (attachmentResponse.status !== 200) {
                return [];
            }

            const children = JSON.parse(attachmentResponse.text);
            return Array.isArray(children)
                ? children
                    .filter(child => child.data && child.data.itemType === "attachment")
                    .map(child => child.data.key)
                : [];
        } catch (error) {
            console.warn("Unable to fetch attachment keys for item", itemKey, error);
            return [];
        }
    };

    // Attachment transfer disabled: no-op stub to avoid writing files to the vault.
    const saveAttachmentToVault = async (attachmentKey, parentRefKey, idx) => {
        return { ok: false, err: 'attachment transfer disabled' };
    };

    const parseNoteItem = async (noteItem, parentKey) => {
        let content = noteItem.data.note || noteItem.data.content || noteItem.data.noteText || "";

        // Remove <div data-schema-version="9"> and closing tags
        content = content.replace(/<div[^>]*data-schema-version="9"[^>]*>/gi, '');
        content = content.replace(/<\/div>/gi, '');

        // Remove <p> tags (keep content)
        content = content.replace(/<p[^>]*>/gi, '');
        content = content.replace(/<\/p>/gi, '');

        // Shift headers by 2 levels (H1->H3, H2->H4, etc.)
        content = content.replace(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi, (_, level, txt) => {
            const newLevel = Math.min(Number(level) + 2, 6);
            return '<h' + newLevel + '>' + txt + '</h' + newLevel + '>';
        });

        // Image transfer disabled: convert <img> tags to markdown links without downloading
        content = content.replace(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi, (m, src) => `![](${src})`);

        const key = noteItem.data.key || noteItem.key || "";
        return {
            content,
            key,
            raw: noteItem.data
        };
    };

    // Minimal HTML -> Markdown conversion
    const htmlToMarkdown = (html) => {
        if (!html) return "";
        let md = String(html);

        // Remove <div data-schema-version="9"> and closing tag
        md = md.replace(/<div[^>]*data-schema-version="9"[^>]*>/gi, '');
        md = md.replace(/<\/div>/gi, '');

        // Decode some HTML entities
        md = md.replace(/&nbsp;/g, ' ')
               .replace(/&amp;/g, '&')
               .replace(/&lt;/g, '<')
               .replace(/&gt;/g, '>')
               .replace(/&quot;/g, '"')
               .replace(/&#39;/g, "'");

        // Headings: lower by two levels (H1->H3, H2->H4, etc.)
        md = md.replace(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi, (_, level, txt) => {
            const newLevel = Math.min(Number(level) + 2, 6);
            return '\n' + '#'.repeat(newLevel) + ' ' + txt + '\n';
        });

        // Paragraphs and line breaks
        md = md.replace(/<br\s*\/?>/gi, '  \n');
        md = md.replace(/<p[^>]*>/gi, '\n\n').replace(/<\/p>/gi, '\n\n');

        // Bold/strong and italics/em
        md = md.replace(/<(strong|b)[^>]*>(.*?)<\/\1>/gi, '**$2**');
        md = md.replace(/<(em|i)[^>]*>(.*?)<\/\1>/gi, '*$2*');

        // Code blocks and inline code
        md = md.replace(/<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi, (_, code) => {
            return '\n```\n' + code.replace(/<[^>]+>/g, '') + '\n```\n';
        });
        md = md.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');

        // Links
        md = md.replace(/<a[^>]*href=["']?([^"' >]+)["']?[^>]*>(.*?)<\/a>/gi, '[$2]($1)');

        // Lists: preserve nested structure by converting recursively
        const convertLists = (htmlSegment, level = 0) => {
            const listRegex = /<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/i;
            // If there's no list, return trimmed content
            if (!listRegex.test(htmlSegment)) return htmlSegment.trim();

            return htmlSegment.replace(/<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/gi, (whole, listType, inner) => {
                // Extract list items
                const items = [];
                inner.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (m, liContent) => {
                    items.push(liContent.trim());
                    return '';
                });

                const mdItems = items.map((it, idx) => {
                    // Recursively convert nested lists inside this item
                    const converted = convertLists(it, level + 1).trim();
                    const indent = '  '.repeat(level);
                    const prefix = listType.toLowerCase() === 'ol' ? `${idx + 1}. ` : '- ';
                    // Ensure multiline items are indented on subsequent lines
                    const lines = converted.split(/\r?\n/).map((ln, i) => i === 0 ? ln.trim() : '  '.repeat(level + 1) + ln.trim());
                    return indent + prefix + lines.join('\n');
                });

                return mdItems.join('\n') + '\n';
            });
        };

        md = convertLists(md);

        // Strip any remaining tags
        md = md.replace(/<[^>]+>/g, '');

        // Normalize multiple blank lines
        md = md.replace(/\n{3,}/g, '\n\n');

        // Trim
        return md.trim();
    };

    const fetchNotesForItem = async (itemKey) => {
        try {
            // Try local Zotero first (children endpoint includes notes)
            const childrenResponse = await requestUrl({
                url: `${ZOTERO_API}/${itemKey}/children?format=json&limit=1000`,
                headers: {
                    "Zotero-Allowed-Request": "true"
                }
            });

            if (childrenResponse.status === 200) {
                const children = JSON.parse(childrenResponse.text);
                if (Array.isArray(children) && children.length > 0) {
                    return await Promise.all(children
                        .filter(child => child.data && child.data.itemType === "note")
                        .map(child => parseNoteItem(child, itemKey)));
                }
            }

            // Fallback to web API if configured
            if (!ZOTERO_WEB_USER_ID) return [];

            const webUrl = `${ZOTERO_WEB_API_BASE}/users/${ZOTERO_WEB_USER_ID}/items?itemType=note&limit=1000`;
            const webResponse = await requestUrl({ url: webUrl, headers: buildWebApiHeaders() });
            if (webResponse.status !== 200) return [];

            const webItems = JSON.parse(webResponse.text);
            return Array.isArray(webItems)
                ? await Promise.all(webItems
                    .filter(item => item.data && item.data.itemType === "note" && item.data.parentItem === itemKey)
                    .map(item => parseNoteItem(item, itemKey)))
                : [];
        } catch (error) {
            console.warn("Unable to fetch notes for item", itemKey, error);
            return [];
        }
    };

    const fetchAnnotationsFromUrl = async (url, headers, parentKeys, parentRefKey) => {
        if (!parentKeys || parentKeys.length === 0) {
            return [];
        }

        const annotationResponse = await requestUrl({
            url,
            headers
        });

        if (annotationResponse.status !== 200) {
            return [];
        }

        const annotationItems = JSON.parse(annotationResponse.text);
        if (!Array.isArray(annotationItems)) {
            return [];
        }

        const filtered = annotationItems.filter(item => item.data && item.data.itemType === "annotation" && parentKeys.includes(item.data.parentItem));
        // Parse and handle image annotations (may reference an attachment item)
        const parsed = await Promise.all(filtered.map(async (item, idx) => {
            const parsedItem = parseAnnotationItem(item);
            try {
                const ann = item.data || {};
                if (ann.parentItem) {
                    // Image transfer disabled: record the referenced attachment key only
                    parsedItem.imageRef = ann.parentItem;
                }
            } catch (e) {
                // ignore per-item errors
            }
            return parsedItem;
        }));

        return parsed;
    };

    const fetchAnnotationsForItem = async (itemKey) => {
        try {
            const attachmentKeys = await fetchAttachmentKeysForItem(itemKey);
            const parentKeys = [itemKey, ...attachmentKeys];
            if (parentKeys.length === 0) {
                return [];
            }

            const localUrl = `${ZOTERO_API}?itemType=annotation&limit=1000`;
            const localHeaders = {
                "Zotero-Allowed-Request": "true"
            };
            const localAnnotations = await fetchAnnotationsFromUrl(localUrl, localHeaders, parentKeys, itemKey);
            if (localAnnotations.length > 0) {
                return localAnnotations;
            }

            if (!ZOTERO_WEB_USER_ID) {
                return [];
            }

            const webUrl = `${ZOTERO_WEB_API_BASE}/users/${ZOTERO_WEB_USER_ID}/items?itemType=annotation&limit=1000`;
            return await fetchAnnotationsFromUrl(webUrl, buildWebApiHeaders(), parentKeys, itemKey);
        } catch (error) {
            console.warn("Unable to fetch annotations for item", itemKey, error);
            return [];
        }
    };

    try {
        // ============ Step 1: Fetch Zotero item list ============
        new Notice("🔍 Loading Zotero items...");

        // Retrieve all items (sorted by most recently modified)
        const response = await requestUrl({
            url: `${ZOTERO_API}?sort=dateModified&direction=desc`,
            headers: {
                "Zotero-Allowed-Request": "true"
            }
        });

        if (response.status !== 200) {
            new Notice("❌ Connection failed: make sure Zotero is running and 'Allow other applications to connect to Zotero' is enabled in settings.");
            return null;
        }

        const allItems = JSON.parse(response.text);

        // Filter to reference item types (exclude attachment, note, annotation, etc.)
        const validTypes = [
            'journalArticle', 'book', 'bookSection', 'conferencePaper',
            'thesis', 'report', 'preprint', 'patent', 'webpage',
            'manuscript', 'document', 'blogPost', 'forumPost'
        ];

        const items = allItems.filter(item =>
            validTypes.includes(item.data.itemType)
        );

        if (items.length === 0) {
            new Notice("⚠️ No reference entries were found in your Zotero library.");
            return null;
        }

        // ============ Step 2: Show the chooser inside Obsidian ============

        // Prepare display text
        const suggestions = items.map(item => {
            const title = item.data.title || "Untitled";
            const creators = item.data.creators || [];
            const authors = creators
                .slice(0, 2)
                .map(c => c.lastName || c.name || "")
                .filter(n => n)
                .join(", ");
            const year = item.data.date ? item.data.date.match(/\d{4}/)?.[0] || "" : "";

            return authors
                ? `${title} - ${authors} (${year})`
                : `${title} (${year})`;
        });

        // Show the chooser
        const selectedIndex = await tp.system.suggester(
            suggestions,
            items.map((_, index) => index),
            true,
            "Choose a reference to cite"
        );

        if (selectedIndex === null || selectedIndex === undefined) {
            new Notice("⚠️ No reference selected.");
            return null;
        }

        const selectedItem = items[selectedIndex].data;

        // ============ Step 3: Get Better BibTeX citation key ============

        // Fetch the citation key via Better BibTeX JSON-RPC
        const itemKey = items[selectedIndex].key;
        const bbtRequest = {
            jsonrpc: "2.0",
            method: "item.citationkey",
            params: [[itemKey]],
            id: 1
        };

        let citekey = itemKey; // Default to item key
        try {
            const bbtResponse = await requestUrl({
                url: "http://localhost:23119/better-bibtex/json-rpc",
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "User-Agent": "Obsidian-Templater"
                },
                body: JSON.stringify(bbtRequest)
            });

            const bbtData = JSON.parse(bbtResponse.text);
            if (bbtData.result && bbtData.result[itemKey]) {
                citekey = bbtData.result[itemKey];
            }
        } catch (error) {
            console.warn("Unable to fetch Better BibTeX citation key, using item key instead:", error);
        }

        // ============ Step 4: Get annotations/highlights ============
        const highlights = await fetchAnnotationsForItem(itemKey);

        // ============ Step 5: Get collections information ============

        let collectionNames = [];
        if (selectedItem.collections && selectedItem.collections.length > 0) {
            try {
                // Fetch collections details
                const collectionRequests = selectedItem.collections.map(async (collectionKey) => {
                    const collectionResponse = await requestUrl({
                        url: `http://localhost:23119/api/users/0/collections/${collectionKey}`,
                        headers: {
                            "Zotero-Allowed-Request": "true"
                        }
                    });
                    const collectionData = JSON.parse(collectionResponse.text);
                    return collectionData.data.name;
                });

                collectionNames = await Promise.all(collectionRequests);
            } catch (error) {
                console.warn("Unable to fetch collections information:", error);
            }
        }

        // ============ Step 5: Clean data and return ============

        // Process authors
        let authors = "Unknown";
        if (selectedItem.creators && selectedItem.creators.length > 0) {
            authors = selectedItem.creators.map(c => {
                const first = c.firstName || "";
                const last = c.lastName || c.name || "";
                return `${first} ${last}`.trim();
            }).filter(n => n).join(", ");
        }

        // Process year
        let year = "Unknown";
        if (selectedItem.date) {
            const match = selectedItem.date.match(/\d{4}/);
            if (match) year = match[0];
        }

        // Process journal name
        const journal = selectedItem.publicationTitle ||
                       selectedItem.bookTitle ||
                       selectedItem.conferenceName ||
                       selectedItem.publisher || "";

        // Fetch child notes attached to this reference
        const notes = await fetchNotesForItem(itemKey);

        new Notice("✅ Selected: " + (selectedItem.title || "Unknown reference"));

        return {
            citekey: citekey,
            title: selectedItem.title || "No Title",
            authors: authors,
            year: year,
            journal: journal,
            doi: selectedItem.DOI || "",
            url: selectedItem.url || "",
            type: selectedItem.itemType || "article",
            collections: collectionNames,
            abstract: selectedItem.abstractNote || "",
            highlights: highlights,
            notes: notes,
            zoteroLink: `zotero://select/library/items/${itemKey}`
        };

    } catch (error) {
        console.error("Zotero Picker Error:", error);
        new Notice("❌ Script error: press Cmd+Option+I to open the console.");
        return null;
    }
};
