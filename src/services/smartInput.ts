import englishDataset from '../data/smartInput.en.json'
import { isCancelCommand, parseSmartInput } from './smartParser'
import type { ParsedInput, SmartDataset } from './smartParser'

/**
 * Frontend binding for the smart parser.
 *
 * This thin file is the ONLY thing that knows the dataset currently ships in
 * the bundle. When the backend starts serving it (e.g. GET /api/smart-input/dataset),
 * swap `activeDataset` for the fetched payload — `smartParser.ts` needs no change.
 */
const activeDataset = englishDataset as SmartDataset

export function parseQuickAdd(text: string, now?: Date): ParsedInput | null {
  return parseSmartInput(text, activeDataset, { now })
}

/** True when a spoken phrase means "close this, do nothing". */
export function isQuickAddCancel(text: string): boolean {
  return isCancelCommand(text, activeDataset)
}

export type { ParsedInput }
