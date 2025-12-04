
import React, { useState, useEffect } from 'react';
import { 
  Initiative, User, Role, Status, Priority, WorkType, UnplannedTag, AssetClass, PermissionKey, TradeOffAction 
} from '../types';
import { HIERARCHY, QUARTERS } from '../constants';
import { X, MessageSquare, FileText, Send, Share2, Copy, Check, Scale } from 'lucide-react';

interface InitiativeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (initiative: Initiative, tradeOff?: TradeOffAction) => void;
  currentUser: User;
  initiativeToEdit?: Initiative | null;
  rolePermissions: Record<Role, Record<PermissionKey, boolean>>;
  users: User[];
  allInitiatives: Initiative[]; // Needed for Trade-off selection
}

const InitiativeModal: React.FC<InitiativeModalProps> = ({
  isOpen, onClose, onSave, currentUser, initiativeToEdit, rolePermissions, users, allInitiatives
}) => {
  const isEditMode = !!initiativeToEdit;
  const permissions = rolePermissions[currentUser.role];

  // Form State
  const [formData, setFormData] = useState<Partial<Initiative>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'details' | 'comments'>('details');
  const [newComment, setNewComment] = useState('');

  // Trade Off State
  const [enableTradeOff, setEnableTradeOff] = useState(false);
  const [tradeOffData, setTradeOffData] = useState<Partial<TradeOffAction>>({ field: 'eta' });

  // Share/Export State
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<'slack' | 'notion' | null>(null);

  // Reset or Load Data
  useEffect(() => {
    if (isOpen) {
      if (initiativeToEdit) {
        setFormData({ ...initiativeToEdit });
      } else {
        // Defaults for new item
        const canCreatePlanned = permissions.createPlanned;
        const canCreateUnplanned = permissions.createUnplanned;
        
        const defaultWorkType = (canCreateUnplanned && !canCreatePlanned) 
          ? WorkType.Unplanned 
          : WorkType.Planned;
        
        const defaultAsset = AssetClass.PL;
        const defaultPillar = HIERARCHY[defaultAsset][0].name;
        const defaultResp = HIERARCHY[defaultAsset][0].responsibilities[0];

        setFormData({
          status: Status.Planned,
          priority: Priority.P1,
          workType: defaultWorkType,
          isAtRisk: false,
          l1_assetClass: defaultAsset,
          l2_pillar: defaultPillar,
          l3_responsibility: defaultResp,
          actualEffort: 0,
          estimatedEffort: 0,
          unplannedTags: [],
          quarter: 'Q4 2025',
          comments: []
        });
      }
      setErrors({});
      setActiveTab('details');
      setNewComment('');
      setShowShareMenu(false);
      setCopyFeedback(null);
      setEnableTradeOff(false);
      setTradeOffData({ field: 'eta' });
    }
  }, [isOpen, initiativeToEdit, currentUser.role, permissions]);

  // Filter for Trade-off candidates (In Progress, not current item)
  const tradeOffCandidates = allInitiatives.filter(i => 
    i.status === Status.InProgress && i.id !== formData.id
  );

  // Permission Logic
  const canEdit = (): boolean => {
    if (permissions.editAll) return true;

    if (isEditMode) {
       if (formData.workType === WorkType.Unplanned && permissions.editUnplanned) return true;
       if (formData.ownerId === currentUser.id && permissions.editOwn) return true;
       return false;
    } else {
       // Creation
       if (formData.workType === WorkType.Planned && permissions.createPlanned) return true;
       if (formData.workType === WorkType.Unplanned && permissions.createUnplanned) return true;
       return false;
    }
  };

  const isReadOnly = !canEdit();

  const handleChange = (field: keyof Initiative, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for field
    if (errors[field]) {
      setErrors(prev => {
        const newErr = { ...prev };
        delete newErr[field];
        return newErr;
      });
    }
  };

  const handleAssetClassChange = (newClass: AssetClass) => {
    const pillars = HIERARCHY[newClass];
    const defaultPillar = pillars[0]?.name || '';
    const defaultResp = pillars[0]?.responsibilities[0] || '';
    
    setFormData(prev => ({
      ...prev,
      l1_assetClass: newClass,
      l2_pillar: defaultPillar,
      l3_responsibility: defaultResp
    }));
  };

  const handlePillarChange = (newPillar: string) => {
    const assetClass = formData.l1_assetClass || AssetClass.PL;
    const pillars = HIERARCHY[assetClass];
    const selectedPillarNode = pillars.find(p => p.name === newPillar);
    const defaultResp = selectedPillarNode?.responsibilities[0] || '';

    setFormData(prev => ({
      ...prev,
      l2_pillar: newPillar,
      l3_responsibility: defaultResp
    }));
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.title) newErrors.title = "Title is required";
    if (!formData.ownerId) newErrors.ownerId = "Primary Owner is required";
    if (!formData.eta) newErrors.eta = "ETA is required";
    if (!formData.quarter) newErrors.quarter = "Quarter is required";
    if (formData.estimatedEffort === undefined || formData.estimatedEffort < 0) newErrors.estimatedEffort = "Valid effort required";
    
    if (formData.workType === WorkType.Unplanned) {
       if (!formData.unplannedTags || formData.unplannedTags.length === 0) {
         newErrors.unplannedTags = "Unplanned work must have at least one risk/PM tag";
       }
    }

    const isDelayed = formData.status === Status.Delayed;
    const isAtRisk = formData.isAtRisk;
    if ((isDelayed || isAtRisk) && !formData.riskActionLog?.trim()) {
      newErrors.riskActionLog = "Risk/Action documentation is MANDATORY for Delayed or At Risk items.";
    }

    // Trade Off Validation
    if (enableTradeOff) {
      if (!tradeOffData.targetInitiativeId) newErrors.tradeOffTarget = "Select an initiative to trade-off";
      if (!tradeOffData.newValue) newErrors.tradeOffValue = "Define the new value";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validate()) {
      const now = new Date().toISOString().split('T')[0];
      
      const isNew = !formData.id;
      
      const payload = {
        ...formData,
        lastUpdated: now,
        id: formData.id || Math.random().toString(36).substr(2, 9),
        originalEstimatedEffort: isNew ? formData.estimatedEffort : formData.originalEstimatedEffort,
        originalEta: isNew ? formData.eta : formData.originalEta,
      } as Initiative;
      
      const tradeOffAction = enableTradeOff && tradeOffData.targetInitiativeId && tradeOffData.newValue
        ? tradeOffData as TradeOffAction
        : undefined;

      onSave(payload, tradeOffAction);
      onClose();
    }
  };

  const handleAddComment = () => {
    if (!newComment.trim()) return;
    const comment = {
      id: Math.random().toString(36).substr(2, 9),
      text: newComment,
      authorId: currentUser.id,
      timestamp: new Date().toISOString()
    };
    setFormData(prev => ({
      ...prev,
      comments: [...(prev.comments || []), comment]
    }));
    setNewComment('');
  };

  // --- Export Logic ---
  const getOwnerName = (id: string) => users.find(u => u.id === id)?.name || 'Unknown';

  const handleCopy = async (platform: 'slack' | 'notion') => {
    const ownerName = getOwnerName(formData.ownerId || '');
    let text = '';

    if (platform === 'slack') {
      text = `*Initiative Update*\n` +
             `*Title:* ${formData.title}\n` +
             `*Owner:* ${ownerName}\n` +
             `*Status:* ${formData.status} ${formData.isAtRisk ? '(🚩 At Risk)' : ''}\n` +
             `*ETA:* ${formData.eta}\n` +
             `*Progress:* ${formData.actualEffort}/${formData.estimatedEffort} weeks\n` +
             `> ${formData.riskActionLog || 'No immediate risks flagged.'}`;
    } else {
      text = `# ${formData.title}\n\n` +
             `**Owner:** ${ownerName}\n` +
             `**Status:** ${formData.status}\n` +
             `**ETA:** ${formData.eta}\n` +
             `**Quarter:** ${formData.quarter}\n` +
             `---\n` +
             `**Description / Risks:**\n` +
             `${formData.riskActionLog || 'No immediate risks flagged.'}`;
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback(platform);
      setTimeout(() => {
        setCopyFeedback(null);
        setShowShareMenu(false);
      }, 1500);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const availablePillars = formData.l1_assetClass ? HIERARCHY[formData.l1_assetClass] : [];
  const selectedPillarNode = availablePillars.find(p => p.name === formData.l2_pillar);
  const availableResponsibilities = selectedPillarNode ? selectedPillarNode.responsibilities : [];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto custom-scrollbar flex flex-col">
        
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              {isEditMode ? 'Edit Initiative' : 'New Initiative'}
            </h2>
            {isReadOnly && <span className="text-xs font-semibold text-red-500 uppercase tracking-wider">Read Only View</span>}
          </div>
          
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowShareMenu(!showShareMenu)}
                className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors"
                title="Share / Export"
              >
                <Share2 size={20} />
              </button>

              {showShareMenu && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-xl border border-slate-200 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-xs font-bold text-slate-500 uppercase">Export To Clipboard</div>
                  <button
                    onClick={() => handleCopy('slack')}
                    className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center justify-between group"
                  >
                    <span>Copy for Slack</span>
                    {copyFeedback === 'slack' ? <Check size={16} className="text-emerald-600"/> : <Copy size={16} className="text-slate-400 group-hover:text-slate-600"/>}
                  </button>
                  <div className="border-t border-slate-100"></div>
                  <button
                    onClick={() => handleCopy('notion')}
                    className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-slate-50 flex items-center justify-between group"
                  >
                    <span>Copy for Notion</span>
                    {copyFeedback === 'notion' ? <Check size={16} className="text-emerald-600"/> : <Copy size={16} className="text-slate-400 group-hover:text-slate-600"/>}
                  </button>
                </div>
              )}
            </div>

            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-500 transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-6">
          <button 
            onClick={() => setActiveTab('details')}
            className={`flex items-center gap-2 py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'details' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <FileText size={16} /> Details
          </button>
          <button 
            onClick={() => setActiveTab('comments')}
            className={`flex items-center gap-2 py-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'comments' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <MessageSquare size={16} /> Comments 
            <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full text-xs">
              {formData.comments?.length || 0}
            </span>
          </button>
        </div>

        {/* Body */}
        {activeTab === 'details' ? (
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            
            {/* Hierarchy Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
               <h3 className="col-span-full text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Hierarchy Context</h3>
               
               <div className="col-span-2 md:col-span-1">
                 <label className="block text-sm font-medium text-slate-700 mb-1">L1 Asset Class (Group)</label>
                 <select 
                   disabled={isReadOnly}
                   value={formData.l1_assetClass} 
                   onChange={(e) => handleAssetClassChange(e.target.value as AssetClass)}
                   className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                 >
                   {Object.values(AssetClass).map(ac => <option key={ac} value={ac}>{ac}</option>)}
                 </select>
               </div>

               <div className="col-span-2 md:col-span-1">
                 <label className="block text-sm font-medium text-slate-700 mb-1">L2 Pillar (Function)</label>
                 <select 
                   disabled={isReadOnly}
                   value={formData.l2_pillar || ''} 
                   onChange={(e) => handlePillarChange(e.target.value)}
                   className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                 >
                   {availablePillars.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                 </select>
               </div>
               
               <div className="col-span-2">
                 <label className="block text-sm font-medium text-slate-700 mb-1">L3 Responsibility</label>
                 <select 
                   disabled={isReadOnly}
                   value={formData.l3_responsibility || ''} 
                   onChange={(e) => handleChange('l3_responsibility', e.target.value)}
                   className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                 >
                   {availableResponsibilities.map(r => <option key={r} value={r}>{r}</option>)}
                 </select>
               </div>

               <div className="col-span-2">
                 <label className="block text-sm font-medium text-slate-700 mb-1">L4 Target</label>
                 <input 
                   disabled={isReadOnly}
                   type="text" 
                   value={formData.l4_target || ''} 
                   onChange={(e) => handleChange('l4_target', e.target.value)}
                   className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                   placeholder="e.g. Identify constraints"
                 />
               </div>
            </div>

            {/* Core Fields */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">L5 Initiative Title <span className="text-red-500">*</span></label>
                <input 
                  disabled={isReadOnly}
                  type="text" 
                  value={formData.title || ''} 
                  onChange={(e) => handleChange('title', e.target.value)}
                  className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.title ? 'border-red-500' : 'border-slate-300'}`}
                />
                {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title}</p>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Primary Owner (Team Lead) <span className="text-red-500">*</span></label>
                  <select 
                    disabled={isReadOnly}
                    value={formData.ownerId || ''} 
                    onChange={(e) => handleChange('ownerId', e.target.value)}
                    className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.ownerId ? 'border-red-500' : 'border-slate-300'}`}
                  >
                    <option value="">Select Owner...</option>
                    {users.filter(u => u.role === Role.TeamLead).map(u => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
                  {errors.ownerId && <p className="text-red-500 text-xs mt-1">{errors.ownerId}</p>}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Secondary Owner (Open Text)</label>
                  <input 
                    disabled={isReadOnly}
                    type="text"
                    value={formData.secondaryOwner || ''} 
                    onChange={(e) => handleChange('secondaryOwner', e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. Stakeholder Name"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
                    <select 
                      disabled={isReadOnly}
                      value={formData.priority} 
                      onChange={(e) => handleChange('priority', e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {Object.values(Priority).map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                 </div>
                 <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
                  <select 
                    disabled={isReadOnly}
                    value={formData.status} 
                    onChange={(e) => handleChange('status', e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {Object.values(Status).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                 <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Quarter <span className="text-red-500">*</span></label>
                  <select 
                    disabled={isReadOnly}
                    value={formData.quarter || ''} 
                    onChange={(e) => handleChange('quarter', e.target.value)}
                    className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.quarter ? 'border-red-500' : 'border-slate-300'}`}
                  >
                    <option value="">Select Quarter...</option>
                    {QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
                  </select>
                  {errors.quarter && <p className="text-red-500 text-xs mt-1">{errors.quarter}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Work Type</label>
                  <select 
                    disabled={isReadOnly} 
                    value={formData.workType} 
                    onChange={(e) => handleChange('workType', e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {Object.values(WorkType).map(w => <option key={w} value={w}>{w}</option>)}
                  </select>
                  {!permissions.createPlanned && formData.workType === WorkType.Planned && !isReadOnly && (
                     <p className="text-xs text-red-500 mt-1">Role not permitted to create Planned Work.</p>
                  )}
                </div>
              </div>

              {formData.workType === WorkType.Unplanned && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg animate-in fade-in zoom-in duration-300">
                  <label className="block text-sm font-bold text-amber-800 mb-2">Unplanned Work Requirements <span className="text-red-500">*</span></label>
                  <div className="flex gap-4">
                    {[UnplannedTag.RiskItem, UnplannedTag.PMItem].map(tag => (
                      <label key={tag} className="flex items-center space-x-2 text-sm text-slate-700 cursor-pointer">
                        <input 
                          type="checkbox"
                          disabled={isReadOnly}
                          checked={formData.unplannedTags?.includes(tag)}
                          onChange={(e) => {
                            const currentTags = formData.unplannedTags || [];
                            let newTags;
                            if (e.target.checked) {
                              newTags = [...currentTags, tag];
                            } else {
                              newTags = currentTags.filter(t => t !== tag);
                            }
                            handleChange('unplannedTags', newTags);
                          }}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span>{tag}</span>
                      </label>
                    ))}
                  </div>
                  {errors.unplannedTags && <p className="text-red-500 text-xs mt-1">{errors.unplannedTags}</p>}
                </div>
              )}

              {/* Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                 <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Original Effort (wks) <span className="text-red-500">*</span></label>
                    <input 
                      disabled={isReadOnly}
                      type="number"
                      min="0"
                      step="0.5"
                      value={formData.estimatedEffort}
                      onChange={(e) => handleChange('estimatedEffort', parseFloat(e.target.value))}
                      className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.estimatedEffort ? 'border-red-500' : 'border-slate-300'}`}
                    />
                 </div>
                 <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Actual Effort</label>
                    <input 
                      disabled={isReadOnly}
                      type="number"
                      min="0"
                      step="0.5"
                      value={formData.actualEffort}
                      onChange={(e) => handleChange('actualEffort', parseFloat(e.target.value))}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                 </div>
                 <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">ETA <span className="text-red-500">*</span></label>
                    <input 
                      disabled={isReadOnly}
                      type="date"
                      value={formData.eta}
                      onChange={(e) => handleChange('eta', e.target.value)}
                      className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.eta ? 'border-red-500' : 'border-slate-300'}`}
                    />
                    {errors.eta && <p className="text-red-500 text-xs mt-1">{errors.eta}</p>}
                 </div>
              </div>

              {/* Risk Section */}
              <div className={`border rounded-lg p-4 ${formData.status === Status.Delayed || formData.isAtRisk ? 'bg-red-50 border-red-200' : 'bg-white border-slate-200'}`}>
                <div className="flex justify-between items-center mb-2">
                   <label className="flex items-center space-x-2 text-sm font-bold text-slate-800 cursor-pointer">
                      <input 
                        type="checkbox"
                        disabled={isReadOnly}
                        checked={formData.isAtRisk}
                        onChange={(e) => handleChange('isAtRisk', e.target.checked)}
                        className="rounded text-red-600 focus:ring-red-500"
                      />
                      <span className="flex items-center gap-2">
                         Flag as "At Risk" 
                         {formData.status === Status.Delayed && <span className="text-xs font-normal text-red-600">(Auto-required due to Delayed status)</span>}
                      </span>
                   </label>
                </div>

                {(formData.status === Status.Delayed || formData.isAtRisk) && (
                  <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="block text-sm font-medium text-red-800 mb-1">
                      Risk/Action Documentation <span className="text-red-600 font-bold">*</span>
                    </label>
                    <textarea
                      disabled={isReadOnly}
                      value={formData.riskActionLog || ''}
                      onChange={(e) => handleChange('riskActionLog', e.target.value)}
                      placeholder="Describe the risk and the mitigation action plan..."
                      rows={3}
                      className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 ${errors.riskActionLog ? 'border-red-500' : 'border-slate-300'}`}
                    />
                    {errors.riskActionLog && <p className="text-red-600 text-xs mt-1 font-medium">{errors.riskActionLog}</p>}
                  </div>
                )}
              </div>

              {/* Optional: Trade Off Section */}
              {!isReadOnly && (
                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                  <div className="flex items-center justify-between mb-3">
                    <label className="flex items-center space-x-2 text-sm font-bold text-slate-700 cursor-pointer select-none">
                      <input 
                        type="checkbox"
                        checked={enableTradeOff}
                        onChange={(e) => setEnableTradeOff(e.target.checked)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span className="flex items-center gap-2">
                        <Scale size={16} /> Optional: Track Alternative Cost (Trade-off)
                      </span>
                    </label>
                  </div>
                  
                  {enableTradeOff && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300 pl-6 border-l-2 border-slate-200 ml-1">
                      <p className="text-xs text-slate-500">Select an existing "In Progress" initiative that will be impacted by prioritizing this new task.</p>
                      
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Impacted Initiative</label>
                        <select
                          value={tradeOffData.targetInitiativeId || ''}
                          onChange={(e) => setTradeOffData(prev => ({ ...prev, targetInitiativeId: e.target.value }))}
                          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Select Initiative...</option>
                          {tradeOffCandidates.map(i => (
                            <option key={i.id} value={i.id}>{i.title} (Owner: {users.find(u => u.id === i.ownerId)?.name})</option>
                          ))}
                        </select>
                        {errors.tradeOffTarget && <p className="text-red-500 text-xs mt-1">{errors.tradeOffTarget}</p>}
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Field to Modify</label>
                          <select
                            value={tradeOffData.field || 'eta'}
                            onChange={(e) => setTradeOffData(prev => ({ ...prev, field: e.target.value as any }))}
                            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="eta">ETA</option>
                            <option value="status">Status</option>
                            <option value="priority">Priority</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">New Value</label>
                          {tradeOffData.field === 'eta' ? (
                            <input 
                              type="date"
                              value={tradeOffData.newValue || ''}
                              onChange={(e) => setTradeOffData(prev => ({ ...prev, newValue: e.target.value }))}
                              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          ) : tradeOffData.field === 'status' ? (
                            <select
                              value={tradeOffData.newValue || ''}
                              onChange={(e) => setTradeOffData(prev => ({ ...prev, newValue: e.target.value }))}
                              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                               <option value="">Select Status...</option>
                               {Object.values(Status).map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          ) : (
                            <select
                              value={tradeOffData.newValue || ''}
                              onChange={(e) => setTradeOffData(prev => ({ ...prev, newValue: e.target.value }))}
                              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                               <option value="">Select Priority...</option>
                               {Object.values(Priority).map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                          )}
                          {errors.tradeOffValue && <p className="text-red-500 text-xs mt-1">{errors.tradeOffValue}</p>}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

            </div>
          </form>
        ) : (
          <div className="flex-1 flex flex-col p-6 min-h-[400px]">
            <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
              {(!formData.comments || formData.comments.length === 0) ? (
                 <div className="text-center text-slate-400 py-10">No comments yet. Start the conversation!</div>
              ) : (
                 formData.comments.map(comment => {
                    const author = users.find(u => u.id === comment.authorId);
                    return (
                      <div key={comment.id} className="flex gap-3">
                         <img src={author?.avatar} alt={author?.name} className="w-8 h-8 rounded-full bg-slate-200" />
                         <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex-1">
                            <div className="flex justify-between items-center mb-1">
                              <span className="font-semibold text-sm text-slate-800">{author?.name || 'Unknown'}</span>
                              <span className="text-xs text-slate-400">{new Date(comment.timestamp).toLocaleDateString()}</span>
                            </div>
                            <p className="text-sm text-slate-700">{comment.text}</p>
                         </div>
                      </div>
                    )
                 })
              )}
            </div>
            
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                  placeholder="Type a comment..."
                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button 
                  onClick={handleAddComment}
                  className="bg-blue-600 text-white p-2 rounded-md hover:bg-blue-700 transition-colors"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        {activeTab === 'details' && (
          <div className="flex justify-end gap-3 p-6 pt-2 border-t border-slate-100 sticky bottom-0 bg-white">
            <button 
              type="button" 
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            {!isReadOnly && (
              <button 
                type="button"
                onClick={handleSubmit} 
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
              >
                Save Initiative
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default InitiativeModal;
