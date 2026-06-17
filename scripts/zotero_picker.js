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

    // Save an attachment file (by attachment item key) into the vault under the parent reference folder
    const saveAttachmentToVault = async (attachmentKey, parentRefKey, idx) => {
        try {
            const folder = `9000_Obsidian_Infrastructure/9200_Zotero_References/${parentRefKey}`;
            try { await app.vault.createFolder(folder); } catch (e) { /* ignore if exists */ }

            const fs = typeof require === 'function'
                ? require('fs')
                : (typeof window !== 'undefined' && typeof window.require === 'function' ? window.require('fs') : null);
            const pathModule = typeof require === 'function'
                ? require('path')
                : (typeof window !== 'undefined' && typeof window.require === 'function' ? window.require('path') : null);

            const readFsFile = async (fullPath) => {
                if (!fs) return null;
                try {
                    if (fs.promises && typeof fs.promises.readFile === 'function') {
                        const fileBuffer = await fs.promises.readFile(fullPath);
                        return fileBuffer && fileBuffer.length > 0 ? fileBuffer : null;
                    }
                    if (typeof fs.readFileSync === 'function') {
                        const fileBuffer = fs.readFileSync(fullPath);
                        return fileBuffer && fileBuffer.length > 0 ? fileBuffer : null;
                    }
                } catch (e) {
                    return null;
                }
                return null;
            };

            const homeDir = typeof process !== 'undefined' && process.env && process.env.HOME ? process.env.HOME : null;
            const possibleRoots = [];
            if (homeDir) {
                possibleRoots.push(pathModule ? pathModule.join(homeDir, 'snap', 'zotero-snap', 'common', 'Zotero', 'storage') : `${homeDir}/snap/zotero-snap/common/Zotero/storage`);
                possibleRoots.push(pathModule ? pathModule.join(homeDir, '.zotero', 'zotero', 'storage') : `${homeDir}/.zotero/zotero/storage`);
                possibleRoots.push(pathModule ? pathModule.join(homeDir, '.zotero', 'storage') : `${homeDir}/.zotero/storage`);
                possibleRoots.push(pathModule ? pathModule.join(homeDir, 'Zotero', 'storage') : `${homeDir}/Zotero/storage`);
            }

            const metaResponse = await requestUrl({
                url: `${ZOTERO_API}/${attachmentKey}`,
                headers: { "Zotero-Allowed-Request": "true" }
            });
            let attachmentMeta = null;
            if (metaResponse && metaResponse.status === 200 && metaResponse.text) {
                try {
                    attachmentMeta = JSON.parse(metaResponse.text).data || null;
                } catch (e) {
                    attachmentMeta = null;
                }
            }
            const attachmentFilename = attachmentMeta && attachmentMeta.filename ? attachmentMeta.filename : `${attachmentKey}.bin`;

            let localBuffer = null;
            let sourcePath = null;
            for (const root of possibleRoots) {
                const candidate = pathModule ? pathModule.join(root, attachmentKey, attachmentFilename) : `${root}/${attachmentKey}/${attachmentFilename}`;
                const fileBuffer = await readFsFile(candidate);
                if (fileBuffer) {
                    localBuffer = fileBuffer;
                    sourcePath = candidate;
                    break;
                }
            }

            if (!localBuffer) {
                const fileResp = await requestUrl({
                    url: `${ZOTERO_API}/${attachmentKey}/file`,
                    headers: { "Zotero-Allowed-Request": "true" },
                    binary: true,
                    responseType: 'arraybuffer'
                });
                if (!fileResp) throw new Error('No response from attachment request');

                const redirectLocation = fileResp.headers && (fileResp.headers.location || fileResp.headers.Location || fileResp.headers['Content-Location'] || fileResp.headers['content-location']);
                if ((fileResp.status === 301 || fileResp.status === 302) && redirectLocation && redirectLocation.startsWith('file://')) {
                    const localPath = decodeURIComponent(redirectLocation.replace(/^file:\/\//i, ''));
                    const fileBuffer = await readFsFile(localPath);
                    if (fileBuffer) {
                        localBuffer = fileBuffer;
                        sourcePath = localPath;
                    }
                }

                if (!localBuffer) {
                    if (fileResp.status !== 200) {
                        throw new Error('Failed to fetch attachment file: ' + fileResp.status + ' redirect=' + String(redirectLocation));
                    }
                    if (fileResp.binary) {
                        localBuffer = fileResp.binary;
                    } else if (typeof fileResp.arrayBuffer === 'function') {
                        localBuffer = await fileResp.arrayBuffer();
                    } else {
                        throw new Error('Attachment response returned no binary data');
                    }
                }
            }

            if (!localBuffer) {
                throw new Error('Unable to resolve attachment binary data from local Zotero storage or network fallback.');
            }

            const bytes = localBuffer instanceof Uint8Array ? localBuffer : new Uint8Array(localBuffer);
            const resp = { headers: attachmentMeta?.headers || {}, sourcePath, binary: bytes };

            // Determine filename and extension
            let ext = 'bin';
            const contentType = resp.headers && (resp.headers['content-type'] || resp.headers['Content-Type']);
            if (contentType) ext = (contentType.split('/')[1] || ext).split(';')[0];
            let savedFilename = `${parentRefKey}-attach-${Date.now()}-${idx}.${ext}`;
            const cd = resp.headers && (resp.headers['content-disposition'] || resp.headers['Content-Disposition']);
            if (cd) {
                const m = cd.match(/filename\*=UTF-8''([^;\n\r]+)/) || cd.match(/filename="?([^";]+)"?/);
                if (m && m[1]) savedFilename = decodeURIComponent(m[1].replace(/"/g, ''));
            }

            const filePath = `${folder}/${savedFilename}`;

            let arrayBuffer = null;
            if (typeof resp.arrayBuffer === 'function') {
                arrayBuffer = await resp.arrayBuffer();
            } else if (resp.binary) {
                arrayBuffer = resp.binary;
            } else if (resp.text) {
                // Fallback only if binary is unavailable.
                try {
                    arrayBuffer = Uint8Array.from(atob(resp.text), c => c.charCodeAt(0)).buffer;
                } catch (e) {
                    arrayBuffer = new TextEncoder().encode(resp.text).buffer;
                }
            }

            if (!arrayBuffer) throw new Error('No binary data');
            const bytes = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
            const debug = { headers: resp.headers || {}, length: bytes.length, firstBytesHex: null, writeMethod: null, sourcePath: resp.sourcePath || null };
            try {
                const first = bytes.subarray ? bytes.subarray(0, 16) : bytes.slice(0, 16);
                debug.firstBytesHex = Array.from(first).map(b => ('0' + b.toString(16)).slice(-2)).join(' ');
            } catch (e) {
                debug.firstBytesHex = 'unavailable';
            }

            if (app.vault.adapter.writeBinary) {
                await app.vault.adapter.writeBinary(filePath, bytes);
                debug.writeMethod = 'writeBinary';
            } else if (app.vault.adapter.write) {
                // Fallback: write in manageable chunks to avoid large apply(null, ...) calls
                debug.writeMethod = 'write';
                const CHUNK = 0x8000;
                let i = 0;
                const parts = [];
                while (i < bytes.length) {
                    const slice = bytes.subarray ? bytes.subarray(i, i + CHUNK) : bytes.slice(i, i + CHUNK);
                    parts.push(String.fromCharCode.apply(null, slice));
                    i += CHUNK;
                }
                await app.vault.adapter.write(filePath, parts.join(''));

                // Also write a base64 backup to help external debugging/repair
                try {
                    const b64Parts = [];
                    i = 0;
                    while (i < bytes.length) {
                        const slice = bytes.subarray ? bytes.subarray(i, i + CHUNK) : bytes.slice(i, i + CHUNK);
                        b64Parts.push(btoa(String.fromCharCode.apply(null, slice)));
                        i += CHUNK;
                    }
                    const b64 = b64Parts.join('');
                    await app.vault.adapter.write(filePath + '.b64', b64);
                    debug.b64Path = filePath + '.b64';
                } catch (e) {
                    debug.b64Error = String(e);
                }
            }
            return { ok: true, path: filePath, debug };
        } catch (err) {
            console.warn('saveAttachmentToVault failed for', attachmentKey, err);
            return { ok: false, err: String(err), src: attachmentKey };
        }
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

        // Helper: save image to vault and return relative path
        const saveImageToVault = async (parentKey, src, idx) => {
            try {
                const folder = `9000_Obsidian_Infrastructure/9200_Zotero_References/${parentKey}`;
                try { await app.vault.createFolder(folder); } catch (e) { /* ignore if exists */ }

                // Determine filename and extension
                let ext = 'png';
                let baseName = `${parentKey}-img-${Date.now()}-${idx}`;

                if (src.startsWith('data:')) {
                    const match = src.match(/^data:([^;]+);base64,(.*)$/i);
                    if (!match) return { ok: false, src, err: 'Invalid data URI' };
                    const mime = match[1];
                    const dataB64 = match[2];
                    ext = mime.split('/')[1] || ext;
                    const filePath = `${folder}/${baseName}.${ext}`;
                    const bytes = Uint8Array.from(atob(dataB64), c => c.charCodeAt(0));
                    if (app.vault.adapter.writeBinary) {
                        await app.vault.adapter.writeBinary(filePath, bytes);
                    } else if (app.vault.adapter.write) {
                        await app.vault.adapter.write(filePath, dataB64);
                    }
                    return { ok: true, path: filePath };
                }

                const headers = { "Zotero-Allowed-Request": "true" };
                const resp = await requestUrl({ url: src, headers, binary: true, responseType: 'arraybuffer' });
                if (!resp || resp.status !== 200) return { ok: false, src, err: 'Failed to fetch image' };

                const contentType = resp.headers && (resp.headers['content-type'] || resp.headers['Content-Type']);
                if (contentType) ext = contentType.split('/')[1] || ext;
                const urlParts = src.split('?')[0].split('/');
                const lastPart = urlParts[urlParts.length - 1] || '';
                if (lastPart.includes('.')) ext = lastPart.split('.').pop().slice(0,4) || ext;

                const filePath = `${folder}/${baseName}.${ext}`;

                let arrayBuffer = null;
                if (typeof resp.arrayBuffer === 'function') {
                    arrayBuffer = await resp.arrayBuffer();
                } else if (resp.binary) {
                    arrayBuffer = resp.binary;
                } else if (resp.text) {
                    try {
                        arrayBuffer = Uint8Array.from(atob(resp.text), c => c.charCodeAt(0)).buffer;
                    } catch (e) {
                        arrayBuffer = new TextEncoder().encode(resp.text).buffer;
                    }
                }

                if (!arrayBuffer) return { ok: false, src, err: 'No binary data' };

                const bytes = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer);
                const debug = { headers: resp.headers || {}, length: bytes.length, firstBytesHex: null, writeMethod: null, sourcePath: resp.sourcePath || null };
                try {
                    const first = bytes.subarray ? bytes.subarray(0, 16) : bytes.slice(0, 16);
                    debug.firstBytesHex = Array.from(first).map(b => ('0' + b.toString(16)).slice(-2)).join(' ');
                } catch (e) {
                    debug.firstBytesHex = 'unavailable';
                }

                if (app.vault.adapter.writeBinary) {
                    await app.vault.adapter.writeBinary(filePath, bytes);
                    debug.writeMethod = 'writeBinary';
                } else if (app.vault.adapter.write) {
                    // Fallback: write in manageable chunks to avoid large apply(null, ...) calls
                    debug.writeMethod = 'write';
                    const CHUNK = 0x8000;
                    let i = 0;
                    const parts = [];
                    while (i < bytes.length) {
                        const slice = bytes.subarray ? bytes.subarray(i, i + CHUNK) : bytes.slice(i, i + CHUNK);
                        parts.push(String.fromCharCode.apply(null, slice));
                        i += CHUNK;
                    }
                    await app.vault.adapter.write(filePath, parts.join(''));

                    // Also write a base64 backup to help external debugging/repair
                    try {
                        const b64Parts = [];
                        i = 0;
                        while (i < bytes.length) {
                            const slice = bytes.subarray ? bytes.subarray(i, i + CHUNK) : bytes.slice(i, i + CHUNK);
                            b64Parts.push(btoa(String.fromCharCode.apply(null, slice)));
                            i += CHUNK;
                        }
                        const b64 = b64Parts.join('');
                        await app.vault.adapter.write(filePath + '.b64', b64);
                        debug.b64Path = filePath + '.b64';
                    } catch (e) {
                        debug.b64Error = String(e);
                    }
                }
                return { ok: true, path: filePath, debug };
            } catch (err) {
                return { ok: false, src, err: String(err) };
            }
        };

        // Replace <img> tags with markdown image links, downloading images
        const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;
        let match;
        let imgIndex = 0;
        const replacements = [];
        const debugMsgs = [];
        while ((match = imgRegex.exec(content)) !== null) {
            imgIndex += 1;
            const src = match[1];
            const saved = await saveImageToVault(parentKey || 'zotero', src, imgIndex);
            if (saved && saved.ok) {
                replacements.push({ original: match[0], replacement: `![](${saved.path})` });
                debugMsgs.push(`Downloaded: ${src} -> ${saved.path}`);
            } else {
                replacements.push({ original: match[0], replacement: `![](${src})` });
                debugMsgs.push(`Failed: ${src} (${saved && saved.err ? saved.err : 'unknown error'})`);
            }
        }

        for (const r of replacements) {
            content = content.split(r.original).join(r.replacement);
        }

        if (debugMsgs.length > 0) {
            content += '\n\n---\n**Image import debug**\n' + debugMsgs.map(m => '- ' + m).join('\n');
        }

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
                if ((ann.annotationType === 'image' || ann.annotationType === 'image') && ann.parentItem) {
                    // parentItem may be the attachment key; try to download it
                    const saved = await saveAttachmentToVault(ann.parentItem, parentRefKey || ann.parentItem, idx+1);
                    if (saved && saved.ok) {
                        parsedItem.imagePath = saved.path;
                        if (saved.debug) parsedItem.imageDebug = saved.debug;
                    } else {
                        parsedItem.imageError = saved && saved.err ? saved.err : 'download_failed';
                        if (saved && saved.debug) parsedItem.imageDebug = saved.debug;
                    }
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
            return await fetchAnnotationsFromUrl(webUrl, buildWebApiHeaders(), attachmentKeys, itemKey);
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
