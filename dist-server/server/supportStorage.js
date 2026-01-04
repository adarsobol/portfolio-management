/**
 * Support Storage Service
 * Stores support tickets and feedback in Google Cloud Storage
 */
import { Storage } from '@google-cloud/storage';
class SupportStorageService {
    storage = null;
    bucketName;
    initialized = false;
    constructor(config) {
        this.bucketName = config.bucketName;
        console.log('[SUPPORT_STORAGE] Initializing with config:', {
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
            console.log('[SUPPORT_STORAGE] Successfully initialized GCS storage');
        }
        catch (error) {
            console.error('[SUPPORT_STORAGE] Failed to initialize GCS for support storage:', error);
            this.initialized = false;
        }
    }
    getTicketsPath() {
        return 'support/tickets.json';
    }
    getFeedbackPath() {
        return 'support/feedback.json';
    }
    async createTicket(ticket) {
        if (!this.initialized || !this.storage) {
            console.warn('Support storage not initialized, skipping ticket creation');
            return false;
        }
        try {
            const bucket = this.storage.bucket(this.bucketName);
            const filePath = this.getTicketsPath();
            const file = bucket.file(filePath);
            // Read existing tickets
            let tickets = [];
            try {
                const [exists] = await file.exists();
                if (exists) {
                    const [contents] = await file.download();
                    tickets = JSON.parse(contents.toString());
                }
            }
            catch (error) {
                console.warn('Could not read existing tickets, starting fresh:', error);
            }
            // Add new ticket
            tickets.push(ticket);
            // Write back to storage
            await file.save(JSON.stringify(tickets, null, 2), {
                contentType: 'application/json',
                metadata: {
                    cacheControl: 'no-cache',
                },
            });
            return true;
        }
        catch (error) {
            console.error('Failed to create support ticket:', error);
            return false;
        }
    }
    async getTickets(status) {
        if (!this.initialized || !this.storage) {
            return [];
        }
        try {
            const bucket = this.storage.bucket(this.bucketName);
            const filePath = this.getTicketsPath();
            const file = bucket.file(filePath);
            const [exists] = await file.exists();
            if (!exists) {
                return [];
            }
            const [contents] = await file.download();
            const tickets = JSON.parse(contents.toString());
            if (status) {
                return tickets.filter(t => t.status === status);
            }
            return tickets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }
        catch (error) {
            console.error('Failed to get support tickets:', error);
            return [];
        }
    }
    async updateTicket(ticketId, updates) {
        if (!this.initialized || !this.storage) {
            return false;
        }
        try {
            const bucket = this.storage.bucket(this.bucketName);
            const filePath = this.getTicketsPath();
            const file = bucket.file(filePath);
            const [contents] = await file.download();
            const tickets = JSON.parse(contents.toString());
            const index = tickets.findIndex(t => t.id === ticketId);
            if (index === -1) {
                return false;
            }
            tickets[index] = {
                ...tickets[index],
                ...updates,
                updatedAt: new Date().toISOString(),
            };
            await file.save(JSON.stringify(tickets, null, 2), {
                contentType: 'application/json',
            });
            return true;
        }
        catch (error) {
            console.error('Failed to update support ticket:', error);
            return false;
        }
    }
    async createFeedback(feedback) {
        if (!this.initialized || !this.storage) {
            console.warn('Support storage not initialized, skipping feedback');
            return false;
        }
        try {
            const bucket = this.storage.bucket(this.bucketName);
            const filePath = this.getFeedbackPath();
            const file = bucket.file(filePath);
            // Read existing feedback
            let feedbackList = [];
            try {
                const [exists] = await file.exists();
                if (exists) {
                    const [contents] = await file.download();
                    feedbackList = JSON.parse(contents.toString());
                }
            }
            catch (error) {
                console.warn('Could not read existing feedback, starting fresh:', error);
            }
            // Add new feedback
            feedbackList.push(feedback);
            // Write back to storage
            await file.save(JSON.stringify(feedbackList, null, 2), {
                contentType: 'application/json',
            });
            return true;
        }
        catch (error) {
            console.error('Failed to create feedback:', error);
            return false;
        }
    }
    async getFeedback() {
        if (!this.initialized || !this.storage) {
            return [];
        }
        try {
            const bucket = this.storage.bucket(this.bucketName);
            const filePath = this.getFeedbackPath();
            const file = bucket.file(filePath);
            const [exists] = await file.exists();
            if (!exists) {
                return [];
            }
            const [contents] = await file.download();
            const feedback = JSON.parse(contents.toString());
            return feedback.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
        }
        catch (error) {
            console.error('Failed to get feedback:', error);
            return [];
        }
    }
    async getFeedbackById(feedbackId) {
        if (!this.initialized || !this.storage) {
            return null;
        }
        try {
            const bucket = this.storage.bucket(this.bucketName);
            const filePath = this.getFeedbackPath();
            const file = bucket.file(filePath);
            const [exists] = await file.exists();
            if (!exists) {
                return null;
            }
            const [contents] = await file.download();
            const feedbackList = JSON.parse(contents.toString());
            return feedbackList.find(f => f.id === feedbackId) || null;
        }
        catch (error) {
            console.error('Failed to get feedback by ID:', error);
            return null;
        }
    }
    async updateFeedback(feedbackId, updates) {
        if (!this.initialized || !this.storage) {
            return false;
        }
        try {
            const bucket = this.storage.bucket(this.bucketName);
            const filePath = this.getFeedbackPath();
            const file = bucket.file(filePath);
            const [contents] = await file.download();
            const feedbackList = JSON.parse(contents.toString());
            const index = feedbackList.findIndex(f => f.id === feedbackId);
            if (index === -1) {
                return false;
            }
            feedbackList[index] = {
                ...feedbackList[index],
                ...updates,
                updatedAt: new Date().toISOString(),
            };
            await file.save(JSON.stringify(feedbackList, null, 2), {
                contentType: 'application/json',
            });
            return true;
        }
        catch (error) {
            console.error('Failed to update feedback:', error);
            return false;
        }
    }
    async addFeedbackComment(feedbackId, comment) {
        if (!this.initialized || !this.storage) {
            return false;
        }
        try {
            const bucket = this.storage.bucket(this.bucketName);
            const filePath = this.getFeedbackPath();
            const file = bucket.file(filePath);
            const [contents] = await file.download();
            const feedbackList = JSON.parse(contents.toString());
            const index = feedbackList.findIndex(f => f.id === feedbackId);
            if (index === -1) {
                return false;
            }
            if (!feedbackList[index].comments) {
                feedbackList[index].comments = [];
            }
            feedbackList[index].comments.push(comment);
            feedbackList[index].updatedAt = new Date().toISOString();
            await file.save(JSON.stringify(feedbackList, null, 2), {
                contentType: 'application/json',
            });
            return true;
        }
        catch (error) {
            console.error('Failed to add comment to feedback:', error);
            return false;
        }
    }
    async addComment(ticketId, comment) {
        if (!this.initialized || !this.storage) {
            return false;
        }
        try {
            const bucket = this.storage.bucket(this.bucketName);
            const filePath = this.getTicketsPath();
            const file = bucket.file(filePath);
            const [contents] = await file.download();
            const tickets = JSON.parse(contents.toString());
            const index = tickets.findIndex(t => t.id === ticketId);
            if (index === -1) {
                return false;
            }
            // Initialize comments array if not exists
            if (!tickets[index].comments) {
                tickets[index].comments = [];
            }
            // Add comment
            tickets[index].comments.push(comment);
            tickets[index].updatedAt = new Date().toISOString();
            await file.save(JSON.stringify(tickets, null, 2), {
                contentType: 'application/json',
            });
            return true;
        }
        catch (error) {
            console.error('Failed to add comment to ticket:', error);
            return false;
        }
    }
    async getTicketById(ticketId) {
        if (!this.initialized || !this.storage) {
            return null;
        }
        try {
            const tickets = await this.getTickets();
            return tickets.find(t => t.id === ticketId) || null;
        }
        catch (error) {
            console.error('Failed to get ticket:', error);
            return null;
        }
    }
    isInitialized() {
        console.log('[SUPPORT_STORAGE] isInitialized check:', {
            initialized: this.initialized,
            hasStorage: !!this.storage,
            bucketName: this.bucketName
        });
        return this.initialized;
    }
}
// Singleton instance
let supportStorageInstance = null;
export function initializeSupportStorage(config) {
    console.log('[SUPPORT_STORAGE] initializeSupportStorage called with config:', {
        bucketName: config.bucketName,
        hasProjectId: !!config.projectId,
        hasKeyFilename: !!config.keyFilename
    });
    supportStorageInstance = new SupportStorageService(config);
    console.log('[SUPPORT_STORAGE] Instance created, initialized:', supportStorageInstance.isInitialized());
    return supportStorageInstance;
}
export function getSupportStorage() {
    console.log('[SUPPORT_STORAGE] getSupportStorage called, instance exists:', !!supportStorageInstance);
    return supportStorageInstance;
}
export function isSupportStorageEnabled() {
    return supportStorageInstance?.isInitialized() ?? false;
}
// ============================================
// IN-MEMORY FALLBACK STORAGE
// ============================================
// Used when GCS is not configured - stores in memory for session duration
const inMemoryFeedback = [];
const inMemoryTickets = [];
export const memoryStorage = {
    createFeedback: (feedback) => {
        inMemoryFeedback.push(feedback);
        console.log('[MEMORY] Feedback stored in memory:', feedback.id);
        return true;
    },
    getFeedback: () => {
        return [...inMemoryFeedback].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    },
    getFeedbackById: (feedbackId) => {
        return inMemoryFeedback.find(f => f.id === feedbackId) || null;
    },
    updateFeedback: (feedbackId, updates) => {
        const index = inMemoryFeedback.findIndex(f => f.id === feedbackId);
        if (index === -1)
            return false;
        inMemoryFeedback[index] = {
            ...inMemoryFeedback[index],
            ...updates,
            updatedAt: new Date().toISOString(),
        };
        return true;
    },
    addFeedbackComment: (feedbackId, comment) => {
        const index = inMemoryFeedback.findIndex(f => f.id === feedbackId);
        if (index === -1)
            return false;
        if (!inMemoryFeedback[index].comments) {
            inMemoryFeedback[index].comments = [];
        }
        inMemoryFeedback[index].comments.push(comment);
        inMemoryFeedback[index].updatedAt = new Date().toISOString();
        return true;
    },
    createTicket: (ticket) => {
        inMemoryTickets.push(ticket);
        console.log('[MEMORY] Ticket stored in memory:', ticket.id);
        return true;
    },
    getTickets: (status) => {
        let tickets = [...inMemoryTickets];
        if (status) {
            tickets = tickets.filter(t => t.status === status);
        }
        return tickets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },
    getTicketById: (id) => {
        return inMemoryTickets.find(t => t.id === id) || null;
    },
    updateTicket: (ticketId, updates) => {
        const index = inMemoryTickets.findIndex(t => t.id === ticketId);
        if (index === -1)
            return false;
        inMemoryTickets[index] = {
            ...inMemoryTickets[index],
            ...updates,
            updatedAt: new Date().toISOString(),
        };
        return true;
    },
    addComment: (ticketId, comment) => {
        const index = inMemoryTickets.findIndex(t => t.id === ticketId);
        if (index === -1)
            return false;
        if (!inMemoryTickets[index].comments) {
            inMemoryTickets[index].comments = [];
        }
        inMemoryTickets[index].comments.push(comment);
        inMemoryTickets[index].updatedAt = new Date().toISOString();
        return true;
    },
    isInitialized: () => true,
};
