import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { Html, OrbitControls } from '@react-three/drei';
import { LumaSplatsThree } from '@lumaai/luma-web';
import * as THREE from 'three';
import {
  Activity, Shield, Layers, Users, Zap, LayoutDashboard, Share2, Database,
  LogOut, Mail, ShieldCheck, ChevronRight, ChevronDown, Terminal, Cpu,
  MessageSquare, Home, Settings, Globe, Lock, Box, Fingerprint, BarChart3,
  Network, Radio, Wrench, Handshake, UserCheck, Map as MapIcon, X,
  CreditCard, Wallet, MousePointer2, Settings2, Save, Eye, Send, Star
} from 'lucide-react';

// 假设这些类型和组件在你的本地文件中已存在
import { AgentType, Message, UserRole, User } from './types';
import { getUsdcBalance, getAddressBalance, getReputationByEmail, sendEthTransaction, sendUsdcTransaction, rateAgent } from './services/blockchainService';
import { db } from './services/dbService';
import { AGENTS, MOCK_BUILDINGS, CHICAGO_LOOP_CENTER } from './constants';
import ChatInterface from './components/ChatInterface';
import TwinCityMap from './components/TwinCityMap';
import PointDetailModal from './components/PointDetailModal';
import { generateOrchestratedResponse, detectAgentIntent } from './services/geminiService';

// --- API 配置区域 ---
//const DIFY_ROUTER_API_URL = "https://api.dify.ai/v1/chat-messages"; 
//const DIFY_ROUTER_API_KEY = ""; 
//const DIFY_WORKFLOW_API_URL = "https://api.dify.ai/v1/chat-messages"; 
//const DIFY_WORKFLOW_API_KEY = ""; 
//const GOOGLE_MAPS_API_KEY = ""; 

// 商户 Agent 专用 Dify 应用（你提供的 Key）
//const DIFY_MERCHANT_API_URL = "https://api.dify.ai/v1/chat-messages";
//const DIFY_MERCHANT_API_KEY = "";
const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const DIFY_ROUTER_API_URL = import.meta.env.VITE_DIFY_ROUTER_API_URL;
const DIFY_ROUTER_API_KEY = import.meta.env.VITE_DIFY_ROUTER_API_KEY;

const DIFY_WORKFLOW_API_URL = import.meta.env.VITE_DIFY_WORKFLOW_API_URL;
const DIFY_WORKFLOW_API_KEY = import.meta.env.VITE_DIFY_WORKFLOW_API_KEY;

const DIFY_MERCHANT_API_URL = import.meta.env.VITE_DIFY_MERCHANT_API_URL;
const DIFY_MERCHANT_API_KEY = import.meta.env.VITE_DIFY_MERCHANT_API_KEY;

interface DifyIntentResult {
  intent: string;
  keywords: string;
  confidence: number;
}
// --- MOCK DATA FOR MACHINE ECONOMY ---
const MOCK_AGENT_ACTIVITIES = [
  "SYSTEM_EVENT: New Tenant detected. Welcome to the Loop, Tom Jenkins! 🏙️",
  "REPUTATION_STEWARD: On-chain identity 'did:twin:usr:tom-jenkins' verified. Trust Score: 788.",
  "SAFETY_SENTINEL: Scanning Loop District... No anomalies detected in Sector 7.",
  "INFRA_JANITOR: IoT Sensor #882 reporting low latency. Fiber node optimized.",
  "TENANT_CONCIERGE: Neighborhood orientation packet sent to user Tom Jenkins.",
  "MERCHANT_PULSE: Millennium Park area reporting 85% commercial vitality.",
  "COMMUNITY_GOVERNANCE: Welcome event for new residents scheduled for Friday."
];

const MOCK_COMMUNITY_POSTS = [
  {
    id: 1,
    sender: "SYSTEM_CORE",
    text: "Welcome our newest citizen, Tom Jenkins, to the Chicago Loop digital twin community! 🥂 We've synchronized your neural DID with the local mesh.",
    timestamp: "2 mins ago",
    tag: "NEW_RESIDENT",
    icon: <UserCheck size={18} className="text-emerald-400" />
  },
  {
    id: 2,
    sender: "SAFETY_SENTINEL",
    text: "Night-time safety protocols updated for the Michigan Ave residential cluster. All emergency paths verified for new residents.",
    timestamp: "15 mins ago",
    tag: "SAFETY",
    icon: <ShieldCheck size={18} className="text-blue-400" />
  },
  {
    id: 3,
    sender: "MERCHANT_PULSE",
    text: "Special welcome offer: 15% discount at 'Loop Coffee' for all verified digital twin residents for the next 4 hours!",
    timestamp: "1 hour ago",
    tag: "DEALS",
    icon: <Zap size={18} className="text-amber-400" />
  }
];

// --- SCROLLER COMPONENT ---
const AgentActivityScroller = () => (
  <div className="w-full h-9 bg-blue-600/10 border-y border-white/5 overflow-hidden flex items-center relative backdrop-blur-xl">
    <div className="flex whitespace-nowrap animate-scroll-text gap-16 items-center">
      {[...MOCK_AGENT_ACTIVITIES, ...MOCK_AGENT_ACTIVITIES].map((text, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-1 h-1 bg-blue-400 rounded-full animate-pulse shadow-[0_0_8px_#60a5fa]" />
          <span className="text-[10px] font-mono text-blue-100/60 uppercase tracking-[0.2em] font-medium">
            {text}
          </span>
        </div>
      ))}
    </div>
  </div>
);

// --- API 调用函数 ---
const callDifyApi = async (query: string, apiKey: string, url: string) => {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: {},
        query: query,
        response_mode: "blocking",
        user: "twin-city-user",
      }),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    console.error("Dify Fetch Error:", e);
    return null;
  }
};

// 商户 Agent 使用的 Dify（streaming SSE，按 agent_message.answer 拼接）
const callDifyMerchantStream = async (query: string, apiKey: string, url: string): Promise<string> => {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: {},
        query,
        response_mode: "streaming",
        user: "twin-city-user",
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error("[Dify Merchant] Error", response.status, errBody);
      return "";
    }

    const reader = response.body?.getReader();
    if (!reader) return "";

    const decoder = new TextDecoder();
    let buffer = "";
    let fullAnswer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr || jsonStr === "[DONE]") continue;
        try {
          const obj = JSON.parse(jsonStr);
          if (obj.event === "agent_message" && typeof obj.answer === "string") {
            fullAnswer += obj.answer;
          }
        } catch {
          // 忽略单行解析错误，继续读后续 chunk
        }
      }
    }

    return fullAnswer;
  } catch (e) {
    console.error("[Dify Merchant] Fetch Error:", e);
    return "";
  }
};



const callDifyWorkflowApi = async (query: string, apiKey: string, url: string) => {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: { query: query },
        response_mode: "blocking",
        user: "twin-city-user",
      }),
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (e) {
    console.error("Dify Workflow Fetch Error:", e);
    return null;
  }
};

const fetchGeocode = async (address: string) => {
  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${GOOGLE_MAPS_API_KEY}`;
    const response = await fetch(url);
    return await response.json();
  } catch (e) {
    console.error("Geo API Error:", e);
    return { results: [] };
  }
};

// --- NEW 3D COMPONENTS START ---

// 1. Luma 模型渲染器
const LumaSplats = ({ source }: { source: string }) => {
  const splat = useMemo(() => {
    return new LumaSplatsThree({
      source: source,
      enableThreeShaderIntegration: false,
    });
  }, [source]);
  return <primitive object={splat} dispose={null} />;
};

// 2. 交互热点 (Hotspot)
interface HotspotProps {
  position: [number, number, number];
  label: string;
  onClick: () => void;
  isEditMode: boolean;
}

const Hotspot: React.FC<HotspotProps> = ({ position, label, onClick, isEditMode }) => {
  return (
    <Html position={position} center zIndexRange={[100, 0]}>
      <div 
        onClick={onClick}
        className={`group relative flex items-center gap-2 cursor-pointer transition-all duration-300 ${isEditMode ? 'pointer-events-none opacity-80' : 'hover:scale-110'}`}
      >
        <div className="absolute w-4 h-4 bg-blue-500 rounded-full animate-ping opacity-75 left-2"></div>
        <div className="relative z-10 w-8 h-8 bg-blue-600/90 border border-blue-400 rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(59,130,246,0.6)] backdrop-blur-sm">
          <MousePointer2 size={14} className="text-white" />
        </div>
        <div className="bg-black/60 text-white text-xs font-mono px-3 py-1.5 rounded-r-lg border-r border-t border-b border-blue-500/30 backdrop-blur-md translate-x-[-10px] -z-0">
          {label}
        </div>
      </div>
    </Html>
  );
};

// 3. 街景模态框 (新增组件)
const StreetViewModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  targetLocation: { lat: number; lng: number }; // 目标房屋坐标
}> = ({ isOpen, onClose, targetLocation }) => {
  const streetViewRef = useRef<HTMLDivElement>(null);
  const [statusMsg, setStatusMsg] = useState("Connecting to Google Earth satellite link...");
  const [panoDate, setPanoDate] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const loadMapsApi = () => {
      // 检查 API 是否已加载 (使用 any 绕过 TS 类型检查)
      if ((window as any).google && (window as any).google.maps) {
        initStreetView();
        return;
      }

      // 动态加载 Google Maps Script (包含 geometry 库)
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=geometry`;
      script.async = true;
      script.defer = true;
      script.onload = () => initStreetView();
      document.body.appendChild(script);
    };

    const initStreetView = () => {
      if (!(window as any).google || !streetViewRef.current) return;

      const googleMaps = (window as any).google.maps;
      const svService = new googleMaps.StreetViewService();
      
      // 100米半径寻找最近拍摄点
      svService.getPanorama({
        location: targetLocation,
        radius: 100,
        source: googleMaps.StreetViewSource.OUTDOOR
      }, (data: any, status: any) => {
        if (status === "OK") {
          setPanoDate(data.imageDate);
          setStatusMsg("信号锁定：实景数据传输中...");
          
          const panorama = new googleMaps.StreetViewPanorama(streetViewRef.current as HTMLElement, {
             disableDefaultUI: true, // 隐藏默认控件，更像赛博朋克风格
             zoomControl: true,
             panControl: true,
             clickToGo: true,
             addressControl: false,
             fullscreenControl: false
          });
          
          panorama.setPano(data.location.pano);

          // 核心逻辑：计算镜头朝向，让其正对房子
          const heading = googleMaps.geometry.spherical.computeHeading(
            data.location.latLng, 
            targetLocation
          );

          panorama.setPov({
            heading: heading, 
            pitch: 5, // 稍微抬头
            zoom: 1
          });

          panorama.setVisible(true);
        } else {
          setStatusMsg(`无法获取街景数据: ${status}`);
        }
      });
    };

    loadMapsApi();
  }, [isOpen, targetLocation]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="w-[90vw] h-[80vh] glass-panel rounded-[2rem] border border-white/10 overflow-hidden relative shadow-2xl flex flex-col">
        
        {/* Header */}
        <div className="h-16 bg-black/60 flex items-center justify-between px-8 border-b border-white/10 z-10">
          <div className="flex items-center gap-4">
             <div className="w-8 h-8 bg-orange-500/20 rounded-full flex items-center justify-center border border-orange-500/30">
                <MapIcon size={16} className="text-orange-400" />
             </div>
             <div>
               <h3 className="text-white font-bold tracking-wide">REALITY_LINK // STREET_VIEW</h3>
               <p className="text-[10px] text-white/40 font-mono uppercase">
                  {panoDate ? `Capture Date: ${panoDate}` : statusMsg}
               </p>
             </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 bg-white/5 hover:bg-white/20 rounded-full flex items-center justify-center transition-all text-white rounded-full">
            <X size={20} />
          </button>
        </div>

        {/* Street View Container */}
        <div className="flex-1 relative bg-gray-900">
           <div ref={streetViewRef} className="w-full h-full" />
           {/* 覆盖层：增加一点科技感的扫描线 */}
           <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-[5] bg-[length:100%_2px,3px_100%] opacity-20"></div>
        </div>
      </div>
    </div>
  );
};

// 4. 升级版 LumaModal (包含街景触发)
const LumaModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  lumalabsUrl: string;
  difyData: any;
}> = ({ isOpen, onClose, lumalabsUrl, difyData }) => {
  
  const sourceId = useMemo(() => {
    if (lumalabsUrl.includes('capture/')) {
      return lumalabsUrl.split('capture/')[1].split('?')[0];
    }
    return lumalabsUrl;
  }, [lumalabsUrl]);

  const [isEditMode, setIsEditMode] = useState(false);
  const [hotspotPos, setHotspotPos] = useState<[number, number, number]>([0, 0.5, 0]); 
  
  // 新增：控制街景弹窗状态
  const [showStreetView, setShowStreetView] = useState(false);
  // 新增：目标坐标 (Home Alone House 坐标)
  const targetHouseCoords = { lat: 42.109723, lng: -87.733525 };

  const updatePos = (index: number, value: number) => {
    const newPos = [...hotspotPos] as [number, number, number];
    newPos[index] = value;
    setHotspotPos(newPos);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed top-8 right-8 bottom-8 left-[600px] z-[100] flex flex-col animate-in fade-in duration-300">
      <div className="glass-panel w-full h-full rounded-[2rem] border border-white/10 overflow-hidden relative shadow-2xl shadow-blue-900/20 flex flex-col bg-black/80">
        
        {/* 顶部栏 */}
        <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-black/90 to-transparent flex items-center justify-between px-8 z-20 pointer-events-none">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center backdrop-blur-sm border border-blue-500/30">
              <Globe className="text-blue-400" size={16} />
            </div>
            <span className="text-white/90 font-mono text-sm tracking-wider">
              NEURAL_RECONSTRUCTION // INTERACTIVE
            </span>
          </div>
          
          <div className="flex items-center gap-4 pointer-events-auto">
            <button 
              onClick={() => setIsEditMode(!isEditMode)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all border ${isEditMode ? 'bg-orange-500/20 text-orange-400 border-orange-500/50' : 'bg-white/5 text-white/40 border-white/10 hover:text-white'}`}
            >
              {isEditMode ? <Settings2 size={14} /> : <Eye size={14} />}
              {isEditMode ? 'DEV: ON' : 'VIEW'}
            </button>
            <button onClick={onClose} className="w-10 h-10 bg-white/5 hover:bg-white/20 rounded-full flex items-center justify-center transition-all border border-white/10 text-white">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* 3D 场景区域 */}
        <div className="flex-1 bg-[#050505] relative cursor-move">
          <Canvas camera={{ position: [3, 1, 3], fov: 60 }} dpr={[1, 2]}>
            <color attach="background" args={['#050505']} />
            <ambientLight intensity={0.5} />
            <OrbitControls enableDamping dampingFactor={0.05} minDistance={0.5} maxDistance={10} />
            
            <LumaSplats source={`https://lumalabs.ai/capture/${sourceId}`} />
            
            <Hotspot 
              position={hotspotPos} 
              label="查看街道实景" 
              isEditMode={isEditMode}
              onClick={() => {
                console.log("Opening Street View...");
                setShowStreetView(true);
              }}
            />

            {isEditMode && <axesHelper args={[2]} />}
            {isEditMode && <gridHelper args={[10, 10, 0x444444, 0x222222]} />}
          </Canvas>

          {/* 调试面板 */}
          {isEditMode && (
            <div className="absolute top-20 right-6 w-64 glass-panel p-4 rounded-xl border border-orange-500/30 bg-black/80 backdrop-blur-xl animate-in slide-in-from-right-10 pointer-events-auto">
              <div className="flex items-center gap-2 mb-4 text-orange-400 border-b border-orange-500/20 pb-2">
                <Settings2 size={16} />
                <span className="text-xs font-bold uppercase">Position Debugger</span>
              </div>
              {['X', 'Y', 'Z'].map((axis, i) => (
                <div key={axis} className="mb-4">
                  <div className="flex justify-between text-xs text-white/60 mb-1 font-mono">
                    <span>{axis}-Axis</span>
                    <span className="text-orange-400">{hotspotPos[i].toFixed(2)}</span>
                  </div>
                  <input 
                    type="range" min="-5" max="5" step="0.1" 
                    value={hotspotPos[i]}
                    onChange={(e) => updatePos(i, parseFloat(e.target.value))}
                    className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              ))}
              <div className="bg-white/5 p-2 rounded text-[10px] font-mono text-white/40 break-all select-all">
                {`position={[${hotspotPos[0].toFixed(2)}, ${hotspotPos[1].toFixed(2)}, ${hotspotPos[2].toFixed(2)}]}`}
              </div>
            </div>
          )}
        </div>

        {/* 底部数据面板 */}
        {difyData && (
            <div className="absolute bottom-6 left-6 right-6 pointer-events-none z-20">
              <div className="glass-panel p-4 rounded-2xl border border-white/10 w-full backdrop-blur-xl bg-black/60 pointer-events-auto transition-all hover:bg-black/80 shadow-2xl">
                 <div className="flex items-center gap-2 mb-2 text-xs text-blue-400 font-bold uppercase tracking-widest">
                    <Activity size={12} />
                    <span>Spatial Analysis Result</span>
                 </div>
                 <div className="text-white/80 text-sm font-mono leading-relaxed max-h-24 overflow-y-auto pr-2 custom-scrollbar">
                    {typeof difyData === 'string' ? difyData : difyData?.answer || difyData?.outputs?.result || JSON.stringify(difyData, null, 2)}
                 </div>
              </div>
            </div>
        )}
      </div>

      {/* 嵌入街景组件 */}
      <StreetViewModal 
        isOpen={showStreetView} 
        onClose={() => setShowStreetView(false)} 
        targetLocation={targetHouseCoords}
      />

    </div>
  );
};
// --- NEW 3D COMPONENTS END ---

type NavTab = 'HOME' | 'SYSTEM' | 'COMMUNITY';

const MOCK_ACCOUNTS = [
  { email: 'alex.landlord@gmail.com', name: 'Alex Rivera', role: 'Landlord' as UserRole, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alex', eigenCreditScore: 842 },
  { email: 'maria.merchant@gmail.com', name: 'Maria Chen', role: 'Merchant' as UserRole, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Maria', eigenCreditScore: 915 },
  { email: 'tom.tenant@gmail.com', name: 'Tom Jenkins', role: 'Tenant' as UserRole, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Tom', eigenCreditScore: 788 }
];


const INITIAL_AGENT_MESSAGES = [
  { agentId: AgentType.SAFETY_SENTINEL, text: "正在更新安全路径：密歇根大道监控盲点已检测到，建议采用具身重叠路径。" },
  { agentId: AgentType.INFRA_JANITOR, text: "警告：Wacker Dr 节点路灯故障。已标记维修点，正在派遣机器人修复。" },
  { agentId: AgentType.CITY_CORE, text: "Loop 区域数字孪生系统已完成 100% 同步。欢迎市民访问。" },
];

const App: React.FC = () => {
  const [user, setUser] = useState<User>({ id: '', name: '', email: '', avatar: '', isAuthenticated: false });
  const [view, setView] = useState<'LOGIN' | 'HANDSHAKE' | 'SIMULATION'>('LOGIN');
  const [activeTab, setActiveTab] = useState<NavTab>('HOME');
  const [activeAgent, setActiveAgent] = useState<AgentType>(AgentType.CITY_CORE);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [mapOverlay, setMapOverlay] = useState<'NONE' | 'SAFETY' | 'COMMERCE'>('NONE');
  const [highlightedBuildings, setHighlightedBuildings] = useState<string[]>([]);
  const [groundedPoints, setGroundedPoints] = useState<any[]>([]);
  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [fleetStream, setFleetStream] = useState<any[]>([]);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState<string>('0');
  const [ethBalance, setEthBalance] = useState<string>('0');
  const [userAddress, setUserAddress] = useState<string>('');
  const [agentId, setAgentId] = useState<number | null>(null);
  const [creditScore, setCreditScore] = useState<number>(0);

  // 转账弹窗状态
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferType, setTransferType] = useState<'ETH' | 'USDC'>('ETH');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferRecipient, setTransferRecipient] = useState('');
  const [allUsers, setAllUsers] = useState<{ email: string; address: string; agentId?: number }[]>([]);
  const [isTransferring, setIsTransferring] = useState(false);

  // Feedback 弹窗状态
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [feedbackTarget, setFeedbackTarget] = useState('');
  const [feedbackScore, setFeedbackScore] = useState(50);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);

  // Fetch ETH/USDC balance, address, agentId and credit score when profile modal is opened
  useEffect(() => {
    if (isProfileModalOpen && user.email) {
      const fetchUserBlockchainInfo = async () => {
        try {
          const identity = await db.findByEmail(user.email);
          if (identity && identity.address) {
            setUserAddress(identity.address);
            setAgentId(identity.agentId || null);
            const [usdcBal, ethBal, reputation] = await Promise.all([
              getUsdcBalance(identity.address),
              getAddressBalance(identity.address),
              getReputationByEmail(user.email)
            ]);
            setUsdcBalance(usdcBal);
            setEthBalance(ethBal);
            setCreditScore(reputation.score || 0);
          }
        } catch (error) {
          console.error('Failed to fetch user blockchain info:', error);
        }
      };
      fetchUserBlockchainInfo();
    }
  }, [isProfileModalOpen, user.email]);

  // Fetch all users when transfer or feedback modal is opened
  useEffect(() => {
    if (isTransferModalOpen || isFeedbackModalOpen) {
      const fetchAllUsers = async () => {
        try {
          const identities = await db.getAllIdentities();
          const users = identities
            .filter(i => i.email && i.address)
            .map(i => ({ email: i.email, address: i.address, agentId: i.agentId }));
          setAllUsers(users);
        } catch (error) {
          console.error('Failed to fetch users:', error);
        }
      };
      fetchAllUsers();
    }
  }, [isTransferModalOpen, isFeedbackModalOpen]);

  // Handle transfer
  const handleTransfer = async () => {
    if (!transferRecipient || !transferAmount) return;

    setIsTransferring(true);
    try {
      const recipientUser = allUsers.find(u => u.email === transferRecipient);
      if (!recipientUser) {
        alert('Recipient not found');
        return;
      }

      const currentUserIdentity = await db.findByEmail(user.email);
      if (!currentUserIdentity || !currentUserIdentity.privateKey) {
        alert('Current user identity not found');
        return;
      }

      let txHash = '';
      if (transferType === 'ETH') {
        txHash = await sendEthTransaction(
          currentUserIdentity.privateKey,
          recipientUser.address,
          transferAmount
        );
      } else {
        txHash = await sendUsdcTransaction(
          currentUserIdentity.privateKey,
          recipientUser.address,
          transferAmount
        );
      }

      alert(`Transfer successful! Transaction hash: ${txHash}`);
      setIsTransferModalOpen(false);
      setTransferAmount('');
      setTransferRecipient('');
    } catch (error: any) {
      console.error('Transfer failed:', error);
      alert(`Transfer failed: ${error.message || 'Unknown error'}`);
    } finally {
      setIsTransferring(false);
    }
  };

  // Handle feedback submission
  const handleFeedbackSubmit = async () => {
    if (!feedbackTarget) return;

    setIsSubmittingFeedback(true);
    try {
      const targetUser = allUsers.find(u => u.email === feedbackTarget);
      if (!targetUser) {
        alert('Target user not found');
        return;
      }

      const currentUserIdentity = await db.findByEmail(user.email);
      if (!currentUserIdentity || !currentUserIdentity.privateKey) {
        alert('Current user identity not found');
        return;
      }

      const txHash = await rateAgent(
        currentUserIdentity.privateKey,
        targetUser.address,
        feedbackScore,
        feedbackComment,
        targetUser.agentId
      );

      alert(`Feedback submitted successfully! Transaction hash: ${txHash}`);
      setIsFeedbackModalOpen(false);
      setFeedbackTarget('');
      setFeedbackScore(50);
      setFeedbackComment('');
    } catch (error: any) {
      console.error('Feedback submission failed:', error);
      alert(`Feedback submission failed: ${error.message || 'Unknown error'}`);
    } finally {
      setIsSubmittingFeedback(false);
    }
  };

  // 弹窗状态
  const [selectedPoint, setSelectedPoint] = useState<any>(null);
  const [isPointModalOpen, setIsPointModalOpen] = useState(false);
  const [showLumaModal, setShowLumaModal] = useState(false);
  const [currentLumaData, setCurrentLumaData] = useState<any>(null);
  
  const [discoveryState, setDiscoveryState] = useState<'WELCOME' | 'PREFERENCES' | 'LISTINGS' | 'EXPLORING'>('WELCOME');
  const [handshakeStep, setHandshakeStep] = useState(0);

  const handshakeLogs = [
    "Contacting Google Authentication SDK...",
    "Retrieving user_email and access_token...",
    "Initializing Digital Twin Identity...",
    "Generating Base-compatible Embedded Wallet...",
    "Binding Google Identity to Neural DID...",
    "Finalizing Slashable Security Value: 12.5 ETH"
  ];

  useEffect(() => {
    if (view === 'HANDSHAKE') {
      if (handshakeStep < handshakeLogs.length) {
        const timer = setTimeout(() => setHandshakeStep(prev => prev + 1), 600);
        return () => clearTimeout(timer);
      } else {
        setTimeout(() => setView('SIMULATION'), 800);
      }
    }
  }, [view, handshakeStep]);

  useEffect(() => {
    if (view === 'SIMULATION' && messages.length === 0) {
      const timer = setTimeout(() => {
        const welcomeMsg: Message = {
          id: 'welcome-001',
          sender: AgentType.CITY_CORE,
          text: `Hello, ${user.name}. I am Neo-Chicago Core. Your digital twin identity is active. Welcome to the Loop Smart Community.\n\nYou have entered as a ${user.role}. How can I assist you today? For example, I can help you find the safest apartments in the Loop, analyze commercial vitality, or manage your on-chain credit.`,
          timestamp: new Date()
        };
        setMessages([welcomeMsg]);
        setFleetStream(INITIAL_AGENT_MESSAGES.map(m => ({ ...m, id: Math.random().toString(), time: '00:00:01' })));
        setActiveAgent(AgentType.CITY_CORE);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [view, messages.length, user.name, user.role]);

  useEffect(() => {
    if (view !== 'SIMULATION') return;
    const interval = setInterval(() => {
      const AGENT_POOL = [
                          { 
                            agentId: AgentType.SAFETY_SENTINEL, 
                            text: "Safety Patrol Node 04: Anomalous pedestrian flow detected. Switching to Defensive Scan Mode." 
                          },
                          { 
                            agentId: AgentType.INFRA_JANITOR, 
                            text: "WiFi Node #88A under maintenance. Peripheral users automatically rerouted to 5G redundancy link." 
                          },
                          { 
                            agentId: AgentType.REPUTATION_STEWARD, 
                            text: "New on-chain lease detected (#Lease-9902). Calculating reputation credit increment." 
                          },
                          { 
                            agentId: AgentType.MERCHANT_PULSE, 
                            text: "Commercial Vitality Index near Millennium Park increased to 88%." 
                          },
                          { 
                            agentId: AgentType.CITY_CORE, 
                            text: "City Core: Multiple new citizens detected in Loop area. Synchronizing spatial permissions." 
                          },
                        ];
      const randomMsg = AGENT_POOL[Math.floor(Math.random() * AGENT_POOL.length)];
      const newPost = {
        ...randomMsg,
        id: Date.now().toString(),
        time: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
      };
      setFleetStream(prev => [newPost, ...prev].slice(0, 30));
    }, 5000);
    return () => clearInterval(interval);
  }, [view]);

  const handleLoginStart = (account: typeof MOCK_ACCOUNTS[0]) => {
    setUser({
      ...account,
      id: `usr-${Date.now()}`,
      isAuthenticated: true,
      did: `did:twin:usr:${account.name.toLowerCase().replace(' ', '-')}`,
      embeddedWallet: `0x${Math.random().toString(16).slice(2, 42)}`,
      eigenCreditScore: account.eigenCreditScore || 750,
      slashableValue: '12.5 ETH'
    });
    setView('HANDSHAKE');
  };

  const handleLogout = () => {
    setUser({ id: '', name: '', email: '', avatar: '', isAuthenticated: false });
    setView('LOGIN');
    setMessages([]);
    setHandshakeStep(0);
    setDiscoveryState('WELCOME');
    setHighlightedBuildings([]);
    setGroundedPoints([]);
    setIsProfileModalOpen(false);
  };

  const handleSendMessage = async (text: string) => {
    const userMsg: Message = { id: Date.now().toString(), sender: 'USER', text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);
    // 新增：英文关键词前置拦截，确保 "apartment" 或 "rent" 能直接启动流程
    if (discoveryState === 'WELCOME' && 
       (text.toLowerCase().includes('rent') || text.toLowerCase().includes('apartment'))) {
      setDiscoveryState('PREFERENCES');
      const coreResponse: Message = {
        id: Date.now().toString(),
        sender: AgentType.CITY_CORE,
        text: "[Neo-Chicago Core]: I see you're looking for a place. To narrow down your search, what is more important to you?\n1. Safety (Path analysis via Safety Sentinel)\n2. Lifestyle (District vitality via Merchant Pulse)",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, coreResponse]);
      setIsTyping(false);
      return;
    }
    try {
      const routerResult = await callDifyApi(text, DIFY_ROUTER_API_KEY, DIFY_ROUTER_API_URL);
      let parsedIntent: DifyIntentResult | null = null;
      if (routerResult && routerResult.answer) {
        try {
          const cleanJson = routerResult.answer.replace(/```json\n?|```/g, '').trim();
          parsedIntent = JSON.parse(cleanJson);
        } catch (e) {
           console.warn("JSON Parse Error", e);
        }
      }

      if (parsedIntent && parsedIntent.intent === 'Area_Search') {
        const address = parsedIntent.keywords;
        const geoData = await fetchGeocode(address);
        if (geoData.results && geoData.results.length > 0) {
          const location = geoData.results[0].geometry.location;
          const centerLat = Number(location.lat);
          const centerLng = Number(location.lng);
          const searchPoints = [
            { id: `geo-${Date.now()}-1`, lat: centerLat, lng: centerLng, label: `${address}`, type: 'SEARCH_RESULT' },
            { id: `geo-${Date.now()}-2`, lat: centerLat + 0.0015, lng: centerLng + 0.0015, label: `${address} (Hotspot)`, type: 'SEARCH_RESULT' }
          ];
          setGroundedPoints(prev => [...prev, ...searchPoints]);
          const aiMsg: Message = {
            id: Date.now().toString(),
            sender: AgentType.SPATIAL_ARCHITECT,
            text: `[Spatial Architect]: [Spatial Architect]: Spatial intent recognized (Confidence: ${parsedIntent.confidence}).Google GeoAPI data retrieved. Area "${address}" has been locked. 2 key anchors have been generated on the holographic map. Please click to view detailed data.`,
            timestamp: new Date(),
            metadata: { grounding: searchPoints }
          };
          setMessages(prev => [...prev, aiMsg]);
          setActiveAgent(AgentType.SPATIAL_ARCHITECT);
          setIsTyping(false);
          return;
        }
      }


      if (discoveryState === 'WELCOME' && (text.includes('租房') || text.includes('rent') || text.includes('apartment'))) {
        setDiscoveryState('PREFERENCES');
        const coreResponse: Message = {
          id: Date.now().toString(),
          sender: AgentType.CITY_CORE,
          text: "[Neo-Chicago Core]: Understood. Scanning available listings. What is your primary priority for an ideal residence? 1. Safety & Security (Deploying Safety Sentinel for path analysis) 2. Social Vitality (Deploying Merchant Pulse for district recommendations)",
          timestamp: new Date()
        };
        setTimeout(() => {
          setMessages(prev => [...prev, coreResponse]);
          setIsTyping(false);
        }, 1000);
        return;
      }
      
      const predictedAgent = await detectAgentIntent(text);
      setActiveAgent(predictedAgent);

      // 商户相关问题 → 走你提供的 Dify Merchant Agent（streaming）
      if (predictedAgent === AgentType.MERCHANT_PULSE) {
        const merchantAnswer = await callDifyMerchantStream(text, DIFY_MERCHANT_API_KEY, DIFY_MERCHANT_API_URL);
        const displayText = merchantAnswer.trim() || "Merchant Pulse connection error. Please try again later.";
        const newMsg: Message = {
          id: Date.now().toString(),
          sender: AgentType.MERCHANT_PULSE,
          text: displayText,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, newMsg]);
        setIsTyping(false);
        return;
      }

      const { text: fullResponse, grounding } = await generateOrchestratedResponse(text);
      if (grounding?.length > 0) setGroundedPoints(prev => [...prev, ...grounding]);
      const cleanResponse = fullResponse.replace(/<internal_thought>[\s\S]*?<\/internal_thought>/g, '').trim();
      const newMsg: Message = {
        id: Date.now().toString(),
        sender: predictedAgent,
        text: cleanResponse,
        timestamp: new Date(),
        metadata: { grounding }
      };
      setMessages(prev => [...prev, newMsg]);

    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        sender: AgentType.CITY_CORE,
        text: "System is temporarily busy. Please try again later.",
        timestamp: new Date()
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleBuildingSelect = (item: any) => {
    setHighlightedBuildings([item.id]);
    setSelectedPoint(item);
    setIsPointModalOpen(true);
    if (isChatCollapsed) setIsChatCollapsed(false);
  };

  const handleViewDetails = async () => {
    setIsPointModalOpen(false);
    const pointInfo = {
      id: selectedPoint.id,
      label: selectedPoint.label || selectedPoint.name,
      lat: selectedPoint.lat || selectedPoint.coordinates?.lat,
      lng: selectedPoint.lng || selectedPoint.coordinates?.lng,
      type: selectedPoint.type || 'unknown',
      category: selectedPoint.category,
      address: selectedPoint.address
    };
    const query = `获取点位详情: ${JSON.stringify(pointInfo)}`;
    setIsTyping(true);
    try {
      const difyResult = await callDifyWorkflowApi(query, DIFY_WORKFLOW_API_KEY, DIFY_WORKFLOW_API_URL);
      const aiMsg: Message = {
        id: Date.now().toString(),
        sender: AgentType.SPATIAL_ARCHITECT,
        text: `[Spatial Architect]: Successfully retrieved details for "${pointInfo.label}".\n\nLoading spatial topology data...`,
        timestamp: new Date(),
        metadata: {
          difyResponse: difyResult?.answer || difyResult?.outputs?.result || 'loading...',
          lumalabsUrl: 'https://lumalabs.ai/capture/0fd66136-b18e-4389-a99c-092acaeeb1d4'
        }
      };
      setMessages(prev => [...prev, aiMsg]);
      setTimeout(() => {
        setCurrentLumaData(difyResult);
        setShowLumaModal(true);
      }, 300);
    } catch (error) {
      console.error('Dify API Error:', error);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        sender: AgentType.CITY_CORE,
        text: 'Sorry, an error occurred while fetching details. Please try again later.',
        timestamp: new Date()
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  if (view === 'LOGIN') {
     return (
      <div className="fixed inset-0 z-[100] bg-[#020617] flex items-center justify-center p-6 overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-[120px] pointer-events-none mix-blend-screen" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-purple-600/20 rounded-full blur-[120px] pointer-events-none mix-blend-screen" />
        <div className="max-w-md w-full glass-panel rounded-[3rem] p-12 text-center border border-white/10 shadow-[0_0_80px_rgba(0,0,0,0.5)] relative overflow-hidden z-10">
           <div className="w-24 h-24 bg-blue-600 rounded-[2rem] flex items-center justify-center mx-auto mb-10 relative shadow-xl shadow-blue-500/30 group">
             <div className="absolute inset-0 bg-blue-400 rounded-[2rem] blur opacity-0 group-hover:opacity-40 transition-opacity duration-500"></div>
             <Activity size={48} className="text-white relative z-10" />
           </div>
           <h2 className="text-4xl font-black mb-3 text-white uppercase italic tracking-tighter">Atlas Axis</h2>
           <p className="text-white/40 mb-12 text-sm font-mono">Redefining Urban Living through the Chicago Machine Economy</p>
           <div className="space-y-4">
            {MOCK_ACCOUNTS.map((account) => (
              <button key={account.email} onClick={() => handleLoginStart(account)} className="w-full p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 hover:scale-[1.02] transition-all text-white flex items-center gap-5 group">
                <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white/10 group-hover:border-blue-400 transition-colors">
                    <img src={account.avatar} className="w-full h-full" alt={account.name} />
                </div>
                <div className="text-left">
                    <span className="font-bold block text-lg">{account.name}</span>
                    <span className="text-[10px] text-blue-400/60 font-mono block mb-1">{account.email}</span>
                    <span className="text-xs text-white/40 uppercase tracking-widest">{account.role}</span>
                </div>
                <ChevronRight className="ml-auto text-white/20 group-hover:text-white group-hover:translate-x-1 transition-all" />
              </button>
            ))}
           </div>
        </div>
      </div>
     );
  }

  if (view === 'HANDSHAKE') {
    return (
        <div className="fixed inset-0 bg-[#020617] text-white flex flex-col items-center justify-center font-mono z-[200]">
            <div className="w-64 h-1 bg-white/10 rounded-full overflow-hidden mb-8">
                <div className="h-full bg-blue-500 transition-all duration-300 ease-out" style={{ width: `${(handshakeStep / handshakeLogs.length) * 100}%` }} />
            </div>
            <div className="h-8 flex items-center justify-center">
                <span className="animate-pulse text-blue-400">{handshakeLogs[handshakeStep] || "System Ready"}</span>
            </div>
        </div>
    );
  }

  return (
    <div className="h-screen w-screen relative bg-[#020617] overflow-hidden flex">
      <nav className="w-20 h-full z-[80] glass-panel border-r border-white/10 flex flex-col items-center py-8 gap-10">
        <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/30 mb-4">
          <Activity size={24} className="text-white" />
        </div>
        <div className="flex flex-col gap-6">
          <button onClick={() => setActiveTab('HOME')} className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${activeTab === 'HOME' ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20' : 'text-white/20 hover:text-white hover:bg-white/5'}`}><Home size={22} /></button>
          <button onClick={() => setActiveTab('SYSTEM')} className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${activeTab === 'SYSTEM' ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' : 'text-white/20 hover:text-white hover:bg-white/5'}`}><Cpu size={22} /></button>
          <button onClick={() => setActiveTab('COMMUNITY')} className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${activeTab === 'COMMUNITY' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' : 'text-white/20 hover:text-white hover:bg-white/5'}`}><Network size={22} /></button>
          <button onClick={() => setIsTransferModalOpen(true)} className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all text-white/20 hover:text-white hover:bg-white/5" title="Transfer"><Send size={22} /></button>
          <button onClick={() => setIsFeedbackModalOpen(true)} className="w-12 h-12 rounded-2xl flex items-center justify-center transition-all text-white/20 hover:text-white hover:bg-white/5" title="Feedback"><Star size={22} /></button>
        </div>
        <div className="mt-auto flex flex-col gap-6 items-center">
            <button onClick={() => setIsProfileModalOpen(true)} className="w-12 h-12 rounded-2xl overflow-hidden border-2 border-white/10 hover:border-white/50 transition-all"><img src={user.avatar} className="w-full h-full object-cover" /></button>
            <button onClick={handleLogout} className="text-white/20 hover:text-red-400 transition-colors"><LogOut size={20} /></button>
        </div>
      </nav>

      <main className="flex-1 relative flex flex-col overflow-hidden">
        {activeTab === 'HOME' && (
          <div className="absolute inset-0 z-0 animate-in fade-in duration-500">
            <TwinCityMap onBuildingClick={handleBuildingSelect} highlightedIds={highlightedBuildings} groundedPoints={groundedPoints} />
            
            {/* 右上角 Agent 滚动条 */}
            <div className="absolute top-8 right-8 w-96 z-40 pointer-events-none space-y-4 animate-in slide-in-from-right-8 duration-700">
              <div className="rounded-2xl overflow-hidden border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.8)] backdrop-blur-2xl bg-black/40">
                <div className="bg-blue-600/80 px-3 py-1.5 flex justify-between items-center border-b border-white/10">
                  <span className="text-[9px] font-black text-white uppercase tracking-[0.3em] italic">Agent_Neural_Stream</span>
                  <div className="flex gap-1.5">
                    <div className="w-1 h-1 bg-white/40 rounded-full" />
                    <div className="w-1 h-1 bg-white/40 rounded-full" />
                  </div>
                </div>
                <AgentActivityScroller />
              </div>
            </div>
            
            <div className={`absolute bottom-8 left-8 transition-all duration-700 z-50 glass-panel shadow-[0_0_100px_rgba(0,0,0,0.5)] flex flex-col border border-white/10 overflow-hidden backdrop-blur-xl ${isChatCollapsed ? 'w-24 h-24 rounded-[2.5rem]' : 'w-[480px] h-[640px] rounded-[3rem]'}`}>
              <ChatInterface messages={messages} onSendMessage={handleSendMessage} activeAgent={activeAgent} isTyping={isTyping} isCollapsed={isChatCollapsed} onToggleCollapse={() => setIsChatCollapsed(!isChatCollapsed)} />
            </div>
          </div>
        )}
        {activeTab === 'SYSTEM' && (
          <div className="flex-1 flex flex-col bg-[#020617] animate-in fade-in duration-500 overflow-y-auto custom-scrollbar">
            {/* 顶部滚动简讯 */}
            <div className="sticky top-0 z-20">
              <AgentActivityScroller />
            </div>
            
            <div className="p-10 max-w-6xl mx-auto w-full">
              {/* 仪表盘头部 */}
              <div className="flex items-center justify-between mb-10 border-b border-white/5 pb-6">
                <div>
                  <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase mb-2">Neural_Grid_Governance</h2>
                  <p className="text-[10px] text-purple-400 font-mono tracking-[0.3em] uppercase">Active Autonomous Agent Fleet Monitoring</p>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-white/30 font-mono mb-1 uppercase">Total Network TVL (Treasury)</div>
                  <div className="text-xl font-black text-white font-mono tracking-tighter">9,045.5 ETH</div>
                </div>
              </div>
        
              {/* Agent 状态网格：从 MOCK_ACCOUNTS 中筛选系统角色 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {MOCK_ACCOUNTS.filter(acc => acc.role.includes('Agent')).map((agent) => (
                  <div key={agent.email} className="glass-panel p-6 rounded-[2.5rem] border border-white/5 hover:border-purple-500/30 transition-all group relative overflow-hidden bg-black/40">
                    {/* 背景装饰光效 */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 blur-[50px] group-hover:bg-purple-500/10 transition-colors" />
                    
                    <div className="flex items-start gap-6 relative z-10">
                      {/* Agent 头像/图标 */}
                      <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:border-purple-500/50 transition-colors shrink-0">
                        <img src={agent.avatar} alt={agent.name} className="w-12 h-12" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h3 className="text-lg font-bold text-white uppercase tracking-tight">{agent.name}</h3>
                            <p className="text-[9px] text-purple-400 font-mono uppercase font-black">{agent.role}</p>
                          </div>
                          <span className="text-[9px] px-2 py-1 rounded bg-white/5 text-white/40 font-mono border border-white/10">
                            {agent.address.slice(0, 12)}...
                          </span>
                        </div>
                        
                        {/* 机器经济描述 */}
                        <p className="text-[10px] text-white/40 font-mono mb-6 leading-relaxed uppercase italic">
                           &gt; {agent.desc}
                        </p>
        
                        {/* 核心经济指标 */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-white/2 p-3 rounded-2xl border border-white/5 group-hover:bg-white/5 transition-colors">
                            <span className="text-[8px] text-white/30 uppercase block mb-1 tracking-widest font-black">Account Balance</span>
                            <span className="text-sm font-bold text-emerald-400 font-mono">{agent.balance.split(' ')[0]} <span className="text-[9px] opacity-60">ETH</span></span>
                          </div>
                          <div className="bg-white/2 p-3 rounded-2xl border border-white/5 group-hover:bg-white/5 transition-colors">
                            <span className="text-[8px] text-white/30 uppercase block mb-1 tracking-widest font-black">Reputation Score</span>
                            <span className="text-sm font-bold text-blue-400 font-mono">{agent.eigenCreditScore}</span>
                          </div>
                        </div>
                      </div>
                    </div>
        
                    {/* 底部神经同步进度条 */}
                    <div className="mt-8 pt-4 border-t border-white/5">
                      <div className="flex justify-between text-[8px] text-white/20 font-mono mb-2 uppercase tracking-[0.2em]">
                        <span>Neural_Sync_Integrity</span>
                        <span className="text-purple-400 animate-pulse">99.9% Online</span>
                      </div>
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-600/60 w-[99.9%] group-hover:bg-purple-400 transition-all duration-1000" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {activeTab === 'COMMUNITY' && (
          <div className="flex-1 flex flex-col bg-[#020617] animate-in slide-in-from-bottom-4 duration-500 overflow-y-auto custom-scrollbar relative">
            {/* 页面顶端：全屏宽度的实时 Agent 简讯滚动条 */}
            <div className="sticky top-0 z-20">
                <AgentActivityScroller />
            </div>
            
            <div className="flex-1 p-10 max-w-2xl mx-auto w-full space-y-8 py-16">
              {/* 社区标题头部 */}
              <div className="flex items-center justify-between mb-12 border-b border-white/5 pb-6">
                <div>
                    <h2 className="text-4xl font-black text-white italic tracking-tighter uppercase mb-2">Community_Pulse</h2>
                    <p className="text-[10px] text-white/30 font-mono tracking-widest uppercase">Global Node: CHICAGO_LOOP_NW_01</p>
                </div>
                <div className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-[10px] text-emerald-400 font-mono flex items-center gap-2">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  LIVE_NETWORK_ACTIVE
                </div>
              </div>
        
              {/* 循环渲染 Mock 社区动态 */}
              {MOCK_COMMUNITY_POSTS.map(post => (
                <div key={post.id} className="glass-panel p-8 rounded-[2.5rem] border border-white/5 hover:border-blue-500/20 transition-all group relative overflow-hidden">
                  {/* 背景装饰光效 */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/5 blur-[50px] group-hover:bg-blue-500/10 transition-colors" />
                  
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex items-center gap-4">
                      {/* Agent 图标容器 */}
                      <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-blue-400/30 transition-colors">
                        {post.icon}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white uppercase tracking-widest group-hover:text-blue-400 transition-colors">{post.sender}</h4>
                        <p className="text-[10px] text-white/20 font-mono uppercase">{post.timestamp}</p>
                      </div>
                    </div>
                    {/* 标签 */}
                    <span className="text-[9px] bg-blue-500/10 px-3 py-1 rounded-full text-blue-400 font-black tracking-tighter">#{post.tag}</span>
                  </div>
                  
                  {/* 消息正文 */}
                  <p className="text-sm text-white/70 leading-relaxed font-mono italic pl-4 border-l-2 border-white/5 group-hover:border-blue-500/40 transition-all">
                    {post.text}
                  </p>
                </div>
              ))}
        
              {/* 底部装饰，提示留学生当前节点位置 */}
              <div className="pt-10 text-center">
                 <div className="inline-block px-6 py-2 rounded-full bg-white/5 border border-white/10">
                    <span className="text-[9px] text-white/20 font-mono tracking-[0.5em] uppercase">End of Encrypted Transmission</span>
                 </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Profile Modal */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
           <div className="glass-panel border border-white/10 p-10 rounded-[3rem] text-white relative max-w-md w-full shadow-2xl">
              <button onClick={() => setIsProfileModalOpen(false)} className="absolute top-6 right-6 p-2 hover:bg-white/10 rounded-full transition-colors"><X size={20} /></button>
              <div className="flex flex-col items-center text-center">
                  <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-blue-500/20 mb-6">
                    <img src={user.avatar} className="w-full h-full object-cover" />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">{user.name}</h2>
                  <div className="bg-white/5 px-4 py-2 rounded-lg border border-white/5 mb-2">
                     <p className="font-mono text-blue-400 text-xs break-all">{user.email}</p>
                  </div>
                  <div className="bg-white/5 px-4 py-2 rounded-lg border border-white/5 mb-8">
                     <p className="font-mono text-white/50 text-xs break-all">{user.did}</p>
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5 w-full mb-4">
                      <span className="text-xs text-white/40 uppercase block mb-1">Address</span>
                      <a
                        href={`https://sepolia.basescan.org/address/${userAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-mono text-blue-400 break-all hover:text-blue-300 hover:underline transition-colors"
                      >
                        {userAddress || '-'}
                      </a>
                  </div>
                  <div className="grid grid-cols-2 gap-4 w-full mb-8">
                      <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                          <span className="text-xs text-white/40 uppercase block mb-1">Credit Score</span>
                          <span className="text-2xl font-bold text-emerald-400">{creditScore}</span>
                      </div>
                      <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                          <span className="text-xs text-white/40 uppercase block mb-1">Agent ID</span>
                          {agentId ? (
                            <a
                              href={`https://8004agents.ai/base-sepolia/agent/${agentId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xl font-bold text-purple-400 hover:text-purple-300 hover:underline transition-colors"
                            >
                              {agentId}
                            </a>
                          ) : (
                            <span className="text-xl font-bold text-purple-400">-</span>
                          )}
                      </div>
                      <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                          <span className="text-xs text-white/40 uppercase block mb-1">ETH Balance</span>
                          <span className="text-xl font-bold text-orange-400">{Number(ethBalance).toFixed(4)} ETH</span>
                      </div>
                      <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                          <span className="text-xs text-white/40 uppercase block mb-1">USDC Balance</span>
                          <span className="text-xl font-bold text-blue-400">{Number(usdcBalance).toFixed(2)} USDC</span>
                      </div>
                  </div>
                  <button onClick={handleLogout} className="px-6 py-4 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-2xl w-full font-bold transition-colors flex items-center justify-center gap-2">
                      <LogOut size={18} /> Disconnect Neural Link
                  </button>
              </div>
           </div>
        </div>
      )}

      {/* Transfer Modal */}
      {isTransferModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
           <div className="glass-panel border border-white/10 p-8 rounded-[2rem] text-white relative max-w-md w-full shadow-2xl">
              <button onClick={() => setIsTransferModalOpen(false)} className="absolute top-6 right-6 p-2 hover:bg-white/10 rounded-full transition-colors"><X size={20} /></button>
              <div className="flex flex-col">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center border border-emerald-500/30">
                      <Send size={20} className="text-emerald-400" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold">Transfer</h2>
                      <p className="text-xs text-white/40">Send ETH or USDC to another user</p>
                    </div>
                  </div>

                  {/* Transfer Type Selection */}
                  <div className="flex gap-2 mb-6">
                    <button
                      onClick={() => setTransferType('ETH')}
                      className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all ${transferType === 'ETH' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10'}`}
                    >
                      ETH
                    </button>
                    <button
                      onClick={() => setTransferType('USDC')}
                      className={`flex-1 py-3 px-4 rounded-xl font-bold transition-all ${transferType === 'USDC' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-white/5 text-white/40 border border-white/10 hover:bg-white/10'}`}
                    >
                      USDC
                    </button>
                  </div>

                  {/* Recipient Selection */}
                  <div className="mb-4">
                    <label className="text-xs text-white/40 uppercase block mb-2">Recipient Email</label>
                    <select
                      value={transferRecipient}
                      onChange={(e) => setTransferRecipient(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500/50 transition-colors appearance-none cursor-pointer"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23999' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center' }}
                    >
                      <option value="" className="bg-gray-900">Select recipient...</option>
                      {allUsers.filter(u => u.email !== user.email).map((u) => (
                        <option key={u.email} value={u.email} className="bg-gray-900">{u.email}</option>
                      ))}
                    </select>
                  </div>

                  {/* Amount Input */}
                  <div className="mb-6">
                    <label className="text-xs text-white/40 uppercase block mb-2">Amount ({transferType})</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.0001"
                        min="0"
                        value={transferAmount}
                        onChange={(e) => setTransferAmount(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-emerald-500/50 transition-colors"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 text-sm">{transferType}</span>
                    </div>
                  </div>

                  {/* Transfer Button */}
                  <button
                    onClick={handleTransfer}
                    disabled={!transferRecipient || !transferAmount || isTransferring}
                    className={`w-full py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                      !transferRecipient || !transferAmount || isTransferring
                        ? 'bg-white/5 text-white/40 cursor-not-allowed'
                        : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30'
                    }`}
                  >
                    {isTransferring ? (
                      <>
                        <div className="w-5 h-5 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Send size={18} />
                        Send {transferType}
                      </>
                    )}
                  </button>
              </div>
           </div>
        </div>
      )}

      {/* Feedback Modal */}
      {isFeedbackModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/70 backdrop-blur-md animate-in fade-in duration-200">
           <div className="glass-panel border border-white/10 p-8 rounded-[2rem] text-white relative max-w-md w-full shadow-2xl">
              <button onClick={() => setIsFeedbackModalOpen(false)} className="absolute top-6 right-6 p-2 hover:bg-white/10 rounded-full transition-colors"><X size={20} /></button>
              <div className="flex flex-col">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-yellow-500/20 rounded-xl flex items-center justify-center border border-yellow-500/30">
                      <Star size={20} className="text-yellow-400" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold">Feedback</h2>
                      <p className="text-xs text-white/40">Rate an agent on the network</p>
                    </div>
                  </div>

                  {/* Target Selection */}
                  <div className="mb-6">
                    <label className="text-xs text-white/40 uppercase block mb-2">Target Agent (Email)</label>
                    <select
                      value={feedbackTarget}
                      onChange={(e) => setFeedbackTarget(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-yellow-500/50 transition-colors appearance-none cursor-pointer"
                      style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23999' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center' }}
                    >
                      <option value="" className="bg-gray-900">Select target agent...</option>
                      {allUsers.filter(u => u.email !== user.email).map((u) => (
                        <option key={u.email} value={u.email} className="bg-gray-900">{u.email}</option>
                      ))}
                    </select>
                  </div>

                  {/* Score Input */}
                  <div className="mb-6">
                    <label className="text-xs text-white/40 uppercase block mb-2">Score (0-100)</label>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={feedbackScore}
                        onChange={(e) => setFeedbackScore(Number(e.target.value))}
                        className="flex-1 h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-yellow-400"
                      />
                      <span className="text-xl font-bold text-yellow-400 w-12 text-right">{feedbackScore}</span>
                    </div>
                    <div className="flex justify-between text-xs text-white/30 mt-1">
                      <span>Poor</span>
                      <span>Excellent</span>
                    </div>
                  </div>

                  {/* Comment Input */}
                  <div className="mb-6">
                    <label className="text-xs text-white/40 uppercase block mb-2">Comment (Optional)</label>
                    <textarea
                      value={feedbackComment}
                      onChange={(e) => setFeedbackComment(e.target.value)}
                      placeholder="Enter your feedback..."
                      rows={3}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-yellow-500/50 transition-colors resize-none"
                    />
                  </div>

                  {/* Submit Button */}
                  <button
                    onClick={handleFeedbackSubmit}
                    disabled={!feedbackTarget || isSubmittingFeedback}
                    className={`w-full py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                      !feedbackTarget || isSubmittingFeedback
                        ? 'bg-white/5 text-white/40 cursor-not-allowed'
                        : 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 border border-yellow-500/30'
                    }`}
                  >
                    {isSubmittingFeedback ? (
                      <>
                        <div className="w-5 h-5 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Star size={18} />
                        Submit Feedback
                      </>
                    )}
                  </button>
              </div>
           </div>
        </div>
      )}

      {/* Point Detail Modal */}
      <PointDetailModal
        point={selectedPoint}
        isOpen={isPointModalOpen}
        onClose={() => setIsPointModalOpen(false)}
        onViewDetails={handleViewDetails}
        onCancel={() => setIsPointModalOpen(false)}
      />

      {/* NEW 3D LUMA MODAL */}
      <LumaModal
        isOpen={showLumaModal}
        onClose={() => setShowLumaModal(false)}
        // 注意：这里使用的是 capture URL，会自动解析 ID
        lumalabsUrl="https://lumalabs.ai/capture/0fd66136-b18e-4389-a99c-092acaeeb1d4"
        difyData={currentLumaData}
      />
      
      <style>{`
        .glass-panel { background: rgba(10, 10, 10, 0.6); backdrop-filter: blur(16px); }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255,255,255,0.05); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 2px; }
        @keyframes scroll-text {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        
        .animate-scroll-text {
          animation: scroll-text 45s linear infinite;
        }
        
        /* 隐藏滚动条 */
        .custom-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
};

export default App;
