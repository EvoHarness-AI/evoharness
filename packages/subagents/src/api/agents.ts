import type {
	RegisterRuntimeAgentInput,
	RuntimeAgentDefinition,
	RuntimeAgentRegistration,
} from "../agents/runtime-agent-registry.ts";

export {
	type RegisterRuntimeAgentViaEventsInput,
	RUNTIME_AGENT_REGISTER_EVENT,
	RUNTIME_AGENT_REGISTER_VERSION,
	type RuntimeAgentRegistrationRequest,
	type RuntimeAgentRegistrationResult,
	registerAgentViaEvents,
} from "../agents/runtime-agent-events.ts";
export { registerRuntimeAgent as registerAgent } from "../agents/runtime-agent-registry.ts";

export type { RegisterRuntimeAgentInput, RuntimeAgentDefinition, RuntimeAgentRegistration };
