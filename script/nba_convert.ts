import {aql, Database} from "arangojs";
import fs from "fs";
import {randomBytes} from "crypto";
import {DocumentCollection} from "arangojs/collections";
import escapeHTML from "escape-html";
import {Graph, Node, NodeTypeConfig, NodeTypeHtmlConfig} from "packages/utils/src/graph/graphType";
import { HtmlClass } from "packages/utils/src/html/htmlType";
import { createNodeFromConfig } from "packages/utils/src/graph/nodeUtils";
import {NbaGraph} from "./type";

const dbUrl = "http://127.0.0.1:8529";
const dbUser = "root";
const dbPass = "azerty";
const dbName = "nodius";

const document_name = "converted_nba"

const db = new Database({
    url: dbUrl,
    auth: {username: dbUser, password: dbPass},
    databaseName: dbName
});

function generateToken(length: number = 64): string {
    return randomBytes(Math.ceil(length / 2)).toString("hex").slice(0, length);
}

interface nbaGraph {
    date:number,
    version:number,
    sheets: Record<string, {
        id:string
    }>
}

async function createUniqueToken(
    collection: DocumentCollection<any>,
    length: number = 64
): Promise<string> {
    let token: string;
    let exists = true;

    while (exists) {
        token = generateToken(length);

        const cursor = await db.query(aql`
      FOR doc IN ${collection}
        FILTER doc.token == ${token}
        LIMIT 1
        RETURN doc._key
    `);

        exists = cursor.hasNext;
    }

    return token!;
}

async function ensureCollection(
    name: string,
): Promise<DocumentCollection> {
    const collection = db.collection(name);

    const exists = await collection.exists();
    if (!exists) {
        await collection.create();
    }
    return collection as DocumentCollection;
}

const convert = async () => {

    const nba_data = await fs.readFileSync("nba.json", "utf8");
    const nba_json = JSON.parse(nba_data) as NbaGraph;

    //create graph key
    const graph_collection = await ensureCollection("nodius_graph");
    const graph_key = await createUniqueToken(graph_collection);

    //create html key
    const html_collection = await ensureCollection("nodius_html_class");
    const html_key = await createUniqueToken(html_collection);

    // delete previous one if exist
    let cursor = await db.query(aql`
      FOR doc IN nodius_graphs
        FILTER doc.name == ${escapeHTML(document_name+"-graph")}
        REMOVE doc IN nodius_graphs
    `);

    cursor = await db.query(aql`
      FOR doc IN nodius_html_class
        FILTER doc.name == ${escapeHTML(document_name+"-graph")}
        REMOVE doc IN nodius_html_class
    `);


    // create graph
    const graph:Omit<Graph, "_sheets"> = {
        name: document_name+"-graph",
        _key: graph_key,
        category: "default",
        htmlKeyLinked: html_key,
        version: 0,
        permission: 0,
        workspace: "root",
        lastUpdatedTime: Date.now(),
        createdTime: Date.now(),
        sheetsList: {0: "main"}
    }

    const rootNodeKey = graph_key+"-root";

    const html_class:Omit<HtmlClass, "object"> = {
        _key: html_key,
        version: 0,
        permission: 0,
        category: "default",
        name: "document_name",
        lastUpdatedTime: Date.now(),
        createdTime: Date.now(),
        workspace: "root",
        htmlNodeKey: rootNodeKey,
        graphKeyLinked: graph_key,
    }
    await html_collection.save(html_class);

    const node_collection = await ensureCollection("nodius_nodes");

    const nodeRoot = createNodeFromConfig<any>(
        NodeTypeHtmlConfig,
        rootNodeKey,
        graph_key,
        Object.keys(nba_json.sheets)[0]
    );
    nodeRoot.data = {
        "domEvents": [
            {
                "name": "load",
                "call": "[!]CALL-HANDLE-2"
            }
        ],
        "type": "block",
        "name": "Container",
        "delimiter": true,
        "tag": "div",
        "css": [
            {
                "selector": "&",
                "rules": [
                    [
                        "height",
                        "100%"
                    ],
                    [
                        "width",
                        "100%"
                    ]
                ]
            }
        ],
        "identifier": "root",
        "content": {
            "type": "html",
            "domEvents": [],
            "name": "Html",
            "identifier": "rooy",
            "css": [
                {
                    "selector": "&",
                    "rules": [
                        [
                            "height",
                            "100%"
                        ]
                    ]
                }
            ],
            "tag": "div",
            "content": `<div>\n  {{result}}\n</div>`
        }
    };

    // retrieve all node Type
    const query = aql`
      FOR doc IN nodius_node_config
      RETURN doc
    `;

    cursor = await db.query(query);
    const nodeConfigs = await cursor.all() as NodeTypeConfig[];

    const configPortal = nodeConfigs.find((n) => n._key === "64c31f4e4a65dbab5250f97399992874b8a9dd93d3aacd6bb74d33c86831f07c");
    const configSentence = nodeConfigs.find((n) => n._key === "2502f926879cb50caa287919b5a6dcf8e5687a46ca8da48d4bdb0b1a225324f8");
    const configCondition = nodeConfigs.find((n) => n._key === "10683d03c06c60fee0659ec919b21a127989e3facf13b33540dac6b3d07f8ca9");
    const configSection = nodeConfigs.find((n) => n._key === "e96efd5b74eb5c96cd778db757cc17cd8fa230502e6ed26576e5d7f1cbb732ab");
    const configMultiplexer = nodeConfigs.find((n) => n._key === "7442312b8ca689ebc9b5a80e5e2b369e13d4fbbd2b73b3db1eee379702ae84d2");
    const configSubflow = nodeConfigs.find((n) => n._key === "ec278f3a79a6d6380946ed05ad8cb48ed163cc5314957ecc652b4f6a3460e820");

    //await node_collection.save(nodeRoot);
    for(const [sheetId, sheet] of Object.entries(nba_json.sheets)) {
        graph.sheetsList[sheetId] = sheet.name;
        if(sheetId === Object.keys(nba_json.sheets)[0]) {
            // first sheet, add node root
            graph.sheets[sheetId].nodeMap.set(nodeRoot._key, nodeRoot);

            for(const [nodeId, node] of Object.entries(sheet.nodes)) {
                let newNode:Node<any>|undefined;
                if(node.type === "portalNode") {

                }

                if(newNode) {
                    graph.sheets[sheetId].nodeMap.set(newNode._key, newNode);
                }
            }
        }
    }


    await graph_collection.save(graph);
}

convert();