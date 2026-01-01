import React, { useState, useCallback } from 'react';
import { Plus, Trash2, Edit2, Check, X, AlertCircle, GripVertical, Download, Upload, RotateCcw, Loader2 } from 'lucide-react';
import { AppConfig, Initiative } from '../../types';
import { getValueUsageCount, validateValueList, getDefaultValueLists, getPriorities, getUnplannedTags, getInitiativeTypes, getQuarters, getAssetClasses, getStatuses, getDependencyTeams, getWorkTypes, ensureRequiredValuesInConfig } from '../../utils/valueLists';

const API_ENDPOINT = import.meta.env.VITE_API_ENDPOINT || '';

interface ValueListsManagerProps {
  config: AppConfig;
  onUpdate: (updatedConfig: AppConfig) => void;
  initiatives: Initiative[];
}

type ListType = 'assetClasses' | 'statuses' | 'dependencyTeams' | 'priorities' | 'workTypes' | 'unplannedTags' | 'initiativeTypes' | 'quarters';

interface ListConfig {
  label: string;
  field: ListType;
  description: string;
}

const LIST_CONFIGS: ListConfig[] = [
  {
    label: 'Asset Classes',
    field: 'assetClasses',
    description: 'Asset classes used for categorizing initiatives (e.g., PL, Auto, POS, Advisory)'
  },
  {
    label: 'Statuses',
    field: 'statuses',
    description: 'Status values for initiatives and tasks (e.g., Not Started, In Progress, Done)'
  },
  {
    label: 'Dependency Teams',
    field: 'dependencyTeams',
    description: 'Teams that can be dependencies for initiatives (e.g., R&M - Research, Product)'
  },
  {
    label: 'Priorities',
    field: 'priorities',
    description: 'Priority levels for initiatives (e.g., P0, P1, P2)'
  },
  {
    label: 'Work Types',
    field: 'workTypes',
    description: 'Types of work (e.g., Planned Work, Unplanned Work)'
  },
  {
    label: 'Unplanned Tags',
    field: 'unplannedTags',
    description: 'Tags for unplanned work items (e.g., Unplanned, Risk Item, PM Item)'
  },
  {
    label: 'Initiative Types',
    field: 'initiativeTypes',
    description: 'Types of initiatives (e.g., WP, BAU)'
  },
  {
    label: 'Quarters',
    field: 'quarters',
    description: 'Quarter values for planning (e.g., Q1 2025, Q2 2025)'
  }
];

export const ValueListsManager: React.FC<ValueListsManagerProps> = ({
  config,
  onUpdate,
  initiatives
}) => {
  const [editingIndex, setEditingIndex] = useState<{ listType: ListType; index: number } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [newValue, setNewValue] = useState<Record<ListType, string>>({
    assetClasses: '',
    statuses: '',
    dependencyTeams: '',
    priorities: '',
    workTypes: '',
    unplannedTags: '',
    initiativeTypes: '',
    quarters: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const getList = useCallback((listType: ListType): string[] => {
    // Use getter functions that ensure required UI values are included for data integrity
    switch (listType) {
      case 'assetClasses':
        return getAssetClasses(config);
      case 'statuses':
        return getStatuses(config);
      case 'dependencyTeams':
        return getDependencyTeams(config);
      case 'priorities':
        return getPriorities(config);
      case 'workTypes':
        return getWorkTypes(config);
      case 'unplannedTags':
        return getUnplannedTags(config);
      case 'initiativeTypes':
        return getInitiativeTypes(config);
      case 'quarters':
        return getQuarters(config);
      default:
        return [];
    }
  }, [config]);

  const updateList = useCallback(async (listType: ListType, newList: string[]) => {
    // Use getList to ensure we're working with lists that include required UI values
    const updatedValueLists = {
      assetClasses: getList('assetClasses'),
      statuses: getList('statuses'),
      dependencyTeams: getList('dependencyTeams'),
      priorities: getList('priorities'),
      workTypes: getList('workTypes'),
      unplannedTags: getList('unplannedTags'),
      initiativeTypes: getList('initiativeTypes'),
      quarters: getList('quarters'),
      [listType]: newList // Override with the new list (which should include required values from getList)
    };
    
    // Update local state immediately for responsive UI
    const updatedConfig: AppConfig = {
      ...config,
      valueLists: updatedValueLists
    };
    onUpdate(updatedConfig);

    // Save to backend
    setIsSaving(true);
    setSaveError(null);
    try {
      const token = localStorage.getItem('portfolio-auth-token');
      const response = await fetch(`${API_ENDPOINT}/api/config/value-lists`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || ''}`
        },
        body: JSON.stringify({ valueLists: updatedValueLists })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save value lists');
      }

      // Success - value lists are now saved to backend
      setSaveError(null);
    } catch (error) {
      console.error('Error saving value lists to backend:', error);
      setSaveError(error instanceof Error ? error.message : 'Failed to save to backend');
      // Note: Local state is already updated, so UI reflects changes
      // User can retry saving if needed
    } finally {
      setIsSaving(false);
    }
  }, [config, onUpdate]);

  const handleAdd = useCallback((listType: ListType) => {
    const value = newValue[listType].trim();
    if (!value) return;

    const currentList = getList(listType);
    const validation = validateValueList(value, currentList);
    
    if (!validation.valid) {
      setErrors(prev => ({ ...prev, [`${listType}-new`]: validation.error || 'Invalid value' }));
      return;
    }

    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[`${listType}-new`];
      return newErrors;
    });

    updateList(listType, [...currentList, value]);
    setNewValue(prev => ({ ...prev, [listType]: '' }));
  }, [newValue, getList, updateList]);

  const handleEditStart = useCallback((listType: ListType, index: number) => {
    const currentList = getList(listType);
    setEditingIndex({ listType, index });
    setEditValue(currentList[index]);
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[`${listType}-${index}`];
      return newErrors;
    });
  }, [getList]);

  const handleEditSave = useCallback(() => {
    if (!editingIndex) return;

    const { listType, index } = editingIndex;
    const value = editValue.trim();
    if (!value) {
      setEditingIndex(null);
      return;
    }

    const currentList = getList(listType);
    const validation = validateValueList(value, currentList.filter((_, i) => i !== index));
    
    if (!validation.valid) {
      setErrors(prev => ({ ...prev, [`${listType}-${index}`]: validation.error || 'Invalid value' }));
      return;
    }

    const updatedList = [...currentList];
    updatedList[index] = value;
    updateList(listType, updatedList);
    setEditingIndex(null);
    setEditValue('');
  }, [editingIndex, editValue, getList, updateList]);

  const handleEditCancel = useCallback(() => {
    setEditingIndex(null);
    setEditValue('');
    setErrors(prev => {
      const newErrors = { ...prev };
      Object.keys(newErrors).forEach(key => {
        if (key.startsWith(`${editingIndex?.listType}-`)) {
          delete newErrors[key];
        }
      });
      return newErrors;
    });
  }, [editingIndex]);

  const handleDelete = useCallback((listType: ListType, index: number) => {
    const currentList = getList(listType);
    const value = currentList[index];
    
    // Check usage
    const fieldMap: Record<ListType, 'assetClass' | 'status' | 'dependencyTeam' | 'priority' | 'workType' | 'unplannedTag' | 'initiativeType' | 'quarter'> = {
      assetClasses: 'assetClass',
      statuses: 'status',
      dependencyTeams: 'dependencyTeam',
      priorities: 'priority',
      workTypes: 'workType',
      unplannedTags: 'unplannedTag',
      initiativeTypes: 'initiativeType',
      quarters: 'quarter'
    };
    
    const usageCount = getValueUsageCount(value, initiatives, fieldMap[listType]);
    
    if (usageCount > 0) {
      const confirmMessage = `"${value}" is used in ${usageCount} initiative(s) or task(s). Are you sure you want to delete it?`;
      if (!window.confirm(confirmMessage)) {
        return;
      }
    }

    const updatedList = currentList.filter((_, i) => i !== index);
    updateList(listType, updatedList);
  }, [getList, initiatives, updateList]);


  const handleReset = useCallback((listType: ListType) => {
    if (!window.confirm(`Reset ${LIST_CONFIGS.find(c => c.field === listType)?.label} to default values?`)) {
      return;
    }
    const defaults = getDefaultValueLists();
    updateList(listType, defaults[listType]);
  }, [updateList]);

  const handleExport = useCallback((listType: ListType) => {
    const currentList = getList(listType);
    const data = JSON.stringify(currentList, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${listType}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [getList]);

  const handleImport = useCallback((listType: ListType, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const imported = JSON.parse(content);
        
        if (!Array.isArray(imported) || !imported.every(item => typeof item === 'string')) {
          alert('Invalid file format. Expected an array of strings.');
          return;
        }

        if (!window.confirm(`Replace ${LIST_CONFIGS.find(c => c.field === listType)?.label} with ${imported.length} imported values?`)) {
          return;
        }

        updateList(listType, imported);
      } catch (error) {
        alert('Failed to parse file. Please ensure it is valid JSON.');
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset input
  }, [updateList]);

  const handleEnsureRequiredValues = useCallback(async () => {
    if (!window.confirm('This will ensure all required enum values (P0/P1/P2, WP/BAU, etc.) are present in the value lists. Continue?')) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    try {
      const updatedConfig = ensureRequiredValuesInConfig(config);
      onUpdate(updatedConfig);

      // Save to backend
      const token = localStorage.getItem('portfolio-auth-token');
      const updatedValueLists = {
        assetClasses: updatedConfig.valueLists?.assetClasses || [],
        statuses: updatedConfig.valueLists?.statuses || [],
        dependencyTeams: updatedConfig.valueLists?.dependencyTeams || [],
        priorities: updatedConfig.valueLists?.priorities || [],
        workTypes: updatedConfig.valueLists?.workTypes || [],
        unplannedTags: updatedConfig.valueLists?.unplannedTags || [],
        initiativeTypes: updatedConfig.valueLists?.initiativeTypes || [],
        quarters: updatedConfig.valueLists?.quarters || []
      };

      const response = await fetch(`${API_ENDPOINT}/api/config/value-lists`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token || ''}`
        },
        body: JSON.stringify({ valueLists: updatedValueLists })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to save value lists');
      }

      alert('Required values have been ensured in all value lists.');
    } catch (error) {
      console.error('Error ensuring required values:', error);
      setSaveError(error instanceof Error ? error.message : 'Failed to ensure required values');
    } finally {
      setIsSaving(false);
    }
  }, [config, onUpdate]);

  return (
    <div className="space-y-6">
      {/* One-time ensure required values button */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-semibold text-blue-900 mb-1">Ensure Required Values</h4>
            <p className="text-sm text-blue-700 mb-3">
              Ensure all required enum values are present in the value lists:
              <br />• Priorities: P0, P1, P2
              <br />• Initiative Types: WP, BAU
              <br />• Work Types: Planned Work, Unplanned Work
              <br />• Statuses: Not Started, In Progress, At Risk, Done, Obsolete, Deleted
              <br />• Asset Classes: PL, Auto, POS, Advisory
              <br />• Unplanned Tags: Unplanned, Risk Item, PM Item, Both
            </p>
            <button
              onClick={handleEnsureRequiredValues}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Ensuring required values...</span>
                </>
              ) : (
                <>
                  <RotateCcw size={16} />
                  <span>Ensure Required Values</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Save status indicator */}
      {(isSaving || saveError) && (
        <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${
          saveError 
            ? 'bg-red-50 text-red-700 border border-red-200' 
            : 'bg-blue-50 text-blue-700 border border-blue-200'
        }`}>
          {isSaving ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              <span>Saving to backend...</span>
            </>
          ) : saveError ? (
            <>
              <AlertCircle size={16} />
              <span>Failed to save: {saveError}</span>
            </>
          ) : null}
        </div>
      )}

      {LIST_CONFIGS.map(({ label, field, description }) => {
        const list = getList(field);
        const fieldKey = field as ListType;

        return (
          <div key={field} className="bg-white rounded-lg border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{label}</h3>
                <p className="text-sm text-slate-500 mt-1">{description}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExport(fieldKey)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-md border border-slate-200 transition-colors"
                  title="Export list"
                >
                  <Download size={14} />
                  Export
                </button>
                <label className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-md border border-slate-200 transition-colors cursor-pointer">
                  <Upload size={14} />
                  Import
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => handleImport(fieldKey, e)}
                  />
                </label>
                <button
                  onClick={() => handleReset(fieldKey)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md border border-red-200 transition-colors"
                  title="Reset to defaults"
                >
                  <RotateCcw size={14} />
                  Reset
                </button>
              </div>
            </div>

            {/* Add new value */}
            <div className="flex items-center gap-2 mb-4">
              <input
                type="text"
                value={newValue[fieldKey]}
                onChange={(e) => {
                  setNewValue(prev => ({ ...prev, [fieldKey]: e.target.value }));
                  setErrors(prev => {
                    const newErrors = { ...prev };
                    delete newErrors[`${fieldKey}-new`];
                    return newErrors;
                  });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAdd(fieldKey);
                  }
                }}
                placeholder={`Add new ${label.toLowerCase()}...`}
                className="flex-1 px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={() => handleAdd(fieldKey)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-1.5"
              >
                <Plus size={16} />
                Add
              </button>
            </div>
            {errors[`${fieldKey}-new`] && (
              <div className="mb-2 text-sm text-red-600 flex items-center gap-1">
                <AlertCircle size={14} />
                {errors[`${fieldKey}-new`]}
              </div>
            )}

            {/* List of values */}
            <div className="space-y-2">
              {list.length === 0 ? (
                <div className="text-sm text-slate-400 italic py-4 text-center">
                  No values yet. Add one above.
                </div>
              ) : (
                list.map((value, index) => {
                  const isEditing = editingIndex?.listType === fieldKey && editingIndex.index === index;
                  const fieldMap: Record<ListType, 'assetClass' | 'status' | 'dependencyTeam' | 'priority' | 'workType' | 'unplannedTag' | 'initiativeType' | 'quarter'> = {
                    assetClasses: 'assetClass',
                    statuses: 'status',
                    dependencyTeams: 'dependencyTeam',
                    priorities: 'priority',
                    workTypes: 'workType',
                    unplannedTags: 'unplannedTag',
                    initiativeTypes: 'initiativeType',
                    quarters: 'quarter'
                  };
                  const usageCount = getValueUsageCount(value, initiatives, fieldMap[fieldKey]);

                  return (
                    <div
                      key={`${fieldKey}-${index}`}
                      className="flex items-center gap-2 p-3 bg-slate-50 rounded-md border border-slate-200 hover:border-slate-300 transition-colors group"
                    >
                      <GripVertical className="text-slate-400 cursor-move" size={16} />
                      
                      {isEditing ? (
                        <>
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleEditSave();
                              } else if (e.key === 'Escape') {
                                handleEditCancel();
                              }
                            }}
                            className="flex-1 px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                          />
                          <button
                            onClick={handleEditSave}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                            title="Save"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            onClick={handleEditCancel}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Cancel"
                          >
                            <X size={16} />
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 text-slate-900 font-medium">{value}</span>
                          {usageCount > 0 && (
                            <span className="text-xs text-slate-500 bg-slate-200 px-2 py-0.5 rounded">
                              Used {usageCount}x
                            </span>
                          )}
                          <button
                            onClick={() => handleEditStart(fieldKey, index)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                            title="Edit"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(fieldKey, index)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                            title={usageCount > 0 ? `Delete (used ${usageCount}x)` : 'Delete'}
                            disabled={usageCount > 0 && !window.confirm}
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                      {errors[`${fieldKey}-${index}`] && (
                        <div className="text-xs text-red-600 flex items-center gap-1">
                          <AlertCircle size={12} />
                          {errors[`${fieldKey}-${index}`]}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

