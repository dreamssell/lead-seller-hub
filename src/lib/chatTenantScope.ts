export interface TenantScopedRecord {
  owner_id?: string | null;
  customer_id?: string | null;
  id?: string | null;
}

export function getActiveOwnerId(accessOwnerId?: string | null, fallbackUserId?: string | null) {
  return accessOwnerId || fallbackUserId || null;
}

export function isSameOwnerScope(activeOwnerId?: string | null, recordOwnerId?: string | null) {
  if (!activeOwnerId || !recordOwnerId) return false;
  return activeOwnerId === recordOwnerId;
}

export function canUseTenantRecord(activeOwnerId?: string | null, recordOwnerId?: string | null) {
  return Boolean(activeOwnerId && recordOwnerId && activeOwnerId === recordOwnerId);
}

export function shouldApplyConversationMessages(currentConversationId: string | null, requestedConversationId: string | null) {
  return Boolean(currentConversationId && requestedConversationId && currentConversationId === requestedConversationId);
}

export function applyConversationMessagesAfterSwitch<T>(params: {
  currentConversationId: string | null;
  requestedConversationId: string | null;
  previousMessages: T[];
  loadedMessages?: T[] | null;
  failed?: boolean;
}) {
  if (params.failed) return params.previousMessages;
  if (!shouldApplyConversationMessages(params.currentConversationId, params.requestedConversationId)) {
    return params.previousMessages;
  }
  return params.loadedMessages || [];
}
