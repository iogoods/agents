// src/actions/getLatestNFT.ts
import {
  composeContext,
  elizaLogger as elizaLogger2,
  generateObjectDeprecated,
  ModelClass
} from "@elizaos/core";
import axios from "axios";

// src/environment.ts
import { z } from "zod";
var stargazeEnvSchema = z.object({
  STARGAZE_ENDPOINT: z.string().min(1, "Stargaze API endpoint is required")
});
async function validateStargazeConfig(runtime) {
  try {
    const config = {
      STARGAZE_ENDPOINT: runtime.getSetting("STARGAZE_ENDPOINT")
    };
    return stargazeEnvSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map((err) => `${err.path.join(".")}: ${err.message}`).join("\n");
      throw new Error(
        `Stargaze configuration validation failed:
${errorMessages}`
      );
    }
    throw error;
  }
}

// src/utils/debug.ts
import { elizaLogger } from "@elizaos/core";
var debugLog = {
  request: (method, url, data) => {
    elizaLogger.log("\u{1F310} API Request:", {
      method,
      url,
      data: data || "No data"
    });
  },
  response: (response) => {
    elizaLogger.log("\u2705 API Response:", {
      status: response?.status,
      data: response?.data || "No data"
    });
  },
  error: (error) => {
    elizaLogger.error("\u26D4 Error Details:", {
      message: error?.message,
      response: {
        status: error?.response?.status,
        data: error?.response?.data
      },
      config: {
        url: error?.config?.url,
        method: error?.config?.method,
        data: error?.config?.data
      }
    });
  },
  validation: (config) => {
    elizaLogger.log("\u{1F50D} Config Validation:", config);
  }
};

// src/actions/getLatestNFT.ts
var getLatestNFTTemplate = `Given the message, extract information about the NFT collection request.

Format the response as a JSON object with these fields:
- collectionAddr: the collection address or name
- limit: number of NFTs to fetch (default to 1 for latest)

Example response:
For "Show me the latest NFT from ammelia":
\`\`\`json
{
    "collectionAddr": "ammelia",
    "limit": 1
}
\`\`\`

For "Show me the latest NFT from Badkids":
\`\`\`json
{
    "collectionAddr": "badkids",
    "limit": 1
}
\`\`\`

{{recentMessages}}

Extract the collection information from the above messages and respond with the appropriate JSON.`;
var GRAPHQL_QUERY = `
query MarketplaceTokens($collectionAddr: String!, $limit: Int) {
    tokens(
        collectionAddr: $collectionAddr
        limit: $limit
        sortBy: MINTED_DESC
    ) {
        tokens {
            id
            tokenId
            name
            media {
                url
            }
            listPrice {
                amount
                symbol
            }
        }
        pageInfo {
            total
            offset
            limit
        }
    }
}`;
var getLatestNFT_default = {
  name: "GET_LATEST_NFT",
  similes: ["SHOW_LATEST_NFT", "FETCH_LATEST_NFT"],
  validate: async (runtime, _message) => {
    elizaLogger2.log("\u{1F504} Validating Stargaze configuration...");
    try {
      const config = await validateStargazeConfig(runtime);
      debugLog.validation(config);
      return true;
    } catch (error) {
      debugLog.error(error);
      return false;
    }
  },
  description: "Get the latest NFT from a Stargaze collection",
  handler: async (runtime, message, state, _options, callback) => {
    elizaLogger2.log("\u{1F680} Starting Stargaze GET_LATEST_NFT handler...");
    if (!state) {
      elizaLogger2.log("Creating new state...");
      state = await runtime.composeState(message);
    } else {
      elizaLogger2.log("Updating existing state...");
      state = await runtime.updateRecentMessageState(state);
    }
    try {
      elizaLogger2.log("Composing NFT context...");
      const nftContext = composeContext({
        state,
        template: getLatestNFTTemplate
      });
      elizaLogger2.log("Generating content from context...");
      const content = await generateObjectDeprecated({
        runtime,
        context: nftContext,
        modelClass: ModelClass.LARGE
      });
      if (!content || !content.collectionAddr) {
        throw new Error("Invalid or missing collection address in parsed content");
      }
      debugLog.validation(content);
      const config = await validateStargazeConfig(runtime);
      const requestData = {
        query: GRAPHQL_QUERY,
        variables: {
          collectionAddr: content.collectionAddr,
          limit: content.limit || 1
        }
      };
      debugLog.request("POST", config.STARGAZE_ENDPOINT, requestData);
      const response = await axios.post(
        config.STARGAZE_ENDPOINT,
        requestData,
        {
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
      debugLog.response(response);
      if (!response.data?.data?.tokens?.tokens) {
        throw new Error("Unexpected API response structure");
      }
      const latestNFT = response.data.data.tokens.tokens[0];
      if (!latestNFT) {
        throw new Error(`No NFTs found in collection: ${content.collectionAddr}`);
      }
      if (callback) {
        const message2 = {
          text: `Latest NFT from ${content.collectionAddr}:
Name: ${latestNFT.name}
Token ID: ${latestNFT.tokenId}
Image: ${latestNFT.media.url}`,
          content: latestNFT
        };
        elizaLogger2.log("\u2705 Sending callback with NFT data:", message2);
        callback(message2);
      }
      return true;
    } catch (error) {
      debugLog.error(error);
      if (callback) {
        callback({
          text: `Error fetching collection stats: ${error}`,
          content: { error }
        });
      }
      return false;
    }
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Show me the latest NFT from ammelia collection"
        }
      },
      {
        user: "{{user1}}",
        content: {
          text: "whats the latest mint for badkids in stargaze?"
        }
      },
      {
        user: "{{agent}}",
        content: {
          text: "I'll fetch the latest NFT from the ammelia collection.",
          action: "GET_LATEST_NFT"
        }
      },
      {
        user: "{{agent}}",
        content: {
          text: "Here's the latest NFT: {{dynamic}}"
        }
      }
    ]
  ]
};

// src/actions/getCollectionStats.ts
import {
  composeContext as composeContext2,
  elizaLogger as elizaLogger3,
  generateObjectDeprecated as generateObjectDeprecated2,
  ModelClass as ModelClass2
} from "@elizaos/core";
import axios2 from "axios";
var COLLECTION_STATS_QUERY = `
query CollectionStats($collectionAddr: String!) {
    collection(address: $collectionAddr) {
        contractAddress
        name
        stats {
            numOwners
            bestOffer
            volumeTotal
            volume24Hour
            salesCountTotal
            tokensMintedPercent
            uniqueOwnerPercent
            change24HourPercent
            marketCap
            mintCount24hour
            mintVolume24hour
            volumeUsdTotal
            volumeUsd24hour
        }
    }
}`;
var getCollectionStatsTemplate = `Given the message, extract the collection address for fetching Stargaze stats.

Format the response as a JSON object with this field:
- collectionAddr: the collection address or name (required)

Example response for "Show me stats for ammelia collection":
\`\`\`json
{
    "collectionAddr": "ammelia"
}
\`\`\`

Example response for "Show me stats for stars10n0m58ztlr9wvwkgjuek2m2k0dn5pgrhfw9eahg9p8e5qtvn964suc995j collection":
\`\`\`json
{
    "collectionAddr": "stars10n0m58ztlr9wvwkgjuek2m2k0dn5pgrhfw9eahg9p8e5qtvn964suc995j"
}
\`\`\`

{{recentMessages}}

Extract the collection address from the above messages and respond with the appropriate JSON.`;
var getCollectionStats_default = {
  name: "GET_COLLECTION_STATS",
  similes: ["CHECK_COLLECTION_STATS", "COLLECTION_INFO"],
  validate: async (runtime, _message) => {
    elizaLogger3.log("\u{1F504} Validating Stargaze configuration...");
    try {
      const config = await validateStargazeConfig(runtime);
      debugLog.validation(config);
      return true;
    } catch (error) {
      debugLog.error(error);
      return false;
    }
  },
  description: "Get detailed statistics for a Stargaze collection",
  handler: async (runtime, message, state, _options, callback) => {
    elizaLogger3.log("\u{1F680} Starting Stargaze GET_COLLECTION_STATS handler...");
    if (!state) {
      elizaLogger3.log("Creating new state...");
      state = await runtime.composeState(message);
    } else {
      elizaLogger3.log("Updating existing state...");
      state = await runtime.updateRecentMessageState(state);
    }
    try {
      elizaLogger3.log("Composing collection stats context...");
      const statsContext = composeContext2({
        state,
        template: getCollectionStatsTemplate
      });
      elizaLogger3.log("Generating content from context...");
      const content = await generateObjectDeprecated2({
        runtime,
        context: statsContext,
        modelClass: ModelClass2.LARGE
      });
      if (!content || !content.collectionAddr) {
        throw new Error("Invalid or missing collection address in parsed content");
      }
      debugLog.validation(content);
      const config = await validateStargazeConfig(runtime);
      const requestData = {
        query: COLLECTION_STATS_QUERY,
        variables: {
          collectionAddr: content.collectionAddr
        }
      };
      debugLog.request("POST", config.STARGAZE_ENDPOINT, requestData);
      const response = await axios2.post(
        config.STARGAZE_ENDPOINT,
        requestData,
        {
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
      debugLog.response(response);
      const stats = response.data?.data?.collection?.stats;
      const name = response.data?.data?.collection?.name;
      if (!stats) {
        throw new Error("No stats found for collection");
      }
      const formatValue = (value) => value ? Number(value).toLocaleString(void 0, {
        maximumFractionDigits: 2
      }) : "0";
      const formatPercent = (value) => value ? `${Number(value).toFixed(2)}%` : "0%";
      if (callback) {
        const message2 = {
          text: `Collection Stats for ${name} (${content.collectionAddr}):
- Total Volume: ${formatValue(stats.volumeUsdTotal)} USD
- 24h Volume: ${formatValue(stats.volumeUsd24hour)} USD
- Total Sales: ${formatValue(stats.salesCountTotal)}
- Unique Owners: ${formatValue(stats.numOwners)}
- Owner Ratio: ${formatPercent(stats.uniqueOwnerPercent)}
- Minted: ${formatPercent(stats.tokensMintedPercent)}
- 24h Change: ${formatPercent(stats.change24HourPercent)}
- 24h Mints: ${formatValue(stats.mintCount24hour)}
- Market Cap: ${formatValue(stats.marketCap)} USD`,
          content: stats
        };
        elizaLogger3.log("\u2705 Sending callback with collection stats:", message2);
        callback(message2);
      }
      return true;
    } catch (error) {
      debugLog.error(error);
      if (callback) {
        callback({
          text: `Error fetching collection stats: ${error}`,
          content: { error }
        });
      }
      return false;
    }
  },
  examples: [[
    {
      user: "{{user1}}",
      content: {
        text: "Show me stats for collection ammelia"
      }
    },
    {
      user: "{{agent}}",
      content: {
        text: "I'll check the stats for collection ammelia...",
        action: "GET_COLLECTION_STATS"
      }
    },
    {
      user: "{{user1}}",
      content: {
        text: "Show me stats for collection {collection address}"
      }
    },
    {
      user: "{{agent}}",
      content: {
        text: "I'll check the stats for collection {collection address}...",
        action: "GET_COLLECTION_STATS"
      }
    }
  ]]
};

// src/actions/getTokenSales.ts
import {
  composeContext as composeContext3,
  elizaLogger as elizaLogger4,
  generateObjectDeprecated as generateObjectDeprecated3,
  ModelClass as ModelClass3
} from "@elizaos/core";
import axios3 from "axios";
var getTokenSalesTemplate = `Given the message, extract the collection address for fetching Stargaze sales data.

Format the response as a JSON object with these fields:
- collectionAddr: the collection address or name (required)
- limit: number of sales to fetch (default to 5)

Example response:
\`\`\`json
{
    "collectionAddr": "ammelia",
    "limit": 5
}
\`\`\`

{{recentMessages}}

Extract the collection information from the above messages and respond with the appropriate JSON.`;
var TOKEN_SALES_QUERY = `
query TokenSales($collectionAddr: String!, $limit: Int) {
    tokenSales(
        filterByCollectionAddrs: [$collectionAddr]
        limit: $limit
        sortBy: USD_PRICE_DESC
    ) {
        tokenSales {
            id
            token {
                tokenId
                name
                media {
                    url
                }
            }
            price
            priceUsd
            date
            saleDenomSymbol
            saleType
            buyer {
                address
            }
            seller {
                address
            }
        }
    }
}`;
var getTokenSales_default = {
  name: "GET_TOKEN_SALES",
  similes: ["CHECK_SALES", "RECENT_SALES"],
  validate: async (runtime, _message) => {
    elizaLogger4.log("\u{1F504} Validating Stargaze configuration...");
    try {
      const config = await validateStargazeConfig(runtime);
      debugLog.validation(config);
      return true;
    } catch (error) {
      debugLog.error(error);
      return false;
    }
  },
  description: "Get recent sales data for a Stargaze collection",
  handler: async (runtime, message, state, _options, callback) => {
    elizaLogger4.log("\u{1F680} Starting Stargaze GET_TOKEN_SALES handler...");
    if (!state) {
      elizaLogger4.log("Creating new state...");
      state = await runtime.composeState(message);
    } else {
      elizaLogger4.log("Updating existing state...");
      state = await runtime.updateRecentMessageState(state);
    }
    try {
      elizaLogger4.log("Composing sales context...");
      const salesContext = composeContext3({
        state,
        template: getTokenSalesTemplate
      });
      elizaLogger4.log("Generating content from context...");
      const content = await generateObjectDeprecated3({
        runtime,
        context: salesContext,
        modelClass: ModelClass3.LARGE
      });
      if (!content || !content.collectionAddr) {
        throw new Error("Invalid or missing collection address in parsed content");
      }
      debugLog.validation(content);
      const config = await validateStargazeConfig(runtime);
      const requestData = {
        query: TOKEN_SALES_QUERY,
        variables: {
          collectionAddr: content.collectionAddr,
          limit: content.limit || 5
        }
      };
      debugLog.request("POST", config.STARGAZE_ENDPOINT, requestData);
      const response = await axios3.post(
        config.STARGAZE_ENDPOINT,
        requestData,
        {
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
      debugLog.response(response);
      const sales = response.data?.data?.tokenSales?.tokenSales;
      if (!sales?.length) {
        throw new Error("No sales found for collection");
      }
      const formatPrice = (price, symbol) => `${Number(price).toLocaleString(void 0, {
        maximumFractionDigits: 2
      })} ${symbol}`;
      const formatDate = (dateStr) => {
        try {
          return new Date(dateStr).toLocaleString();
        } catch {
          return dateStr;
        }
      };
      if (callback) {
        const salesText = sales.map(
          (sale) => `\u2022 ${sale.token.name} (ID: ${sale.token.tokenId})
    Price: ${formatPrice(sale.price, sale.saleDenomSymbol)} ($${sale.priceUsd.toFixed(2)})
    Date: ${formatDate(sale.date)}
    Type: ${sale.saleType}
    Seller: ${sale.seller.address}
    Buyer: ${sale.buyer.address}`
        ).join("\n\n");
        callback({
          text: `Recent sales for ${content.collectionAddr}:

${salesText}`,
          content: {
            collection: content.collectionAddr,
            sales
          }
        });
      }
      return true;
    } catch (error) {
      debugLog.error(error);
      if (callback) {
        callback({
          text: `Error fetching sales data: ${error instanceof Error ? error.message : "Unknown error"}`,
          content: { error: error instanceof Error ? error.message : "Unknown error" }
        });
      }
      return false;
    }
  },
  examples: [[
    {
      user: "{{user1}}",
      content: {
        text: "Show me recent sales from collection ammelia"
      }
    },
    {
      user: "{{agent}}",
      content: {
        text: "I'll check the recent sales for the ammelia collection...",
        action: "GET_TOKEN_SALES"
      }
    },
    {
      user: "{{agent}}",
      content: {
        text: "Here are the recent sales data for ammelia collection:\n\u2022 NFT #123 - Sold for 100 STARS ($5.20)\n\u2022 NFT #124 - Sold for 95 STARS ($4.95)"
      }
    }
  ]]
};

// src/index.ts
var stargazePlugin = {
  name: "stargaze",
  description: "Stargaze NFT Plugin for Eliza",
  actions: [
    getLatestNFT_default,
    getCollectionStats_default,
    getTokenSales_default
  ],
  evaluators: [],
  providers: []
};
var index_default = stargazePlugin;
export {
  index_default as default,
  stargazePlugin
};
//# sourceMappingURL=index.js.map