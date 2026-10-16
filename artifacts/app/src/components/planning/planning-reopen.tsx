import { ToastAction } from "@/components/ui/toast";
import { toast } from "@/hooks/use-toast";
import { droppedWith, stateOf, type NodeState, type PlanNode, type StateOptions } from "@/lib/planning-model";

type SetState = (id: string, state: NodeState, opts?: StateOptions) => unknown;

/**
 * Reopen, the same from the List, the Map and Details. A question keeps its
 * old answer as a reference (it comes back prefilled in the answer field), and
 * reopening a settled question offers Undo: reopening clears the grade of the
 * guess, and without Undo one stray tap would lose it for good. Reopening also
 * brings back the options dropped when it settled ("chosen over"); with the
 * board's `nodes` handed in, Undo drops them again.
 */
export async function reopenNode(node: PlanNode, setNodeState: SetState, nodes?: PlanNode[]): Promise<boolean> {
  const before = stateOf(node);
  const chosenOver = nodes ? droppedWith(node.id, nodes) : [];
  const ok = await setNodeState(node.id, "open", node.ask ? { keepOutcome: true } : undefined);
  if (ok === false) return false;
  if (before === "settled") {
    const { outcome, verdict } = node;
    toast({
      title: "Reopened",
      description: verdict ? "The answer is kept as a reference; the grade of the guess is cleared." : "The answer is kept as a reference.",
      action: (
        <ToastAction
          altText="Undo"
          onClick={() => { void setNodeState(node.id, "settled", { outcome, verdict, ...(chosenOver.length ? { dropIds: chosenOver } : {}) }); }}
        >
          Undo
        </ToastAction>
      ),
    });
  }
  return true;
}
