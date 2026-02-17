/**
 * Collaboration system for multi-platform automatic prompt injection
 *
 * This module provides intelligent collaboration notification routing
 * across different Claude clients (Code, Desktop, ai).
 */

export { CollaborationManager } from './CollaborationManager.js';
export { EnvironmentDetector } from './EnvironmentDetector.js';
export type { ClientType } from './EnvironmentDetector.js';
export type { CollaborationStrategy } from './CollaborationStrategy.js';
export { HooksStrategy } from './HooksStrategy.js';
export { NotificationsStrategy } from './NotificationsStrategy.js';
export { SamplingStrategy } from './SamplingStrategy.js';
