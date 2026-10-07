// Our own English sets, as built by scripts/english-own/build.ts from data/english/sets/.
// The ONLY content the Practise page serves (7 Oct 2026) — the language bank is grounding only.
import raw from '../../data/english/own-sets.json';
import { isEditing, ownUuid, type OwnEditing, type OwnReading, type OwnSet } from './english-own';

export const OWN_SETS: OwnSet[] = (raw as unknown as { sets: OwnSet[] }).sets;
export const OWN_EDITING: OwnEditing[] = OWN_SETS.filter(isEditing);
export const OWN_READING: OwnReading[] = OWN_SETS.filter((s): s is OwnReading => !isEditing(s));

const BY_UUID = new Map(OWN_SETS.map(s => [ownUuid(s.id), s]));
export const ownByUuid = (uuid: string): OwnSet | null => BY_UUID.get(uuid.toLowerCase()) ?? null;
