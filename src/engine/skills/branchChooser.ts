import type { SkillPrototype, ChooseSegment } from './prototypes';
import type { GameState } from '../GameState';

export interface BranchChooser {
  choose(labels: readonly string[], state: GameState, casterId: number): number | null;
}
/** Stable baseline policy; gameplay choice is not a spell's random branch. */
export class AiBranchChooser implements BranchChooser {
  choose(labels: readonly string[]): number | null { return labels.length ? 0 : null; }
}
export class FixedBranchChooser implements BranchChooser {
  constructor(private index: number | null) {}
  choose(): number | null { return this.index; }
}
export function skillChoices(proto: SkillPrototype): ChooseSegment | undefined {
  return proto.segments.find((s): s is ChooseSegment => s.kind === 'choose');
}
/** Preserve branch order and surrounding clauses. Invalid/missing selection is a cancellation. */
export function selectSkillBranch(proto: SkillPrototype, index?: number | null): SkillPrototype | null {
  const choices = proto.segments.filter((s): s is ChooseSegment => s.kind === 'choose');
  if (!choices.length) return proto;
  if (choices.length !== 1 || !Number.isInteger(index) || index! < 0 || index! >= choices[0].options.length) return null;
  const choice = choices[0];
  if (choice.labels.length !== choice.options.length) return null;
  const segments = proto.segments.flatMap(s => s === choice ? choice.options[index!] : [s]);
  // This representation permits one top-level choice only; never silently execute nested choices.
  if (segments.some(s => s.kind === 'choose')) return null;
  return { ...proto, segments };
}
