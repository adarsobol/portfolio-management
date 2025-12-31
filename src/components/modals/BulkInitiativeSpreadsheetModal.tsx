import React, { useState } from 'react';
import {
  Initiative, User, Status, Priority, UnplannedTag, AssetClass, Dependency, DependencyTeam, Role
} from '../../types';
import { HIERARCHY, QUARTERS } from '../../constants';
import { Plus, X, Trash2, Users, ArrowDown, ArrowUp, Copy } from 'lucide-react';

interface BulkEntryRow {
  id: string;
  title: string;
  ownerId: string;
  priority: Priority;
  status: Status;
  eta: string;
  estimatedEffort: number;
  l2_pillar: string;
  l3_responsibility: string;
  l4_target: string;
  secondaryOwner: string;
  definitionOfDone?: string;
  unplannedTags?: UnplannedTag[];
  dependencies?: Dependency[];
  hasTradeOff: boolean;
  tradeOffTargetId: string;
  tradeOffField: 'eta' | 'status' | 'priority';
  tradeOffValue: string;
}

interface BulkInitiativeSpreadsheetModalProps {
  rows: BulkEntryRow[];
  onRowsChange: (rows: BulkEntryRow[]) => void;
  errors: Record<string, Record<string, string>>;
  onErrorsChange: (errors: Record<string, Record<string, string>>) => void;
  sharedSettings: {
    quarter: string;
    l1_assetClass: AssetClass;
  };
  onSharedSettingsChange: (settings: { quarter: string; l1_assetClass: AssetClass }) => void;
  users: User[];
  allInitiatives: Initiative[];
  onRowChange: (rowId: string, field: keyof BulkEntryRow, value: any) => void;
  onAddRow: () => void;
  onRemoveRow: (rowId: string) => void;
  onDuplicateRow: (rowId: string) => void;
}

export const BulkInitiativeSpreadsheetModal: React.FC<BulkInitiativeSpreadsheetModalProps> = ({
  rows,
  onRowsChange: _onRowsChange,
  errors,
  onErrorsChange: _onErrorsChange,
  sharedSettings,
  onSharedSettingsChange,
  users,
  allInitiatives: _allInitiatives,
  onRowChange,
  onAddRow,
  onRemoveRow,
  onDuplicateRow
}) => {
  const [expandedDependencies, setExpandedDependencies] = useState<Set<string>>(new Set());

  const toggleDependencies = (rowId: string) => {
    setExpandedDependencies(prev => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  const addDependency = (rowId: string) => {
    const row = rows.find(r => r.id === rowId);
    if (row) {
      const newDependency: Dependency = {
        team: DependencyTeam.Product,
        deliverable: '',
        eta: ''
      };
      onRowChange(rowId, 'dependencies', [...(row.dependencies || []), newDependency]);
    }
  };

  const updateDependency = (rowId: string, depIndex: number, field: keyof Dependency, value: any) => {
    const row = rows.find(r => r.id === rowId);
    if (row) {
      const updatedDeps = [...(row.dependencies || [])];
      updatedDeps[depIndex] = { ...updatedDeps[depIndex], [field]: value };
      onRowChange(rowId, 'dependencies', updatedDeps);
    }
  };

  const removeDependency = (rowId: string, depIndex: number) => {
    const row = rows.find(r => r.id === rowId);
    if (row && row.dependencies) {
      const updatedDeps = row.dependencies.filter((_, i) => i !== depIndex);
      onRowChange(rowId, 'dependencies', updatedDeps);
    }
  };

  const toggleUnplannedTag = (rowId: string, tag: UnplannedTag) => {
    const row = rows.find(r => r.id === rowId);
    if (row) {
      const currentTags = row.unplannedTags || [];
      const hasTag = currentTags.includes(tag);
      const newTags = hasTag
        ? currentTags.filter(t => t !== tag)
        : [...currentTags, tag];
      onRowChange(rowId, 'unplannedTags', newTags);
    }
  };

  const teamLeads = users.filter(u => u.role === Role.TeamLead);

  // Column definitions for the spreadsheet
  const columns = [
    { key: 'l2_pillar', label: 'Pillar', width: 'w-32', type: 'select' },
    { key: 'l3_responsibility', label: 'Responsibilities', width: 'w-40', type: 'select' },
    { key: 'l4_target', label: 'Target', width: 'w-48', type: 'text' },
    { key: 'title', label: 'Initiatives', width: 'w-64', type: 'text' },
    { key: 'priority', label: 'Priority', width: 'w-24', type: 'select' },
    { key: 'definitionOfDone', label: 'Definition of Done', width: 'w-48', type: 'text' },
    { key: 'estimatedEffort', label: 'Q1 Effort (weeks)', width: 'w-32', type: 'number' },
    { key: 'ownerId', label: 'Owner Within Team', width: 'w-40', type: 'select' },
    { key: 'status', label: 'Status', width: 'w-32', type: 'select' },
    { key: 'eta', label: 'ETA', width: 'w-32', type: 'date' },
    { key: 'pmItem', label: 'PM Item', width: 'w-20', type: 'checkbox' },
    { key: 'riskItem', label: 'Risk Item', width: 'w-20', type: 'checkbox' },
    { key: 'dependencies', label: 'Dependencies', width: 'w-auto', type: 'dependencies' },
  ];

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Shared Settings */}
      <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center gap-2 mb-3">
          <Users size={16} className="text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">Shared Settings (applies to all)</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Quarter</label>
            <select
              value={sharedSettings.quarter}
              onChange={(e) => onSharedSettingsChange({ ...sharedSettings, quarter: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {QUARTERS.map(q => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Asset Class</label>
            <select
              value={sharedSettings.l1_assetClass}
              onChange={(e) => onSharedSettingsChange({ ...sharedSettings, l1_assetClass: e.target.value as AssetClass })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Object.values(AssetClass).map(ac => <option key={ac} value={ac}>{ac}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Spreadsheet Table */}
      <div className="flex-1 overflow-auto">
        <div className="inline-block min-w-full">
          <table className="border-collapse" style={{ minWidth: '1400px' }}>
            {/* Header Row */}
            <thead>
              <tr className="bg-blue-100 border-b-2 border-slate-300">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`${col.width} px-3 py-2 text-left text-xs font-semibold text-slate-700 border-r border-slate-300 sticky top-0 bg-blue-100 z-10`}
                  >
                    {col.label}
                  </th>
                ))}
                <th className="w-16 px-3 py-2 text-left text-xs font-semibold text-slate-700 border-r border-slate-300 sticky top-0 bg-blue-100 z-10">
                  Actions
                </th>
              </tr>
              {/* Dependencies Sub-header */}
              <tr className="bg-blue-50 border-b border-slate-300">
                <th colSpan={12} className="px-3 py-1 text-xs font-medium text-slate-600 border-r border-slate-300 sticky top-[41px] bg-blue-50 z-10">
                  Dependencies
                </th>
                <th className="px-3 py-1 text-xs font-medium text-slate-600 border-r border-slate-300 sticky top-[41px] bg-blue-50 z-10">
                  Department
                </th>
                <th className="px-3 py-1 text-xs font-medium text-slate-600 border-r border-slate-300 sticky top-[41px] bg-blue-50 z-10">
                  Requirement
                </th>
                <th className="px-3 py-1 text-xs font-medium text-slate-600 border-r border-slate-300 sticky top-[41px] bg-blue-50 z-10">
                  Deadline
                </th>
                <th className="w-16 px-3 py-1 sticky top-[41px] bg-blue-50 z-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => {
                const rowErrors = errors[row.id] || {};
                const hasDependencies = row.dependencies && row.dependencies.length > 0;
                const isDependenciesExpanded = expandedDependencies.has(row.id);

                return (
                  <React.Fragment key={row.id}>
                    {/* Main Data Row */}
                    <tr className="hover:bg-slate-50 border-b border-slate-200">
                      {/* Pillar */}
                      <td className="px-3 py-2 border-r border-slate-200">
                        <select
                          value={row.l2_pillar}
                          onChange={(e) => {
                            const newPillar = e.target.value;
                            const pillarNode = HIERARCHY[sharedSettings.l1_assetClass].find(p => p.name === newPillar);
                            onRowChange(row.id, 'l2_pillar', newPillar);
                            if (pillarNode) {
                              onRowChange(row.id, 'l3_responsibility', pillarNode.responsibilities[0] || '');
                            }
                          }}
                          className={`w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                            rowErrors.l2_pillar ? 'border-red-500 bg-red-50' : 'border-slate-200'
                          }`}
                        >
                          {HIERARCHY[sharedSettings.l1_assetClass].map(p => (
                            <option key={p.name} value={p.name}>{p.name}</option>
                          ))}
                        </select>
                      </td>

                      {/* Responsibilities */}
                      <td className="px-3 py-2 border-r border-slate-200">
                        <select
                          value={row.l3_responsibility}
                          onChange={(e) => onRowChange(row.id, 'l3_responsibility', e.target.value)}
                          className={`w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                            rowErrors.l3_responsibility ? 'border-red-500 bg-red-50' : 'border-slate-200'
                          }`}
                        >
                          {(HIERARCHY[sharedSettings.l1_assetClass].find(p => p.name === row.l2_pillar)?.responsibilities || []).map(r => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      </td>

                      {/* Target */}
                      <td className="px-3 py-2 border-r border-slate-200">
                        <input
                          type="text"
                          value={row.l4_target}
                          onChange={(e) => onRowChange(row.id, 'l4_target', e.target.value)}
                          placeholder="e.g. Identify constraints"
                          className={`w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                            rowErrors.l4_target ? 'border-red-500 bg-red-50' : 'border-slate-200'
                          }`}
                        />
                      </td>

                      {/* Initiatives (Title) */}
                      <td className="px-3 py-2 border-r border-slate-200">
                        <input
                          type="text"
                          value={row.title}
                          onChange={(e) => onRowChange(row.id, 'title', e.target.value)}
                          placeholder={`Initiative ${rowIndex + 1}...`}
                          className={`w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                            rowErrors.title ? 'border-red-500 bg-red-50' : 'border-slate-200'
                          }`}
                        />
                      </td>

                      {/* Priority */}
                      <td className="px-3 py-2 border-r border-slate-200">
                        <select
                          value={row.priority}
                          onChange={(e) => onRowChange(row.id, 'priority', e.target.value)}
                          className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          {Object.values(Priority).map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </td>

                      {/* Definition of Done */}
                      <td className="px-3 py-2 border-r border-slate-200">
                        <input
                          type="text"
                          value={row.definitionOfDone || ''}
                          onChange={(e) => onRowChange(row.id, 'definitionOfDone', e.target.value)}
                          placeholder="Definition of done..."
                          className={`w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                            rowErrors.definitionOfDone ? 'border-red-500 bg-red-50' : 'border-slate-200'
                          }`}
                        />
                      </td>

                      {/* Q1 Effort (weeks) */}
                      <td className="px-3 py-2 border-r border-slate-200">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onRowChange(row.id, 'estimatedEffort', Math.max(0, row.estimatedEffort - 0.25))}
                            className="p-1 hover:bg-blue-100 rounded text-slate-500 hover:text-blue-600 transition-colors"
                            title="Decrease by 0.25"
                          >
                            <ArrowDown size={12} />
                          </button>
                          <input
                            type="number"
                            min="0"
                            step="0.25"
                            value={row.estimatedEffort}
                            onChange={(e) => onRowChange(row.id, 'estimatedEffort', parseFloat(e.target.value) || 0)}
                            className={`w-16 px-2 py-1 text-sm border rounded text-center focus:outline-none focus:ring-1 focus:ring-blue-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
                              rowErrors.estimatedEffort ? 'border-red-500 bg-red-50' : 'border-slate-200'
                            }`}
                          />
                          <button
                            onClick={() => onRowChange(row.id, 'estimatedEffort', row.estimatedEffort + 0.25)}
                            className="p-1 hover:bg-blue-100 rounded text-slate-500 hover:text-blue-600 transition-colors"
                            title="Increase by 0.25"
                          >
                            <ArrowUp size={12} />
                          </button>
                        </div>
                      </td>

                      {/* Owner Within Team */}
                      <td className="px-3 py-2 border-r border-slate-200">
                        <select
                          value={row.ownerId}
                          onChange={(e) => onRowChange(row.id, 'ownerId', e.target.value)}
                          className={`w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                            rowErrors.ownerId ? 'border-red-500 bg-red-50' : 'border-slate-200'
                          }`}
                        >
                          <option value="">Select...</option>
                          {teamLeads.map(u => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                          ))}
                        </select>
                      </td>

                      {/* PM Item */}
                      <td className="px-3 py-2 border-r border-slate-200 text-center">
                        <input
                          type="checkbox"
                          checked={(row.unplannedTags || []).includes(UnplannedTag.PMItem)}
                          onChange={() => toggleUnplannedTag(row.id, UnplannedTag.PMItem)}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                      </td>

                      {/* Risk Item */}
                      <td className="px-3 py-2 border-r border-slate-200 text-center">
                        <input
                          type="checkbox"
                          checked={(row.unplannedTags || []).includes(UnplannedTag.RiskItem)}
                          onChange={() => toggleUnplannedTag(row.id, UnplannedTag.RiskItem)}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                      </td>

                      {/* Dependencies - Department, Requirement, Deadline */}
                      <td colSpan={3} className="px-3 py-2 border-r border-slate-200">
                        {hasDependencies && (
                          <button
                            onClick={() => toggleDependencies(row.id)}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            {isDependenciesExpanded ? 'Hide' : 'Show'} ({row.dependencies?.length || 0})
                          </button>
                        )}
                        {!hasDependencies && (
                          <button
                            onClick={() => addDependency(row.id)}
                            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                          >
                            <Plus size={12} /> Add
                          </button>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-2 border-r border-slate-200">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => onDuplicateRow(row.id)}
                            className="p-1 hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600"
                            title="Duplicate row"
                          >
                            <Copy size={14} />
                          </button>
                          {rows.length > 1 && (
                            <button
                              onClick={() => onRemoveRow(row.id)}
                              className="p-1 hover:bg-red-100 rounded text-red-400 hover:text-red-600"
                              title="Remove row"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* Dependencies Rows */}
                    {isDependenciesExpanded && row.dependencies && row.dependencies.map((dep, depIndex) => (
                      <tr key={`${row.id}-dep-${depIndex}`} className="bg-slate-50 border-b border-slate-200">
                        <td colSpan={12} className="px-3 py-2 border-r border-slate-200"></td>
                        {/* Department */}
                        <td className="px-3 py-2 border-r border-slate-200">
                          <select
                            value={dep.team}
                            onChange={(e) => updateDependency(row.id, depIndex, 'team', e.target.value)}
                            className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            {Object.values(DependencyTeam).map(team => (
                              <option key={team} value={team}>{team}</option>
                            ))}
                          </select>
                        </td>
                        {/* Requirement */}
                        <td className="px-3 py-2 border-r border-slate-200">
                          <input
                            type="text"
                            value={dep.deliverable}
                            onChange={(e) => updateDependency(row.id, depIndex, 'deliverable', e.target.value)}
                            placeholder="Requirement..."
                            className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </td>
                        {/* Deadline */}
                        <td className="px-3 py-2 border-r border-slate-200">
                          <div className="flex items-center gap-1">
                            <input
                              type="date"
                              value={dep.eta || ''}
                              onChange={(e) => updateDependency(row.id, depIndex, 'eta', e.target.value)}
                              className="flex-1 px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <button
                              onClick={() => removeDependency(row.id, depIndex)}
                              className="p-1 hover:bg-red-100 rounded text-red-400 hover:text-red-600"
                              title="Remove dependency"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </td>
                        <td className="px-3 py-2"></td>
                      </tr>
                    ))}
                    {isDependenciesExpanded && (!row.dependencies || row.dependencies.length === 0) && (
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <td colSpan={12} className="px-3 py-2 border-r border-slate-200"></td>
                        <td colSpan={3} className="px-3 py-2 border-r border-slate-200">
                          <button
                            onClick={() => addDependency(row.id)}
                            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                          >
                            <Plus size={12} /> Add Dependency
                          </button>
                        </td>
                        <td className="px-3 py-2"></td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Row Button */}
      <div className="px-6 py-3 border-t border-slate-200 bg-slate-50">
        <button
          type="button"
          onClick={onAddRow}
          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          <Plus size={16} />
          Add Row
        </button>
      </div>
    </div>
  );
};

