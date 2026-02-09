import React from 'react';
import { X, MapPin, Shield, Users, Building, Calendar, DollarSign, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { BuildingData, SearchResultPoint } from '../types';

interface PointDetailModalProps {
  point: BuildingData | SearchResultPoint | any;
  isOpen: boolean;
  onClose: () => void;
  onViewDetails: () => void;
  onCancel: () => void;
}

const PointDetailModal: React.FC<PointDetailModalProps> = ({
  point,
  isOpen,
  onClose,
  onViewDetails,
  onCancel
}) => {
  if (!isOpen || !point) return null;

  const isBuilding = 'category' in point;
  const isSearchResult = 'type' in point && point.type === 'SEARCH_RESULT';
  
  // 获取安全等级颜色
  const getSecurityColor = (level?: string) => {
    switch (level) {
      case 'HIGH': return 'text-green-500';
      case 'MEDIUM': return 'text-yellow-500';
      case 'LOW': return 'text-red-500';
      default: return 'text-gray-400';
    }
  };

  // 获取安全等级图标
  const getSecurityIcon = (level?: string) => {
    switch (level) {
      case 'HIGH': return <Shield className="w-4 h-4 text-green-500" />;
      case 'MEDIUM': return <AlertCircle className="w-4 h-4 text-yellow-500" />;
      case 'LOW': return <AlertCircle className="w-4 h-4 text-red-500" />;
      default: return <Shield className="w-4 h-4 text-gray-400" />;
    }
  };

  // 获取建筑类型图标
  const getBuildingIcon = (category?: string) => {
    switch (category) {
      case 'RESIDENTIAL': return <Building className="w-4 h-4 text-blue-500" />;
      case 'LANDMARK': return <MapPin className="w-4 h-4 text-purple-500" />;
      case 'SIGHTSEEING': return <MapPin className="w-4 h-4 text-amber-500" />;
      default: return <Building className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-black/70 backdrop-blur-md">
      <div className="glass-modal w-full max-w-2xl rounded-[2rem] border border-white/10 overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)] animate-modal-in">
        {/* 弹窗头部 */}
        <div className="p-8 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
              {isBuilding ? getBuildingIcon(point.category) : <MapPin className="w-6 h-6 text-red-500" />}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">
                {point.name || point.label}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <MapPin className="w-3 h-3 text-gray-400" />
                <span className="text-sm text-gray-400">
                  {point.address || 'Coordinate Location'}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* 弹窗内容 */}
        <div className="p-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* 左侧：地图缩略图区域 */}
            <div className="space-y-4">
              <div className="aspect-video rounded-2xl bg-gradient-to-br from-blue-900/30 to-purple-900/30 border border-white/10 flex items-center justify-center">
                <div className="text-center">
                  <MapPin className="w-12 h-12 text-blue-500 mx-auto mb-4" />
                  <p className="text-sm text-gray-400">Maps Overview</p>
                  <p className="text-xs text-gray-500 mt-2">
                    坐标: [{point.coordinates?.lat?.toFixed(4) || point.lat?.toFixed(4)}, {point.coordinates?.lng?.toFixed(4) || point.lng?.toFixed(4)}]
                  </p>
                </div>
              </div>
              
              {/* 安全状态指示器 */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-black/40 to-black/20 border border-white/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getSecurityIcon(point.securityLevel || point.safetyScore > 90 ? 'HIGH' : 'MEDIUM')}
                    <div>
                      <p className="text-sm font-medium text-white">Safety Status</p>
                      <p className={`text-xs font-bold ${getSecurityColor(point.securityLevel || point.safetyScore > 90 ? 'HIGH' : 'MEDIUM')}`}>
                        {point.securityLevel || (point.safetyScore > 90 ? 'HIGH' : 'MEDIUM')}
                      </p>
                    </div>
                  </div>
                  {point.safetyScore && (
                    <div className="text-right">
                      <p className="text-sm text-gray-400">Safety Score</p>
                      <p className="text-xl font-bold text-green-500">{point.safetyScore}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 右侧：详细信息卡片 */}
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Detailed Info</h3>
                
                {isBuilding ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 rounded-xl bg-white/5">
                        <div className="flex items-center gap-2 mb-1">
                          <Building className="w-3 h-3 text-blue-400" />
                          <span className="text-xs text-gray-400">Building Type</span>
                        </div>
                        <p className="text-sm font-medium text-white">
                          {point.category === 'RESIDENTIAL' ? '住宅' : 
                           point.category === 'LANDMARK' ? '地标' : '景点'}
                        </p>
                      </div>
                      
                      {point.yearBuilt && (
                        <div className="p-3 rounded-xl bg-white/5">
                          <div className="flex items-center gap-2 mb-1">
                            <Calendar className="w-3 h-3 text-purple-400" />
                            <span className="text-xs text-gray-400">Building Year</span>
                          </div>
                          <p className="text-sm font-medium text-white">{point.yearBuilt}</p>
                        </div>
                      )}
                    </div>

                    {point.rent && (
                      <div className="p-3 rounded-xl bg-gradient-to-r from-emerald-900/20 to-emerald-800/10 border border-emerald-500/20">
                        <div className="flex items-center gap-2 mb-1">
                          <DollarSign className="w-3 h-3 text-emerald-400" />
                          <span className="text-xs text-gray-400">Rent</span>
                        </div>
                        <p className="text-lg font-bold text-emerald-400">{point.rent}</p>
                        {point.availability !== false && (
                          <div className="flex items-center gap-1 mt-2">
                            <CheckCircle className="w-3 h-3 text-emerald-500" />
                            <span className="text-xs text-emerald-400">Available</span>
                          </div>
                        )}
                      </div>
                    )}

                    {point.description && (
                      <div className="p-3 rounded-xl bg-white/5">
                        <p className="text-sm text-gray-300">{point.description}</p>
                      </div>
                    )}
                  </div>
                ) : isSearchResult ? (
                  <div className="space-y-4">
                    <div className="p-3 rounded-xl bg-white/5">
                      <div className="flex items-center gap-2 mb-2">
                        <MapPin className="w-3 h-3 text-red-400" />
                        <span className="text-xs text-gray-400">Searching Type</span>
                      </div>
                      <p className="text-sm font-medium text-white">Anchor</p>
                    </div>

                    {point.footTraffic !== undefined && (
                      <div className="p-3 rounded-xl bg-white/5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Users className="w-3 h-3 text-blue-400" />
                            <span className="text-xs text-gray-400">Amount of People</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-2 bg-gray-700 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                                style={{ width: `${Math.min(point.footTraffic, 100)}%` }}
                              />
                            </div>
                            <span className="text-sm font-bold text-white">{point.footTraffic}%</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {point.nearbyFacilities && point.nearbyFacilities.length > 0 && (
                      <div className="p-3 rounded-xl bg-white/5">
                        <div className="flex items-center gap-2 mb-2">
                          <Building className="w-3 h-3 text-amber-400" />
                          <span className="text-xs text-gray-400">Facilities</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {point.nearbyFacilities.slice(0, 4).map((facility: string, index: number) => (
                            <span key={index} className="px-2 py-1 text-xs bg-white/10 rounded-lg text-gray-300">
                              {facility}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-white/5">
                    <p className="text-sm text-gray-300">General Position Info</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 弹窗底部按钮 */}
        <div className="p-8 border-t border-white/10 flex justify-end gap-4">
          <button
            onClick={onCancel}
            className="px-6 py-3 rounded-xl border border-white/20 text-white hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <a
            href="https://www.zillow.com/apartments/chicago-il/algonquin-apartments/5Xgzxv/"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium hover:opacity-90 transition-opacity flex items-center gap-2"
          >
            <ExternalLink size={16} />
            Zillow sources
          </a>
          <button
            onClick={onViewDetails}
            className="px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-medium hover:opacity-90 transition-opacity"
          >
            查看详情
          </button>
        </div>
      </div>
    </div>
  );
};

export default PointDetailModal;
