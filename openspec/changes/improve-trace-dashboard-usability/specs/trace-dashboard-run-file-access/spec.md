## ADDED Requirements

### Requirement: Selected runs expose a full trace artifact path
The trace viewer SHALL provide the selected run with a full trace artifact path that identifies the complete trace artifact written for that run.

#### Scenario: JSON trace output is available
- **WHEN** a run is written with JSON trace output enabled
- **THEN** the selected run data SHALL expose the filesystem path to the JSON trace artifact as its full trace path

#### Scenario: Only HTML trace output is available
- **WHEN** a run is written with HTML output enabled and JSON output disabled
- **THEN** the selected run data SHALL expose the filesystem path to the HTML trace artifact as its full trace path

### Requirement: Dashboard displays the full trace artifact path
The trace dashboard SHALL display the selected run's full trace artifact path in the run details area when that path metadata is available.

#### Scenario: Run has full trace path metadata
- **WHEN** a developer selects a run whose metadata includes a full trace path
- **THEN** the dashboard SHALL render the full trace path in the selected run details

#### Scenario: Run lacks full trace path metadata
- **WHEN** a developer selects a run created before full trace path metadata was available
- **THEN** the dashboard SHALL remain usable without failing to render the run details

### Requirement: Dashboard copies the displayed full trace path
The trace dashboard SHALL provide an action that copies the selected run's displayed full trace artifact path to the clipboard.

#### Scenario: Copy full trace path
- **WHEN** a developer activates the copy-path action for a selected run with full trace path metadata
- **THEN** the dashboard SHALL write that exact full trace path value to the clipboard

#### Scenario: Path is unavailable
- **WHEN** a developer views a run without full trace path metadata
- **THEN** the dashboard SHALL NOT attempt to copy an inferred or synthetic path value
