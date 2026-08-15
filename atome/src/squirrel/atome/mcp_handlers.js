import { createMcpAiRuntimeHandlers } from './mcp_handlers_ai_runtime.js';
import { createMcpCommunicationHandlers } from './mcp_handlers_communication.js';
import { createMcpPlatformHandlers } from './mcp_handlers_platform.js';
import { createMcpConditionHandlers } from './mcp_handlers_conditions.js';

export const atomeMCPHandlers = {};

Object.assign(
    atomeMCPHandlers,
    createMcpPlatformHandlers(() => atomeMCPHandlers),
    createMcpAiRuntimeHandlers(),
    createMcpCommunicationHandlers(),
    createMcpConditionHandlers()
);
