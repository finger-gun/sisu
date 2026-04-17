## ADDED Requirements

### Requirement: Recipe Metadata Declares Dependency-Aware Install Plans
The system SHALL support install recipes that declare ordered package installs, optional choices, and post-install configuration actions.

#### Scenario: Recipe installs multiple dependent packages
- **WHEN** a user executes a bundle recipe
- **THEN** the installer MUST execute declared package installs in recipe order before post-install actions

### Requirement: Recipe Execution Reports Step-Level Outcomes
Recipe execution MUST produce explicit success/failure output for each step and stop at the first unrecoverable failure.

#### Scenario: Install fails mid-recipe
- **WHEN** a package install step fails
- **THEN** the installer MUST report the failed step, report previously completed steps, and MUST NOT execute remaining steps

### Requirement: Recipe Actions Are Shared Across UI And Command Paths
The same recipe execution behavior MUST apply regardless of whether installation is triggered from settings UI or command-based install flow.

#### Scenario: User installs recipe from different entry points
- **WHEN** the same recipe is invoked via settings and via command
- **THEN** both flows MUST execute identical install and post-install steps with equivalent validation and error handling
