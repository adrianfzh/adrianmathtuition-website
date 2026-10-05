// ▶ Watch it — the committed clip specs (data/watch-it/*.json, one file per
// topic, keyed by the science bank's question id). Written by the authoring
// agents (scripts/watch-it/) and checked by lib/watch-it checkWatchSpec before
// they are merged; a spec here is a question that HAS a Watch it.
import kinematics from '../../data/watch-it/kinematics.json';
import chemicalCalculations from '../../data/watch-it/chemical-calculations.json';
import type { WatchSpec } from './watch-it';

const ALL: Record<string, WatchSpec> = {
  ...(kinematics as unknown as Record<string, WatchSpec>),
  ...(chemicalCalculations as unknown as Record<string, WatchSpec>),
};

export function watchSpecFor(qid: string): WatchSpec | null {
  return Object.prototype.hasOwnProperty.call(ALL, qid) ? ALL[qid] : null;
}

/** How many questions have a clip, per topic file. */
export function watchCounts(): Record<string, number> {
  return {
    Kinematics: Object.keys(kinematics).length,
    'Chemical Calculations': Object.keys(chemicalCalculations).length,
  };
}
