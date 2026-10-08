// Our own listening and oral sets, as built by scripts/english-own/build-speaking.ts from
// data/english/listening/ and data/english/oral/ (SPEC-ENGLISH-ORAL-LISTENING.md, 8 Oct 2026).
import raw from '../../data/english/speaking-sets.json';
import type { ListeningSet } from './english-listening';
import type { OralSet } from './english-oral';

const built = raw as unknown as { listening: ListeningSet[]; oral: OralSet[] };
export const LISTENING_SETS: ListeningSet[] = built.listening;
export const ORAL_SETS: OralSet[] = built.oral;
export const listeningById = (id: string): ListeningSet | null => LISTENING_SETS.find(s => s.id === id) ?? null;
export const oralById = (id: string): OralSet | null => ORAL_SETS.find(s => s.id === id) ?? null;
/** The recording of a listening set: public/english/listening/<id>.mp3 (made by speaking-audio.mjs). */
export const listeningAudio = (id: string): string => `/english/listening/${id}.mp3`;
