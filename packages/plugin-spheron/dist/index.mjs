// src/actions/escrow.ts
import {
  elizaLogger as elizaLogger2,
  composeContext,
  ModelClass,
  generateObjectDeprecated
} from "@elizaos/core";

// src/environment.ts
import { z } from "zod";
var spheronEnvSchema = z.object({
  PRIVATE_KEY: z.string().min(1, "Private key is required"),
  PROVIDER_PROXY_URL: z.string().url("Provider proxy URL must be a valid URL"),
  WALLET_ADDRESS: z.string().min(1, "Wallet address is required"),
  SPHERON_PROXY_PORT: z.string().optional()
});
var requiredEnvVars = [
  "SPHERON_PRIVATE_KEY",
  "SPHERON_WALLET_ADDRESS",
  "SPHERON_PROVIDER_PROXY_URL"
];
async function validateSpheronConfig(runtime) {
  try {
    const config = {
      PRIVATE_KEY: runtime.getSetting("PRIVATE_KEY") || process.env.SPHERON_PRIVATE_KEY || process.env.PRIVATE_KEY,
      PROVIDER_PROXY_URL: runtime.getSetting("PROVIDER_PROXY_URL") || process.env.SPHERON_PROVIDER_PROXY_URL || process.env.PROVIDER_PROXY_URL,
      WALLET_ADDRESS: runtime.getSetting("WALLET_ADDRESS") || process.env.SPHERON_WALLET_ADDRESS || process.env.WALLET_ADDRESS
    };
    return spheronEnvSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map((err) => `${err.path.join(".")}: ${err.message}`).join("\n");
      throw new Error(
        `Spheron configuration validation failed:
${errorMessages}`
      );
    }
    throw error;
  }
}

// src/utils/index.ts
import { elizaLogger } from "@elizaos/core";
import { SpheronSDK } from "@spheron/protocol-sdk";
var getSDKInstance = async (runtime) => {
  const config = await validateSpheronConfig(runtime);
  return new SpheronSDK("testnet", config.PRIVATE_KEY);
};
var getUserBalance = async (runtime, token, walletAddress) => {
  const sdk = await getSDKInstance(runtime);
  return await sdk.escrow.getUserBalance(token, walletAddress);
};
var depositBalance = async (runtime, token, amount) => {
  const sdk = await getSDKInstance(runtime);
  return await sdk.escrow.depositBalance({
    token,
    amount,
    onFailureCallback: (error) => {
      elizaLogger.error("Deposit failed: ", error);
      throw error;
    }
  });
};
var withdrawBalance = async (runtime, token, amount) => {
  const sdk = await getSDKInstance(runtime);
  return await sdk.escrow.withdrawBalance({
    token,
    amount,
    onFailureCallback: (error) => {
      elizaLogger.error("Withdrawal failed:", error);
      throw error;
    }
  });
};
var startDeployment = async (runtime, computeConfig) => {
  const token = computeConfig.token || "CST";
  const balance = await getUserBalance(runtime, token);
  if (!balance.unlockedBalance || !balance.token?.decimal) {
    throw new Error("Invalid balance info structure");
  }
  const unlockedBalance = BigInt(balance.unlockedBalance);
  const decimal = BigInt(balance.token.decimal);
  const divisor = BigInt(10) ** decimal;
  const balanceAmount = Number(unlockedBalance) / Number(divisor);
  const requiredAmount = calculateGPUPrice(computeConfig.computeResources?.gpu) * (computeConfig.duration ? parseDuration(computeConfig.duration) : 1);
  if (balanceAmount < requiredAmount) {
    throw new Error(
      `Insufficient balance. Available: ${balanceAmount} ${token}, Required: ${requiredAmount} ${token}`
    );
  }
  const result = await createOrder(runtime, generateICLYaml(computeConfig));
  let isReady = false;
  const maxAttempts = 10;
  let attempts = 0;
  while (!isReady && attempts < maxAttempts) {
    const status = await getDeploymentStatus(
      runtime,
      result.leaseId.toString()
    );
    elizaLogger.debug(
      `Deployment status (attempt ${attempts + 1}/${maxAttempts}):`,
      status
    );
    if (status) {
      isReady = true;
    } else {
      await new Promise((resolve) => setTimeout(resolve, 1e4));
      attempts++;
    }
  }
  if (isReady) {
    elizaLogger.log("Deployment ready");
  } else {
    elizaLogger.error(`Deployment not ready after ${maxAttempts} attempts`);
    throw new Error("Deployment timeout");
  }
  return result;
};
var updateDeployment = async (runtime, leaseId, computeConfig) => {
  const token = computeConfig.token || "CST";
  const balance = await getUserBalance(runtime, token);
  if (!balance.unlockedBalance || !balance.token?.decimal) {
    throw new Error("Invalid balance info structure");
  }
  const unlockedBalance = BigInt(balance.unlockedBalance);
  const decimal = BigInt(balance.token.decimal);
  const divisor = BigInt(10) ** decimal;
  const balanceAmount = Number(unlockedBalance) / Number(divisor);
  const requiredAmount = calculateGPUPrice(computeConfig.computeResources?.gpu) * (computeConfig.duration ? parseDuration(computeConfig.duration) : 1);
  if (balanceAmount < requiredAmount) {
    throw new Error(
      `Insufficient balance. Available: ${balanceAmount} ${token}, Required: ${requiredAmount} ${token}`
    );
  }
  const result = await updateOrder(
    runtime,
    leaseId.toString(),
    generateICLYaml(computeConfig)
  );
  let isReady = false;
  const maxAttempts = 10;
  let attempts = 0;
  while (!isReady && attempts < maxAttempts) {
    const status = await getDeploymentStatus(runtime, leaseId.toString());
    elizaLogger.debug(
      `Deployment status (attempt ${attempts + 1}/${maxAttempts}):`,
      status
    );
    if (status) {
      isReady = true;
    } else {
      await new Promise((resolve) => setTimeout(resolve, 1e4));
      attempts++;
    }
  }
  if (isReady) {
    elizaLogger.log("Deployment ready");
  } else {
    elizaLogger.error(`Deployment not ready after ${maxAttempts} attempts`);
    throw new Error("Deployment timeout");
  }
  return result;
};
var createOrder = async (runtime, iclYaml) => {
  elizaLogger.debug("Creating order with iclYaml:", iclYaml);
  const sdk = await getSDKInstance(runtime);
  const config = await validateSpheronConfig(runtime);
  return await sdk.deployment.createDeployment(
    iclYaml,
    config.PROVIDER_PROXY_URL
  );
};
var updateOrder = async (runtime, leaseId, iclYaml) => {
  const sdk = await getSDKInstance(runtime);
  const config = await validateSpheronConfig(runtime);
  return await sdk.deployment.updateDeployment(
    leaseId,
    iclYaml,
    config.PROVIDER_PROXY_URL
  );
};
var getDeployment = async (runtime, leaseId) => {
  elizaLogger.debug("Getting deployment with lease ID:", leaseId);
  const sdk = await getSDKInstance(runtime);
  const config = await validateSpheronConfig(runtime);
  return await sdk.deployment.getDeployment(
    leaseId,
    config.PROVIDER_PROXY_URL
  );
};
var closeDeployment = async (runtime, leaseId) => {
  const sdk = await getSDKInstance(runtime);
  return await sdk.deployment.closeDeployment(leaseId);
};
async function getDeploymentStatus(runtime, deploymentId) {
  try {
    const deployment = await getDeployment(runtime, deploymentId);
    const service = Object.values(deployment.services)[0];
    return service.ready_replicas === service.total;
  } catch (error) {
    throw new Error(`Failed to get deployment status: ${error.message}`);
  }
}
function calculateGPUPrice(gpu) {
  if (!gpu) return 1;
  const basePrice = (() => {
    switch (gpu.model?.toLowerCase()) {
      // Consumer GPUs
      case "rtx4090":
        return 0.7;
      case "rtx3090":
        return 0.5;
      case "rtx3080":
        return 0.4;
      case "rtx3070":
        return 0.3;
      // Data Center GPUs
      case "h100":
        return 3;
      case "a100":
        return 1.5;
      case "a40":
        return 1.2;
      case "a30":
        return 1.2;
      case "a16":
        return 1;
      // Default case
      default:
        return 0.5;
    }
  })();
  return basePrice * (gpu.count || 1);
}
function generateICLYaml(config) {
  return `version: "1.0"
services:
  ${config.name}:
    image: ${config.image}
    ${config.ports ? `expose:
      ${config.ports.map(
    (p) => `- port: ${p.containerPort}
        as: ${p.servicePort}
        to:
          - global: true`
  ).join("\n      ")}` : ""}
    ${config.env ? `env:
      ${config.env.map((e) => `- ${e.name}=${e.value}`).join("\n      ")}` : ""}
profiles:
  name: ${config.name}
  duration: ${config.duration || "24h"}
  mode: ${config.mode || "provider"}
  tier:
    - community
  compute:
    ${config.name}:
      resources:
        cpu:
          units: ${config.computeResources?.cpu || 2}
        memory:
          size: ${config.computeResources?.memory || "2Gi"}
        storage:
          - size: ${config.computeResources?.storage || "10Gi"}
        ${config.computeResources?.gpu ? `gpu:
          units: ${config.computeResources?.gpu?.count || 1}
          attributes:
            vendor:
              nvidia:
                - model: ${config.computeResources?.gpu?.model || "rtx4090"}` : ""}
  placement:
    westcoast:
      pricing:
        ${config.name}:
          token: ${config.token || "CST"}
          amount: ${calculateGPUPrice(config.computeResources?.gpu)}
deployment:
  ${config.name}:
    westcoast:
      profile: ${config.name}
      count: ${config.replicas || 1}`;
}
function parseDuration(duration) {
  const match = duration.match(/^(\d*\.?\d+)(h|d|w|m)$/);
  if (!match) {
    throw new Error(
      "Invalid duration format. Expected format: number (can include decimals) followed by h(hours), d(days), w(weeks), or m(months)"
    );
  }
  const [, value, unit] = match;
  const numValue = Number.parseFloat(value);
  switch (unit) {
    case "min":
      return numValue / 60;
    case "h":
      return numValue;
    case "d":
      return numValue * 24;
    case "w":
      return numValue * 7 * 24;
    case "m":
      return numValue * 30 * 24;
    default:
      return 1;
  }
}

// src/utils/constants.ts
var SUPPORTED_TOKENS = {
  USDT: "USDT",
  USDC: "USDC",
  DAI: "DAI",
  WETH: "WETH",
  CST: "CST"
};
var DEPLOYMENT_CONFIGS = {
  DEFAULT_PROVIDER_PROXY_URL: "http://localhost:3040",
  NETWORK: "testnet"
};
var LEASE_STATES = {
  ACTIVE: "ACTIVE",
  TERMINATED: "TERMINATED"
};
var AVAILABLE_GPU_MODELS = [
  "rtx4090",
  "h100",
  "rtx3090",
  "t4",
  "rtx4070tisuper",
  "rtx4070",
  "rtx4070ti",
  "rtx6000-ada",
  "t1000",
  "a100",
  "v100",
  "p4"
];

// src/actions/escrow.ts
function isEscrowContent(content) {
  console.log("Content for escrow operation:", content);
  if (typeof content !== "object" || content === null) {
    return false;
  }
  const contentObj = content;
  return typeof contentObj.token === "string" && (contentObj.operation === "deposit" || contentObj.operation === "withdraw" ? typeof contentObj.amount === "number" && contentObj.amount > 0 : contentObj.operation === "check") && (contentObj.operation === "deposit" || contentObj.operation === "withdraw" || contentObj.operation === "check");
}
var escrowTemplate = `Respond with a JSON markdown block containing only the extracted values
- Use null for any values that cannot be determined.
- Token must be one of the supported tokens.
- Amount must be a positive number.

Example response for checking balance for <token-symbol>:
\`\`\`json
{
    "token": "<token-symbol>", // can be USDT, USDC, DAI, WETH, CST
    "operation": "check"
}
\`\`\`

Example response for depositing <amount> <token-symbol>:
\`\`\`json
{
    "token": "<token-symbol>", // can be USDT, USDC, DAI, WETH, CST
    "amount": <amount>, // must be a positive number
    "operation": "deposit"
}
\`\`\`

Example response for withdrawing <amount> <token-symbol>:
\`\`\`json
{
    "token": "<token-symbol>", // can be USDT, USDC, DAI, WETH, CST
    "amount": <amount>, // must be a positive number
    "operation": "withdraw" // must be one of the supported operations
}
\`\`\`

## Supported Tokens
${Object.entries(SUPPORTED_TOKENS).map(([key, _]) => `- ${key}`).join("\n")}

{{recentMessages}}

Given the recent messages, extract the following information about the requested escrow operation:
- Token symbol (must be one of the supported tokens)
- Amount to deposit/withdraw (must be a positive number)
- Operation type (deposit or withdraw)
- Don't mention multiple operations in the same json block

Respond with a JSON markdown block containing only the extracted values.`;
var escrow_default = {
  name: "ESCROW_OPERATION",
  similes: [
    "DEPOSIT_TOKEN",
    "WITHDRAW_TOKEN",
    "CHECK_BALANCE",
    "GET_BALANCE",
    "DEPOSIT_FUNDS",
    "WITHDRAW_FUNDS",
    "ADD_FUNDS",
    "REMOVE_FUNDS",
    "TRANSFER_TO_ESCROW",
    "TRANSFER_FROM_ESCROW",
    "FUND_ACCOUNT",
    "WITHDRAW_FROM_ACCOUNT"
  ],
  description: "MUST use this action if the user requests to deposit or withdraw tokens from escrow. The request might vary, but it will always be related to escrow operations.",
  validate: async (runtime, _message) => {
    await validateSpheronConfig(runtime);
    return true;
  },
  handler: async (runtime, message, state, _options, callback) => {
    elizaLogger2.log("Starting ESCROW_OPERATION handler...");
    let currentState = state;
    if (!currentState) {
      currentState = await runtime.composeState(message);
    } else {
      currentState = await runtime.updateRecentMessageState(currentState);
    }
    state.recentMessages = state.recentMessages.split("\n").filter(
      (line) => line.includes("(just now)") || line.includes("(user)")
    ).slice(-2).join("\n");
    const escrowContext = composeContext({
      state: currentState,
      template: escrowTemplate
    });
    const content = await generateObjectDeprecated({
      runtime,
      context: escrowContext,
      modelClass: ModelClass.SMALL
    });
    if (!isEscrowContent(content)) {
      elizaLogger2.error("Invalid content for ESCROW_OPERATION action.");
      callback?.({
        text: "Unable to process escrow request. Invalid content provided.",
        content: { error: "Invalid escrow content" }
      });
      return false;
    }
    try {
      const config = await validateSpheronConfig(runtime);
      const balance = await getUserBalance(
        runtime,
        content.token,
        config.WALLET_ADDRESS
      );
      elizaLogger2.log(`Current ${content.token} balance:`, balance);
      if (content.operation === "check") {
        const formattedAvailableBalance = Number(balance.unlockedBalance) / 10 ** Number(balance.token.decimal);
        const formattedLockedBalance = Number(balance.lockedBalance) / 10 ** Number(balance.token.decimal);
        callback?.({
          text: `Current ${content.token.toUpperCase()} Balance for ${config.WALLET_ADDRESS}
 Available balance: ${formattedAvailableBalance.toFixed(2)} ${content.token.toUpperCase()}
 Locked balance: ${formattedLockedBalance.toFixed(2)} ${content.token.toUpperCase()}`,
          content: {
            success: true,
            unlockedBalance: formattedAvailableBalance,
            lockedBalance: formattedLockedBalance,
            token: balance.token,
            walletAddress: config.WALLET_ADDRESS
          }
        });
      } else if (content.operation === "deposit") {
        try {
          const result = await depositBalance(
            runtime,
            content.token,
            content.amount
          );
          callback?.({
            text: `Successfully deposited ${content.amount} ${content.token.toUpperCase()} into Spheron Escrow for ${config.WALLET_ADDRESS}`,
            content: {
              success: true,
              transaction: result,
              operation: "deposit",
              token: content.token,
              amount: content.amount,
              newBalance: await getUserBalance(
                runtime,
                content.token,
                config.WALLET_ADDRESS
              ),
              walletAddress: config.WALLET_ADDRESS
            }
          });
        } catch (error) {
          elizaLogger2.error("Deposit operation failed:", error);
          callback?.({
            text: `Failed to deposit ${content.amount} ${content.token.toUpperCase()}: ${error instanceof Error ? error.message : "Unknown error"}`,
            content: {
              success: false,
              operation: "deposit",
              token: content.token,
              amount: content.amount,
              error: error instanceof Error ? error.message : "Unknown error"
            }
          });
          return false;
        }
      } else if (content.operation === "withdraw") {
        try {
          const result = await withdrawBalance(
            runtime,
            content.token,
            content.amount
          );
          callback?.({
            text: `Successfully withdrew ${content.amount} ${content.token.toUpperCase()} from Spheron Escrow for ${config.WALLET_ADDRESS}`,
            content: {
              success: true,
              transaction: result,
              operation: "withdraw",
              token: content.token,
              amount: content.amount,
              newBalance: await getUserBalance(
                runtime,
                content.token,
                config.WALLET_ADDRESS
              ),
              walletAddress: config.WALLET_ADDRESS
            }
          });
        } catch (error) {
          elizaLogger2.error("Withdraw operation failed:", error);
          callback?.({
            text: `Failed to withdraw ${content.amount} ${content.token.toUpperCase()}: ${error instanceof Error ? error.message : "Unknown error"}`,
            content: {
              success: false,
              operation: "withdraw",
              token: content.token,
              amount: content.amount,
              error: error instanceof Error ? error.message : "Unknown error"
            }
          });
          return false;
        }
      } else {
        throw new Error("Invalid operation");
      }
      return true;
    } catch (error) {
      elizaLogger2.error("Escrow operation failed:", error);
      callback?.({
        text: "Escrow operation failed",
        content: {
          error: error instanceof Error ? error.message : "Unknown error"
        }
      });
      return false;
    }
  },
  examples: [
    [
      {
        user: "{{user1}}",
        content: {
          text: "Deposit 100 USDT into escrow"
        }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "Processing your deposit of 100 USDT...",
          action: "ESCROW_OPERATION"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Withdraw 50 USDC from my balance"
        }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "Processing your withdrawal of 50 USDC...",
          action: "ESCROW_OPERATION"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Add 200 DAI to my account"
        }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "Processing your deposit of 200 DAI...",
          action: "ESCROW_OPERATION"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Check agent's escrow USDT balance"
        }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "Checking your USDT balance...",
          action: "ESCROW_OPERATION"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "How much DAI do I have in agent's escrow?"
        }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "Let me check your DAI balance...",
          action: "ESCROW_OPERATION"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Transfer 75 USDC to escrow"
        }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "Processing your deposit of 75 USDC...",
          action: "ESCROW_OPERATION"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "I want to remove 150 DAI from escrow"
        }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "Processing your withdrawal of 150 DAI...",
          action: "ESCROW_OPERATION"
        }
      }
    ]
  ]
};

// src/actions/deployment.ts
import {
  elizaLogger as elizaLogger3,
  composeContext as composeContext2,
  ModelClass as ModelClass2,
  generateObjectDeprecated as generateObjectDeprecated2
} from "@elizaos/core";

// src/utils/template.ts
var DEPLOYMENT_TEMPLATES = {
  "jupyter-notebook": {
    description: "Jupyter Notebook environment for AI development",
    config: (customizations) => ({
      name: "jupyter",
      image: customizations.cpu ? "jupyter/minimal-notebook:latest" : "quay.io/jupyter/pytorch-notebook:cuda12-pytorch-2.4.1",
      ports: [
        {
          containerPort: 8888,
          servicePort: 8888
        }
      ],
      env: [
        {
          name: "JUPYTER_TOKEN",
          value: "spheron"
        }
      ],
      computeResources: {
        cpu: customizations.resources?.cpu || 4,
        memory: customizations.resources?.memory || "8Gi",
        storage: customizations.resources?.storage || "10Gi",
        ...!customizations.cpu && {
          gpu: {
            count: customizations.resources?.gpu || 1,
            model: customizations.resources?.gpu_model || "rtx4090"
          }
        }
      },
      duration: customizations.duration || "1d",
      token: customizations.token || "CST"
    })
  },
  "ollama-webui": {
    description: "Ollama Web UI for managing and interacting with LLMs",
    config: (customizations) => ({
      name: "ollama-webui",
      image: "ghcr.io/open-webui/open-webui:ollama",
      ports: [
        {
          containerPort: 8080,
          servicePort: 8080
        },
        {
          containerPort: 11434,
          servicePort: 11434
        }
      ],
      computeResources: {
        cpu: customizations.resources?.cpu || 4,
        memory: customizations.resources?.memory || "8Gi",
        storage: customizations.resources?.storage || "20Gi",
        ...!customizations.cpu && {
          gpu: {
            count: customizations.resources?.gpu || 1,
            model: customizations.resources?.gpu_model || "rtx4090"
          }
        }
      },
      duration: customizations.duration || "1d",
      token: customizations.token || "CST"
    })
  },
  "vscode-pytorch": {
    description: "VS Code Server with PyTorch development environment",
    config: (customizations) => ({
      name: "vscode",
      image: customizations.cpu ? "lscr.io/linuxserver/code-server" : "spheronnetwork/vscode-pytorch:latest",
      ports: [
        {
          containerPort: 8443,
          servicePort: 8443
        }
      ],
      env: [
        {
          name: "PASSWORD",
          value: "spheron"
        }
      ],
      computeResources: {
        cpu: customizations.resources?.cpu || 4,
        memory: customizations.resources?.memory || "8Gi",
        storage: customizations.resources?.storage || "20Gi",
        ...!customizations.cpu && {
          gpu: {
            count: customizations.resources?.gpu || 1,
            model: customizations.resources?.gpu_model || "rtx4090"
          }
        }
      },
      duration: customizations.duration || "1d",
      token: customizations.token || "CST"
    })
  },
  "heurist-miner": {
    description: "Heurist Miner for mining Heurist network",
    config: (customizations) => ({
      name: "heurist-miner",
      image: "spheronnetwork/heurist-miner:latest",
      ports: [
        {
          containerPort: 8888,
          servicePort: 8888
        }
      ],
      env: [
        {
          name: "MINER_ID_0",
          value: customizations.template?.heuristMinerAddress || ""
        },
        {
          name: "LOG_LEVEL",
          value: "INFO"
        }
      ],
      computeResources: {
        cpu: customizations.resources?.cpu || 8,
        memory: customizations.resources?.memory || "16Gi",
        storage: customizations.resources?.storage || "200Gi",
        ...!customizations.cpu && {
          gpu: {
            count: customizations.resources?.gpu || 1,
            model: customizations.resources?.gpu_model || "rtx4090"
          }
        }
      },
      duration: customizations.duration || "1d",
      token: customizations.token || "CST"
    })
  }
};

// src/actions/deployment.ts
function isDeploymentContent(content) {
  elizaLogger3.debug("Content for deployment operation:", content);
  if (typeof content !== "object" || content === null) {
    return false;
  }
  const contentObj = content;
  if (typeof contentObj.operation !== "string" || !["create", "update", "close"].includes(contentObj.operation)) {
    return false;
  }
  switch (contentObj.operation) {
    case "create":
      return typeof contentObj.template === "string" && typeof contentObj.customizations === "object";
    case "update":
      return typeof contentObj.leaseId === "string" && typeof contentObj.template === "string" && typeof contentObj.customizations === "object";
    case "close":
      return typeof contentObj.leaseId === "string";
    default:
      return false;
  }
}
var templateDescriptions = Object.entries(DEPLOYMENT_TEMPLATES).map(([key, template]) => `- ${key}: ${template.description}`).join("\n");
var deploymentTemplate = `Respond with a JSON markdown block containing only the extracted values for the requested deployment operation.

Example responses for different operations:

1. Creating a new deployment:
\`\`\`json
{
    "operation": "create",
    "template": "<template-name>",  // One of: jupyter-notebook, ollama-webui, vscode-pytorch
    "customizations": {
        "cpu": <true|false>,                // Extract CPU-only preference from context or put a default value of false. eg. no gpu needed or something like that
        "resources": {               // Extract resource requirements from context
            "cpu": "<requested-cpu>", // Extract cpu requirements from context or put a default value of 4
            "memory": "<requested-memory>", // Extract memory requirements from context or put a default value of 8Gi
            "storage": "<requested-storage>", // Extract storage requirements from context or put a default value of 100Gi
            "gpu": "<requested-gpu-count>", // Extract gpu requirements from context or put a default value of 1
            "gpu_model": "<requested-gpu-model>" // Extract gpu model requirements from context or put a default value of rtx4090
        },
        "duration": "<requested-duration>" // Extract duration requirements from context or put a default value of 1h
        "token": "<requested-token>" // Extract token requirements from context or put a default value of CST
        "template": {
            "heuristMinerAddress": "<requested-heurist-miner-address>" // Extract heurist miner address requirements from context
        }
    }
}
\`\`\`

2. Updating an existing deployment:
\`\`\`json
{
    "operation": "update",
    "leaseId": "existing-lease-id", // Extract lease ID from context
    "template": "<template-name>", // One of: jupyter-notebook, ollama-webui, vscode-pytorch
    "customizations": {
        "cpu": <true|false>,   // Extract cpu-only preference from context or put a default value of false. eg. no gpu needed or something like that
        "resources": {               // Extract updated resource requirements from context
            "cpu": "<requested-cpu>", // Extract cpu requirements from context or put a default value of 4
            "memory": "<requested-memory>", // Extract memory requirements from context or put a default value of 8Gi
            "storage": "<requested-storage>", // Extract storage requirements from context or put a default value of 100Gi
            "gpu": "<requested-gpu-count>", // Extract gpu requirements from context or put a default value of 1
            "gpu_model": "<requested-gpu-model>" // Extract gpu model requirements from context or put a default value of rtx4090
        },
        "duration": "<requested-duration>" // Extract duration requirements from context or put a default value of 1h
        "token": "<requested-token>" // Extract token requirements from context or put a default value of CST
    }
}
\`\`\`

3. Closing a deployment:
\`\`\`json
{
    "operation": "close",
    "leaseId": "lease-id-to-close"
}
\`\`\`

## Available Templates
${templateDescriptions}

## Available GPU Models
${AVAILABLE_GPU_MODELS.map((gpu) => `- ${gpu}`).join("\n")}

{{recentMessages}}

Given the recent messages, extract the following information about the requested deployment:
- Desired template name from the context
- CPU-only requirement (if specified) from the context
- Any customization requirements GPU model and it's count, cpu and memory resources properly from the context
- Token (if specified) from the context
- Duration (if specified) from the context
- Lease ID (if updating or closing) from the context
- Operation (create, update, close) from the context

Respond with a JSON markdown block containing only the extracted values.`;
var deployment_default = {
  name: "DEPLOYMENT_OPERATION",
  similes: [
    "CREATE_DEPLOYMENT",
    "UPDATE_DEPLOYMENT",
    "GET_DEPLOYMENT",
    "CLOSE_DEPLOYMENT",
    "DEPLOY_SERVICE",
    "MANAGE_DEPLOYMENT",
    "LAUNCH_SERVICE",
    "START_DEPLOYMENT",
    "SETUP_DEPLOYMENT"
  ],
  description: "MUST use this action if the user requests to create, update, or manage a deployment. The request might vary, but it will always be related to deployment operations.",
  validate: async (runtime, _message) => {
    await validateSpheronConfig(runtime);
    return true;
  },
  handler: async (runtime, message, state, _options, callback) => {
    elizaLogger3.log("Starting DEPLOYMENT_OPERATION handler...");
    let currentState = state;
    if (!currentState) {
      currentState = await runtime.composeState(message);
    } else {
      currentState = await runtime.updateRecentMessageState(currentState);
    }
    state.recentMessages = state.recentMessages.split("\n").filter(
      (line) => line.includes("(just now)") || line.includes("(user)")
    ).slice(-2).join("\n");
    const deploymentContext = composeContext2({
      state: currentState,
      template: deploymentTemplate
    });
    const content = await generateObjectDeprecated2({
      runtime,
      context: deploymentContext,
      modelClass: ModelClass2.SMALL
    });
    if (!isDeploymentContent(content)) {
      elizaLogger3.error(
        "Invalid content for DEPLOYMENT_OPERATION action."
      );
      callback?.({
        text: "Unable to process deployment request. Invalid content provided.",
        content: { error: "Invalid deployment content" }
      });
      return false;
    }
    try {
      switch (content.operation) {
        case "create": {
          if (!content.template || !DEPLOYMENT_TEMPLATES[content.template]) {
            throw new Error(
              `Unsupported template: ${content.template}. Available templates are: ${Object.keys(DEPLOYMENT_TEMPLATES).join(", ")}`
            );
          }
          const computeConfig = DEPLOYMENT_TEMPLATES[content.template].config(content.customizations);
          const result = await startDeployment(
            runtime,
            computeConfig
          );
          elizaLogger3.log(
            "Deployment created with lease ID:",
            result.leaseId.toString()
          );
          const deploymentDetails = await getDeployment(
            runtime,
            result.leaseId.toString()
          );
          const service = Object.values(
            deploymentDetails.services
          )[0];
          const ports = deploymentDetails.forwarded_ports[service.name] || [];
          const portInfo = ports.map(
            (p) => `${p.host}:${p.externalPort} for Port ${p.port}`
          ).join(", ");
          console.log("Final response:", {
            text: `Deployment created and ready!
Lease ID: ${result.leaseId.toString()}
${portInfo ? `Access URLs: ${portInfo}` : ""}`,
            content: {
              success: true,
              leaseId: result.leaseId.toString(),
              details: deploymentDetails,
              ports
            }
          });
          callback?.({
            text: `Deployment created and ready!
Lease ID: ${result.leaseId.toString()}
${portInfo ? `Access URLs: ${portInfo}` : ""}`,
            content: {
              success: true,
              leaseId: result.leaseId.toString(),
              details: deploymentDetails,
              ports
            }
          });
          break;
        }
        case "update": {
          if (!content.leaseId || !content.customizations || !content.template) {
            throw new Error(
              "Lease ID, template, and customizations are required for deployment update"
            );
          }
          if (!DEPLOYMENT_TEMPLATES[content.template]) {
            throw new Error(
              `Unsupported template: ${content.template}`
            );
          }
          const computeConfig = DEPLOYMENT_TEMPLATES[content.template].config(content.customizations);
          const result = await updateDeployment(
            runtime,
            content.leaseId.toString(),
            computeConfig
          );
          elizaLogger3.log(
            "Deployment updated with lease ID:",
            result.leaseId.toString()
          );
          const newDetails = await getDeployment(
            runtime,
            content.leaseId.toString()
          );
          callback?.({
            text: `Deployment ${content.leaseId.toString()} updated successfully`,
            content: {
              success: true,
              details: newDetails
            }
          });
          break;
        }
        case "close": {
          if (!content.leaseId) {
            throw new Error(
              "Lease ID is required for deployment closure"
            );
          }
          const result = await closeDeployment(
            runtime,
            content.leaseId.toString()
          );
          elizaLogger3.log(
            "Deployment closed with lease ID:",
            content.leaseId.toString()
          );
          callback?.({
            text: `Deployment ${content.leaseId.toString()} closed successfully`,
            content: {
              success: true,
              transaction: result
            }
          });
          break;
        }
      }
      return true;
    } catch (error) {
      console.log("Error:", error);
      elizaLogger3.error("Deployment operation failed:", error.message);
      callback?.({
        text: "Deployment operation failed",
        content: {
          error: error instanceof Error ? error.message : "Unknown error"
        }
      });
      return false;
    }
  },
  examples: [
    // Create deployment examples with templates
    [
      {
        user: "{{user1}}",
        content: {
          text: "Deploy a Jupyter notebook with GPU"
        }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "Setting up your Jupyter notebook deployment with GPU support...",
          action: "DEPLOYMENT_OPERATION"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Create a CPU-only Jupyter notebook deployment"
        }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "Setting up your CPU-only Jupyter notebook deployment...",
          action: "DEPLOYMENT_OPERATION"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Deploy Jupyter notebook with A100 GPU and 32GB memory"
        }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "Setting up your Jupyter notebook deployment with A100 GPU and custom resources...",
          action: "DEPLOYMENT_OPERATION"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Deploy Ollama WebUI with RTX 4090"
        }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "Setting up Ollama WebUI with RTX 4090 GPU support...",
          action: "DEPLOYMENT_OPERATION"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Create a VS Code deployment with PyTorch and T4 GPU"
        }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "Setting up VS Code PyTorch environment with T4 GPU...",
          action: "DEPLOYMENT_OPERATION"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Deploy a Jupyter notebook with GPU and token USDT"
        }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "Setting up your Jupyter notebook deployment with GPU support and token USDT...",
          action: "DEPLOYMENT_OPERATION"
        }
      }
    ],
    // Update deployment examples
    [
      {
        user: "{{user1}}",
        content: {
          text: "Upgrade my deployment abc123 to use an A100 GPU"
        }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "Updating deployment abc123 to use A100 GPU...",
          action: "DEPLOYMENT_OPERATION"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Scale up the memory to 64GB for deployment xyz789"
        }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "Updating deployment resources...",
          action: "DEPLOYMENT_OPERATION"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Update my deployment abc123 to use an A100 GPU and token USDT"
        }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "Updating deployment abc123 to use A100 GPU and token USDT...",
          action: "DEPLOYMENT_OPERATION"
        }
      }
    ],
    // Close deployment examples
    [
      {
        user: "{{user1}}",
        content: {
          text: "Close deployment abc123"
        }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "Closing deployment abc123...",
          action: "DEPLOYMENT_OPERATION"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "I want to stop my deployment abc123"
        }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "Closing deployment abc123...",
          action: "DEPLOYMENT_OPERATION"
        }
      }
    ],
    [
      {
        user: "{{user1}}",
        content: {
          text: "Stop my Jupyter notebook deployment xyz789"
        }
      },
      {
        user: "{{agentName}}",
        content: {
          text: "Terminating Jupyter notebook deployment xyz789...",
          action: "DEPLOYMENT_OPERATION"
        }
      }
    ]
  ]
};

// src/providers/tokens.ts
import {
  elizaLogger as elizaLogger4
} from "@elizaos/core";
var tokensProvider = {
  get: async (_runtime, _message, _state) => {
    elizaLogger4.debug("tokensProvider::get");
    const tokens = Object.entries(SUPPORTED_TOKENS).map(([key, value]) => `${key}: ${value}`).join("\n");
    return `The supported tokens for Spheron operations are:
${tokens}`;
  }
};

// src/providers/deployment.ts
import {
  elizaLogger as elizaLogger5
} from "@elizaos/core";
var deploymentProvider = {
  get: async (_runtime, _message, _state) => {
    elizaLogger5.debug("deploymentProvider::get");
    const configs = Object.entries(DEPLOYMENT_CONFIGS).map(([key, value]) => `${key}: ${value}`).join("\n");
    return `The deployment configuration settings are:
${configs}`;
  }
};

// src/index.ts
var CONFIG = {
  SUPPORTED_TOKENS,
  DEPLOYMENT_CONFIGS,
  LEASE_STATES
};
var spheronPlugin = {
  name: "spheron",
  description: "Spheron Protocol Plugin for Eliza",
  actions: [escrow_default, deployment_default],
  evaluators: [],
  providers: [tokensProvider, deploymentProvider]
};
var index_default = spheronPlugin;
export {
  CONFIG,
  closeDeployment,
  createOrder,
  index_default as default,
  depositBalance,
  generateICLYaml,
  getDeployment,
  getDeploymentStatus,
  getSDKInstance,
  getUserBalance,
  requiredEnvVars,
  spheronEnvSchema,
  spheronPlugin,
  startDeployment,
  updateDeployment,
  updateOrder,
  validateSpheronConfig,
  withdrawBalance
};
//# sourceMappingURL=index.mjs.map