// src/index.ts
import chalk from "chalk";
import Table from "cli-table3";
import ora from "ora";

// src/environment.ts
import { z } from "zod";
var ENV = "production";
var HYPERBOLIC_ENDPOINTS = {
  production: {
    marketplace: "https://api.hyperbolic.xyz/v1/marketplace",
    balance: "https://api.hyperbolic.xyz/billing/get_current_balance",
    history: "https://api.hyperbolic.xyz/billing/purchase_history",
    instances: {
      base: "https://api.hyperbolic.xyz/v1/marketplace/instances",
      history: "https://api.hyperbolic.xyz/v1/marketplace/instances/history",
      create: "https://api.hyperbolic.xyz/v1/marketplace/instances/create",
      terminate: "https://api.hyperbolic.xyz/v1/marketplace/instances/terminate",
      gpu_status: "https://api.hyperbolic.xyz/v1/marketplace/instances/{id}/status"
    }
  },
  staging: {
    marketplace: process.env.HYPERBOLIC_STAGING_MARKETPLACE || "https://api-staging.hyperbolic.xyz/v1/marketplace",
    balance: process.env.HYPERBOLIC_STAGING_BALANCE || "https://api-staging.hyperbolic.xyz/billing/get_current_balance",
    history: process.env.HYPERBOLIC_STAGING_HISTORY || "https://api-staging.hyperbolic.xyz/billing/purchase_history",
    instances: {
      base: process.env.HYPERBOLIC_STAGING_INSTANCES || "https://api-staging.hyperbolic.xyz/v1/marketplace/instances",
      history: process.env.HYPERBOLIC_STAGING_INSTANCES_HISTORY || "https://api-staging.hyperbolic.xyz/v1/marketplace/instances/history",
      create: process.env.HYPERBOLIC_STAGING_INSTANCES_CREATE || "https://api-staging.hyperbolic.xyz/v1/marketplace/instances/create",
      terminate: process.env.HYPERBOLIC_STAGING_INSTANCES_TERMINATE || "https://api-staging.hyperbolic.xyz/v1/marketplace/instances/terminate",
      gpu_status: "https://api.hyperbolic.xyz/v1/marketplace/instances/{id}/status"
    }
  }
};
var hyperbolicEnvSchema = z.object({
  // API Configuration
  HYPERBOLIC_ENV: z.enum(["production", "staging"]).default("production"),
  HYPERBOLIC_API_KEY: z.string().min(1, "HYPERBOLIC_API_KEY is required"),
  // Request Configuration
  HYPERBOLIC_MAX_RETRIES: z.string().transform(Number).default("3"),
  HYPERBOLIC_RETRY_DELAY: z.string().transform(Number).default("1000"),
  HYPERBOLIC_TIMEOUT: z.string().transform(Number).default("5000"),
  // Logging Configuration
  HYPERBOLIC_GRANULAR_LOG: z.boolean().default(true),
  HYPERBOLIC_LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),
  // SSH Configuration
  HYPERBOLIC_SSH_PRIVATE_KEY_PATH: z.string().optional(),
  // Runtime Configuration
  HYPERBOLIC_RUNTIME_CHECK_MODE: z.boolean().default(false),
  HYPERBOLIC_SPASH: z.boolean().default(false)
});
function getConfig(env = ENV || process.env.HYPERBOLIC_ENV) {
  ENV = env || "production";
  return {
    HYPERBOLIC_ENV: env || "production",
    HYPERBOLIC_API_KEY: process.env.HYPERBOLIC_API_KEY || "",
    HYPERBOLIC_MAX_RETRIES: Number(process.env.HYPERBOLIC_MAX_RETRIES || "3"),
    HYPERBOLIC_RETRY_DELAY: Number(process.env.HYPERBOLIC_RETRY_DELAY || "1000"),
    HYPERBOLIC_TIMEOUT: Number(process.env.HYPERBOLIC_TIMEOUT || "5000"),
    HYPERBOLIC_GRANULAR_LOG: process.env.HYPERBOLIC_GRANULAR_LOG === "true" || false,
    HYPERBOLIC_LOG_LEVEL: process.env.HYPERBOLIC_LOG_LEVEL || "info",
    HYPERBOLIC_SSH_PRIVATE_KEY_PATH: process.env.SSH_PRIVATE_KEY_PATH,
    HYPERBOLIC_RUNTIME_CHECK_MODE: process.env.RUNTIME_CHECK_MODE === "true" || false,
    HYPERBOLIC_SPASH: process.env.HYPERBOLIC_SPASH === "true" || false
  };
}
async function validateHyperbolicConfig(runtime) {
  try {
    const envConfig = getConfig(
      runtime.getSetting("HYPERBOLIC_ENV") ?? void 0
    );
    const config7 = {
      HYPERBOLIC_ENV: process.env.HYPERBOLIC_ENV || runtime.getSetting("HYPERBOLIC_ENV") || envConfig.HYPERBOLIC_ENV,
      HYPERBOLIC_API_KEY: process.env.HYPERBOLIC_API_KEY || runtime.getSetting("HYPERBOLIC_API_KEY") || envConfig.HYPERBOLIC_API_KEY,
      HYPERBOLIC_MAX_RETRIES: process.env.HYPERBOLIC_MAX_RETRIES || runtime.getSetting("HYPERBOLIC_MAX_RETRIES") || envConfig.HYPERBOLIC_MAX_RETRIES.toString(),
      HYPERBOLIC_RETRY_DELAY: process.env.HYPERBOLIC_RETRY_DELAY || runtime.getSetting("HYPERBOLIC_RETRY_DELAY") || envConfig.HYPERBOLIC_RETRY_DELAY.toString(),
      HYPERBOLIC_TIMEOUT: process.env.HYPERBOLIC_TIMEOUT || runtime.getSetting("HYPERBOLIC_TIMEOUT") || envConfig.HYPERBOLIC_TIMEOUT.toString(),
      HYPERBOLIC_GRANULAR_LOG: process.env.HYPERBOLIC_GRANULAR_LOG === "true" || false,
      HYPERBOLIC_LOG_LEVEL: process.env.HYPERBOLIC_LOG_LEVEL || runtime.getSetting("HYPERBOLIC_LOG_LEVEL") || envConfig.HYPERBOLIC_LOG_LEVEL,
      HYPERBOLIC_SSH_PRIVATE_KEY_PATH: process.env.SSH_PRIVATE_KEY_PATH || runtime.getSetting("SSH_PRIVATE_KEY_PATH"),
      HYPERBOLIC_RUNTIME_CHECK_MODE: process.env.RUNTIME_CHECK_MODE === "true" || false,
      HYPERBOLIC_SPASH: process.env.HYPERBOLIC_SPASH === "true" || false
    };
    return hyperbolicEnvSchema.parse(config7);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to validate Hyperbolic configuration: ${errorMessage}`);
  }
}

// src/actions/actionGetAvailableGpus.ts
import { elizaLogger } from "@elizaos/core";
import axios from "axios";

// src/error/base.ts
var HyperbolicError = class _HyperbolicError extends Error {
  constructor(message) {
    super(message);
    this.name = "HyperbolicError";
    Object.setPrototypeOf(this, _HyperbolicError.prototype);
  }
};
var ConfigurationError = class _ConfigurationError extends HyperbolicError {
  constructor(message) {
    super(message);
    this.name = "ConfigurationError";
    Object.setPrototypeOf(this, _ConfigurationError.prototype);
  }
};
var APIError = class _APIError extends HyperbolicError {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.name = "APIError";
    Object.setPrototypeOf(this, _APIError.prototype);
  }
};
var ValidationError = class _ValidationError extends HyperbolicError {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    Object.setPrototypeOf(this, _ValidationError.prototype);
  }
};

// src/actions/actionGetAvailableGpus.ts
var config = getConfig();
var GRANULAR_LOG = config.HYPERBOLIC_GRANULAR_LOG;
var logGranular = (message, data) => {
  if (GRANULAR_LOG) {
    elizaLogger.info(`[GetAvailableGpus] ${message}`, data);
    console.log(`[GetAvailableGpus] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  }
};
var actionGetAvailableGpus = {
  name: "GET_HB_AVAILABLE_GPUS",
  similes: ["LIST_GPUS", "SHOW_GPUS", "AVAILABLE_GPUS", "FIND_GPUS"],
  description: "Get all available GPU machines on the Hyperbolic platform with their specifications and pricing.",
  examples: [[
    {
      user: "user",
      content: {
        text: "Show me available GPUs on Hyperbolic",
        filters: {}
      }
    },
    {
      user: "assistant",
      content: {
        text: "Here are the available GPUs on the Hyperbolic platform:\n\nGPU Model: RTX 4090\nMemory: 24GB\nCompute Capability: 8.9\nPricing: $2.5/hour ($1800/month)\nLocation: US-East\nStatus: \u2713 Available\nPerformance Score: 95/100",
        success: true,
        data: {
          gpus: [{
            model: "RTX 4090",
            memory: 24,
            price: 2.5,
            available: 8,
            total: 8,
            location: "US-East"
          }]
        }
      }
    }
  ]],
  validate: async (_runtime, message) => {
    if (message.content?.type !== "GET_HB_AVAILABLE_GPUS") {
      return true;
    }
    logGranular("Validating GET_HB_AVAILABLE_GPUS action", {
      content: message.content
    });
    try {
      const content = message.content;
      if (content.filters && typeof content.filters !== "object") {
        throw new ValidationError("Invalid filters format - must be an object");
      }
      logGranular("Validation successful");
      return true;
    } catch (error) {
      logGranular("Validation failed", { error });
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError(error instanceof Error ? error.message : "Unknown validation error");
    }
  },
  handler: async (runtime, message, _state, _options = {}, callback) => {
    logGranular("Executing GET_HB_AVAILABLE_GPUS action");
    try {
      const config7 = await validateHyperbolicConfig(runtime);
      console.log("Debug - Config validated:", {
        hasApiKey: !!config7.HYPERBOLIC_API_KEY,
        env: config7.HYPERBOLIC_ENV
      });
      const apiKey = config7.HYPERBOLIC_API_KEY;
      if (!apiKey) {
        throw new ConfigurationError("HYPERBOLIC_API_KEY not found in environment variables");
      }
      const content = message.content;
      logGranular("Processing request with filters", { filters: content.filters });
      try {
        logGranular("Making request to Hyperbolic marketplace API");
        const response = await axios.post(
          HYPERBOLIC_ENDPOINTS[config7.HYPERBOLIC_ENV].marketplace,
          { filters: content.filters || {} },
          {
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`
            }
          }
        );
        logGranular("Received response from API", {
          statusCode: response.status,
          dataLength: response.data?.instances?.length
        });
        const gpuMap = /* @__PURE__ */ new Map();
        for (const instance of response.data.instances) {
          if (instance.status === "node_ready") {
            const gpu = instance.hardware.gpus[0];
            const gpuModel = gpu.model.replace("NVIDIA-", "");
            const memory = Math.round(gpu.ram / 1024);
            const price = instance.pricing.price.amount / 100;
            const available = instance.gpus_total - instance.gpus_reserved;
            const total = instance.gpus_total;
            const location = instance.location.region;
            const storage = instance.hardware.storage[0]?.capacity || 0;
            const ram = instance.hardware.ram[0]?.capacity || 0;
            const cpuCores = instance.hardware.cpus[0]?.virtual_cores || 0;
            const key = `${gpuModel}-${price}-${instance.cluster_name}`;
            if (!gpuMap.has(key)) {
              gpuMap.set(key, {
                model: gpuModel,
                memory,
                price,
                available,
                total,
                location,
                node_id: instance.id,
                cluster_name: instance.cluster_name,
                compute_power: gpu.compute_power || 0,
                clock_speed: gpu.clock_speed || 0,
                storage_capacity: storage,
                ram_capacity: ram,
                cpu_cores: cpuCores,
                status: instance.status
              });
            } else {
              const existing = gpuMap.get(key);
              if (existing) {
                existing.available += available;
                existing.total += total;
              }
            }
          }
        }
        const gpus = Array.from(gpuMap.values());
        gpus.sort((a, b) => b.price - a.price || b.available - a.available);
        const formattedText = `Available GPU Types:

${gpus.map((gpu) => {
          const monthlyPrice = Math.round(gpu.price * 24 * 30);
          const storageGB = Math.round(gpu.storage_capacity / 1024);
          const ramGB = Math.round(gpu.ram_capacity / 1024);
          return `${gpu.model} (${gpu.memory}GB):
- Price: $${gpu.price.toFixed(2)}/hour ($${monthlyPrice}/month)
- Available: ${gpu.available}/${gpu.total} units
- Location: ${gpu.location}
- Node ID: ${gpu.node_id}
- Cluster: ${gpu.cluster_name}
- Hardware Specs:
  \u2022 CPU: ${gpu.cpu_cores} virtual cores
  \u2022 RAM: ${ramGB}GB
  \u2022 Storage: ${storageGB}GB
  \u2022 GPU Clock: ${gpu.clock_speed}MHz
  \u2022 Compute Power: ${gpu.compute_power} TFLOPS
- Status: ${gpu.status}

To rent this GPU, use:
  \u2022 Node ID: ${gpu.node_id}
  \u2022 Cluster Name: ${gpu.cluster_name}
`;
        }).join("\n")}

                Note: Use the Node ID and Cluster Name when creating an instance. These are the unique identifiers required for the rental process.`;
        if (callback) {
          logGranular("Sending success callback with formatted text", { formattedText });
          callback({
            text: formattedText,
            success: true,
            data: {
              gpus
            }
          });
        }
        return true;
      } catch (error) {
        logGranular("API request failed", { error });
        if (axios.isAxiosError(error)) {
          throw new APIError(
            `Failed to fetch GPU data: ${error.message}`,
            error.response?.status
          );
        }
        throw new APIError("Failed to fetch GPU data");
      }
    } catch (error) {
      logGranular("Handler execution failed", { error });
      if (callback) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        callback({
          text: `Error getting available GPUs: ${errorMessage}`,
          success: false,
          data: {
            gpus: [],
            error: errorMessage
          }
        });
      }
      if (error instanceof ConfigurationError || error instanceof ValidationError || error instanceof APIError) {
        throw error;
      }
      throw new APIError("Failed to execute GET_HB_AVAILABLE_GPUS action");
    }
  }
};

// src/actions/actionGetCurrentBalance.ts
import { elizaLogger as elizaLogger2 } from "@elizaos/core";
import axios2 from "axios";
import { Decimal } from "decimal.js";
var config2 = getConfig();
var GRANULAR_LOG2 = config2.HYPERBOLIC_GRANULAR_LOG;
var logGranular2 = (message, data) => {
  if (GRANULAR_LOG2) {
    elizaLogger2.info(`[GetCurrentBalance] ${message}`, data);
    console.log(`[GetCurrentBalance] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  }
};
var actionGetCurrentBalance = {
  name: "GET_HB_CURRENT_BALANCE",
  similes: ["CHECK_BALANCE", "SHOW_BALANCE", "VIEW_BALANCE", "BALANCE_CHECK"],
  description: "Get the current balance of your Hyperbolic account in USD and crypto currencies.",
  examples: [[
    {
      user: "user",
      content: {
        text: "Show my current balance on Hyperbolic"
      }
    },
    {
      user: "assistant",
      content: {
        text: "Your current balances are:\nUSD: $1,000.00\nETH: 0.5\nBTC: 0.01",
        success: true,
        data: {
          balances: {
            USD: "1000.00",
            ETH: "0.5",
            BTC: "0.01"
          }
        }
      }
    }
  ], [
    {
      user: "user",
      content: {
        text: "Get my ETH balance",
        currency: "ETH"
      }
    },
    {
      user: "assistant",
      content: {
        text: "Your ETH balance is: 0.5 ETH",
        success: true,
        data: {
          balances: {
            ETH: "0.5"
          }
        }
      }
    }
  ]],
  validate: async (_runtime, message) => {
    if (message.content?.type !== "GET_CURRENT_BALANCE") {
      return true;
    }
    logGranular2("Validating GET_CURRENT_BALANCE action", {
      content: message.content
    });
    try {
      const content = message.content;
      if (content.currency && typeof content.currency !== "string") {
        throw new ValidationError("Currency must be a string");
      }
      logGranular2("Validation successful");
      return true;
    } catch (error) {
      logGranular2("Validation failed", { error });
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError(error instanceof Error ? error.message : "Unknown validation error");
    }
  },
  handler: async (runtime, message, _state, _options = {}, callback) => {
    logGranular2("Executing GET_CURRENT_BALANCE action");
    try {
      const config7 = await validateHyperbolicConfig(runtime);
      console.log("Debug - Config validated:", {
        hasApiKey: !!config7.HYPERBOLIC_API_KEY,
        env: config7.HYPERBOLIC_ENV
      });
      const apiKey = config7.HYPERBOLIC_API_KEY;
      if (!apiKey) {
        throw new ConfigurationError("HYPERBOLIC_API_KEY not found in environment variables");
      }
      const content = message.content;
      logGranular2("Processing request", { currency: content.currency });
      try {
        const response = await axios2.get(
          HYPERBOLIC_ENDPOINTS[config7.HYPERBOLIC_ENV].balance,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`
            },
            params: content.currency ? { currency: content.currency } : void 0
          }
        );
        logGranular2("Received response from API", {
          statusCode: response.status,
          dataLength: Object.keys(response.data).length
        });
        const balances = {};
        for (const [key, value] of Object.entries(response.data)) {
          if (typeof value === "number") {
            balances[key] = new Decimal(value).dividedBy(100).toFixed(2);
          }
        }
        const formattedText = Object.entries(balances).map(([currency, amount]) => `${currency}: ${amount}`).join("\n");
        if (callback) {
          logGranular2("Sending success callback with formatted text", { formattedText });
          callback({
            text: `Your current balances are:
${formattedText}`,
            success: true,
            data: {
              balances
            }
          });
        }
        return true;
      } catch (error) {
        logGranular2("API request failed", { error });
        if (axios2.isAxiosError(error)) {
          throw new APIError(
            `Failed to fetch balance data: ${error.message}`,
            error.response?.status
          );
        }
        throw new APIError("Failed to fetch balance data");
      }
    } catch (error) {
      logGranular2("Handler execution failed", { error });
      if (callback) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        callback({
          text: `Error getting current balance: ${errorMessage}`,
          success: false,
          data: {
            error: errorMessage
          }
        });
      }
      if (error instanceof ConfigurationError || error instanceof ValidationError || error instanceof APIError) {
        throw error;
      }
      throw new APIError("Failed to execute GET_CURRENT_BALANCE action");
    }
  }
};

// src/actions/actionGetGpuStatus.ts
import { elizaLogger as elizaLogger3 } from "@elizaos/core";
import axios3 from "axios";
var config3 = getConfig();
var GRANULAR_LOG3 = config3.HYPERBOLIC_GRANULAR_LOG;
var logGranular3 = (message, data) => {
  if (GRANULAR_LOG3) {
    elizaLogger3.info(`[GetGpuStatus] ${message}`, data);
    console.log(`[GetGpuStatus] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  }
};
var actionGetGpuStatus = {
  name: "GET_HB_GPU_STATUS",
  similes: ["CHECK_GPU", "GPU_STATUS", "INSTANCE_STATUS", "CHECK_INSTANCE", "LIST_INSTANCES"],
  description: "List all GPU instances or get detailed status information about a specific GPU instance.",
  examples: [[
    {
      user: "user",
      content: {
        text: "Check status of all my GPU instances on Hyperbolic"
      }
    },
    {
      user: "assistant",
      content: {
        text: "GPU Instance Status:\nState: Running\nUptime: 2.5 hours\nGPU Utilization: 85%\nMemory Usage: 75%\nTemperature: 65\xB0C\nPower Usage: 250W\n\nRunning Processes:\n- PyTorch Training (PID: 1234): 70% GPU, 8GB Memory\n- TensorFlow Inference (PID: 5678): 15% GPU, 4GB Memory",
        instanceId: "abc123",
        success: true,
        data: {
          status: {
            state: "running",
            uptime: 9e3,
            gpu_utilization: 85,
            memory_utilization: 75,
            temperature: 65,
            power_usage: 250,
            processes: [
              {
                pid: 1234,
                name: "PyTorch Training",
                memory_usage: 8192,
                gpu_usage: 70
              },
              {
                pid: 5678,
                name: "TensorFlow Inference",
                memory_usage: 4096,
                gpu_usage: 15
              }
            ]
          }
        }
      }
    }
  ]],
  validate: async (_runtime, message) => {
    if (message.content?.type !== "GET_HB_GPU_STATUS") {
      return true;
    }
    logGranular3("Validating GET_HB_GPU_STATUS action", {
      content: message.content
    });
    try {
      const content = message.content;
      if (content.instanceId && typeof content.instanceId !== "string") {
        throw new ValidationError("If provided, Instance ID must be a string");
      }
      logGranular3("Validation successful");
      return true;
    } catch (error) {
      logGranular3("Validation failed", { error });
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError(error instanceof Error ? error.message : "Unknown validation error");
    }
  },
  handler: async (runtime, message, _state, _options = {}, callback) => {
    logGranular3("Executing GET_HB_GPU_STATUS action");
    try {
      const config7 = await validateHyperbolicConfig(runtime);
      console.log("Debug - Config validated:", {
        hasApiKey: !!config7.HYPERBOLIC_API_KEY,
        env: config7.HYPERBOLIC_ENV
      });
      const apiKey = config7.HYPERBOLIC_API_KEY;
      if (!apiKey) {
        throw new ConfigurationError("HYPERBOLIC_API_KEY not found in environment variables");
      }
      const content = message.content;
      logGranular3("Processing request", { instanceId: content.instanceId });
      try {
        const response = await axios3.get(
          HYPERBOLIC_ENDPOINTS[config7.HYPERBOLIC_ENV].instances.base,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`
            }
          }
        );
        logGranular3("Received response from API", {
          statusCode: response.status
        });
        const instances = response.data.instances || [];
        const formattedText = instances.length > 0 ? `Your GPU Instances:

${instances.map(
          (instance) => `Instance ID: ${instance.id}
Status: ${instance.instance.status}
SSH Access: ${instance.sshCommand}
GPU: ${instance.instance.hardware.gpus[0].model}
Price: $${instance.instance.pricing.price.amount}/hour`
        ).join("\n-------------------\n\n")}` : "No active GPU instances found.";
        logGranular3("Sending success callback with formatted text", { formattedText });
        if (callback) {
          callback({
            text: formattedText,
            success: true,
            data: {
              instances: response.data.instances
            }
          });
        }
        return true;
      } catch (error) {
        logGranular3("API request failed", { error });
        if (axios3.isAxiosError(error)) {
          if (error.response?.status === 404) {
            throw new APIError(
              `Instance ${content.instanceId} not found or GPU status is not available. Please verify the instance ID and try again.`,
              404
            );
          }
          throw new APIError(
            `Failed to fetch GPU status: ${error.message}`,
            error.response?.status
          );
        }
        throw new APIError("Failed to fetch GPU status");
      }
    } catch (error) {
      logGranular3("Handler execution failed", { error });
      if (callback) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        callback({
          text: `Error getting GPU status: ${errorMessage}`,
          instanceId: message.content.instanceId,
          success: false,
          data: {
            error: errorMessage
          }
        });
      }
      if (error instanceof ConfigurationError || error instanceof ValidationError || error instanceof APIError) {
        throw error;
      }
      throw new APIError("Failed to execute GET_HB_GPU_STATUS action");
    }
  }
};

// src/actions/actionGetSpendHistory.ts
import { elizaLogger as elizaLogger4 } from "@elizaos/core";
import axios4 from "axios";
import { Decimal as Decimal2 } from "decimal.js";
var config4 = getConfig();
var GRANULAR_LOG4 = config4.HYPERBOLIC_GRANULAR_LOG;
var logGranular4 = (message, data) => {
  if (GRANULAR_LOG4) {
    elizaLogger4.info(`[GetSpendHistory] ${message}`, data);
    console.log(`[GetSpendHistory] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  }
};
var actionGetSpendHistory = {
  name: "GET_HB_SPEND_HISTORY",
  similes: ["CHECK_SPENDING", "VIEW_EXPENSES", "SPENDING_HISTORY", "COST_HISTORY"],
  description: "Get the spending history for your Hyperbolic account, optionally filtered by date range and currency.",
  examples: [[
    {
      user: "user",
      content: {
        text: "Show my spending history on Hyperbolic"
      }
    },
    {
      user: "assistant",
      content: {
        text: "Here's your spending history for the last 30 days:\n\nTotal Spend: $2,500\n\nBreakdown by Service:\n- GPU Compute: $2,000 (80%)\n- Storage: $300 (12%)\n- Network: $200 (8%)\n\nTop Instances:\n1. RTX 4090 Instance (gpu-123): $1,200\n2. A100 Instance (gpu-456): $800\n3. Storage Volume (vol-789): $300",
        success: true,
        data: {
          totalSpend: 2500,
          breakdown: {
            compute: 2e3,
            storage: 300,
            network: 200
          },
          topInstances: [
            {
              id: "gpu-123",
              name: "RTX 4090 Instance",
              spend: 1200
            },
            {
              id: "gpu-456",
              name: "A100 Instance",
              spend: 800
            },
            {
              id: "vol-789",
              name: "Storage Volume",
              spend: 300
            }
          ]
        }
      }
    }
  ], [
    {
      user: "user",
      content: {
        text: "Get my spending for the last week",
        days: 7
      }
    },
    {
      user: "assistant",
      content: {
        text: "Here's your spending history for the last 7 days:\n\nTotal Spend: $800\n\nBreakdown by Service:\n- GPU Compute: $650 (81.25%)\n- Storage: $100 (12.5%)\n- Network: $50 (6.25%)\n\nTop Instances:\n1. RTX 4090 Instance (gpu-123): $400\n2. A100 Instance (gpu-456): $250\n3. Storage Volume (vol-789): $100",
        success: true,
        data: {
          totalSpend: 800,
          breakdown: {
            compute: 650,
            storage: 100,
            network: 50
          },
          topInstances: [
            {
              id: "gpu-123",
              name: "RTX 4090 Instance",
              spend: 400
            },
            {
              id: "gpu-456",
              name: "A100 Instance",
              spend: 250
            },
            {
              id: "vol-789",
              name: "Storage Volume",
              spend: 100
            }
          ]
        }
      }
    }
  ]],
  validate: async (_runtime, message) => {
    if (message.content?.type !== "GET_HB_SPEND_HISTORY") {
      return true;
    }
    logGranular4("Validating GET_HB_SPEND_HISTORY action", {
      content: message.content
    });
    try {
      const content = message.content;
      if (content.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(content.startDate)) {
        throw new ValidationError("Start date must be in YYYY-MM-DD format");
      }
      if (content.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(content.endDate)) {
        throw new ValidationError("End date must be in YYYY-MM-DD format");
      }
      if (content.currency && typeof content.currency !== "string") {
        throw new ValidationError("Currency must be a string");
      }
      logGranular4("Validation successful");
      return true;
    } catch (error) {
      logGranular4("Validation failed", { error });
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError(error instanceof Error ? error.message : "Unknown validation error");
    }
  },
  handler: async (runtime, message, _state, _options = {}, callback) => {
    logGranular4("Executing GET_HB_SPEND_HISTORY action");
    try {
      const config7 = await validateHyperbolicConfig(runtime);
      console.log("Debug - Config validated:", {
        hasApiKey: !!config7.HYPERBOLIC_API_KEY,
        env: config7.HYPERBOLIC_ENV
      });
      const apiKey = config7.HYPERBOLIC_API_KEY;
      if (!apiKey) {
        throw new ConfigurationError("HYPERBOLIC_API_KEY not found in environment variables");
      }
      const content = message.content;
      logGranular4("Processing request", {
        startDate: content.startDate,
        endDate: content.endDate,
        currency: content.currency
      });
      try {
        const response = await axios4.get(
          HYPERBOLIC_ENDPOINTS[config7.HYPERBOLIC_ENV].history,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`
            },
            params: {
              start_date: content.startDate,
              end_date: content.endDate,
              currency: content.currency
            }
          }
        );
        logGranular4("Received response from API", {
          statusCode: response.status,
          dataLength: response.data.purchase_history?.length
        });
        const history = response.data.purchase_history || [];
        const totalSpend = history.reduce((sum, entry) => sum + (entry.amount || 0), 0) / 100;
        const dateRange = content.startDate && content.endDate ? ` (${content.startDate} - ${content.endDate})` : "";
        const currencyPrefix = content.currency ? `${content.currency} ` : "$";
        const historyText = history.length > 0 ? history.map((entry, index) => {
          const date = new Date(entry.timestamp).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "2-digit"
          });
          const amount = new Decimal2(entry.amount).dividedBy(100).toFixed(2);
          return `${index + 1}. ${date}: ${currencyPrefix}${amount} - ${entry.description}`;
        }).join("\n") : "No purchase history available.";
        const formattedText = `${content.currency || "Spending"} History${dateRange}:

${historyText}

${history.length > 0 ? `Total Spend: ${currencyPrefix}${totalSpend.toFixed(2)}` : ""}`;
        if (callback) {
          logGranular4("Sending success callback");
          callback({
            text: formattedText,
            success: true,
            data: {
              history,
              totalSpend
            }
          });
        }
        return true;
      } catch (error) {
        logGranular4("API request failed", { error });
        if (axios4.isAxiosError(error)) {
          throw new APIError(
            `Failed to fetch spend history: ${error.message}`,
            error.response?.status
          );
        }
        throw new APIError("Failed to fetch spend history");
      }
    } catch (error) {
      logGranular4("Handler execution failed", { error });
      if (callback) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        callback({
          text: `Error getting spend history: ${errorMessage}`,
          success: false,
          data: {
            error: errorMessage
          }
        });
      }
      if (error instanceof ConfigurationError || error instanceof ValidationError || error instanceof APIError) {
        throw error;
      }
      throw new APIError("Failed to execute GET_HB_SPEND_HISTORY action");
    }
  }
};

// src/actions/actionRentCompute.ts
import { elizaLogger as elizaLogger6 } from "@elizaos/core";
import axios5 from "axios";

// src/utils/parseGpuRent.ts
import { elizaLogger as elizaLogger5 } from "@elizaos/core";
function parseGpuRental(text) {
  elizaLogger5.info("[GpuRentalParser] Parsing text:", { text });
  try {
    const nodeMatch = text.match(/\[nodeid\]([\s\S]*?)\[\/nodeid\]/i);
    if (!nodeMatch) {
      elizaLogger5.info("[GpuRentalParser] No [nodeid] tags found in text");
      throw new ValidationError("No [nodeid] tags found. Expected format: [nodeid]node-id[/nodeid]");
    }
    const clusterMatch = text.match(/\[cluster\]([\s\S]*?)\[\/cluster\]/i);
    if (!clusterMatch) {
      elizaLogger5.info("[GpuRentalParser] No [cluster] tags found in text");
      throw new ValidationError("No [cluster] tags found. Expected format: [cluster]cluster-name[/cluster]");
    }
    const nodeId = nodeMatch[1].trim();
    const clusterName = clusterMatch[1].trim();
    if (!nodeId) {
      elizaLogger5.info("[GpuRentalParser] Empty node ID in [nodeid] tags");
      throw new ValidationError("Empty node ID in [nodeid] tags");
    }
    if (!clusterName) {
      elizaLogger5.info("[GpuRentalParser] Empty cluster name in [cluster] tags");
      throw new ValidationError("Empty cluster name in [cluster] tags");
    }
    elizaLogger5.info("[GpuRentalParser] Successfully parsed rental info:", { nodeId, clusterName });
    return {
      nodeId,
      clusterName
    };
  } catch (error) {
    elizaLogger5.error("[GpuRentalParser] Parse error:", { error });
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError(
      `Failed to parse GPU rental info: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// src/actions/actionRentCompute.ts
var config5 = getConfig();
var GRANULAR_LOG5 = config5.HYPERBOLIC_GRANULAR_LOG;
var logGranular5 = (message, data) => {
  if (GRANULAR_LOG5) {
    elizaLogger6.info(`[RentCompute] ${message}`, data);
    console.log(`[RentCompute] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  }
};
var actionRentCompute = {
  name: "RENT_HB_COMPUTE",
  similes: ["RENT_GPU", "GET_GPU", "LAUNCH_INSTANCE", "START_INSTANCE"],
  description: "Rent GPU compute resources on the Hyperbolic platform using node ID and cluster name.",
  examples: [[
    {
      user: "user",
      content: {
        text: "Rent GPU instance on the Hyperbolic \n[nodeid]las1-prd-acl-msi-09.fen.intra[/nodeid]\n[cluster]circular-snapdragon-worm[/cluster]"
      }
    },
    {
      user: "assistant",
      content: {
        text: "Successfully rented GPU instance:\nInstance ID: i-rtx4090-xyz789\nNode: las1-prd-acl-msi-09.fen.intra\nCluster: circular-snapdragon-worm\nCost: $0.50/hour\n\nSpecifications:\n- GPU: NVIDIA RTX 4090\n- GPU Memory: 24GB\n- CPU Cores: 128\n- RAM: 1GB\n- Storage: 1GB",
        success: true,
        data: {
          nodeId: "las1-prd-acl-msi-09.fen.intra",
          clusterName: "circular-snapdragon-worm",
          instanceId: "i-rtx4090-xyz789",
          cost: {
            amount: 0.5,
            currency: "USD"
          },
          specs: {
            gpu_model: "NVIDIA RTX 4090",
            gpu_memory: 24,
            cpu_cores: 128,
            ram: 1,
            storage: 1
          }
        }
      }
    }
  ]],
  validate: async (_runtime, message) => {
    if (message.content?.type !== "RENT_COMPUTE") {
      return true;
    }
    logGranular5("Validating RENT_COMPUTE action", {
      content: message.content
    });
    try {
      const content = message.content;
      const rentalInfo = parseGpuRental(content.text);
      logGranular5("Validation successful", rentalInfo);
      return true;
    } catch (error) {
      logGranular5("Validation failed", { error });
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError(error instanceof Error ? error.message : "Unknown validation error");
    }
  },
  handler: async (runtime, message, _state, _options = {}, callback) => {
    logGranular5("Executing RENT_COMPUTE action");
    try {
      const config7 = await validateHyperbolicConfig(runtime);
      console.log("Debug - Config validated:", {
        hasApiKey: !!config7.HYPERBOLIC_API_KEY,
        env: config7.HYPERBOLIC_ENV
      });
      const apiKey = config7.HYPERBOLIC_API_KEY;
      if (!apiKey) {
        throw new ConfigurationError("HYPERBOLIC_API_KEY not found in environment variables");
      }
      const content = message.content;
      const rentalInfo = parseGpuRental(content.text);
      logGranular5("Processing request", rentalInfo);
      try {
        const _baseUrl = HYPERBOLIC_ENDPOINTS[config7.HYPERBOLIC_ENV].marketplace;
        const endpoint = "https://api.hyperbolic.xyz/v1/marketplace/instances/create";
        const requestBody = {
          cluster_name: rentalInfo.clusterName,
          node_name: rentalInfo.nodeId,
          gpu_count: 1
        };
        logGranular5("Making API request:", {
          endpoint,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey.substring(0, 10)}...`
          },
          body: requestBody
        });
        const response = await axios5.post(
          endpoint,
          requestBody,
          {
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`
            }
          }
        );
        logGranular5("Received API response:", {
          status: response.status,
          statusText: response.statusText,
          data: response.data
        });
        if (response.data.status === "success") {
          const formattedText = `Successfully requested GPU instance:
Node: ${rentalInfo.nodeId}
Cluster: ${rentalInfo.clusterName}
GPU Count: 1

Your instance is being provisioned. You can check its status using the GET_GPU_STATUS command.`;
          if (callback) {
            callback({
              text: formattedText,
              success: true,
              data: {
                nodeId: rentalInfo.nodeId,
                clusterName: rentalInfo.clusterName
              }
            });
          }
          return true;
        }
        throw new APIError("Unexpected response format from API");
      } catch (error) {
        logGranular5("API request failed", { error });
        if (axios5.isAxiosError(error)) {
          throw new APIError(
            `Failed to rent GPU: ${error.message}`,
            error.response?.status
          );
        }
        throw new APIError("Failed to rent GPU");
      }
    } catch (error) {
      logGranular5("Handler execution failed", { error });
      if (callback) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        callback({
          text: `Error renting GPU: ${errorMessage}`,
          success: false,
          data: {
            error: errorMessage
          }
        });
      }
      if (error instanceof ConfigurationError || error instanceof ValidationError || error instanceof APIError) {
        throw error;
      }
      throw new APIError("Failed to execute RENT_COMPUTE action");
    }
  }
};

// src/actions/actionTerminateCompute.ts
import { elizaLogger as elizaLogger8 } from "@elizaos/core";
import axios6 from "axios";

// src/utils/parseGpuInstance.ts
import { elizaLogger as elizaLogger7 } from "@elizaos/core";
function parseGpuInstance(text) {
  elizaLogger7.info("[GpuParser] Parsing text:", { text });
  try {
    const tagMatch = text.match(/\[gpu\]([\s\S]*?)\[\/gpu\]/i);
    if (!tagMatch) {
      elizaLogger7.info("[GpuParser] No [gpu] tags found in text");
      throw new ValidationError("No [gpu] tags found. Expected format: [gpu]instance-id[/gpu]");
    }
    const instanceId = tagMatch[1].trim();
    if (!instanceId) {
      elizaLogger7.info("[GpuParser] Empty instance ID in [gpu] tags");
      throw new ValidationError("Empty instance ID in [gpu] tags");
    }
    elizaLogger7.info("[GpuParser] Successfully parsed instance ID:", { instanceId });
    return {
      instanceId,
      market: "gpu"
    };
  } catch (error) {
    elizaLogger7.error("[GpuParser] Parse error:", { error });
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError(
      `Failed to parse GPU instance: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// src/actions/actionTerminateCompute.ts
var config6 = getConfig();
var GRANULAR_LOG6 = config6.HYPERBOLIC_GRANULAR_LOG;
var logGranular6 = (message, data) => {
  if (GRANULAR_LOG6) {
    elizaLogger8.info(`[TerminateCompute] ${message}`, data);
    console.log(`[TerminateCompute] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  }
};
var actionTerminateCompute = {
  name: "TERMINATE_HB_COMPUTE",
  similes: ["STOP_GPU", "TERMINATE_INSTANCE", "STOP_INSTANCE"],
  description: "Terminate a running GPU compute instance on Hyperbolic",
  examples: [[
    {
      user: "user",
      content: {
        text: "Terminate GPU instance [gpu]worse-walnut-viper[/gpu] on Hyperbolic",
        instanceId: "worse-walnut-viper",
        market: "Hyperbolic"
      }
    },
    {
      user: "assistant",
      content: {
        text: "Successfully initiated termination of GPU instance worse-walnut-viper on Hyperbolic",
        instanceId: "worse-walnut-viper",
        market: "Hyperbolic",
        success: true,
        data: {
          terminationStatus: {
            status: "success",
            message: "Termination initiated"
          }
        }
      }
    }
  ], [
    {
      user: "user",
      content: {
        text: "Terminate the Hyperbolic instance [gpu]worse-walnut-viper[/gpu]",
        instanceId: "worse-walnut-viper",
        market: "gpu"
      }
    },
    {
      user: "assistant",
      content: {
        text: "Successfully initiated termination of GPU instance worse-walnut-viper on gpu marketplace",
        instanceId: "worse-walnut-viper",
        market: "gpu",
        success: true,
        data: {
          terminationStatus: {
            status: "success",
            message: "Termination initiated"
          }
        }
      }
    }
  ]],
  validate: async (_runtime, message) => {
    logGranular6("Starting validation", {
      messageText: message.content?.text,
      type: message.content?.type
    });
    if (!message.content?.type || message.content.type !== "TERMINATE_HB_COMPUTE") {
      return true;
    }
    if (!message.content.text) {
      throw new ValidationError("No text provided to parse instance ID");
    }
    try {
      const parsed = parseGpuInstance(message.content.text);
      logGranular6("Successfully parsed instance ID", {
        instanceId: parsed.instanceId,
        market: parsed.market
      });
      return true;
    } catch (error) {
      logGranular6("Failed to parse instance ID", { error });
      throw new ValidationError(error instanceof Error ? error.message : "Could not parse instance ID from text");
    }
  },
  handler: async (runtime, message, _state, _options = {}, callback) => {
    logGranular6("Executing TERMINATE_HB_COMPUTE action");
    try {
      const config7 = await validateHyperbolicConfig(runtime);
      const apiKey = config7.HYPERBOLIC_API_KEY;
      if (!apiKey) {
        throw new ConfigurationError("HYPERBOLIC_API_KEY not found in environment variables");
      }
      const parsed = parseGpuInstance(message.content?.text || "");
      logGranular6("Parsed instance details", {
        instanceId: parsed.instanceId,
        market: parsed.market
      });
      try {
        const requestBody = { id: parsed.instanceId };
        logGranular6("Sending termination request", {
          endpoint: HYPERBOLIC_ENDPOINTS[config7.HYPERBOLIC_ENV].instances.terminate,
          requestBody
        });
        const response = await axios6.post(
          HYPERBOLIC_ENDPOINTS[config7.HYPERBOLIC_ENV].instances.terminate,
          requestBody,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`
            }
          }
        );
        logGranular6("Received response from API", {
          statusCode: response.status,
          data: response.data
        });
        const formattedText = `Successfully initiated termination of GPU instance ${parsed.instanceId}`;
        if (callback) {
          callback({
            text: formattedText,
            instanceId: parsed.instanceId,
            market: parsed.market,
            success: true,
            data: {
              terminationStatus: {
                status: "success",
                message: "Termination initiated"
              }
            }
          });
        }
        return true;
      } catch (error) {
        logGranular6("API request failed", { error });
        if (axios6.isAxiosError(error)) {
          const errorCode = error.response?.data?.error_code;
          const errorMessage = error.response?.data?.message || error.message;
          if (errorCode === 105) {
            throw new APIError(`Instance not found: ${parsed.instanceId}`, 404);
          }
          throw new APIError(
            `Failed to terminate instance: ${errorMessage}`,
            error.response?.status
          );
        }
        throw new APIError("Failed to terminate instance");
      }
    } catch (error) {
      logGranular6("Handler execution failed", { error });
      if (callback) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        callback({
          text: `Error terminating instance: ${errorMessage}`,
          instanceId: message.content.instanceId,
          success: false,
          data: {
            terminationStatus: {
              status: "error",
              message: errorMessage,
              error_code: error.statusCode || 500
            }
          }
        });
      }
      if (error instanceof ConfigurationError || error instanceof ValidationError || error instanceof APIError) {
        throw error;
      }
      throw new APIError("Failed to execute TERMINATE_HB_COMPUTE action");
    }
  }
};

// src/index.ts
var spinner = ora({
  text: chalk.cyan("Initializing HYPERBOLIC Plugin..."),
  spinner: "dots12",
  color: "cyan"
}).start();
var actions = [
  actionGetAvailableGpus,
  actionGetCurrentBalance,
  actionGetGpuStatus,
  actionGetSpendHistory,
  actionRentCompute,
  actionTerminateCompute
];
var HYPERBOLIC_SPASH = getConfig().HYPERBOLIC_SPASH;
if (HYPERBOLIC_SPASH) {
  console.log(`
${chalk.cyan("\u250C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510")}`);
  console.log(chalk.cyan("\u2502") + chalk.yellow.bold("          HYPERBOLIC PLUGIN             ") + chalk.cyan(" \u2502"));
  console.log(chalk.cyan("\u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2524"));
  console.log(chalk.cyan("\u2502") + chalk.white("  Initializing HYPERBOLIC Services...    ") + chalk.cyan("\u2502"));
  console.log(chalk.cyan("\u2502") + chalk.white("  Version: 1.0.0                        ") + chalk.cyan("\u2502"));
  console.log(chalk.cyan("\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518"));
  spinner.succeed(chalk.green("HYPERBOLIC Plugin initialized successfully!"));
  const actionTable = new Table({
    head: [
      chalk.cyan("Action"),
      chalk.cyan("H"),
      chalk.cyan("V"),
      chalk.cyan("E"),
      chalk.cyan("Similes")
    ],
    style: {
      head: [],
      border: ["cyan"]
    }
  });
  for (const action of actions) {
    actionTable.push([
      chalk.white(action.name),
      typeof action.handler === "function" ? chalk.green("\u2713") : chalk.red("\u2717"),
      typeof action.validate === "function" ? chalk.green("\u2713") : chalk.red("\u2717"),
      action.examples?.length > 0 ? chalk.green("\u2713") : chalk.red("\u2717"),
      chalk.gray(action.similes?.join(", ") || "none")
    ]);
  }
  console.log(`
${actionTable.toString()}`);
  const statusTable = new Table({
    style: {
      border: ["cyan"]
    }
  });
  statusTable.push(
    [chalk.cyan("Plugin Status")],
    [chalk.white("Name    : ") + chalk.yellow("hyperbolic-plugin")],
    [chalk.white("Actions : ") + chalk.green(actions.length.toString())],
    [chalk.white("Status  : ") + chalk.green("Loaded & Ready")]
  );
  console.log(`
${statusTable.toString()}
`);
} else {
  spinner.stop();
}
var hyperbolicPlugin = {
  name: "hyperbolic-plugin",
  description: "HYPERBOLIC Plugin for DePin",
  actions,
  evaluators: []
};
var index_default = hyperbolicPlugin;
export {
  index_default as default,
  hyperbolicPlugin
};
//# sourceMappingURL=index.js.map