import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Download, FileSpreadsheet, FileText, ChevronDown, Copy, Check, Table2 } from 'lucide-react';
import { Initiative, User, WorkType } from '../../types';
import { exportToClipboard, exportUnplannedToNotionClipboard } from '../../utils';
import { authService } from '../../services/authService';

interface ExportDropdownProps {
  initiatives: Initiative[];
  users: User[];
  filters?: {
    assetClass?: string;
    owners?: string[];
    workType?: string;
  };
}

export function ExportDropdown({ initiatives, users, filters }: ExportDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notionCopied, setNotionCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Count unplanned items for display
  const unplannedCount = useMemo(() => {
    return initiatives.filter(i => i.workType === WorkType.Unplanned).length;
  }, [initiatives]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Server-side export (more reliable)
  const handleServerExport = useCallback(async (format: 'excel' | 'csv') => {
    if (isExporting) return;
    
    setIsExporting(true);
    setIsOpen(false);
    
    try {
      const endpoint = format === 'excel' ? '/api/export/excel' : '/api/export/csv';
      const response = await fetch(`http://localhost:3001${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authService.getAuthHeader()
        },
        body: JSON.stringify({ initiatives, users })
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = format === 'excel' ? 'portfolio-initiatives.xlsx' : 'portfolio-initiatives.csv';
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match) filename = match[1];
      }

      // Download the file
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      console.log(`Server export successful: ${filename}`);
    } catch (error) {
      console.error('Server export failed:', error);
      alert('Export failed. Please try the "Copy to Clipboard" option instead.');
    } finally {
      setIsExporting(false);
    }
  }, [initiatives, users, isExporting]);

  const handleCopyToClipboard = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      await exportToClipboard(initiatives, users);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setIsOpen(false);
      }, 1500);
    } catch (error) {
      console.error('Copy to clipboard failed:', error);
      alert('Failed to copy to clipboard');
    }
  }, [initiatives, users]);

  const handleNotionExport = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      const count = await exportUnplannedToNotionClipboard(initiatives, users);
      if (count > 0) {
        setNotionCopied(true);
        setTimeout(() => {
          setNotionCopied(false);
          setIsOpen(false);
        }, 1500);
      }
    } catch (error) {
      console.error('Notion export failed:', error);
      alert('Failed to copy to clipboard');
    }
  }, [initiatives, users]);

  const hasFilters = filters && (
    filters.assetClass || 
    (filters.owners && filters.owners.length > 0) || 
    filters.workType
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
      >
        <Download size={16} />
        <span>Export</span>
        <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-slate-200 py-2 z-50">
          <div className="px-3 py-2 border-b border-slate-100">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Export Format</p>
            {hasFilters && (
              <p className="text-[10px] text-slate-400 mt-1">
                Exporting {initiatives.length} filtered items
              </p>
            )}
          </div>

          <button
            onClick={() => handleServerExport('excel')}
            disabled={isExporting}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet size={18} className="text-green-600" />
            <div className="text-left">
              <p className="font-medium">{isExporting ? 'Exporting...' : 'Excel (.xlsx)'}</p>
              <p className="text-xs text-slate-400">Server download</p>
            </div>
          </button>

          <button
            onClick={() => handleServerExport('csv')}
            disabled={isExporting}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileText size={18} className="text-blue-600" />
            <div className="text-left">
              <p className="font-medium">{isExporting ? 'Exporting...' : 'CSV (.csv)'}</p>
              <p className="text-xs text-slate-400">Server download</p>
            </div>
          </button>

          <div className="border-t border-slate-100 mt-1 pt-1">
            <button
              onClick={handleCopyToClipboard}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
            >
              {copied ? (
                <Check size={18} className="text-green-600" />
              ) : (
                <Copy size={18} className="text-purple-600" />
              )}
              <div className="text-left">
                <p className="font-medium">{copied ? 'Copied!' : 'Copy to Clipboard'}</p>
                <p className="text-xs text-slate-400">Paste into Excel/Sheets</p>
              </div>
            </button>
          </div>

          {/* Notion Export Section */}
          <div className="border-t border-slate-100 mt-1 pt-1">
            <div className="px-3 py-1.5">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">Notion Export</p>
            </div>
            <button
              onClick={handleNotionExport}
              disabled={unplannedCount === 0}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {notionCopied ? (
                <Check size={18} className="text-green-600" />
              ) : (
                <Table2 size={18} className="text-amber-600" />
              )}
              <div className="text-left">
                <p className="font-medium">{notionCopied ? 'Copied!' : 'Copy for Notion'}</p>
                <p className="text-xs text-slate-400">
                  {unplannedCount} unplanned item{unplannedCount !== 1 ? 's' : ''}
                </p>
              </div>
            </button>
          </div>

          <div className="px-3 py-2 mt-1 border-t border-slate-100">
            <p className="text-[10px] text-slate-400">
              {initiatives.length} initiatives will be exported
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

