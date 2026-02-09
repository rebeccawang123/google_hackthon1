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
  CreditCard, Wallet, MousePointer2, Settings2, Save, Eye 
} from 'lucide-react';

// 假设这些类型和组件在你的本地文件中已存在
import { AgentType, Message, UserRole, User } from './types';
import { AGENTS, MOCK_BUILDINGS, CHICAGO_LOOP_CENTER } from './constants';
import ChatInterface from './components/ChatInterface';
import TwinCityMap from './components/TwinCityMap';
import PointDetailModal from './components/PointDetailModal';
import { generateOrchestratedResponse, detectAgentIntent } from './services/geminiService';

// --- API 配置区域 ---
const DIFY_ROUTER_API_URL = "https://api.dify.ai/v1/chat-messages"; 
const DIFY_ROUTER_API_KEY = ""; 
const DIFY_WORKFLOW_API_URL = "https://api.dify.ai/v1/chat-messages"; 
const DIFY_WORKFLOW_API_KEY = ""; 
const GOOGLE_MAPS_API_KEY = ""; 
// 商户 Agent 专用 Dify 应用（你提供的 Key）
const DIFY_MERCHANT_API_URL = "https://api.dify.ai/v1/chat-messages";
const DIFY_MERCHANT_API_KEY = "";

interface DifyIntentResult {
  intent: string;
  keywords: string;
  confidence: number;
}

// --- API 调用函数 ---
// 通用 Dify Chat（blocking 模式）
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
  const [statusMsg, setStatusMsg] = useState("正在连接 Google Earth 卫星链路...");
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
    <div className="fixed top-8 right-8 bottom-8 left-[520px] z-[100] flex flex-col animate-in fade-in duration-300">
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
              label="查看窗外实景" 
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
          text: `你好，${user.name}。我是 Neo-Chicago Core。你的数字孪生身份已激活，欢迎访问芝加哥 Loop 智慧社区。\n\n检测到你是以 ${user.role} 身份进入系统。有什么我可以帮你的？比如：寻找 Loop 区最安全的公寓、查看商圈活力，或者管理你的链上信用？`,
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
        { agentId: AgentType.SAFETY_SENTINEL, text: "Safety Patrol Node 04: 检测到行人流量异常，已切换为防御扫描模式。" },
        { agentId: AgentType.INFRA_JANITOR, text: "WiFi 节点 #88A 维护中。周边用户已自动切回 5G 冗余链路。" },
        { agentId: AgentType.REPUTATION_STEWARD, text: "检测到新的链上租约（#Lease-9902），正在核算信用增量。" },
        { agentId: AgentType.MERCHANT_PULSE, text: "Millennium Park 附近商圈活力指数（Traffic Index）上升至 88%。" },
        { agentId: AgentType.CITY_CORE, text: "城市核心：检测到多位新市民进入 Loop 区域，正在同步空间权限。" },
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
            text: `[Spatial Architect]: 已识别空间意图 (Confidence: ${parsedIntent.confidence})。\n\n已调取 Google GeoAPI 数据，锁定了 "${address}" 区域。\n已在全息地图上为你生成了 2 个关键锚点，请点击查看详细数据。`,
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
          text: "[Neo-Chicago Core]: 明白。正在扫描可用房源。在寻找理想住处时，你更看重哪一点？\n1. 安全保障（我会调动 Safety Sentinel 进行路径分析）\n2. 社交便利（我会调动 Merchant Pulse 推荐活力商圈）",
          timestamp: new Date()
        };
        setTimeout(() => {
          setMessages(prev => [...prev, coreResponse]);
          setIsTyping(false);
        }, 1000);
        return;
      }
      
      // 默认 Agent 逻辑：先用 Gemini 判断最相关的 Agent
      const predictedAgent = await detectAgentIntent(text);
      setActiveAgent(predictedAgent);

      // 商户相关问题 → 走你提供的 Dify Merchant Agent（streaming）
      if (predictedAgent === AgentType.MERCHANT_PULSE) {
        const merchantAnswer = await callDifyMerchantStream(text, DIFY_MERCHANT_API_KEY, DIFY_MERCHANT_API_URL);
        const displayText = merchantAnswer.trim() || "Merchant Pulse 连接异常，请稍后重试。";
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

      // 其他 Agent 仍然走 Gemini 编排
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
        text: "系统暂时繁忙，请稍后再试。",
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
        text: `[Spatial Architect]: 已获取 "${pointInfo.label}" 的详细信息\n\n正在为您加载空间拓扑数据...`,
        timestamp: new Date(),
        metadata: {
          difyResponse: difyResult?.answer || difyResult?.outputs?.result || '数据加载中...',
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
        text: '抱歉，获取详细信息时出现了错误，请稍后重试。',
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
           <h2 className="text-4xl font-black mb-3 text-white uppercase italic tracking-tighter">Twin-City OS</h2>
           <p className="text-white/40 mb-12 text-sm font-mono">Neural Urban Digital Twin Interface v2.0</p>
           <div className="space-y-4">
            {MOCK_ACCOUNTS.map((account) => (
              <button key={account.email} onClick={() => handleLoginStart(account)} className="w-full p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 hover:scale-[1.02] transition-all text-white flex items-center gap-5 group">
                <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white/10 group-hover:border-blue-400 transition-colors">
                    <img src={account.avatar} className="w-full h-full" alt={account.name} />
                </div>
                <div className="text-left">
                    <span className="font-bold block text-lg">{account.name}</span>
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
        </div>
        <div className="mt-auto flex flex-col gap-6 items-center">
            <button onClick={() => setIsProfileModalOpen(true)} className="w-12 h-12 rounded-2xl overflow-hidden border-2 border-white/10 hover:border-white/50 transition-all"><img src={user.avatar} className="w-full h-full object-cover" /></button>
            <button onClick={handleLogout} className="text-white/20 hover:text-red-400 transition-colors"><LogOut size={20} /></button>
        </div>
      </nav>

      <main className="flex-1 relative flex flex-col overflow-hidden">
        {activeTab === 'HOME' && (
          <div className="absolute inset-0 z-0 animate-in fade-in duration-500">
            <TwinCityMap onBuildingClick={handleBuildingSelect} overlayType={mapOverlay} highlightedIds={highlightedBuildings} groundedPoints={groundedPoints} />
            
            <div className="absolute top-8 left-8 right-8 z-40 flex justify-between pointer-events-none">
              <div className="glass-panel p-5 rounded-[2rem] border border-white/10 flex items-center gap-6 pointer-events-auto shadow-2xl backdrop-blur-xl">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black tracking-[0.3em] text-blue-400 uppercase mb-1">Status</span>
                  <div className="flex items-center gap-2">
                     <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                     <span className="text-sm font-bold text-white">Neural_Grid_Active</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className={`absolute bottom-8 left-8 transition-all duration-700 z-50 glass-panel shadow-[0_0_100px_rgba(0,0,0,0.5)] flex flex-col border border-white/10 overflow-hidden backdrop-blur-xl ${isChatCollapsed ? 'w-24 h-24 rounded-[2.5rem]' : 'w-[480px] h-[640px] rounded-[3rem]'}`}>
              <ChatInterface messages={messages} onSendMessage={handleSendMessage} activeAgent={activeAgent} isTyping={isTyping} isCollapsed={isChatCollapsed} onToggleCollapse={() => setIsChatCollapsed(!isChatCollapsed)} />
            </div>
          </div>
        )}
        {activeTab === 'SYSTEM' && <div className="text-white p-10 flex items-center justify-center h-full text-2xl font-mono text-white/20">System Dashboard Placeholder</div>}
        {activeTab === 'COMMUNITY' && <div className="text-white p-10 flex items-center justify-center h-full text-2xl font-mono text-white/20">Community Feed Placeholder</div>}
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
                  <div className="bg-white/5 px-4 py-2 rounded-lg border border-white/5 mb-8">
                     <p className="font-mono text-blue-400 text-xs break-all">{user.did}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 w-full mb-8">
                      <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                          <span className="text-xs text-white/40 uppercase block mb-1">Credit Score</span>
                          <span className="text-2xl font-bold text-emerald-400">{user.eigenCreditScore}</span>
                      </div>
                      <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                          <span className="text-xs text-white/40 uppercase block mb-1">Stake</span>
                          <span className="text-xl font-bold text-purple-400">{user.slashableValue}</span>
                      </div>
                  </div>
                  <button onClick={handleLogout} className="px-6 py-4 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-2xl w-full font-bold transition-colors flex items-center justify-center gap-2">
                      <LogOut size={18} /> Disconnect Neural Link
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
      `}</style>
    </div>
  );
};

export default App;
