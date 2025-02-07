// src/actions/getPrice/index.ts
import {
  composeContext,
  elizaLogger,
  generateObjectDeprecated,
  ModelClass
} from "@elizaos/core";

// src/environment.ts
import { z } from "zod";
var coinmarketcapEnvSchema = z.object({
  COINMARKETCAP_API_KEY: z.string().min(1, "CoinMarketCap API key is required")
});
async function validateCoinMarketCapConfig(runtime) {
  try {
    const config = {
      COINMARKETCAP_API_KEY: runtime.getSetting("COINMARKETCAP_API_KEY")
    };
    return coinmarketcapEnvSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map((err) => `${err.path.join(".")}: ${err.message}`).join("\n");
      throw new Error(
        `CoinMarketCap configuration validation failed:
${errorMessages}`
      );
    }
    throw error;
  }
}

// src/actions/getPrice/examples.ts
var priceExamples = [
  [
    {
      user: "{{user1}}",
      content: {
        text: "What's the current price of Bitcoin?"
      }
    },
    {
      user: "{{agent}}",
      content: {
        text: "Let me check the current Bitcoin price for you.",
        action: "GET_PRICE"
      }
    },
    {
      user: "{{agent}}",
      content: {
        text: "The current price of BTC is 65,432.21 USD"
      }
    }
  ],
  [
    {
      user: "{{user1}}",
      content: {
        text: "Check ETH price in EUR"
      }
    },
    {
      user: "{{agent}}",
      content: {
        text: "I'll check the current Ethereum price in EUR.",
        action: "GET_PRICE"
      }
    },
    {
      user: "{{agent}}",
      content: {
        text: "The current price of ETH is 2,345.67 EUR"
      }
    }
  ]
];

// src/actions/getPrice/service.ts
import axios from "axios";
var BASE_URL = "https://pro-api.coinmarketcap.com/v1";
var createPriceService = (apiKey) => {
  const client = axios.create({
    baseURL: BASE_URL,
    headers: {
      "X-CMC_PRO_API_KEY": apiKey,
      Accept: "application/json"
    }
  });
  const getPrice = async (symbol, currency) => {
    const normalizedSymbol = symbol.toUpperCase().trim();
    const normalizedCurrency = currency.toUpperCase().trim();
    try {
      const response = await client.get(
        "/cryptocurrency/quotes/latest",
        {
          params: {
            symbol: normalizedSymbol,
            convert: normalizedCurrency
          }
        }
      );
      console.log(
        "API Response:",
        JSON.stringify(response.data, null, 2)
      );
      const symbolData = response.data.data[normalizedSymbol];
      if (!symbolData) {
        throw new Error(
          `No data found for symbol: ${normalizedSymbol}`
        );
      }
      const quoteData = symbolData.quote[normalizedCurrency];
      if (!quoteData) {
        throw new Error(
          `No quote data found for currency: ${normalizedCurrency}`
        );
      }
      return {
        price: quoteData.price,
        marketCap: quoteData.market_cap,
        volume24h: quoteData.volume_24h,
        percentChange24h: quoteData.percent_change_24h
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const errorMessage = error.response?.data?.status?.error_message || error.message;
        console.error("API Error:", errorMessage);
        throw new Error(`API Error: ${errorMessage}`);
      }
      throw error;
    }
  };
  return { getPrice };
};

// src/actions/getPrice/template.ts
var getPriceTemplate = `Respond with a JSON object containing BOTH symbol and currency. Currency must default to "USD" if not specified.

Here are the cryptocurrency symbol mappings:
- bitcoin/btc -> BTC
- ethereum/eth -> ETH
- solana/sol -> SOL
- cardano/ada -> ADA
- ripple/xrp -> XRP
- dogecoin/doge -> DOGE
- polkadot/dot -> DOT
- usdc -> USDC
- tether/usdt -> USDT

IMPORTANT: Response must ALWAYS include both "symbol" and "currency" fields.

Example response:
\`\`\`json
{
    "symbol": "BTC",
    "currency": "USD"
}
\`\`\`

{{recentMessages}}

Extract the cryptocurrency from the most recent message. Always include currency (default "USD").
Respond with a JSON markdown block containing both symbol and currency.`;

// src/actions/getPrice/validation.ts
import { z as z2 } from "zod";
var GetPriceSchema = z2.object({
  symbol: z2.string(),
  currency: z2.string().default("USD")
});
function isGetPriceContent(content) {
  return typeof content.symbol === "string" && typeof content.currency === "string";
}

// src/actions/getPrice/index.ts
var getPrice_default = {
  name: "GET_PRICE",
  similes: [
    "CHECK_PRICE",
    "PRICE_CHECK",
    "GET_CRYPTO_PRICE",
    "CHECK_CRYPTO_PRICE",
    "GET_TOKEN_PRICE",
    "CHECK_TOKEN_PRICE"
  ],
  // eslint-disable-next-line
  validate: async (runtime, _message) => {
    await validateCoinMarketCapConfig(runtime);
    return true;
  },
  description: "Get the current price of a cryptocurrency from CoinMarketCap",
  handler: async (runtime, message, state, _options, callback) => {
    elizaLogger.log("Starting CoinMarketCap GET_PRICE handler...");
    let currentState = state;
    if (!currentState) {
      currentState = await runtime.composeState(message);
    } else {
      currentState = await runtime.updateRecentMessageState(currentState);
    }
    try {
      const priceContext = composeContext({
        state: currentState,
        template: getPriceTemplate
      });
      const content = await generateObjectDeprecated({
        runtime,
        context: priceContext,
        modelClass: ModelClass.SMALL
      });
      if (!isGetPriceContent(content)) {
        throw new Error("Invalid price check content");
      }
      const config = await validateCoinMarketCapConfig(runtime);
      const priceService = createPriceService(
        config.COINMARKETCAP_API_KEY
      );
      try {
        const priceData = await priceService.getPrice(
          content.symbol,
          content.currency
        );
        elizaLogger.success(
          `Price retrieved successfully! ${content.symbol}: ${priceData.price} ${content.currency.toUpperCase()}`
        );
        if (callback) {
          callback({
            text: `The current price of ${content.symbol} is ${priceData.price} ${content.currency.toUpperCase()}`,
            content: {
              symbol: content.symbol,
              currency: content.currency,
              ...priceData
            }
          });
        }
        return true;
      } catch (error) {
        elizaLogger.error("Error in GET_PRICE handler:", error);
        if (callback) {
          callback({
            text: `Error fetching price: ${error.message}`,
            content: { error: error.message }
          });
        }
        return false;
      }
    } catch (error) {
      elizaLogger.error("Error in GET_PRICE handler:", error);
      if (callback) {
        callback({
          text: `Error fetching price: ${error.message}`,
          content: { error: error.message }
        });
      }
      return false;
    }
  },
  examples: priceExamples
};

// src/index.ts
var coinmarketcapPlugin = {
  name: "coinmarketcap",
  description: "CoinMarketCap Plugin for Eliza",
  actions: [getPrice_default],
  evaluators: [],
  providers: []
};
var index_default = coinmarketcapPlugin;
export {
  coinmarketcapPlugin,
  index_default as default
};
//# sourceMappingURL=index.js.map