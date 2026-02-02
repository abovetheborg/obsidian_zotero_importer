/**
 * zotero_picker.js
 * 使用 Zotero 本地 API + Obsidian 内部选择器抓取元数据
 */
module.exports = async (tp) => {
    const ZOTERO_API = "http://localhost:23119/api/users/0/items";

    try {
        // ============ 步骤 1: 获取文献条目列表 ============
        new Notice("🔍 正在加载 Zotero 文献...");

        // 获取所有文献（按最近修改排序）
        const response = await requestUrl({
            url: `${ZOTERO_API}?sort=dateModified&direction=desc`,
            headers: {
                "Zotero-Allowed-Request": "true"
            }
        });

        if (response.status !== 200) {
            new Notice("❌ 连接失败：请确保 Zotero 已打开，并在设置中启用'允许其他应用程序与 Zotero 通信'。");
            return null;
        }

        const allItems = JSON.parse(response.text);

        // 过滤出文献类型（排除 attachment, note, annotation 等）
        const validTypes = [
            'journalArticle', 'book', 'bookSection', 'conferencePaper',
            'thesis', 'report', 'preprint', 'patent', 'webpage',
            'manuscript', 'document', 'blogPost', 'forumPost'
        ];

        const items = allItems.filter(item =>
            validTypes.includes(item.data.itemType)
        );

        if (items.length === 0) {
            new Notice("⚠️ Zotero 库中没有找到任何文献条目。");
            return null;
        }

        // ============ 步骤 2: 在 Obsidian 内部显示选择器 ============

        // 准备显示信息
        const suggestions = items.map(item => {
            const title = item.data.title || "无标题";
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

        // 显示选择器
        const selectedIndex = await tp.system.suggester(
            suggestions,
            items.map((_, index) => index),
            true,
            "选择要引用的文献"
        );

        if (selectedIndex === null || selectedIndex === undefined) {
            new Notice("⚠️ 未选择任何文献。");
            return null;
        }

        const selectedItem = items[selectedIndex].data;

        // ============ 步骤 3: 获取 Better BibTeX citation key ============

        // 通过 Better BibTeX JSON-RPC 获取 citation key
        const itemKey = items[selectedIndex].key;
        const bbtRequest = {
            jsonrpc: "2.0",
            method: "item.citationkey",
            params: [[itemKey]],
            id: 1
        };

        let citekey = itemKey; // 默认使用 item key
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
            console.warn("无法获取 Better BibTeX citation key，使用 item key 代替:", error);
        }

        // ============ 步骤 4: 获取 Collections 信息 ============

        let collectionNames = [];
        if (selectedItem.collections && selectedItem.collections.length > 0) {
            try {
                // 获取 collections 信息
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
                console.warn("无法获取 collections 信息:", error);
            }
        }

        // ============ 步骤 5: 清洗数据并返回 ============

        // 处理作者
        let authors = "Unknown";
        if (selectedItem.creators && selectedItem.creators.length > 0) {
            authors = selectedItem.creators.map(c => {
                const first = c.firstName || "";
                const last = c.lastName || c.name || "";
                return `${first} ${last}`.trim();
            }).filter(n => n).join(", ");
        }

        // 处理年份
        let year = "Unknown";
        if (selectedItem.date) {
            const match = selectedItem.date.match(/\d{4}/);
            if (match) year = match[0];
        }

        // 处理期刊名
        const journal = selectedItem.publicationTitle ||
                       selectedItem.bookTitle ||
                       selectedItem.conferenceName ||
                       selectedItem.publisher || "";

        new Notice("✅ 已选择: " + (selectedItem.title || "未知文献"));

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
        new Notice("❌ 脚本运行出错，请按 Cmd+Option+I 查看控制台。");
        return null;
    }
};
