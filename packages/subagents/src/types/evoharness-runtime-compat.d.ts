declare module "@evoharness/agent-core" {
	interface AgentToolResult<T> {
		/** Runtime error flag emitted and rendered by evoharness tool execution. */
		isError?: boolean;
	}
}

export {};
