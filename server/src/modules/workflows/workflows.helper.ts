import { ValidationError } from "../../utils/errors";

export function validateWorkflowDefinition(
  states: Array<{ name: string; is_initial: boolean; is_terminal: boolean }>,
  transitions: Array<{
    from_state: string;
    to_state: string;
    requires_approval: boolean;
    approval_strategy: string;
    quorum_count?: number;
  }>,
): void {
  const initialStates = states.filter((s) => s.is_initial);
  if (initialStates.length !== 1) {
    throw new ValidationError("Workflow must have exactly one initial state");
  }

  const terminalStates = states.filter((s) => s.is_terminal);
  if (terminalStates.length < 1) {
    throw new ValidationError("Workflow must have at least one terminal state");
  }

  const stateNames = new Set(states.map((s) => s.name));
  for (const t of transitions) {
    if (!stateNames.has(t.from_state)) {
      throw new ValidationError(
        `Transition references unknown state: ${t.from_state}`,
      );
    }
    if (!stateNames.has(t.to_state)) {
      throw new ValidationError(
        `Transition references unknown state: ${t.to_state}`,
      );
    }
    if (t.from_state === t.to_state) {
      throw new ValidationError("Self-loops are not allowed");
    }
    if (t.requires_approval && t.approval_strategy === "none") {
      throw new ValidationError(
        "Approval strategy must be set when requires_approval is true",
      );
    }
    if (t.approval_strategy === "quorum" && !t.quorum_count) {
      throw new ValidationError(
        "quorum_count is required when strategy is quorum",
      );
    }
  }
}
