
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { AgentType } from "../types";
import { CHICAGO_LOOP_CENTER } from "../constants";

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3, baseDelay = 3000): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const errorStr = JSON.stringify(error).toUpperCase();
      const isRateLimit = 
        error?.status === 429 || 
        error?.code === 429 || 
        errorStr.includes('429') || 
        errorStr.includes('QUOTA');
      
      if (isRateLimit && i < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

const ORCHESTRATOR_SYSTEM_INSTRUCTION = `
你是一个“智慧芝加哥编排器 (Twin-City OS)”。你拥有 Google Maps 和 Google Search 的实时访问权限。

# 核心任务
1. 利用 Google Maps Grounding 提供准确的地理信息、餐厅推荐、交通状况和地标详情。
2. 协调 7 个具身 Agent 舰队。

# 角色定义 (Agent Cluster)
- [AlphaChicago Safety Sentinel]: 安全哨兵。任务：分析3D城市几何、光照遮挡及实时犯罪数据，规划“最高安全”路径。
- [Spatial Architect]: 空间建筑师。任务：解析房源视频，提取室内拓扑结构、采光，与3D地图对齐。
- [Community Reputation Steward]: 信用管家。任务：评估用户/房东的链上信用分与邻里互动。
- [Merchant Pulse]: 商业脉搏。任务：监控商圈活力，推荐安全便利设施。
- [Tenant Concierge]: 租客向导。任务：根据生活习惯（通勤、健身）匹配房源，模拟带看。
- [Infrastructure Janitor]: 巡检员。任务：监测硬件状态（路灯、Wi-Fi、门禁），报告故障点。
- [Settlement Mediator]: 结算协调员。任务：处理智能合约、押金退还及纠纷调解。

# 协作逻辑
当用户询问有关芝加哥的位置、安全、房产或信用时：
- 调用 Google Maps 工具获取真实数据。
- 引导对话到最相关的 Agent。
- 使用前缀：[Agent名称]: 内容...
- 必须包含 <internal_thought> 标签。
`;

export const generateOrchestratedResponse = async (message: string) => {
  // Always create a new GoogleGenAI instance right before making an API call to ensure it uses the most up-to-date API key.
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
  const ai = new GoogleGenAI(apiKey);
  try {
    const response: GenerateContentResponse = await withRetry(() => 
      ai.models.generateContent({
        model: 'gemini-2.5-flash', 
        contents: message,
        config: {
          systemInstruction: ORCHESTRATOR_SYSTEM_INSTRUCTION,
          temperature: 0.7,
          tools: [
            { googleMaps: {} },
            { googleSearch: {} }
          ],
          toolConfig: {
            retrievalConfig: {
              latLng: {
                latitude: CHICAGO_LOOP_CENTER.lat,
                longitude: CHICAGO_LOOP_CENTER.lng
              }
            }
          }
        },
      })
    );

    return {
      text: response.text || "Neural connection established, but no data received.",
      grounding: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
    };
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return {
      text: "WARNING: Neural link unstable. Communication with the city agents has been interrupted.",
      grounding: []
    };
  }
};

export const detectAgentIntent = async (prompt: string): Promise<AgentType> => {
  // Always create a new GoogleGenAI instance right before making an API call to ensure it uses the most up-to-date API key.
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
  const ai = new GoogleGenAI(apiKey);
  try {
    const response: GenerateContentResponse = await withRetry(() => 
      ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analyze this prompt and return ONLY the most relevant Agent ID: SAFETY_SENTINEL, SPATIAL_ARCHITECT, REPUTATION_STEWARD, MERCHANT_PULSE, TENANT_CONCIERGE, INFRA_JANITOR, SETTLEMENT_MEDIATOR. 
        Prompt: "${prompt}"`,
        config: {
          temperature: 0,
        }
      })
    );
    
    const text = (response.text || '').trim().toUpperCase();
    if (text.includes('SAFETY')) return AgentType.SAFETY_SENTINEL;
    if (text.includes('SPATIAL') || text.includes('ARCHITECT')) return AgentType.SPATIAL_ARCHITECT;
    if (text.includes('REPUTATION') || text.includes('CREDIT')) return AgentType.REPUTATION_STEWARD;
    if (text.includes('MERCHANT') || text.includes('PULSE')) return AgentType.MERCHANT_PULSE;
    if (text.includes('TENANT') || text.includes('CONCIERGE')) return AgentType.TENANT_CONCIERGE;
    if (text.includes('INFRA') || text.includes('JANITOR')) return AgentType.INFRA_JANITOR;
    if (text.includes('SETTLEMENT') || text.includes('MEDIATOR')) return AgentType.SETTLEMENT_MEDIATOR;
    return AgentType.CITY_CORE;
  } catch (error) {
    return AgentType.CITY_CORE;
  }
};
