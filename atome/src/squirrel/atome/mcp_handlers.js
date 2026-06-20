import { createMcpAiRuntimeHandlers } from './mcp_handlers_ai_runtime.js';
import { createMcpCommunicationHandlers } from './mcp_handlers_communication.js';
import { createMcpPlatformHandlers } from './mcp_handlers_platform.js';

export const atomeMCPHandlers = {};

Object.assign(
    atomeMCPHandlers,
    createMcpPlatformHandlers(() => atomeMCPHandlers),
    createMcpAiRuntimeHandlers(),
    createMcpCommunicationHandlers()
);
