/**
 * Public project-owned Herdr pane lifecycle API for other evoharness extensions.
 *
 * This is the supported extension-to-extension surface. Callers must not
 * import `src/inspectors/herdr/*` directly.
 */
export {
	type CloseProjectPaneData,
	type CloseProjectPaneOptions,
	closeProjectPane,
	createProjectPaneManager,
	type FocusProjectPaneData,
	focusProjectPane,
	type GetProjectPaneStatusOptions,
	getProjectPaneStatus,
	type HerdrProjectPaneBinding,
	type OpenProjectPaneData,
	type OpenProjectPaneOptions,
	openProjectPane,
	PROJECT_PANE_TRUST_STATUS,
	PROJECT_PANES_API_VERSION,
	type ProjectPaneCommandClient,
	type ProjectPaneError,
	type ProjectPaneErrorCode,
	type ProjectPaneManager,
	type ProjectPaneManagerOptions,
	type ProjectPaneResult,
	type ProjectPaneRuntime,
	type ProjectPaneStatusData,
	projectPaneBindingPath,
	readProjectPaneBinding,
} from "../inspectors/herdr/project-panes.ts";
