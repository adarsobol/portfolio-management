import { User } from '../types';

/**
 * Parse mentions from comment text
 * Supports formats:
 * - @email@domain.com (full email)
 * - @firstname.lastname (partial email match)
 * - @firstname (name-based match)
 */
export function parseMentions(text: string, users: User[]): string[] {
  const mentionedIds: string[] = [];
  
  // Pattern 1: @email@domain.com (full email)
  const emailPattern = /@([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
  const emailMatches = Array.from(text.matchAll(emailPattern));
  for (const match of emailMatches) {
    const email = match[1];
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (user && !mentionedIds.includes(user.id)) {
      mentionedIds.push(user.id);
    }
  }
  
  // Pattern 2: @firstname.lastname or @firstname (partial email/name match)
  // Only match if not already part of a full email match
  const partialPattern = /@([a-zA-Z0-9._-]+)/g;
  const partialMatches = Array.from(text.matchAll(partialPattern));
  
  for (const match of partialMatches) {
    const partial = match[1].toLowerCase();
    const matchIndex = match.index || 0;
    
    // Skip if this is part of a full email (already matched above)
    const isPartOfEmail = emailMatches.some(em => {
      const emailMatchIndex = em.index || 0;
      const emailMatchLength = em[0].length;
      return matchIndex >= emailMatchIndex && matchIndex < emailMatchIndex + emailMatchLength;
    });
    
    if (isPartOfEmail) continue;
    
    // Try to match by email prefix (before @)
    const user = users.find(u => {
      const emailPrefix = u.email.split('@')[0].toLowerCase();
      const nameParts = u.name.toLowerCase().split(' ');
      
      // Match by email prefix
      if (emailPrefix === partial || emailPrefix.startsWith(partial) || partial.startsWith(emailPrefix)) {
        return true;
      }
      
      // Match by name (first name or last name)
      if (nameParts.some(part => part === partial || part.startsWith(partial))) {
        return true;
      }
      
      return false;
    });
    
    if (user && !mentionedIds.includes(user.id)) {
      mentionedIds.push(user.id);
    }
  }
  
  return [...new Set(mentionedIds)]; // Remove duplicates
}

/**
 * Get mentioned users from comment text
 */
export function getMentionedUsers(text: string, users: User[]): User[] {
  const mentionedIds = parseMentions(text, users);
  return mentionedIds
    .map(id => users.find(u => u.id === id))
    .filter((user): user is User => user !== undefined);
}

