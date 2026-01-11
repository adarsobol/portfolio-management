/**
 * Report Storage Service
 * 
 * Handles persistence of monthly summary reports in GCS
 */

import { Storage } from '@google-cloud/storage';
import { MonthlyReport } from '../src/types';

interface ReportStorageConfig {
  bucketName: string;
  projectId?: string;
  keyFilename?: string;
}

const REPORTS_DIR = 'reports/';

export class ReportStorage {
  private storage: Storage | null = null;
  private bucketName: string;
  private initialized = false;

  constructor(config: ReportStorageConfig) {
    this.bucketName = config.bucketName;
    
    console.log('[REPORT_STORAGE] Initializing with config:', {
      bucketName: config.bucketName,
      hasProjectId: !!config.projectId,
      hasKeyFilename: !!config.keyFilename
    });
    
    try {
      this.storage = new Storage({
        projectId: config.projectId,
        keyFilename: config.keyFilename,
      });
      this.initialized = true;
      console.log('[REPORT_STORAGE] Successfully initialized GCS storage');
    } catch (error) {
      console.error('[REPORT_STORAGE] Failed to initialize GCS for report storage:', error);
      this.initialized = false;
    }
  }

  isInitialized(): boolean {
    return this.initialized && this.storage !== null;
  }

  /**
   * Get file path for a report
   */
  private getReportPath(period: string, type: 'team' | 'department', teamLeadId?: string): string {
    const filename = type === 'team' && teamLeadId 
      ? `team_${teamLeadId}.json`
      : 'department.json';
    return `${REPORTS_DIR}${period}/${filename}`;
  }

  /**
   * Save a report (overwrites existing for same period/team)
   */
  async saveReport(report: MonthlyReport): Promise<boolean> {
    if (!this.isInitialized() || !this.storage) {
      console.error('[ReportStorage] GCS not initialized');
      return false;
    }

    try {
      const bucket = this.storage.bucket(this.bucketName);
      const path = this.getReportPath(report.period, report.type, report.teamLeadId);
      const file = bucket.file(path);
      const content = JSON.stringify(report, null, 2);
      
      await file.save(content, {
        contentType: 'application/json',
        metadata: {
          cacheControl: 'no-cache'
        }
      });

      console.log(`[ReportStorage] Saved report: ${path}`);
      return true;
    } catch (error) {
      console.error('[ReportStorage] Failed to save report:', error);
      return false;
    }
  }

  /**
   * Get a report by period, type, and optionally teamLeadId
   */
  async getReport(period: string, type: 'team' | 'department', teamLeadId?: string): Promise<MonthlyReport | null> {
    if (!this.isInitialized() || !this.storage) {
      console.error('[ReportStorage] GCS not initialized');
      return null;
    }

    try {
      const bucket = this.storage.bucket(this.bucketName);
      const path = this.getReportPath(period, type, teamLeadId);
      const file = bucket.file(path);
      const [exists] = await file.exists();

      if (!exists) {
        return null;
      }

      const [contents] = await file.download();
      const report: MonthlyReport = JSON.parse(contents.toString());
      return report;
    } catch (error) {
      console.error('[ReportStorage] Failed to get report:', error);
      return null;
    }
  }

  /**
   * List all reports for a period
   */
  async listReports(period?: string): Promise<MonthlyReport[]> {
    if (!this.isInitialized() || !this.storage) {
      console.error('[ReportStorage] GCS not initialized');
      return [];
    }

    try {
      const bucket = this.storage.bucket(this.bucketName);
      const prefix = period ? `${REPORTS_DIR}${period}/` : REPORTS_DIR;
      const [files] = await bucket.getFiles({ prefix });

      const reports: MonthlyReport[] = [];
      
      for (const file of files) {
        if (file.name.endsWith('.json')) {
          try {
            const [contents] = await file.download();
            const report: MonthlyReport = JSON.parse(contents.toString());
            reports.push(report);
          } catch (error) {
            console.error(`[ReportStorage] Failed to parse report ${file.name}:`, error);
          }
        }
      }

      // Sort by generatedAt descending
      reports.sort((a, b) => 
        new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime()
      );

      return reports;
    } catch (error) {
      console.error('[ReportStorage] Failed to list reports:', error);
      return [];
    }
  }

  /**
   * Delete a report
   */
  async deleteReport(period: string, type: 'team' | 'department', teamLeadId?: string): Promise<boolean> {
    if (!this.isInitialized() || !this.storage) {
      console.error('[ReportStorage] GCS not initialized');
      return false;
    }

    try {
      const bucket = this.storage.bucket(this.bucketName);
      const path = this.getReportPath(period, type, teamLeadId);
      const file = bucket.file(path);
      const [exists] = await file.exists();

      if (!exists) {
        return true; // Already deleted
      }

      await file.delete();
      console.log(`[ReportStorage] Deleted report: ${path}`);
      return true;
    } catch (error) {
      console.error('[ReportStorage] Failed to delete report:', error);
      return false;
    }
  }
}

// Singleton instance
let reportStorageInstance: ReportStorage | null = null;

export function initializeReportStorage(): ReportStorage | null {
  if (reportStorageInstance) {
    return reportStorageInstance;
  }

  const bucketName = process.env.GCS_BUCKET_NAME;
  if (!bucketName) {
    console.warn('[REPORT_STORAGE] GCS_BUCKET_NAME not set, report storage disabled');
    return null;
  }

  reportStorageInstance = new ReportStorage({
    bucketName,
    projectId: process.env.GCS_PROJECT_ID,
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
  });

  return reportStorageInstance;
}

export function getReportStorage(): ReportStorage | null {
  if (!reportStorageInstance) {
    return initializeReportStorage();
  }
  return reportStorageInstance;
}

