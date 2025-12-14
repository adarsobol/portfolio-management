import { useState, useCallback } from 'react';

export interface FilterState {
  assetClass: string;
  pillar: string;
  responsibility: string;
  owners: string[];
  workType: string;
  searchQuery: string;
}

export interface FilterActions {
  setAssetClass: (value: string) => void;
  setPillar: (value: string) => void;
  setResponsibility: (value: string) => void;
  setOwners: (value: string[]) => void;
  setWorkType: (value: string) => void;
  setSearchQuery: (value: string) => void;
  resetFilters: () => void;
}

const initialState: FilterState = {
  assetClass: '',
  pillar: '',
  responsibility: '',
  owners: [],
  workType: '',
  searchQuery: '',
};

export function useFilters(): [FilterState, FilterActions] {
  const [filters, setFilters] = useState<FilterState>(initialState);

  const setAssetClass = useCallback((value: string) => {
    setFilters(prev => ({
      ...prev,
      assetClass: value,
      pillar: '', // Reset dependent filters
      responsibility: '',
    }));
  }, []);

  const setPillar = useCallback((value: string) => {
    setFilters(prev => ({
      ...prev,
      pillar: value,
      responsibility: '', // Reset dependent filter
    }));
  }, []);

  const setResponsibility = useCallback((value: string) => {
    setFilters(prev => ({ ...prev, responsibility: value }));
  }, []);

  const setOwners = useCallback((value: string[]) => {
    setFilters(prev => ({ ...prev, owners: value }));
  }, []);

  const setWorkType = useCallback((value: string) => {
    setFilters(prev => ({ ...prev, workType: value }));
  }, []);

  const setSearchQuery = useCallback((value: string) => {
    setFilters(prev => ({ ...prev, searchQuery: value }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(initialState);
  }, []);

  return [
    filters,
    {
      setAssetClass,
      setPillar,
      setResponsibility,
      setOwners,
      setWorkType,
      setSearchQuery,
      resetFilters,
    },
  ];
}

