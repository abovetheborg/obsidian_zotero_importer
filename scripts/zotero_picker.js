/**
 * zotero_picker.js
 * Fetch metadata using the Zotero Local API and Obsidian's internal suggester
 */
module.exports = async (tp) => {
    const ZOTERO_API = "http://localhost:23119/api/users/0/items";

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

        // ============ Step 4: Get collections information ============

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
            zoteroLink: `zotero://select/library/items/${itemKey}`
        };

    } catch (error) {
        console.error("Zotero Picker Error:", error);
        new Notice("❌ Script error: press Cmd+Option+I to open the console.");
        return null;
    }
};
