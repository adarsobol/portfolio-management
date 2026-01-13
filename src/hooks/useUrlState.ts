import { useCallback } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';

/**
 * Custom hook to sync URL query params with filter state
 * Parses and updates URL when filters change
 * Restores filters from URL on mount
 */
export function useUrlState() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  // Get filter values from URL
  const getFilterFromUrl = useCallback((key: string): string[] => {
    const value = searchParams.get(key);
    return value ? value.split(',').filter(Boolean) : [];
  }, [searchParams]);

  // Get single filter value from URL
  const getSingleFilterFromUrl = useCallback((key: string): string => {
    return searchParams.get(key) || '';
  }, [searchParams]);

  // Update URL with filter values
  const updateUrlFilters = useCallback((filters: {
    assetClass?: string;
    owners?: string[];
    workType?: string[];
    quarter?: string[];
    priority?: string[];
    status?: string[];
    searchQuery?: string;
  }) => {
    const newParams = new URLSearchParams(searchParams);
    
    if (filters.assetClass !== undefined) {
      if (filters.assetClass) {
        newParams.set('assetClass', filters.assetClass);
      } else {
        newParams.delete('assetClass');
      }
    }
    
    if (filters.owners !== undefined) {
      if (filters.owners.length > 0) {
        newParams.set('owners', filters.owners.join(','));
      } else {
        newParams.delete('owners');
      }
    }
    
    if (filters.workType !== undefined) {
      if (filters.workType.length > 0) {
        newParams.set('workType', filters.workType.join(','));
      } else {
        newParams.delete('workType');
      }
    }
    
    if (filters.quarter !== undefined) {
      if (filters.quarter.length > 0) {
        newParams.set('quarter', filters.quarter.join(','));
      } else {
        newParams.delete('quarter');
      }
    }
    
    if (filters.priority !== undefined) {
      if (filters.priority.length > 0) {
        newParams.set('priority', filters.priority.join(','));
      } else {
        newParams.delete('priority');
      }
    }
    
    if (filters.status !== undefined) {
      if (filters.status.length > 0) {
        newParams.set('status', filters.status.join(','));
      } else {
        newParams.delete('status');
      }
    }
    
    if (filters.searchQuery !== undefined) {
      if (filters.searchQuery) {
        newParams.set('search', filters.searchQuery);
      } else {
        newParams.delete('search');
      }
    }
    
    navigate({ pathname: location.pathname, search: newParams.toString() }, { replace: true });
  }, [searchParams, navigate, location.pathname]);

  return {
    getFilterFromUrl,
    getSingleFilterFromUrl,
    updateUrlFilters,
    searchParams
  };
}

