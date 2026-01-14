import React, { useRef } from 'react';
import {
  Initiative, User, Status, Priority, UnplannedTag, AssetClass, Dependency, DependencyTeam, AppConfig, InitiativeType
} from '../../types';
import { getEligibleOwners, generateId, logger } from '../../utils';
import { getPriorities, getQuarters, getAssetClasses, getDependencyTeams, getHierarchy, getInitiativeTypes } from '../../utils/valueLists';
import { Plus, Trash2, Users, ArrowDown, ArrowUp, Copy, Upload, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

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
  assignee: string;
  definitionOfDone?: string;
  unplannedTags?: UnplannedTag[];
  dependencies?: Dependency[];
  hasTradeOff: boolean;
  tradeOffTargetId: string;
  tradeOffField: 'eta' | 'status' | 'priority';
  tradeOffValue: string;
  initiativeType: InitiativeType;
}

interface BulkInitiativeSpreadsheetModalProps {
  rows: BulkEntryRow[];
  onRowsChange: (rows: BulkEntryRow[]) => void;
  errors: Record<string, Record<string, string>>;
  onErrorsChange: (errors: Record<string, Record<string, string>>) => void;
  sharedSettings: {
    quarter: string;
    l1_assetClass: AssetClass;
    ownerId: string;
  };
  onSharedSettingsChange: (settings: { quarter: string; l1_assetClass: AssetClass; ownerId: string }) => void;
  users: User[];
  allInitiatives: Initiative[];
  onRowChange: (rowId: string, field: keyof BulkEntryRow, value: any) => void;
  onAddRow: () => void;
  onRemoveRow: (rowId: string) => void;
  onDuplicateRow: (rowId: string) => void;
  config: AppConfig;
}

export const BulkInitiativeSpreadsheetModal: React.FC<BulkInitiativeSpreadsheetModalProps> = ({
  rows,
  config,
  onRowsChange,
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update the first dependency field for a row (inline editing)
  const updateFirstDependency = (rowId: string, field: keyof Dependency, value: string) => {
    const row = rows.find(r => r.id === rowId);
    if (row) {
      const deps = row.dependencies || [];
      if (deps.length === 0) {
        // Create first dependency
        const newDep: Dependency = {
          team: field === 'team' ? value as DependencyTeam : DependencyTeam.Product,
          deliverable: field === 'deliverable' ? value : '',
          eta: field === 'eta' ? value : ''
        };
        onRowChange(rowId, 'dependencies', [newDep]);
      } else {
        // Update first dependency
        const updatedDeps = [...deps];
        updatedDeps[0] = { ...updatedDeps[0], [field]: value };
        onRowChange(rowId, 'dependencies', updatedDeps);
      }
    }
  };

  // Get first dependency or empty values
  const getFirstDependency = (row: BulkEntryRow): Dependency => {
    return row.dependencies?.[0] || { team: '' as DependencyTeam, deliverable: '', eta: '' };
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

  const teamLeads = getEligibleOwners(users);

  // Column definitions for the spreadsheet (aligned with expected format)
  const columns = [
    { key: 'initiativeType', label: 'Type', width: 'w-20' },
    { key: 'l2_pillar', label: 'Pillar', width: 'w-32' },
    { key: 'l3_responsibility', label: 'Responsibilities', width: 'w-40' },
    { key: 'l4_target', label: 'Target', width: 'w-48' },
    { key: 'title', label: 'Initiatives', width: 'w-64' },
    { key: 'priority', label: 'Priority', width: 'w-24' },
    { key: 'definitionOfDone', label: 'Definition of Done', width: 'w-48' },
    { key: 'estimatedEffort', label: 'Q1 Effort (weeks)', width: 'w-32' },
    { key: 'assignee', label: 'Assignee', width: 'w-40' },
    { key: 'eta', label: 'ETA', width: 'w-32' },
    { key: 'pmItem', label: 'PM Item', width: 'w-20' },
    { key: 'riskItem', label: 'Risk Item', width: 'w-20' },
    { key: 'depDepartment', label: 'Dependencies Department', width: 'w-36' },
    { key: 'depDeliverable', label: 'Dependencies Deliverable', width: 'w-48' },
    { key: 'depEta', label: 'Dependencies ETA', width: 'w-32' },
  ];

  // Template headers for download (matches column labels)
  const TEMPLATE_HEADERS = [
    'Type', 'Pillar', 'Responsibilities', 'Target', 'Initiatives', 'Priority',
    'Definition of Done', 'Q1 Effort (weeks)', 'Assignee', 'ETA',
    'PM Item', 'Risk Item', 'Dependencies Department', 'Dependencies Deliverable', 'Dependencies ETA'
  ];

  // Download template Excel file
  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Plan Mode Template');
    XLSX.writeFile(wb, 'plan-mode-template.xlsx');
  };

  // Parse uploaded Excel/CSV file
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as Record<string, unknown>[];

        // Helper function to find column value with multiple name variations (case-insensitive, trimmed)
        const getColumnValue = (row: Record<string, unknown>, possibleNames: string[]): string => {
          for (const name of possibleNames) {
            // Try exact match first
            if (row[name] !== undefined && row[name] !== null && String(row[name]).trim() !== '') {
              return String(row[name]).trim();
            }
            // Try case-insensitive match
            const foundKey = Object.keys(row).find(key => key.trim().toLowerCase() === name.trim().toLowerCase());
            if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null && String(row[foundKey]).trim() !== '') {
              return String(row[foundKey]).trim();
            }
          }
          return '';
        };

        // Debug: Log first row keys to see what columns are actually present
        if (jsonData.length > 0) {
          logger.debug('Available columns in uploaded sheet', { context: 'BulkInitiativeSpreadsheetModal.parseFile', metadata: { columns: Object.keys(jsonData[0]) } });
        }

        const hierarchy = getHierarchy(config);
        const hierarchyNodes = hierarchy[sharedSettings.l1_assetClass] || [];
        const defaultPillar = hierarchyNodes[0]?.name || '';
        const defaultResp = hierarchyNodes[0]?.responsibilities[0] || '';

        const parsedRows: BulkEntryRow[] = jsonData.map((row) => {
          // Map columns to BulkEntryRow fields with robust name matching
          const typeVal = String(
            getColumnValue(row, ['Type', 'type', 'Initiative Type', 'initiativeType', 'InitiativeType']) || 'WP'
          ).trim().toUpperCase();
          const initiativeType = (typeVal === 'BAU' ? InitiativeType.BAU : InitiativeType.WP);
          
          const pillar = getColumnValue(row, ['Pillar', 'pillar', 'L2 Pillar', 'l2_pillar', 'L2_Pillar']) || defaultPillar;
          const responsibility = getColumnValue(row, ['Responsibilities', 'responsibilities', 'Responsibility', 'responsibility', 'L3 Responsibility', 'l3_responsibility', 'L3_Responsibility']) || defaultResp;
          const target = getColumnValue(row, ['Target', 'target', 'L4 Target', 'l4_target', 'L4_Target']);
          const title = getColumnValue(row, ['Initiatives', 'initiatives', 'Initiative', 'initiative', 'Title', 'title', 'Initiative Name', 'InitiativeName']);
          const priority = (getColumnValue(row, ['Priority', 'priority', 'Priorities']) || 'P1').trim() as Priority;
          const definitionOfDone = getColumnValue(row, ['Definition of Done', 'definitionOfDone', 'DefinitionOfDone', 'DoD', 'dod']);
          const effort = parseFloat(getColumnValue(row, ['Q1 Effort (weeks)', 'Q1 Effort', 'Effort', 'effort', 'estimatedEffort', 'Estimated Effort']) || '0') || 0;
          
          // Assignee (free text) - handle multiple column name variations
          const assignee = getColumnValue(row, [
            'Assignee', 
            'assignee', 
            'Owner Within Team', 
            'owner within team',
            'Owner',
            'owner'
          ]);
          
          // Owner comes from shared settings
          const ownerId = sharedSettings.ownerId || '';

          // Parse ETA (handle Excel date serial numbers)
          let eta = '';
          // Find ETA column key first, then get the raw value (might be number for Excel dates)
          const etaKey = Object.keys(row).find(key => 
            ['ETA', 'eta', 'Eta', 'Due Date', 'dueDate'].some(name => 
              key.trim().toLowerCase() === name.trim().toLowerCase()
            )
          );
          const rawEta = etaKey ? row[etaKey] : null;
          if (rawEta !== undefined && rawEta !== null && rawEta !== '') {
            if (typeof rawEta === 'number') {
              // Excel date serial number conversion
              const excelEpoch = new Date(1899, 11, 30);
              const date = new Date(excelEpoch.getTime() + rawEta * 86400000);
              eta = date.toISOString().split('T')[0];
            } else {
              eta = String(rawEta).trim();
            }
          }

          // PM Item and Risk Item (checkboxes)
          const pmItemVal = getColumnValue(row, ['PM Item', 'pmItem', 'PM', 'pm']) || row['PM Item'] || row['pmItem'];
          const riskItemVal = getColumnValue(row, ['Risk Item', 'riskItem', 'Risk', 'risk']) || row['Risk Item'] || row['riskItem'];
          const unplannedTags: UnplannedTag[] = [];
          if (pmItemVal === true || pmItemVal === 'true' || pmItemVal === 'TRUE' || pmItemVal === 'Yes' || pmItemVal === 'yes' || pmItemVal === 'X' || pmItemVal === 'x') {
            unplannedTags.push(UnplannedTag.PMItem);
          }
          if (riskItemVal === true || riskItemVal === 'true' || riskItemVal === 'TRUE' || riskItemVal === 'Yes' || riskItemVal === 'yes' || riskItemVal === 'X' || riskItemVal === 'x') {
            unplannedTags.push(UnplannedTag.RiskItem);
          }

          // Dependencies - handle multiple column name variations (with spaces, dashes, or underscores)
          const depDepartment = getColumnValue(row, [
            'Dependencies Department', 
            'Dependencies - Department',
            'Dependencies_Department',
            'depDepartment'
          ]);
          const depDeliverable = getColumnValue(row, [
            'Dependencies Deliverable', 
            'Dependencies - Deliverable',
            'Dependencies_Deliverable',
            'Dependencies',  // Sometimes just "Dependencies" refers to deliverable
            'depDeliverable'
          ]);
          let depEta = '';
          // Find Dependencies ETA column key first, then get the raw value (might be number for Excel dates)
          const depEtaKey = Object.keys(row).find(key => 
            ['Dependencies ETA', 'Dependencies - ETA', 'Dependencies_ETA', 'depEta'].some(name => 
              key.trim().toLowerCase() === name.trim().toLowerCase()
            )
          );
          const rawDepEta = depEtaKey ? row[depEtaKey] : null;
          if (rawDepEta) {
            if (typeof rawDepEta === 'number') {
              const excelEpoch = new Date(1899, 11, 30);
              const date = new Date(excelEpoch.getTime() + rawDepEta * 86400000);
              depEta = date.toISOString().split('T')[0];
            } else {
              depEta = String(rawDepEta).trim();
            }
          }

          const dependencies: Dependency[] = [];
          if (depDepartment || depDeliverable || depEta) {
            dependencies.push({
              team: (depDepartment || DependencyTeam.Product) as DependencyTeam,
              deliverable: depDeliverable,
              eta: depEta
            });
          }

          return {
            id: generateId(),
            title,
            ownerId,
            priority: (['P0', 'P1', 'P2'].includes(priority) ? priority : Priority.P1) as Priority,
            status: Status.NotStarted, // Default status (not shown in table)
            eta,
            estimatedEffort: effort,
            l2_pillar: pillar,
            l3_responsibility: responsibility,
            l4_target: target,
            assignee,
            definitionOfDone,
            unplannedTags,
            dependencies,
            hasTradeOff: false,
            tradeOffTargetId: '',
            tradeOffField: 'eta',
            tradeOffValue: '',
            initiativeType
          };
        });

        // Replace existing rows with parsed data
        if (parsedRows.length > 0) {
          onRowsChange(parsedRows);
        }
      } catch (err) {
        logger.error('Error parsing file', { context: 'BulkInitiativeSpreadsheetModal.parseFile', error: err instanceof Error ? err : undefined });
        alert('Failed to parse file. Please ensure it is a valid Excel or CSV file.');
      }
    };
    reader.readAsArrayBuffer(file);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Shared Settings + Upload/Download */}
      <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-slate-500" />
            <span className="text-sm font-semibold text-slate-700">Shared Settings (applies to all)</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
            >
              <Upload size={14} />
              Upload Sheet
            </button>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <Download size={14} />
              Download Template
            </button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Quarter</label>
            <select
              value={sharedSettings.quarter}
              onChange={(e) => onSharedSettingsChange({ ...sharedSettings, quarter: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {getQuarters(config).map(q => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Asset Class</label>
            <select
              value={sharedSettings.l1_assetClass}
              onChange={(e) => onSharedSettingsChange({ ...sharedSettings, l1_assetClass: e.target.value as AssetClass })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {getAssetClasses(config).map(ac => <option key={ac} value={ac}>{ac}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Owner</label>
            <select
              value={sharedSettings.ownerId}
              onChange={(e) => onSharedSettingsChange({ ...sharedSettings, ownerId: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select...</option>
              {teamLeads.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Spreadsheet Table */}
      <div className="flex-1 overflow-auto">
        <div className="inline-block min-w-full">
          <table className="border-collapse" style={{ minWidth: '1600px' }}>
            {/* Header Row */}
            <thead>
              <tr className="bg-slate-100 border-b-2 border-slate-300">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`${col.width} px-3 py-2 text-left text-xs font-semibold text-slate-700 border-r border-slate-300 sticky top-0 bg-slate-100 z-10`}
                  >
                    {col.label}
                  </th>
                ))}
                <th className="w-16 px-3 py-2 text-left text-xs font-semibold text-slate-700 border-r border-slate-300 sticky top-0 bg-slate-100 z-10">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => {
                const rowErrors = errors[row.id] || {};
                const firstDep = getFirstDependency(row);

                return (
                  <tr key={row.id} className="hover:bg-slate-50 border-b border-slate-200">
                    {/* Type (WP/BAU) */}
                    <td className="px-3 py-2 border-r border-slate-200">
                      <select
                        value={row.initiativeType || InitiativeType.WP}
                        onChange={(e) => onRowChange(row.id, 'initiativeType', e.target.value as InitiativeType)}
                        className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        {getInitiativeTypes(config).map(t => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </td>

                    {/* Pillar */}
                    <td className="px-3 py-2 border-r border-slate-200">
                      <select
                        value={row.l2_pillar}
                        onChange={(e) => {
                          const newPillar = e.target.value;
                          const hierarchy = getHierarchy(config);
                          const hierarchyNodes = hierarchy[sharedSettings.l1_assetClass] || [];
                          const pillarNode = hierarchyNodes.find(p => p.name === newPillar);
                          onRowChange(row.id, 'l2_pillar', newPillar);
                          if (pillarNode) {
                            onRowChange(row.id, 'l3_responsibility', pillarNode.responsibilities[0] || '');
                          }
                        }}
                        className={`w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                          rowErrors.l2_pillar ? 'border-red-500 bg-red-50' : 'border-slate-200'
                        }`}
                      >
                        {(getHierarchy(config)[sharedSettings.l1_assetClass] || []).map(p => (
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
                        {((getHierarchy(config)[sharedSettings.l1_assetClass] || []).find(p => p.name === row.l2_pillar)?.responsibilities || []).map(r => (
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
                        {getPriorities(config).map(p => <option key={p} value={p}>{p}</option>)}
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
                          type="button"
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
                          type="button"
                          onClick={() => onRowChange(row.id, 'estimatedEffort', row.estimatedEffort + 0.25)}
                          className="p-1 hover:bg-blue-100 rounded text-slate-500 hover:text-blue-600 transition-colors"
                          title="Increase by 0.25"
                        >
                          <ArrowUp size={12} />
                        </button>
                      </div>
                    </td>

                    {/* Assignee */}
                    <td className="px-3 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        value={row.assignee}
                        onChange={(e) => onRowChange(row.id, 'assignee', e.target.value)}
                        placeholder="Assignee name..."
                        className={`w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                          rowErrors.assignee ? 'border-red-500 bg-red-50' : 'border-slate-200'
                        }`}
                      />
                    </td>

                    {/* ETA */}
                    <td className="px-3 py-2 border-r border-slate-200">
                      <input
                        type="date"
                        value={row.eta || ''}
                        onChange={(e) => onRowChange(row.id, 'eta', e.target.value)}
                        className={`w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                          rowErrors.eta ? 'border-red-500 bg-red-50' : 'border-slate-200'
                        }`}
                      />
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

                    {/* Dependencies Department */}
                    <td className="px-3 py-2 border-r border-slate-200">
                      <select
                        value={firstDep.team || ''}
                        onChange={(e) => updateFirstDependency(row.id, 'team', e.target.value)}
                        className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">Select...</option>
                        {getDependencyTeams(config).map(team => (
                          <option key={team} value={team}>{team}</option>
                        ))}
                      </select>
                    </td>

                    {/* Dependencies Deliverable */}
                    <td className="px-3 py-2 border-r border-slate-200">
                      <input
                        type="text"
                        value={firstDep.deliverable || ''}
                        onChange={(e) => updateFirstDependency(row.id, 'deliverable', e.target.value)}
                        placeholder="Deliverable..."
                        className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>

                    {/* Dependencies ETA */}
                    <td className="px-3 py-2 border-r border-slate-200">
                      <input
                        type="date"
                        value={firstDep.eta || ''}
                        onChange={(e) => updateFirstDependency(row.id, 'eta', e.target.value)}
                        className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2 border-r border-slate-200">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onDuplicateRow(row.id)}
                          className="w-8 h-8 flex items-center justify-center hover:bg-slate-200 rounded text-slate-400 hover:text-slate-600 transition-colors"
                          title="Duplicate row"
                        >
                          <Copy size={14} />
                        </button>
                        {rows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => onRemoveRow(row.id)}
                            className="w-8 h-8 flex items-center justify-center hover:bg-red-100 rounded text-red-400 hover:text-red-600 transition-colors"
                            title="Remove row"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
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

